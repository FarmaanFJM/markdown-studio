import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

/**
 * Writes a file so that readers see either the old content or the complete new content.
 *
 * The data goes to a temporary file in the same folder, is flushed to disk and then renamed over
 * the target. If anything fails, the temporary file is removed and the target is untouched.
 */
export async function writeFileAtomic(target: string, data: string | Uint8Array): Promise<void> {
  const directory = path.dirname(target)
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  )
  let handle: fs.FileHandle | null = null
  try {
    handle = await fs.open(temporary, 'wx')
    await handle.writeFile(data)
    await handle.sync()
    await handle.close()
    handle = null
    await fs.rename(temporary, target)
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined)
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}
