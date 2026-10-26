import { create } from 'zustand'
import { planReferenceUpdates } from '@shared/markdown/moves'
import { basename, dirname, isPathInside, joinPath, pathsEqual } from '@shared/paths'
import { api, errorMessage } from '../bridge'
import { documentModels } from '../editor/models'
import { configureRecovery, dropSnapshot, scheduleSnapshot } from './recovery'
import { dialogs, notify } from './ui'
import { useWorkspace } from './workspace'

export interface EditorDocument {
  id: string
  /** Absolute path on disk, or null for a document that has never been saved. */
  path: string | null
  untitledName: string | null
  hasBom: boolean
  dirty: boolean
  /** Monaco alternative version id at the last save; undoing back to it clears `dirty`. */
  savedVersion: number
  /** Modification time of the file when it was read or last written; null for a new document. */
  mtimeMs: number | null
  /** The file changed on disk while this document had unsaved edits. */
  conflict: boolean
  /** Why the last attempt to save failed; cleared by the next successful save. */
  saveError: string | null
}

export interface CursorInfo {
  line: number
  column: number
  selectedCharacters: number
}

interface DocumentsState {
  documents: EditorDocument[]
  activeId: string | null
  /** Increments whenever the active document's text changes. */
  revision: number
  cursor: CursorInfo
}

export const useDocuments = create<DocumentsState>(() => ({
  documents: [],
  activeId: null,
  revision: 0,
  cursor: { line: 1, column: 1, selectedCharacters: 0 }
}))

let nextId = 1

// Text that is only in memory is mirrored to disk shortly after each edit (see recovery.ts).
configureRecovery((id) => {
  const doc = getDocument(id)
  const model = documentModels.get(id)
  if (!doc || !model || !doc.dirty) return null
  return {
    path: doc.path,
    name: documentName(doc),
    content: model.getValue(),
    hasBom: doc.hasBom,
    mtimeMs: doc.mtimeMs
  }
})

/** Re-opens text recovered after an unclean exit as an unsaved document. */
export function restoreDraft(draft: {
  path: string | null
  name: string
  content: string
  hasBom: boolean
  mtimeMs: number | null
}): string {
  const open = draft.path
    ? useDocuments.getState().documents.find((d) => d.path && pathsEqual(d.path, draft.path!))
    : undefined
  const openModel = open ? documentModels.get(open.id) : null
  if (open && openModel) {
    // The file is already open (restored session): the draft's text goes into that tab, so the
    // work is not lost and no second tab for the same file appears.
    openModel.pushEditOperations(
      [],
      [{ range: openModel.getFullModelRange(), text: draft.content }],
      () => null
    )
    patchDocument(open.id, { mtimeMs: draft.mtimeMs ?? open.mtimeMs })
    scheduleSnapshot(open.id, 0)
    return open.id
  }
  const id = addDocument(
    {
      path: draft.path,
      untitledName: draft.path ? null : draft.name.replace(/\.[^.]+$/, ''),
      hasBom: draft.hasBom,
      mtimeMs: draft.mtimeMs,
      dirty: true
    },
    draft.content
  )
  scheduleSnapshot(id, 0)
  return id
}

export function documentName(doc: EditorDocument): string {
  return doc.path ? basename(doc.path) : (doc.untitledName ?? 'Untitled')
}

export function getDocument(id: string | null): EditorDocument | null {
  return useDocuments.getState().documents.find((d) => d.id === id) ?? null
}

export function activeDocument(): EditorDocument | null {
  return getDocument(useDocuments.getState().activeId)
}

function patchDocument(id: string, patch: Partial<EditorDocument>): void {
  useDocuments.setState((s) => ({
    documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d))
  }))
}

function addDocument(
  doc: Omit<EditorDocument, 'id' | 'dirty' | 'savedVersion' | 'conflict' | 'saveError'> & {
    dirty?: boolean
  },
  content: string
): string {
  const id = String(nextId++)
  const model = documentModels.create(id, content)
  const savedVersion = model.getAlternativeVersionId()
  model.onDidChangeContent(() => {
    const current = getDocument(id)
    if (!current) return
    const dirty = model.getAlternativeVersionId() !== current.savedVersion
    if (dirty !== current.dirty) patchDocument(id, { dirty })
    if (dirty) scheduleSnapshot(id)
    else dropSnapshot(id)
    if (useDocuments.getState().activeId === id) {
      useDocuments.setState((s) => ({ revision: s.revision + 1 }))
    }
  })
  useDocuments.setState((s) => ({
    documents: [
      ...s.documents,
      {
        ...doc,
        id,
        // A restored draft starts dirty: its version never matches a saved state.
        dirty: doc.dirty ?? false,
        savedVersion: doc.dirty ? -1 : savedVersion,
        conflict: false,
        saveError: null
      }
    ],
    activeId: id,
    revision: s.revision + 1
  }))
  return id
}

export function activateDocument(id: string): void {
  if (!getDocument(id)) return
  useDocuments.setState((s) => ({ activeId: id, revision: s.revision + 1 }))
}

export function newDocument(): string {
  const used = new Set(useDocuments.getState().documents.map((d) => d.untitledName))
  let n = 1
  while (used.has(`Untitled-${n}`)) n++
  return addDocument(
    { path: null, untitledName: `Untitled-${n}`, hasBom: false, mtimeMs: null },
    ''
  )
}

export async function openDocument(path: string): Promise<string | null> {
  const existing = useDocuments.getState().documents.find((d) => d.path && pathsEqual(d.path, path))
  if (existing) {
    activateDocument(existing.id)
    return existing.id
  }
  try {
    const file = await api.fs.readText(path)
    // Another call may have opened the same file while it was being read.
    const raced = useDocuments.getState().documents.find((d) => d.path && pathsEqual(d.path, path))
    if (raced) {
      activateDocument(raced.id)
      return raced.id
    }
    return addDocument(
      { path: file.path, untitledName: null, hasBom: file.hasBom, mtimeMs: file.mtimeMs },
      file.content
    )
  } catch (error) {
    notify('error', `Could not open ${basename(path)}: ${errorMessage(error)}`)
    return null
  }
}

/** The save failed because the file was changed by someone else after it was opened. */
function isConflict(error: unknown): boolean {
  return /was changed on disk after it was opened/i.test(errorMessage(error))
}

type ConflictChoice = 'overwrite' | 'saveAs' | 'reload' | null

async function askAboutConflict(doc: EditorDocument): Promise<ConflictChoice> {
  const choice = await dialogs.choice({
    title: `${documentName(doc)} changed on disk`,
    message: `Another program changed ${documentName(doc)} after you opened it. Saving now would replace those changes.`,
    detail:
      'Choose Save As to keep both versions, or Reload to take the version on disk and discard your edits.',
    options: [
      { value: 'saveAs', label: 'Save As…', primary: true },
      { value: 'overwrite', label: 'Overwrite', danger: true },
      { value: 'reload', label: 'Reload from Disk' }
    ]
  })
  return choice as ConflictChoice
}

async function writeDocument(
  doc: EditorDocument,
  path: string,
  options: { guard?: boolean } = {}
): Promise<boolean> {
  const model = documentModels.get(doc.id)
  if (!model) return false
  const version = model.getAlternativeVersionId()
  let written: { mtimeMs: number }
  try {
    const guard = options.guard !== false && doc.path && pathsEqual(doc.path, path)
    written = await api.fs.writeText(
      path,
      model.getValue(),
      doc.hasBom,
      guard && doc.mtimeMs !== null ? doc.mtimeMs : undefined
    )
  } catch (error) {
    if (isConflict(error)) {
      const choice = await askAboutConflict(doc)
      if (choice === 'overwrite') return writeDocument(doc, path, { guard: false })
      if (choice === 'saveAs') return saveDocumentAs(doc.id)
      if (choice === 'reload') {
        await reloadFromDisk(doc.id)
      }
      return false
    }
    const message = errorMessage(error)
    patchDocument(doc.id, { saveError: message })
    notify(
      'error',
      `Could not save ${basename(path)}: ${message}. Your text is still open and unsaved.`
    )
    return false
  }
  // Edits made while the write was in flight keep the document dirty.
  patchDocument(doc.id, {
    path,
    untitledName: null,
    savedVersion: version,
    dirty: model.getAlternativeVersionId() !== version,
    mtimeMs: written.mtimeMs,
    conflict: false,
    saveError: null
  })
  if (model.getAlternativeVersionId() === version) dropSnapshot(doc.id)
  const root = useWorkspace.getState().root
  if (root && isPathInside(root, path)) void useWorkspace.getState().refresh([dirname(path)])
  return true
}

/**
 * Replaces the text of a document with the file's current content, as one undoable edit, and
 * marks it as saved. Used when the file changed on disk.
 */
export async function reloadFromDisk(id: string): Promise<boolean> {
  const doc = getDocument(id)
  const model = documentModels.get(id)
  if (!doc?.path || !model) return false
  try {
    const file = await api.fs.readText(doc.path)
    model.pushStackElement()
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: file.content }],
      () => null
    )
    model.pushStackElement()
    patchDocument(id, {
      hasBom: file.hasBom,
      mtimeMs: file.mtimeMs,
      savedVersion: model.getAlternativeVersionId(),
      dirty: false,
      conflict: false
    })
    return true
  } catch (error) {
    notify('error', `Could not reload ${basename(doc.path)}: ${errorMessage(error)}`)
    return false
  }
}

/**
 * Looks at the files of the open documents when the window gets focus again. Documents without
 * unsaved edits follow the file; documents with edits are flagged, and saving asks first.
 */
export async function checkForExternalChanges(): Promise<void> {
  for (const doc of useDocuments.getState().documents) {
    if (!doc.path || doc.mtimeMs === null) continue
    try {
      const file = await api.fs.readText(doc.path)
      if (Math.abs(file.mtimeMs - doc.mtimeMs) <= 1) continue
      const model = documentModels.get(doc.id)
      if (model && model.getValue() === file.content) {
        patchDocument(doc.id, { mtimeMs: file.mtimeMs, conflict: false })
        continue
      }
      if (!getDocument(doc.id)?.dirty) {
        if (await reloadFromDisk(doc.id)) {
          notify('info', `${basename(doc.path)} changed on disk and was reloaded.`)
        }
      } else if (!getDocument(doc.id)?.conflict) {
        patchDocument(doc.id, { conflict: true })
        notify(
          'error',
          `${basename(doc.path)} changed on disk while you have unsaved edits. Saving will ask what to do.`
        )
      }
    } catch {
      // A file that disappeared is reported when it is saved; nothing to do here.
    }
  }
}

export async function saveDocument(id = useDocuments.getState().activeId): Promise<boolean> {
  const doc = getDocument(id)
  if (!doc) return false
  if (!doc.path) return saveDocumentAs(doc.id)
  return writeDocument(doc, doc.path)
}

/**
 * Relative links and images keep working when a document is saved somewhere else: the
 * references are rewritten (as one undoable edit) so they still point at the same files.
 */
async function relinkForNewLocation(doc: EditorDocument, target: string): Promise<boolean> {
  const model = documentModels.get(doc.id)
  const root = useWorkspace.getState().root
  const from = doc.path ?? (root ? joinPath(root, 'Untitled.md') : null)
  if (!model || !from || !root || dirname(from) === dirname(target)) return true
  const plan = planReferenceUpdates(
    [{ path: from, content: model.getValue() }],
    { from, to: target },
    root
  )
  const update = plan.updates[0]
  if (!update || update.replacements.length === 0) return true
  const choice = await dialogs.choice({
    title: 'Update links for the new location?',
    message: `${update.replacements.length} link${update.replacements.length === 1 ? '' : 's'} and image${update.replacements.length === 1 ? '' : 's'} in this document use paths relative to its current folder.`,
    detail: update.changes
      .slice(0, 5)
      .map((c) => `${c.before.slice(0, 60)}  →  ${c.after}`)
      .join('\n'),
    options: [
      { value: 'update', label: 'Update References', primary: true },
      { value: 'keep', label: 'Keep as Written' }
    ]
  })
  if (choice === null) return false
  if (choice === 'update') {
    model.pushStackElement()
    model.pushEditOperations(
      [],
      update.replacements.map((r) => ({
        range: {
          startLineNumber: r.line + 1,
          startColumn: r.column + 1,
          endLineNumber: r.endLine + 1,
          endColumn: r.endColumn + 1
        },
        text: r.text
      })),
      () => null
    )
    model.pushStackElement()
  }
  return true
}

export async function saveDocumentAs(id = useDocuments.getState().activeId): Promise<boolean> {
  const doc = getDocument(id)
  if (!doc) return false
  const root = useWorkspace.getState().root
  const suggested = doc.path ?? joinPath(root ?? '', `${doc.untitledName ?? 'Untitled'}.md`)
  const target = await api.dialogs.saveMarkdown(suggested)
  if (!target) return false
  const other = useDocuments
    .getState()
    .documents.find((d) => d.id !== doc.id && d.path && pathsEqual(d.path, target))
  if (other) {
    notify('error', `${basename(target)} is open in another tab. Close it before saving over it.`)
    return false
  }
  if (!(await relinkForNewLocation(doc, target))) return false
  return writeDocument(getDocument(doc.id) ?? doc, target, { guard: false })
}

export async function saveAllDocuments(): Promise<boolean> {
  for (const doc of useDocuments.getState().documents.filter((d) => d.dirty)) {
    if (!(await saveDocument(doc.id))) return false
  }
  return true
}

function removeDocument(id: string): void {
  const { documents, activeId } = useDocuments.getState()
  const index = documents.findIndex((d) => d.id === id)
  if (index < 0) return
  const remaining = documents.filter((d) => d.id !== id)
  const nextActive =
    activeId === id ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null) : activeId
  useDocuments.setState((s) => ({
    documents: remaining,
    activeId: nextActive,
    revision: s.revision + 1
  }))
  dropSnapshot(id)
  documentModels.dispose(id)
}

/** Closes a tab, asking what to do with unsaved changes. Resolves false if cancelled. */
export async function closeDocument(id = useDocuments.getState().activeId): Promise<boolean> {
  const doc = getDocument(id)
  if (!doc) return false
  if (doc.dirty) {
    activateDocument(doc.id)
    const choice = await dialogs.unsaved([documentName(doc)])
    if (choice === 'cancel') return false
    if (choice === 'save' && !(await saveDocument(doc.id))) return false
  }
  removeDocument(doc.id)
  return true
}

/** Resolves every unsaved document before the window closes. */
export async function confirmCloseAll(): Promise<boolean> {
  const dirty = useDocuments.getState().documents.filter((d) => d.dirty)
  if (dirty.length === 0) return true
  activateDocument(dirty[0].id)
  const choice = await dialogs.unsaved(dirty.map(documentName))
  if (choice === 'cancel') return false
  if (choice === 'save') return saveAllDocuments()
  return true
}

/**
 * Closes the tabs of files inside `folder`, asking about unsaved changes first. Used before the
 * workspace changes, because access to the old folder ends with it.
 */
export async function closeDocumentsIn(folder: string): Promise<boolean> {
  const inside = useDocuments
    .getState()
    .documents.filter((d) => d.path && isPathInside(folder, d.path))
  const dirty = inside.filter((d) => d.dirty)
  if (dirty.length > 0) {
    activateDocument(dirty[0].id)
    const choice = await dialogs.unsaved(dirty.map(documentName))
    if (choice === 'cancel') return false
    if (choice === 'save') {
      for (const doc of dirty) if (!(await saveDocument(doc.id))) return false
    }
  }
  for (const doc of inside) removeDocument(doc.id)
  return true
}

/** Keeps open tabs pointing at files and folders renamed in the Explorer. */
export function handlePathRenamed(oldPath: string, newPath: string): void {
  for (const doc of useDocuments.getState().documents) {
    if (!doc.path || !isPathInside(oldPath, doc.path)) continue
    const suffix = doc.path.slice(oldPath.length).replace(/^[\\/]/, '')
    patchDocument(doc.id, { path: suffix ? joinPath(newPath, suffix) : newPath })
  }
}

/** Closes tabs of deleted files; unsaved ones stay open so no work is lost. */
export function handlePathDeleted(path: string): void {
  for (const doc of useDocuments.getState().documents) {
    if (!doc.path || !isPathInside(path, doc.path)) continue
    if (doc.dirty)
      notify('info', `${documentName(doc)} was deleted from disk but still has unsaved changes.`)
    else removeDocument(doc.id)
  }
}
