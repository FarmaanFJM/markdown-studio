import { COPILOT_LIMITS, type CopilotSuggestion } from '@shared/ai/copilot'
import { api } from '../bridge'
import { monaco } from '../editor/monaco'
import { useSettings } from '../state/settings'
import { sharedDocument, sharedVersion } from './copilotSync'
import { currentAvailability, useAi } from './state'

/** Command Monaco runs after a Copilot suggestion is accepted; it reports the acceptance. */
export const COPILOT_ACCEPTED_COMMAND = 'markdownStudio.copilot.accepted'

type Item = monaco.languages.InlineCompletion & { copilotKey?: string; copilotText?: string }

let requestCounter = 0

function wait(ms: number, token: monaco.CancellationToken): Promise<boolean> {
  if (ms <= 0) return Promise.resolve(!token.isCancellationRequested)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(!token.isCancellationRequested), ms)
    token.onCancellationRequested(() => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

/**
 * Turns Copilot's suggestions into Monaco ghost text. A suggestion must replace a range on the
 * cursor's line that contains the cursor and must still match the text typed so far; anything
 * else is dropped rather than shown, so a late or odd answer never edits the wrong place.
 */
function toItems(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  suggestions: CopilotSuggestion[]
): Item[] {
  const items: Item[] = []
  for (const suggestion of suggestions) {
    const { start, end } = suggestion.range
    const range = new monaco.Range(
      start.line + 1,
      start.character + 1,
      end.line + 1,
      end.character + 1
    )
    if (
      range.startLineNumber !== position.lineNumber ||
      range.endLineNumber !== position.lineNumber
    )
      continue
    if (!range.containsPosition(position)) continue
    if (range.startLineNumber > model.getLineCount()) continue
    const text = suggestion.text.slice(0, COPILOT_LIMITS.suggestionCharacters)
    if (text.trim() === '') continue
    items.push({
      insertText: text,
      range,
      copilotKey: suggestion.key,
      copilotText: text,
      command: {
        id: COPILOT_ACCEPTED_COMMAND,
        title: 'Copilot suggestion accepted',
        arguments: [suggestion.key]
      }
    })
  }
  return items
}

/**
 * Inline suggestions from GitHub Copilot at the cursor. Nothing is requested unless Copilot is
 * the selected provider, the account is signed in and AI is allowed for this folder and document;
 * automatic requests also need "Suggest while typing". The user can always ask with the "AI: Continue Writing" command.
 */
export async function provideCopilotCompletions(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  context: monaco.languages.InlineCompletionContext,
  token: monaco.CancellationToken
): Promise<monaco.languages.InlineCompletions<Item>> {
  const none = { items: [] as Item[] }
  const ai = useSettings.getState().settings.ai
  const explicit = context.triggerKind === monaco.languages.InlineCompletionTriggerKind.Explicit
  if (!ai.enabled || ai.provider !== 'github-copilot') return none
  if (!explicit && !ai.inlineSuggestions) return none
  if (useAi.getState().copilot.state !== 'signed-in' || !currentAvailability().available)
    return none

  if (!explicit && !(await wait(ai.copilotDelayMs, token))) return none
  const document = await sharedDocument(model)
  if (!document || token.isCancellationRequested) return none
  // The text the answer will refer to: edits made while waiting make the answer obsolete.
  if (sharedVersion(model) !== document.version || model.isDisposed()) return none

  const requestId = `cp${Date.now().toString(36)}${requestCounter++}`
  const cancel = token.onCancellationRequested(() => void api.copilot.cancel(requestId))
  try {
    const options = model.getOptions()
    const result = await api.copilot.complete({
      requestId,
      id: document.id,
      version: document.version,
      line: position.lineNumber - 1,
      character: position.column - 1,
      trigger: explicit ? 'invoked' : 'automatic',
      tabSize: options.tabSize,
      insertSpaces: options.insertSpaces
    })
    if (!result.ok || token.isCancellationRequested || model.isDisposed()) return none
    // Discard the answer if the document or the cursor moved while it was on its way.
    if (sharedVersion(model) !== document.version) return none
    const cursor = cursorOf(model)
    if (cursor && !cursor.equals(position)) return none
    return { items: toItems(model, position, result.suggestions) }
  } catch {
    return none
  } finally {
    cancel.dispose()
  }
}

function cursorOf(model: monaco.editor.ITextModel): monaco.Position | null {
  for (const editor of monaco.editor.getEditors()) {
    if (editor.getModel() === model) return editor.getPosition()
  }
  return null
}

/** Reports shown and (partially) accepted suggestions to the language server, as its protocol asks. */
export const copilotLifecycle = {
  shown(item: Item): void {
    if (item.copilotKey) void api.copilot.shown(item.copilotKey).catch(() => undefined)
  },
  partial(item: Item, acceptedCharacters: number): void {
    if (item.copilotKey) {
      void api.copilot.partiallyAccepted(item.copilotKey, acceptedCharacters).catch(() => undefined)
    }
  }
}

export function registerCopilotCommands(): monaco.IDisposable {
  return monaco.editor.registerCommand(COPILOT_ACCEPTED_COMMAND, (_accessor, key: unknown) => {
    if (typeof key === 'string') void api.copilot.accepted(key).catch(() => undefined)
  })
}
