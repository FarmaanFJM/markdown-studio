import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import { isImagePath } from '@shared/fileTypes'
import type { ImportedImage } from '@shared/ipc'
import { AccessDeniedError, type AccessControl } from './accessControl'
import { FileOperationError } from './fileService'

const MAX_IMPORT_BYTES = 200 * 1024 * 1024
const MAX_COLLISION_ATTEMPTS = 1000

async function sameContent(a: string, b: string): Promise<boolean> {
  const [sa, sb] = await Promise.all([fs.stat(a), fs.stat(b)])
  if (sa.size !== sb.size) return false
  const [ba, bb] = await Promise.all([fs.readFile(a), fs.readFile(b)])
  return ba.equals(bb)
}

/** Candidate names `photo.png`, `photo-1.png`, `photo-2.png`, ... */
export function candidateName(fileName: string, attempt: number): string {
  if (attempt === 0) return fileName
  const ext = path.extname(fileName)
  return `${path.basename(fileName, ext)}-${attempt}${ext}`
}

/**
 * Imports images into the workspace.
 *
 * Designed as the single entry point for image assets so later phases can add resizing,
 * optimisation, clipboard screenshots and reference updates without touching the editor.
 */
export class AssetService {
  constructor(private readonly access: AccessControl) {}

  async importImage(source: unknown, targetDirectory: unknown): Promise<ImportedImage> {
    if (typeof source !== 'string' || !path.isAbsolute(source)) {
      throw new FileOperationError('The dropped file has no location on disk.')
    }
    if (!isImagePath(source)) {
      throw new FileOperationError(`"${path.basename(source)}" is not a supported image type.`)
    }
    const sourcePath = path.resolve(source)
    const stat = await fs.stat(sourcePath).catch(() => null)
    if (!stat || !stat.isFile()) {
      throw new FileOperationError(`"${path.basename(sourcePath)}" could not be found.`)
    }

    // Images that already belong to the workspace are referenced where they are.
    if (this.access.isInWorkspace(sourcePath)) return { path: sourcePath, copied: false }

    if (stat.size > MAX_IMPORT_BYTES) {
      throw new FileOperationError(`"${path.basename(sourcePath)}" is too large to import.`)
    }
    if (typeof targetDirectory !== 'string' || !path.isAbsolute(targetDirectory)) {
      throw new FileOperationError('No asset folder is available for this document.')
    }
    const targetDir = path.resolve(targetDirectory)
    if (!this.access.canWriteAsset(path.join(targetDir, 'probe.png'))) {
      throw new AccessDeniedError(targetDir)
    }
    await fs.mkdir(targetDir, { recursive: true })

    const fileName = path.basename(sourcePath)
    for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt++) {
      const target = path.join(targetDir, candidateName(fileName, attempt))
      try {
        // COPYFILE_EXCL never overwrites, even if another process creates the file meanwhile.
        await fs.copyFile(sourcePath, target, constants.COPYFILE_EXCL)
        return { path: target, copied: true }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        // Dropping the same picture twice reuses the earlier copy instead of duplicating it.
        if (await sameContent(sourcePath, target).catch(() => false)) {
          return { path: target, copied: false }
        }
      }
    }
    throw new FileOperationError(`Could not find a free file name for "${fileName}".`)
  }
}
