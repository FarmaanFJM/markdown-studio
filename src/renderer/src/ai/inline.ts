import { monaco } from '../editor/monaco'
import { isCodeAt } from '../editor/markdown/model'
import { useSettings } from '../state/settings'
import { currentAvailability } from './state'
import { runTask } from './run'
import {
  copilotLifecycle,
  provideCopilotCompletions,
  registerCopilotCommands
} from './copilotInline'

/** A continuation fetched by the "Continue writing" command, waiting to be shown as ghost text. */
let explicit: { uri: string; line: number; column: number; text: string } | null = null

export function offerContinuation(
  editor: monaco.editor.IStandaloneCodeEditor,
  position: monaco.Position,
  text: string
): void {
  const model = editor.getModel()
  if (!model) return
  explicit = { uri: model.uri.toString(), line: position.lineNumber, column: position.column, text }
  editor.trigger('markdown-studio-ai', 'editor.action.inlineSuggest.trigger', null)
}

const TYPING_PAUSE_MS = 900
const MIN_CHARACTERS_ON_LINE = 20

function pause(ms: number, token: monaco.CancellationToken): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(!token.isCancellationRequested), ms)
    token.onCancellationRequested(() => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

/**
 * Ghost-text suggestions. Nothing is requested unless AI is available for the document and the
 * user either ran "Continue writing" or enabled inline suggestions in Settings (off by default,
 * because they send the text around the cursor while typing). Suggestions are accepted with Tab
 * and dismissed with Escape; they never change the document by themselves.
 */
export function registerInlineSuggestions(
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null
): monaco.IDisposable {
  const commands = registerCopilotCommands()
  const provider = monaco.languages.registerInlineCompletionsProvider('markdown', {
    async provideInlineCompletions(model, position, context, token) {
      // GitHub Copilot and the OpenAI-compatible endpoint never share a request path: the
      // selected provider decides, and the other one is not consulted.
      if (useSettings.getState().settings.ai.provider === 'github-copilot') {
        return provideCopilotCompletions(model, position, context, token)
      }
      const pending = explicit
      if (pending && pending.uri === model.uri.toString()) {
        explicit = null
        if (pending.line === position.lineNumber && pending.column === position.column) {
          return {
            items: [{ insertText: pending.text, range: monaco.Range.fromPositions(position) }]
          }
        }
      }
      const settings = useSettings.getState().settings.ai
      if (!settings.inlineSuggestions || !currentAvailability().available) return { items: [] }
      const editor = getEditor()
      if (!editor || editor.getModel() !== model) return { items: [] }

      // Only at the end of a line of prose, outside code, after a pause in typing.
      const line = model.getLineContent(position.lineNumber)
      if (
        position.column <= line.length ||
        line.trim().length < MIN_CHARACTERS_ON_LINE ||
        isCodeAt(model, position.lineNumber - 1)
      ) {
        return { items: [] }
      }
      if (!(await pause(TYPING_PAUSE_MS, token))) return { items: [] }

      let cancel: () => void = () => undefined
      token.onCancellationRequested(() => cancel())
      const result = await runTask(
        editor,
        'continue',
        '',
        monaco.Range.fromPositions(position),
        true,
        { onCancel: (listener) => (cancel = listener) }
      )
      if (!result.ok || token.isCancellationRequested) return { items: [] }
      const text = /^[\s.,;:!?)]/.test(result.text) ? result.text : ` ${result.text}`
      return { items: [{ insertText: text, range: monaco.Range.fromPositions(position) }] }
    },
    handleItemDidShow(_completions, item) {
      copilotLifecycle.shown(item)
    },
    handlePartialAccept(_completions, item, acceptedCharacters) {
      copilotLifecycle.partial(item, acceptedCharacters)
    },
    disposeInlineCompletions() {}
  })
  return { dispose: () => (provider.dispose(), commands.dispose()) }
}
