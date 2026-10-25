import { localFileUrl } from '@shared/ipc'
import { resolveLocalPath, type DocumentContext } from '@shared/markdown/resolve'

export { baseDirectory, resolveLocalPath, type DocumentContext } from '@shared/markdown/resolve'

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,]/i

/** Maps an image `src` to a URL the preview may load, or null to drop it. */
export function resolveImageSource(src: string, context: DocumentContext): string | null {
  const trimmed = src.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (SAFE_DATA_IMAGE.test(trimmed)) return trimmed
  const local = resolveLocalPath(trimmed, context)
  return local ? localFileUrl(local) : null
}
