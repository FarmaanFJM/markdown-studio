import {
  applyUpdate,
  planReferenceUpdates,
  type FileUpdate,
  type MarkdownSnapshot
} from '@shared/markdown/moves'
import { basename, dirname, isPathInside, joinPath, pathsEqual, relativePath } from '@shared/paths'
import type { DirEntry } from '@shared/ipc'
import { api, errorMessage } from '../bridge'
import { documentModels } from '../editor/models'
import { monaco } from '../editor/monaco'
import { invalidateWorkspaceIndex } from '../workspace'
import {
  handlePathRenamed,
  saveDocument,
  useDocuments,
  type EditorDocument
} from '../state/documents'
import { dialogs, notify } from '../state/ui'
import { useWorkspace } from '../state/workspace'

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024
const READ_CONCURRENCY = 12

interface Scanned {
  snapshots: MarkdownSnapshot[]
  /** Open documents by path, so edits go through their editors. */
  open: Map<string, EditorDocument>
  unreadable: string[]
  truncated: boolean
}

function openDocumentFor(path: string): EditorDocument | undefined {
  return useDocuments.getState().documents.find((d) => d.path && pathsEqual(d.path, path))
}

/** Reads every Markdown document of the workspace; open documents contribute their editor text. */
async function scanWorkspace(): Promise<Scanned> {
  const listing = await api.fs.listFiles({ extensions: ['.md', '.markdown'], limit: 5000 })
  const open = new Map<string, EditorDocument>()
  const snapshots: MarkdownSnapshot[] = []
  const unreadable: string[] = []
  const queue = [...listing.files]

  const worker = async () => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      const doc = openDocumentFor(path)
      const model = doc ? documentModels.get(doc.id) : null
      if (doc && model) {
        open.set(path, doc)
        snapshots.push({ path, content: model.getValue() })
        continue
      }
      try {
        const file = await api.fs.readText(path)
        if (file.content.length <= MAX_DOCUMENT_BYTES)
          snapshots.push({ path, content: file.content })
        else unreadable.push(path)
      } catch {
        unreadable.push(path)
      }
    }
  }
  await Promise.all(Array.from({ length: READ_CONCURRENCY }, worker))

  // Documents open from outside the workspace listing (unsaved files are not on disk).
  for (const doc of useDocuments.getState().documents) {
    if (!doc.path || open.has(doc.path)) continue
    const model = documentModels.get(doc.id)
    const root = useWorkspace.getState().root
    if (model && root && snapshots.every((s) => !pathsEqual(s.path, doc.path!))) {
      if (relativePath(root, doc.path)?.startsWith('..') === false) {
        open.set(doc.path, doc)
        snapshots.push({ path: doc.path, content: model.getValue() })
      }
    }
  }
  return { snapshots, open, unreadable, truncated: listing.truncated }
}

interface Outcome {
  updatedFiles: number
  updatedReferences: number
  failures: string[]
}

const sameText = (a: string, b: string) => a.replace(/\r\n?/g, '\n') === b.replace(/\r\n?/g, '\n')

async function applyToEditor(
  doc: EditorDocument,
  update: FileUpdate,
  snapshot: MarkdownSnapshot
): Promise<void> {
  const model = documentModels.get(doc.id)
  if (!model) throw new Error('The document is no longer open.')
  const wasClean = !doc.dirty
  if (wasClean) {
    // Saving would replace the file; refuse if someone else changed it since it was opened.
    const onDisk = await api.fs.readText(update.newPath)
    if (!sameText(onDisk.content, snapshot.content)) {
      throw new Error('The file changed on disk after it was opened; reload it and try again.')
    }
  }
  const edits = update.replacements.map((r) => ({
    range: new monaco.Range(r.line + 1, r.column + 1, r.endLine + 1, r.endColumn + 1),
    text: r.text
  }))
  model.pushStackElement()
  model.pushEditOperations([], edits, () => null)
  model.pushStackElement()
  // A document without unsaved work is saved so disk and editor agree; one with unsaved work
  // keeps its changes in the editor only, so nothing the user has not saved is written.
  if (wasClean && !(await saveDocument(doc.id))) {
    throw new Error('The updated document could not be saved.')
  }
}

async function applyToDisk(update: FileUpdate, snapshot: MarkdownSnapshot): Promise<void> {
  const file = await api.fs.readText(update.newPath)
  if (file.content !== snapshot.content) {
    throw new Error('The file changed on disk after it was scanned.')
  }
  await api.fs.writeText(
    update.newPath,
    applyUpdate(file.content, update),
    file.hasBom,
    file.mtimeMs
  )
}

async function applyUpdates(
  updates: FileUpdate[],
  snapshots: Map<string, MarkdownSnapshot>
): Promise<Outcome> {
  const outcome: Outcome = { updatedFiles: 0, updatedReferences: 0, failures: [] }
  for (const update of updates) {
    const doc = openDocumentFor(update.newPath)
    try {
      if (doc) await applyToEditor(doc, update, snapshots.get(update.path)!)
      else await applyToDisk(update, snapshots.get(update.path)!)
      outcome.updatedFiles++
      outcome.updatedReferences += update.replacements.length
    } catch (error) {
      outcome.failures.push(`${basename(update.newPath)}: ${errorMessage(error)}`)
    }
  }
  return outcome
}

function describePlan(
  root: string,
  updates: FileUpdate[],
  open: Map<string, EditorDocument>
): string[] {
  return updates.map((update) => {
    const count = update.replacements.length
    const name = relativePath(root, update.path) ?? basename(update.path)
    const doc = open.get(update.path)
    const note = doc?.dirty ? ' (has unsaved changes: updated in the editor only)' : ''
    return `${name} — ${count} reference${count === 1 ? '' : 's'}${note}`
  })
}

/**
 * Renames or moves a file or folder of the workspace and keeps the Markdown references to it
 * (and the moved documents' own relative links) valid. The user confirms before any document is
 * modified; unsaved editor changes are never written to disk or overwritten.
 */
async function performOperation(
  entry: DirEntry,
  operation: 'rename' | 'move',
  destination: string,
  execute: () => Promise<string>
): Promise<string | null> {
  const root = useWorkspace.getState().root
  const verb = operation === 'rename' ? 'Rename' : 'Move'

  let scan: Scanned | null = null
  let plan: ReturnType<typeof planReferenceUpdates> | null = null
  if (root) {
    try {
      scan = await scanWorkspace()
      const to =
        operation === 'rename'
          ? joinPath(dirname(entry.path), destination)
          : joinPath(destination, entry.name)
      plan = planReferenceUpdates(scan.snapshots, { from: entry.path, to }, root)
    } catch (error) {
      notify('error', `Could not check references: ${errorMessage(error)}`)
    }
  }

  let update = false
  if (root && scan && plan && (plan.updates.length > 0 || plan.unresolved.length > 0)) {
    const warnings: string[] = []
    if (plan.unresolved.length > 0) {
      warnings.push(
        `${plan.unresolved.length} reference(s) cannot be updated automatically and will break.`
      )
    }
    if (scan.truncated) warnings.push('The folder has more Markdown files than could be checked.')
    if (scan.unreadable.length > 0) {
      warnings.push(`${scan.unreadable.length} document(s) could not be read and were not checked.`)
    }
    const total = plan.total
    const choice = await dialogs.choice({
      title: `${verb} and Update References`,
      message: `${verb} "${entry.name}"? ${total} Markdown reference${total === 1 ? '' : 's'} in ${plan.updates.length} document${plan.updates.length === 1 ? '' : 's'} point${plan.updates.length === 1 && total === 1 ? 's' : ''} at ${plan.updates.some((u) => u.path !== u.newPath) ? 'it or move with it' : 'it'}.`,
      items: describePlan(root, plan.updates, scan.open),
      detail: warnings.join('\n') || undefined,
      options: [
        { value: 'update', label: `${verb} and Update References`, primary: true },
        { value: 'only', label: `${verb} Without Updating` }
      ]
    })
    if (choice === null) return null
    update = choice === 'update'
  }

  let result: string
  try {
    result = await execute()
  } catch (error) {
    notify('error', errorMessage(error))
    return null
  }
  handlePathRenamed(entry.path, result)
  invalidateWorkspaceIndex()

  if (update && plan && scan) {
    const byPath = new Map(scan.snapshots.map((s) => [s.path, s]))
    const outcome = await applyUpdates(plan.updates, byPath)
    if (outcome.failures.length > 0) {
      await dialogs.choice({
        title: `${verb}d, but Some References Were Not Updated`,
        message: `"${entry.name}" was ${operation === 'rename' ? 'renamed' : 'moved'}. ${outcome.updatedReferences} reference${outcome.updatedReferences === 1 ? ' was' : 's were'} updated; these documents could not be updated:`,
        items: outcome.failures,
        detail: 'The editor marks the references that no longer resolve.',
        options: []
      })
    } else {
      notify(
        'success',
        `${operation === 'rename' ? 'Renamed' : 'Moved'} ${entry.name} and updated ${outcome.updatedReferences} reference${outcome.updatedReferences === 1 ? '' : 's'} in ${outcome.updatedFiles} document${outcome.updatedFiles === 1 ? '' : 's'}.`
      )
    }
  } else if (plan && plan.updates.length > 0) {
    notify('info', 'References were not updated; the editor marks the ones that no longer resolve.')
  }

  const workspace = useWorkspace.getState()
  await workspace.refresh([dirname(entry.path), dirname(result)])
  workspace.select(result)
  return result
}

export function renameWithReferences(entry: DirEntry, newName: string): Promise<string | null> {
  return performOperation(entry, 'rename', newName, () => api.fs.rename(entry.path, newName))
}

export function moveWithReferences(
  entry: DirEntry,
  targetDirectory: string
): Promise<string | null> {
  if (pathsEqual(dirname(entry.path), targetDirectory)) return Promise.resolve(null)
  if (isPathInside(entry.path, targetDirectory)) {
    notify('error', `"${entry.name}" cannot be moved into itself.`)
    return Promise.resolve(null)
  }
  return performOperation(entry, 'move', targetDirectory, () =>
    api.fs.move(entry.path, targetDirectory)
  )
}
