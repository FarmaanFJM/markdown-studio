import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { DirEntry, TextFile } from '@shared/ipc'
import type { AccessControl } from './accessControl'

/** Entries hidden from the Explorer. They are still untouched on disk. */
const HIDDEN_ENTRIES = new Set(['.git', '.DS_Store', 'Thumbs.db', 'desktop.ini'])

const MAX_TEXT_FILE_BYTES = 32 * 1024 * 1024
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

export class FileOperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileOperationError'
  }
}

/** Validates a single file or folder name typed by the user. */
export function validateEntryName(raw: unknown): string {
  if (typeof raw !== 'string') throw new FileOperationError('A name is required.')
  const name = raw.trim()
  if (!name) throw new FileOperationError('A name is required.')
  if (name === '.' || name === '..') throw new FileOperationError(`"${name}" is not a valid name.`)
  if (/[/\\]/.test(name)) throw new FileOperationError('Names cannot contain "/" or "\\".')
  // Control characters are invalid in file names on every platform.
  // eslint-disable-next-line no-control-regex
  if (/[<>:"|?*\u0000-\u001f]/.test(name)) {
    throw new FileOperationError('Names cannot contain any of these characters: < > : " | ? *')
  }
  if (/[. ]$/.test(name)) throw new FileOperationError('Names cannot end with a space or a period.')
  if (WINDOWS_RESERVED.test(name))
    throw new FileOperationError(`"${name}" is a reserved name on Windows.`)
  if (Buffer.byteLength(name) > 255) throw new FileOperationError('The name is too long.')
  return name
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target)
    return true
  } catch {
    return false
  }
}

function sameEntry(a: string, b: string): boolean {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return a.toLowerCase() === b.toLowerCase()
  }
  return a === b
}

export class FileService {
  constructor(private readonly access: AccessControl) {}

  async readDir(directory: unknown): Promise<DirEntry[]> {
    const dir = this.access.assertWorkspace(directory)
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    const entries = await Promise.all(
      dirents
        .filter((d) => !HIDDEN_ENTRIES.has(d.name))
        .map(async (d): Promise<DirEntry | null> => {
          const full = path.join(dir, d.name)
          try {
            // stat (not lstat) so symbolic links are shown as their targets.
            const stat = await fs.stat(full)
            return {
              name: d.name,
              path: full,
              kind: stat.isDirectory() ? 'directory' : 'file',
              size: stat.size,
              mtimeMs: stat.mtimeMs
            }
          } catch {
            return null // Broken links and entries removed while listing.
          }
        })
    )
    return entries
      .filter((e): e is DirEntry => e !== null)
      .sort((a, b) =>
        a.kind === b.kind ? naturalCompare(a.name, b.name) : a.kind === 'directory' ? -1 : 1
      )
  }

  async readText(file: unknown): Promise<TextFile> {
    const target = this.access.assertFile(file)
    const stat = await fs.stat(target)
    if (stat.isDirectory()) throw new FileOperationError(`"${path.basename(target)}" is a folder.`)
    if (stat.size > MAX_TEXT_FILE_BYTES) {
      throw new FileOperationError(`"${path.basename(target)}" is too large to open (over 32 MB).`)
    }
    const buffer = await fs.readFile(target)
    const hasBom = buffer.subarray(0, 3).equals(UTF8_BOM)
    const content = (hasBom ? buffer.subarray(3) : buffer).toString('utf8')
    return { path: target, content, hasBom, mtimeMs: stat.mtimeMs }
  }

  /** Writes the document exactly as given; only a BOM present when it was opened is restored. */
  async writeText(file: unknown, content: unknown, hasBom: unknown): Promise<{ mtimeMs: number }> {
    const target = this.access.assertFile(file)
    if (typeof content !== 'string') throw new FileOperationError('Invalid document content.')
    const body = Buffer.from(content, 'utf8')
    await fs.writeFile(target, hasBom === true ? Buffer.concat([UTF8_BOM, body]) : body)
    const stat = await fs.stat(target)
    return { mtimeMs: stat.mtimeMs }
  }

  async createFile(directory: unknown, rawName: unknown): Promise<string> {
    const dir = this.access.assertWorkspace(directory)
    let name = validateEntryName(rawName)
    if (!path.extname(name)) name += '.md'
    const target = path.join(dir, name)
    this.access.assertWorkspace(target)
    try {
      await fs.writeFile(target, '', { flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new FileOperationError(`"${name}" already exists in this folder.`)
      }
      throw error
    }
    return target
  }

  async createDirectory(directory: unknown, rawName: unknown): Promise<string> {
    const dir = this.access.assertWorkspace(directory)
    const name = validateEntryName(rawName)
    const target = path.join(dir, name)
    this.access.assertWorkspace(target)
    try {
      await fs.mkdir(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new FileOperationError(`"${name}" already exists in this folder.`)
      }
      throw error
    }
    return target
  }

  async rename(source: unknown, rawName: unknown): Promise<string> {
    const from = this.access.assertWorkspace(source)
    if (this.access.isWorkspaceRoot(from)) {
      throw new FileOperationError('The workspace folder itself cannot be renamed here.')
    }
    const name = validateEntryName(rawName)
    const to = path.join(path.dirname(from), name)
    this.access.assertWorkspace(to)
    if (from === to) return to
    // A case-only rename refers to the same entry on case-insensitive file systems.
    if (!sameEntry(from, to) && (await exists(to))) {
      throw new FileOperationError(`"${name}" already exists in this folder.`)
    }
    await fs.rename(from, to)
    return to
  }

  async trash(target: unknown, trashItem: (p: string) => Promise<void>): Promise<void> {
    const resolved = this.assertDeletable(target)
    try {
      await trashItem(resolved)
    } catch (error) {
      throw new FileOperationError(
        `Could not move "${path.basename(resolved)}" to the trash: ${(error as Error).message}`
      )
    }
  }

  async deletePermanently(target: unknown): Promise<void> {
    const resolved = this.assertDeletable(target)
    await fs.rm(resolved, { recursive: true, force: false })
  }

  private assertDeletable(target: unknown): string {
    const resolved = this.access.assertWorkspace(target)
    if (this.access.isWorkspaceRoot(resolved)) {
      throw new FileOperationError('The workspace folder itself cannot be deleted here.')
    }
    return resolved
  }
}
