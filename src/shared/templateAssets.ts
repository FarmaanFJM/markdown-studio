import { analyzeDocument } from './markdown/analysis'
import {
  applyReplacements,
  classifyReference,
  extractReferences,
  renderDestination,
  replacementFor,
  type DocReference
} from './markdown/references'
import { resolveLocalPath } from './markdown/resolve'
import { isPathInside, joinPath, relativePath } from './paths'

/**
 * Templates cannot carry files with them, so references to local files inside a template need
 * care. These helpers find them, make them independent of the folder they were written in, and
 * re-point them for each new document.
 */

export interface LocalReference {
  reference: DocReference
  /** The path part as written (may be percent-encoded). */
  path: string
  suffix: string
}

/** Links and images that point at local files (not web URLs, mail links or `#anchors`). */
export function localReferences(body: string): LocalReference[] {
  const found: LocalReference[] = []
  for (const reference of extractReferences(analyzeDocument(body))) {
    const target = classifyReference(reference.value)
    if (target.type === 'local' && target.path) {
      found.push({ reference, path: target.path, suffix: target.suffix })
    }
  }
  return found
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Rewrites references that resolve inside the workspace to workspace-root form (`/assets/a.png`)
 * so they stay valid wherever the new document is created. Returns the new text and how many
 * references were rewritten.
 */
export function makeWorkspaceRelative(
  body: string,
  context: { documentDirectory: string | null; workspaceRoot: string }
): { text: string; changed: number } {
  const replacements = []
  for (const local of localReferences(body)) {
    const absolute = resolveLocalPath(local.reference.value, context)
    if (!absolute || !isPathInside(context.workspaceRoot, absolute)) continue
    const relative = relativePath(context.workspaceRoot, absolute)
    if (relative === null || relative === '.') continue
    const rooted = `/${relative}`
    if (decode(local.path) === rooted) continue
    replacements.push(
      replacementFor(local.reference, renderDestination(local.reference, rooted, local.suffix))
    )
  }
  return { text: applyReplacements(body, replacements), changed: replacements.length }
}

export interface PreparedAssets {
  text: string
  /** Absolute paths the document's local references point at, for existence checks. */
  targets: { value: string; path: string }[]
}

/**
 * Points workspace-root references (`/assets/a.png`) at the right relative path for a document
 * created in `documentDirectory`, and lists every local target so the caller can report the
 * ones that do not exist.
 */
export function prepareAssetsForDocument(
  body: string,
  context: { documentDirectory: string; workspaceRoot: string | null }
): PreparedAssets {
  const replacements = []
  const targets: PreparedAssets['targets'] = []
  for (const local of localReferences(body)) {
    const decoded = decode(local.path)
    const rooted = /^\/(?!\/)/.test(decoded) && context.workspaceRoot !== null
    if (rooted && !isPathInside(context.workspaceRoot!, decoded)) {
      const absolute = joinPath(context.workspaceRoot!, decoded.slice(1))
      const relative = relativePath(context.documentDirectory, absolute)
      if (relative !== null) {
        replacements.push(
          replacementFor(
            local.reference,
            renderDestination(local.reference, relative, local.suffix)
          )
        )
        targets.push({ value: relative, path: absolute })
        continue
      }
    }
    const absolute = resolveLocalPath(local.reference.value, {
      documentDirectory: context.documentDirectory,
      workspaceRoot: context.workspaceRoot
    })
    if (absolute) targets.push({ value: local.reference.value, path: absolute })
  }
  return { text: applyReplacements(body, replacements), targets }
}
