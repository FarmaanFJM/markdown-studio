import { create } from 'zustand'
import { basename, dirname, isPathInside, joinPath, pathsEqual } from '@shared/paths'
import { api, errorMessage } from '../bridge'
import { documentModels } from '../editor/models'
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
  doc: Omit<EditorDocument, 'id' | 'dirty' | 'savedVersion'>,
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
    if (useDocuments.getState().activeId === id) {
      useDocuments.setState((s) => ({ revision: s.revision + 1 }))
    }
  })
  useDocuments.setState((s) => ({
    documents: [...s.documents, { ...doc, id, dirty: false, savedVersion }],
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
  return addDocument({ path: null, untitledName: `Untitled-${n}`, hasBom: false }, '')
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
    return addDocument({ path: file.path, untitledName: null, hasBom: file.hasBom }, file.content)
  } catch (error) {
    notify('error', `Could not open ${basename(path)}: ${errorMessage(error)}`)
    return null
  }
}

async function writeDocument(doc: EditorDocument, path: string): Promise<boolean> {
  const model = documentModels.get(doc.id)
  if (!model) return false
  const version = model.getAlternativeVersionId()
  try {
    await api.fs.writeText(path, model.getValue(), doc.hasBom)
  } catch (error) {
    notify('error', `Could not save ${basename(path)}: ${errorMessage(error)}`)
    return false
  }
  // Edits made while the write was in flight keep the document dirty.
  patchDocument(doc.id, {
    path,
    untitledName: null,
    savedVersion: version,
    dirty: model.getAlternativeVersionId() !== version
  })
  const root = useWorkspace.getState().root
  if (root && isPathInside(root, path)) void useWorkspace.getState().refresh([dirname(path)])
  return true
}

export async function saveDocument(id = useDocuments.getState().activeId): Promise<boolean> {
  const doc = getDocument(id)
  if (!doc) return false
  if (!doc.path) return saveDocumentAs(doc.id)
  return writeDocument(doc, doc.path)
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
  return writeDocument(doc, target)
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
