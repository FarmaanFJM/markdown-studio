import type { CopilotSync } from '@shared/ai/copilot'
import { api } from '../bridge'
import { documentModels } from '../editor/models'
import { monaco } from '../editor/monaco'
import { useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'
import { useWorkspace } from '../state/workspace'
import { currentAvailability, useAi } from './state'

type Model = monaco.editor.ITextModel

interface Shared {
  id: string
  model: Model
  /** Version number of the last event sent for this document. */
  version: number
  generation: number
  /** Resolves true once the language server has the document. */
  opened: Promise<boolean>
  listener: monaco.IDisposable
}

/** Versions only ever increase, across documents and re-opens. */
let versionCounter = 0
let shared: Shared | null = null

function send(event: CopilotSync): Promise<boolean> {
  return api.copilot.sync(event).catch(() => false)
}

/** The shared document for a model, once Copilot has received it; null when it is not shared. */
export async function sharedDocument(
  model: Model
): Promise<{ id: string; version: number } | null> {
  const current = shared
  if (!current || current.model !== model) return null
  if (!(await current.opened) || shared !== current) return null
  return { id: current.id, version: current.version }
}

/** The version of a model's shared copy right now, without waiting. */
export function sharedVersion(model: Model): number | null {
  return shared && shared.model === model ? shared.version : null
}

function closeShared(): void {
  const current = shared
  if (!current) return
  shared = null
  current.listener.dispose()
  void send({ op: 'close', id: current.id })
}

function openShared(model: Model, id: string, generation: number): void {
  const version = ++versionCounter
  const entry: Shared = {
    id,
    model,
    version,
    generation,
    opened: send({ op: 'open', id, version, text: model.getValue() }),
    listener: model.onDidChangeContent((event) => {
      if (shared !== entry) return
      if (event.isFlush) return resend(entry)
      const next = ++versionCounter
      entry.version = next
      const changes = event.changes.map((change) => ({
        range: {
          start: {
            line: change.range.startLineNumber - 1,
            character: change.range.startColumn - 1
          },
          end: { line: change.range.endLineNumber - 1, character: change.range.endColumn - 1 }
        },
        text: change.text
      }))
      entry.opened = entry.opened.then(async (ok) => {
        if (!ok || shared !== entry) return false
        if (await send({ op: 'change', id, version: next, changes })) return true
        resend(entry)
        return false
      })
    })
  }
  shared = entry
  void entry.opened.then((ok) => {
    // Refused (for example because Copilot just became unavailable); try again on the next change.
    if (!ok && shared === entry) closeShared()
  })
}

/** Sends the whole document again, after the language server lost track of it. */
function resend(entry: Shared): void {
  if (shared !== entry) return
  const { model, id, generation } = entry
  closeShared()
  openShared(model, id, generation)
}

/**
 * Decides which document, if any, Copilot may see: only the one open in the editor, and only
 * while GitHub Copilot is the selected provider, AI is on, the account is signed in, and AI is
 * allowed for this folder and document. Anything else closes it in the language server.
 */
export function reconcileCopilotSync(
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null
): void {
  const model = getEditor()?.getModel() ?? null
  const ai = useSettings.getState().settings.ai
  const copilot = useAi.getState().copilot
  const id = model ? documentModels.idOf(model) : null
  const allowed =
    model !== null &&
    id !== null &&
    ai.enabled &&
    ai.provider === 'github-copilot' &&
    copilot.state === 'signed-in' &&
    currentAvailability().available
  if (shared && (!allowed || shared.model !== model || shared.generation !== copilot.generation)) {
    closeShared()
  }
  if (allowed && !shared) openShared(model, id, copilot.generation)
}

/**
 * Keeps the Copilot status current and the shared document in step with the editor. Returns a
 * disposable that tears all of it down.
 */
export function installCopilotSync(
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null
): monaco.IDisposable {
  const reconcile = () => reconcileCopilotSync(getEditor)
  const unsubscribers = [
    api.copilot.onChanged((status) => useAi.getState().setCopilot(status)),
    useSettings.subscribe(reconcile),
    useAi.subscribe((state, previous) => {
      if (state.copilot !== previous.copilot) reconcile()
    }),
    useDocuments.subscribe((state, previous) => {
      if (state.activeId !== previous.activeId) queueMicrotask(reconcile)
    }),
    useWorkspace.subscribe(reconcile)
  ]
  const disposed = monaco.editor.onWillDisposeModel((model) => {
    if (shared?.model === model) closeShared()
  })
  const modelChanged = getEditor()?.onDidChangeModel(reconcile)
  void useAi.getState().refreshCopilot()
  return {
    dispose() {
      unsubscribers.forEach((off) => off())
      disposed.dispose()
      modelChanged?.dispose()
      closeShared()
    }
  }
}
