import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { RecoverySnapshot } from '@shared/ipc'
import { writeFileAtomic } from './atomicWrite'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_CONTENT_CHARS = 32 * 1024 * 1024

function sanitize(input: unknown): RecoverySnapshot | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  if (typeof v.id !== 'string' || !ID.test(v.id)) return null
  if (typeof v.content !== 'string' || v.content.length > MAX_CONTENT_CHARS) return null
  const name = typeof v.name === 'string' ? v.name.slice(0, 200) : 'Untitled'
  const filePath = typeof v.path === 'string' && v.path.length <= 2048 ? v.path : null
  const mtime = typeof v.mtimeMs === 'number' && Number.isFinite(v.mtimeMs) ? v.mtimeMs : null
  return {
    id: v.id,
    path: filePath,
    name,
    content: v.content,
    hasBom: v.hasBom === true,
    mtimeMs: mtime,
    savedAt: typeof v.savedAt === 'number' ? v.savedAt : Date.now()
  }
}

/**
 * Keeps a copy of unsaved text on disk (in the application's own data folder, never next to the
 * user's files) so that a crash, power cut or killed process does not lose typed work. A normal
 * close or an explicit "Don't Save" removes the copies; whatever is left was an unclean exit and
 * is offered back at the next start.
 */
export class RecoveryService {
  constructor(private readonly folder: string) {}

  async write(input: unknown): Promise<void> {
    const snapshot = sanitize(input)
    if (!snapshot) throw new Error('Invalid recovery data.')
    await fs.mkdir(this.folder, { recursive: true })
    await writeFileAtomic(path.join(this.folder, `${snapshot.id}.json`), JSON.stringify(snapshot))
  }

  async remove(id: unknown): Promise<void> {
    if (typeof id !== 'string' || !ID.test(id)) return
    await fs.rm(path.join(this.folder, `${id}.json`), { force: true })
  }

  async list(): Promise<RecoverySnapshot[]> {
    let names: string[]
    try {
      names = await fs.readdir(this.folder)
    } catch {
      return []
    }
    const out: RecoverySnapshot[] = []
    for (const name of names.filter((n) => n.endsWith('.json'))) {
      try {
        const snapshot = sanitize(
          JSON.parse(await fs.readFile(path.join(this.folder, name), 'utf8'))
        )
        if (snapshot) out.push(snapshot)
      } catch {
        // A damaged copy is skipped; it is never rewritten.
      }
    }
    return out.sort((a, b) => a.savedAt - b.savedAt)
  }

  async clear(): Promise<void> {
    await fs.rm(this.folder, { recursive: true, force: true })
  }
}
