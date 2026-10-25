import {
  BUILT_IN_SNIPPETS,
  escapeSnippetText,
  type SnippetDefinition
} from '@shared/markdown/snippets'
import { monaco } from '../monaco'

const SOURCE = 'markdown-studio'

interface SnippetController {
  insert(
    template: string,
    options?: { undoStopBefore?: boolean; undoStopAfter?: boolean; adjustWhitespace?: boolean }
  ): void
}

function snippetController(editor: monaco.editor.IStandaloneCodeEditor): SnippetController | null {
  return editor.getContribution('snippetController2') as unknown as SnippetController | null
}

/**
 * How a block (a table, a code fence, a rule...) must be separated from the text around the
 * cursor so it is parsed as a block and does not merge into the neighbouring paragraph.
 */
function blockSeparation(model: monaco.editor.ITextModel, position: monaco.Position) {
  const line = position.lineNumber
  if (model.getLineContent(line).trim() !== '') {
    const end = new monaco.Position(line, model.getLineMaxColumn(line))
    return { at: end, prefix: '\n\n' }
  }
  if (line > 1 && model.getLineContent(line - 1).trim() !== '')
    return { at: position, prefix: '\n' }
  return { at: position, prefix: '' }
}

/**
 * Inserts Monaco snippet text at the cursor as one undoable step, using the editor's native
 * snippet engine (placeholders, Tab navigation). Block snippets are moved onto their own lines.
 */
export function insertSnippetText(
  editor: monaco.editor.IStandaloneCodeEditor,
  body: string,
  options: { block?: boolean } = {}
): void {
  const model = editor.getModel()
  const controller = snippetController(editor)
  if (!model || !controller) return
  const selection = editor.getSelection()
  editor.pushUndoStop()
  if (options.block && selection && selection.isEmpty()) {
    const { at, prefix } = blockSeparation(model, selection.getStartPosition())
    if (prefix) {
      // The prefix is only line breaks, so the cursor ends up at the start of a later line.
      const line = at.lineNumber + prefix.length
      editor.executeEdits(
        SOURCE,
        [
          {
            range: new monaco.Range(at.lineNumber, at.column, at.lineNumber, at.column),
            text: prefix.replace(/\n/g, model.getEOL())
          }
        ],
        [new monaco.Selection(line, 1, line, 1)]
      )
    }
  }
  controller.insert(body, { undoStopBefore: false, adjustWhitespace: true })
  editor.focus()
}

export function insertBuiltInSnippet(
  editor: monaco.editor.IStandaloneCodeEditor,
  definition: SnippetDefinition
): void {
  insertSnippetText(editor, definition.body, { block: definition.kind === 'block' })
}

export function insertSnippetById(editor: monaco.editor.IStandaloneCodeEditor, id: string): void {
  const definition = BUILT_IN_SNIPPETS.find((snippet) => snippet.id === id)
  if (definition) insertBuiltInSnippet(editor, definition)
}

const URL_LIKE = /^(?:https?:\/\/|www\.)\S+$/i

/** `[text](url)`: wraps the selection as the link text, or uses a selected URL as the target. */
export function linkSnippet(selected: string): string {
  const trimmed = selected.trim()
  if (trimmed && URL_LIKE.test(trimmed)) return `[\${1:link text}](${escapeSnippetText(trimmed)})`
  if (trimmed) return '[${TM_SELECTED_TEXT}](${1:url})'
  return '[${1:link text}](${2:url})'
}

/** `![alt](path)`: a selection becomes the alt text. */
export function imageSnippet(selected: string): string {
  return selected.trim() ? '![${TM_SELECTED_TEXT}](${1:path})' : '![${1:alt text}](${2:path})'
}
