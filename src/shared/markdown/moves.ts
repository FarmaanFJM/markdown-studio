import { analyzeDocument } from './analysis'
import {
  applyReplacements,
  classifyReference,
  extractReferences,
  renderDestination,
  replacementFor,
  type TextReplacement
} from './references'
import { resolveLocalPath, safeDecode } from './resolve'
import { dirname, isPathInside, joinPath, pathsEqual, relativePath } from '../paths'

/**
 * Planning of Markdown reference updates for a rename or move of a file or folder.
 *
 * Two kinds of references change: references that point at something that moved, and the
 * relative references of a Markdown document that moved itself. Targets are resolved with the
 * same rules as the preview (`resolveLocalPath`), references are located by the Markdown-aware
 * scanner, and only the destination text of each affected reference is replaced.
 */

export interface MoveOperation {
  /** Absolute path before the operation (a file or a folder). */
  from: string
  /** Absolute path after the operation. */
  to: string
}

/** Where `path` ends up after the operation, or null when it is not affected. */
export function remapPath(path: string, operation: MoveOperation): string | null {
  if (!isPathInside(operation.from, path)) return null
  if (pathsEqual(path, operation.from)) return joinPath(operation.to)
  const rest = relativePath(operation.from, path)
  return rest === null ? null : joinPath(operation.to, rest)
}

export interface MarkdownSnapshot {
  path: string
  content: string
}

export interface PlannedChange {
  line: number
  before: string
  after: string
}

export interface FileUpdate {
  /** Path of the file before the operation. */
  path: string
  /** Path of the file after the operation (differs when the file itself moves). */
  newPath: string
  replacements: TextReplacement[]
  changes: PlannedChange[]
}

export interface UnresolvedReference {
  path: string
  line: number
  reference: string
  reason: string
}

export interface UpdatePlan {
  updates: FileUpdate[]
  unresolved: UnresolvedReference[]
  /** Number of references that will change across all files. */
  total: number
}

function normalizedRelative(value: string): string {
  return joinPath('.', safeDecode(value))
}

/**
 * Finds every reference that must change for `operation`. `files` are the Markdown documents of
 * the workspace (current contents, including unsaved editor text where relevant).
 */
export function planReferenceUpdates(
  files: MarkdownSnapshot[],
  operation: MoveOperation,
  workspaceRoot: string
): UpdatePlan {
  const updates: FileUpdate[] = []
  const unresolved: UnresolvedReference[] = []
  let total = 0

  for (const file of files) {
    const newPath = remapPath(file.path, operation) ?? file.path
    const documentMoved = !pathsEqual(newPath, file.path)
    const analysis = analyzeDocument(file.content)
    const before = { documentDirectory: dirname(file.path), workspaceRoot }
    const lines = analysis.lines
    const replacements: TextReplacement[] = []
    const changes: PlannedChange[] = []

    for (const reference of extractReferences(analysis)) {
      const target = classifyReference(reference.value)
      if (target.type !== 'local' || !target.path) continue
      const oldTarget = resolveLocalPath(reference.value, before)
      if (!oldTarget) continue
      const newTarget = remapPath(oldTarget, operation) ?? oldTarget
      const targetMoved = !pathsEqual(newTarget, oldTarget) || newTarget !== oldTarget
      if (!targetMoved && !documentMoved) continue

      const decoded = safeDecode(target.path)
      let newValue: string | null
      if (/^\/(?!\/)/.test(decoded) && !isPathInside(workspaceRoot, decoded)) {
        // Workspace-root style (/docs/a.md): independent of where the document lives.
        const rooted = relativePath(workspaceRoot, newTarget)
        newValue = rooted !== null && isPathInside(workspaceRoot, newTarget) ? `/${rooted}` : null
      } else if (/^([a-zA-Z]:[\\/]|\/)/.test(decoded)) {
        // An absolute file-system path: only follows the target.
        newValue = targetMoved ? newTarget : null
        if (newValue === null) continue
      } else {
        const relative = relativePath(dirname(newPath), newTarget)
        newValue = relative
        if (relative !== null && normalizedRelative(target.path) === relative) continue
      }

      if (newValue === null) {
        unresolved.push({
          path: file.path,
          line: reference.line + 1,
          reference: reference.value,
          reason: 'There is no relative path between the two locations.'
        })
        continue
      }
      if (newValue === decoded) continue

      const text = renderDestination(reference, newValue, target.suffix)
      replacements.push(replacementFor(reference, text))
      changes.push({
        line: reference.line + 1,
        before: lines[reference.line]?.trim() ?? '',
        after: text
      })
    }

    if (replacements.length > 0) {
      updates.push({ path: file.path, newPath, replacements, changes })
      total += replacements.length
    }
  }

  return { updates, unresolved, total }
}

/** Applies a file's planned replacements to its content. */
export function applyUpdate(content: string, update: FileUpdate): string {
  return applyReplacements(content, update.replacements)
}
