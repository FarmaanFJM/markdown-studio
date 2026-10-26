import { monaco } from '../editor/monaco'
import { isCodeAt } from '../editor/markdown/model'
import { useSettings } from '../state/settings'
import { currentAvailability } from './state'
import { runTask } from './run'

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
  return monaco.languages.registerInlineCompletionsProvider('markdown', {
    async provideInlineCompletions(model, position, _context, token) {
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
    disposeInlineCompletions() {}
  })
}
