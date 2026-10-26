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

const CLIPBOARD_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif'
}
const MAX_CLIPBOARD_BYTES = 64 * 1024 * 1024

/** Checks that the bytes really are the image type they claim to be. */
export function looksLikeImage(bytes: Uint8Array, mime: string): boolean {
  const at = (offset: number, text: string) =>
    [...text].every((ch, i) => bytes[offset + i] === ch.charCodeAt(0))
  switch (mime) {
    case 'image/png':
      return bytes[0] === 0x89 && at(1, 'PNG')
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/gif':
      return at(0, 'GIF8')
    case 'image/webp':
      return at(0, 'RIFF') && at(8, 'WEBP')
    case 'image/bmp':
      return at(0, 'BM')
    case 'image/avif':
      return at(4, 'ftyp')
    default:
      return false
  }
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

  /**
   * Stores image bytes pasted from the clipboard. The type is taken from the MIME type and
   * verified against the file signature; the name is sanitised and never overwrites a file.
   */
  async saveClipboardImage(
    bytes: unknown,
    mime: unknown,
    targetDirectory: unknown,
    baseName: unknown
  ): Promise<ImportedImage> {
    if (typeof mime !== 'string' || !(mime in CLIPBOARD_TYPES)) {
      throw new FileOperationError('The clipboard does not hold a supported image.')
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new FileOperationError('The clipboard image is empty.')
    }
    if (bytes.byteLength > MAX_CLIPBOARD_BYTES) {
      throw new FileOperationError('The clipboard image is too large to paste.')
    }
    if (!looksLikeImage(bytes, mime)) {
      throw new FileOperationError('The clipboard data is not a valid image.')
    }
    if (typeof targetDirectory !== 'string' || !path.isAbsolute(targetDirectory)) {
      throw new FileOperationError('No asset folder is available for this document.')
    }
    const targetDir = path.resolve(targetDirectory)
    if (!this.access.canWriteAsset(path.join(targetDir, 'probe.png'))) {
      throw new AccessDeniedError(targetDir)
    }
    const stem =
      (typeof baseName === 'string' ? baseName : '')
        .replace(/\.[A-Za-z0-9]+$/, '')
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'image'
    const fileName = `${stem}.${CLIPBOARD_TYPES[mime]}`
    await fs.mkdir(targetDir, { recursive: true })
    const data = Buffer.from(bytes)
    // Pasting the same picture again (even a second later, when the generated name differs)
    // reuses the earlier file instead of piling up copies.
    const extension = path.extname(fileName)
    const earlier = await fs.readdir(targetDir).catch(() => [] as string[])
    for (const name of earlier
      .filter((n) => n.startsWith('pasted-image-') && n.endsWith(extension))
      .slice(-200)) {
      const candidate = path.join(targetDir, name)
      const stat = await fs.stat(candidate).catch(() => null)
      if (stat?.isFile() && stat.size === data.length) {
        const existing = await fs.readFile(candidate).catch(() => null)
        if (existing && existing.equals(data)) return { path: candidate, copied: false }
      }
    }
    for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt++) {
      const target = path.join(targetDir, candidateName(fileName, attempt))
      try {
        await fs.writeFile(target, data, { flag: 'wx' })
        return { path: target, copied: true }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        // Pasting the same picture twice reuses the earlier file.
        const existing = await fs.readFile(target).catch(() => null)
        if (existing && existing.equals(data)) return { path: target, copied: false }
      }
    }
    throw new FileOperationError(`Could not find a free file name for "${fileName}".`)
  }
}
