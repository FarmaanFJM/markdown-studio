import { basename } from '@shared/paths'
import { dialogs } from './ui'
import { api } from '../bridge'
import { activateDocument, openDocument, restoreDraft, useDocuments } from './documents'
import { discardSnapshot, pendingSnapshots } from './recovery'
import { useSettings } from './settings'
import { useWorkspace } from './workspace'

/** Remembers which documents are open so the next start can open them again. */
export function startSessionTracking(): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const save = () => {
    const { documents, activeId } = useDocuments.getState()
    const openFiles = documents.flatMap((d) => (d.path ? [d.path] : []))
    const activeFile = documents.find((d) => d.id === activeId)?.path ?? null
    const current = useSettings.getState().settings.workspace
    if (
      current.activeFile === activeFile &&
      current.openFiles.length === openFiles.length &&
      current.openFiles.every((p, i) => p === openFiles[i])
    ) {
      return
    }
    useSettings.getState().update({ workspace: { openFiles, activeFile } })
  }
  useDocuments.subscribe((state, previous) => {
    if (
      state.activeId === previous.activeId &&
      state.documents.length === previous.documents.length &&
      state.documents.every((d, i) => d.path === previous.documents[i]?.path)
    ) {
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 400)
  })
}

/** Opens the documents of the last session (those that still exist and may be read). */
export async function restoreSession(): Promise<void> {
  const { openFiles, activeFile, restoreLastWorkspace, lastWorkspace } =
    useSettings.getState().settings.workspace
  if (!restoreLastWorkspace || !lastWorkspace || !useWorkspace.getState().root) return
  const states = await api.fs.statMany(openFiles).catch(() => [])
  for (const [index, file] of openFiles.entries()) {
    if (states[index] === 'file') await openDocument(file)
  }
  if (activeFile) {
    const active = useDocuments.getState().documents.find((d) => d.path === activeFile)
    if (active) activateDocument(active.id)
  }
}

/** Offers unsaved text left behind by a crash or a killed process. */
export async function offerRecovery(): Promise<void> {
  const pending = await pendingSnapshots()
  if (pending.length === 0) return
  const names = pending.map((s) => s.name || (s.path ? basename(s.path) : 'Untitled'))
  const choice = await dialogs.choice({
    title: 'Recover unsaved work?',
    message: `Markdown Studio did not close normally last time. It kept the unsaved text of ${pending.length} document${pending.length === 1 ? '' : 's'}.`,
    detail: names.join('\n'),
    options: [
      { value: 'restore', label: 'Restore', primary: true },
      { value: 'discard', label: 'Discard', danger: true }
    ]
  })
  if (choice === 'restore') {
    for (const snapshot of pending) {
      // The file may be open already (restored session): the draft replaces nothing silently.
      restoreDraft({ ...snapshot, name: snapshot.name })
    }
    // The restored documents write their own fresh copies; the old ones can go.
    for (const snapshot of pending) await discardSnapshot(snapshot)
    const last = useDocuments.getState().documents.at(-1)
    if (last) activateDocument(last.id)
  } else if (choice === 'discard') {
    for (const snapshot of pending) await discardSnapshot(snapshot)
  }
}
