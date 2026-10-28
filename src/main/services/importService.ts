import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import type { ExternalImportResult, ImportedEntry } from '@shared/ipc'
import type { AccessControl } from './accessControl'
import { FileOperationError } from './fileService'

/** Largest single file, number of files and total size accepted from one drop. */
export const MAX_IMPORT_FILE_BYTES = 200 * 1024 * 1024
export const MAX_IMPORT_FILES = 5000
export const MAX_IMPORT_TOTAL_BYTES = 1024 * 1024 * 1024
const MAX_IMPORT_DEPTH = 32
const MAX_SOURCES = 500
const MAX_NAME_ATTEMPTS = 1000

const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin'

function inside(parent: string, child: string): boolean {
  const fold = (p: string) => (caseInsensitive ? path.resolve(p).toLowerCase() : path.resolve(p))
  const relative = path.relative(fold(parent), fold(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** `photo.png`, `photo-1.png`, ...; folders get the suffix after the whole name. */
function candidate(name: string, attempt: number, isDirectory: boolean): string {
  if (attempt === 0) return name
  if (isDirectory) return `${name}-${attempt}`
  const ext = path.extname(name)
  return `${path.basename(name, ext)}-${attempt}${ext}`
}

interface PlanFile {
  from: string
  /** Path below the destination folder, using the final (possibly renamed) top-level name. */
  relative: string[]
  size: number
}

interface PlanEntry {
  source: string
  name: string
  isDirectory: boolean
  directories: string[][]
  files: PlanFile[]
}

/**
 * Copies files and folders that were dropped from the operating system into the workspace.
 *
 * The result is independent of the originals: contents are copied byte for byte. Nothing is
 * ever overwritten (a clashing name gets a numeric suffix), symbolic links are skipped rather
 * than followed, and the whole drop is measured before the first byte is written so a drop
 * that is too large fails without leaving half a folder behind.
 */
export class ImportService {
  constructor(private readonly access: AccessControl) {}

  async importExternal(sources: unknown, targetDirectory: unknown): Promise<ExternalImportResult> {
    if (!Array.isArray(sources) || sources.length === 0 || sources.length > MAX_SOURCES) {
      throw new FileOperationError('There is nothing to import.')
    }
    const target = this.access.assertWorkspace(targetDirectory)
    const targetStat = await fs.stat(target).catch(() => null)
    if (!targetStat?.isDirectory()) throw new FileOperationError('The destination is not a folder.')

    const skipped: string[] = []
    const plans: PlanEntry[] = []
    const seen = new Set<string>()
    let fileCount = 0
    let totalBytes = 0
    for (const raw of sources) {
      if (typeof raw !== 'string' || !path.isAbsolute(raw)) {
        throw new FileOperationError('A dropped item has no location on disk.')
      }
      const source = path.resolve(raw)
      const key = caseInsensitive ? source.toLowerCase() : source
      if (seen.has(key)) continue
      seen.add(key)
      const lstat = await fs.lstat(source).catch(() => null)
      if (!lstat) throw new FileOperationError(`"${path.basename(source)}" could not be found.`)
      if (lstat.isSymbolicLink()) {
        skipped.push(`${path.basename(source)} (shortcut or link)`)
        continue
      }
      if (lstat.isDirectory()) {
        if (inside(source, target)) {
          throw new FileOperationError(
            `"${path.basename(source)}" cannot be imported into a folder inside itself.`
          )
        }
      } else if (!lstat.isFile()) {
        skipped.push(`${path.basename(source)} (not a regular file)`)
        continue
      }
      const plan = await this.plan(source, lstat.isDirectory(), skipped)
      fileCount += plan.files.length
      totalBytes += plan.files.reduce((sum, f) => sum + f.size, 0)
      if (fileCount > MAX_IMPORT_FILES) {
        throw new FileOperationError(
          `Too many files to import at once (limit ${MAX_IMPORT_FILES}).`
        )
      }
      if (totalBytes > MAX_IMPORT_TOTAL_BYTES) {
        throw new FileOperationError('The dropped items are too large to import (limit 1 GB).')
      }
      plans.push(plan)
    }
    if (plans.length === 0) {
      throw new FileOperationError(
        skipped.length > 0
          ? `Nothing could be imported: ${skipped.join(', ')}.`
          : 'Nothing to import.'
      )
    }

    const imported: ImportedEntry[] = []
    for (const plan of plans) {
      imported.push(await this.copy(plan, target))
    }
    return { imported, skipped, fileCount }
  }

  /** Walks a folder (or wraps a single file), recording what will be copied. */
  private async plan(source: string, isDirectory: boolean, skipped: string[]): Promise<PlanEntry> {
    const name = path.basename(source)
    const plan: PlanEntry = { source, name, isDirectory, directories: [[]], files: [] }
    if (!isDirectory) {
      const stat = await fs.stat(source)
      if (stat.size > MAX_IMPORT_FILE_BYTES) {
        throw new FileOperationError(`"${name}" is too large to import (limit 200 MB).`)
      }
      plan.directories = []
      plan.files.push({ from: source, relative: [], size: stat.size })
      return plan
    }
    const walk = async (directory: string, relative: string[], depth: number): Promise<void> => {
      if (depth > MAX_IMPORT_DEPTH) {
        throw new FileOperationError(`"${name}" is nested too deeply to import.`)
      }
      const dirents = await fs.readdir(directory, { withFileTypes: true })
      for (const dirent of dirents) {
        const full = path.join(directory, dirent.name)
        const below = [...relative, dirent.name]
        if (dirent.isSymbolicLink()) {
          skipped.push(`${[name, ...below].join('/')} (shortcut or link)`)
        } else if (dirent.isDirectory()) {
          plan.directories.push(below)
          await walk(full, below, depth + 1)
        } else if (dirent.isFile()) {
          const stat = await fs.stat(full)
          if (stat.size > MAX_IMPORT_FILE_BYTES) {
            throw new FileOperationError(
              `"${[name, ...below].join('/')}" is too large to import (limit 200 MB).`
            )
          }
          plan.files.push({ from: full, relative: below, size: stat.size })
        } else {
          skipped.push(`${[name, ...below].join('/')} (not a regular file)`)
        }
      }
    }
    await walk(source, [], 0)
    return plan
  }

  private async copy(plan: PlanEntry, target: string): Promise<ImportedEntry> {
    if (!plan.isDirectory) {
      const file = plan.files[0]
      for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
        const destination = path.join(target, candidate(plan.name, attempt, false))
        this.access.assertWorkspace(destination)
        try {
          // COPYFILE_EXCL never overwrites, even if the name is taken a moment later.
          await fs.copyFile(file.from, destination, constants.COPYFILE_EXCL)
          return { source: plan.source, path: destination, kind: 'file', fileCount: 1 }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        }
      }
      throw new FileOperationError(`Could not find a free file name for "${plan.name}".`)
    }

    let root: string | null = null
    for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS && !root; attempt++) {
      const destination = path.join(target, candidate(plan.name, attempt, true))
      this.access.assertWorkspace(destination)
      try {
        await fs.mkdir(destination) // Without `recursive`, so an existing folder is never reused.
        root = destination
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
    if (!root) throw new FileOperationError(`Could not find a free folder name for "${plan.name}".`)
    try {
      for (const directory of plan.directories) {
        if (directory.length > 0) await fs.mkdir(path.join(root, ...directory), { recursive: true })
      }
      for (const file of plan.files) {
        await fs.copyFile(file.from, path.join(root, ...file.relative), constants.COPYFILE_EXCL)
      }
    } catch (error) {
      // The folder was created by this import, so removing it undoes the partial copy.
      await fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
    return { source: plan.source, path: root, kind: 'directory', fileCount: plan.files.length }
  }
}
