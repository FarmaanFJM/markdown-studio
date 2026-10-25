import { isAbsolutePath, isPathInside, joinPath } from '../paths'

export interface DocumentContext {
  /** Directory of the Markdown file, or null for an unsaved document. */
  documentDirectory: string | null
  workspaceRoot: string | null
}

/** Base directory for relative references: the document's folder, else the workspace. */
export function baseDirectory(context: DocumentContext): string | null {
  return context.documentDirectory ?? context.workspaceRoot
}

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Converts a `file:` URL to a path, accepting both `file:///C:/x` and `file:///home/x`. */
function fileUrlToPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    const pathname = safeDecode(parsed.pathname)
    return /^\/[a-zA-Z]:\//.test(pathname) ? pathname.slice(1) : pathname
  } catch {
    return null
  }
}

/**
 * Resolves a reference found in a document (image `src`, link `href`) to an absolute local
 * path. Returns null for web URLs, fragments and unsupported schemes.
 *
 * A leading `/` means "relative to the workspace root", as on GitHub, unless the path
 * already points inside the workspace.
 *
 * This is the single definition of how links and images map to files: the preview, link
 * validation, path completion and reference updates all use it.
 */
export function resolveLocalPath(reference: string, context: DocumentContext): string | null {
  const trimmed = reference.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null
  if (/^file:/i.test(trimmed)) return fileUrlToPath(trimmed)
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[a-z]:[\\/]/i.test(trimmed)) return null

  const decoded = safeDecode(trimmed.split(/[?#]/)[0])
  if (!decoded) return null
  const { workspaceRoot } = context
  if (/^[\\/](?![\\/])/.test(decoded) && workspaceRoot && !isPathInside(workspaceRoot, decoded)) {
    return joinPath(workspaceRoot, decoded.slice(1))
  }
  if (isAbsolutePath(decoded)) return joinPath(decoded)
  const base = baseDirectory(context)
  return base ? joinPath(base, decoded) : null
}
