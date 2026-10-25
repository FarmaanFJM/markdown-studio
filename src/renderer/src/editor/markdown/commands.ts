import {
  EMPTY_RESULT,
  setHeading,
  shiftHeading,
  toggleInline,
  toggleList,
  toggleQuote,
  type EditResult,
  type InlineStyleName,
  type ListKind,
  type Selection as PureSelection
} from '@shared/markdown/formatting'
import type { LineAccess } from '@shared/markdown/lists'
import { notify } from '../../state/ui'
import { activeDocument } from '../../state/documents'
import { getActiveEditor } from '../models'
import { monaco } from '../monaco'
import { applyResults, currentSelections } from './apply'
import { imageSnippet, insertBuiltInSnippet, insertSnippetText, linkSnippet } from './insert'
import { lineAccess, protectedLines } from './model'
import { BUILT_IN_SNIPPETS } from '@shared/markdown/snippets'

type Editor = monaco.editor.IStandaloneCodeEditor

/** The editor of the active Markdown document, or null (with a hint) when there is none. */
export function requireEditor(): Editor | null {
  const editor = getActiveEditor()
  if (!editor?.getModel() || !activeDocument()) {
    notify('info', 'Open a Markdown document first.')
    return null
  }
  return editor
}

const IN_CODE = 'Formatting is not applied inside code blocks.'

type Builder = (
  selection: PureSelection,
  lines: LineAccess,
  isProtected: (line: number) => boolean
) => EditResult

function run(editor: Editor, build: Builder): boolean {
  const model = editor.getModel()
  if (!model) return false
  const lines = lineAccess(model)
  const isProtected = protectedLines(model)
  const ordered = currentSelections(editor).sort(
    (a, b) => a.start.line - b.start.line || a.start.column - b.start.column
  )
  const results = ordered.map((selection) => build(selection, lines, isProtected))
  const changed = applyResults(editor, results, ordered)
  if (!changed && ordered.some((s) => isProtected(s.start.line))) notify('info', IN_CODE)
  editor.focus()
  return changed
}

function inline(style: InlineStyleName): () => void {
  return () => {
    const editor = requireEditor()
    if (!editor) return
    run(editor, (selection, lines, isProtected) =>
      isProtected(selection.start.line) ? EMPTY_RESULT : toggleInline(lines, selection, style)
    )
  }
}

function heading(level: number): () => void {
  return () => {
    const editor = requireEditor()
    if (editor) run(editor, (s, lines, p) => setHeading(lines, s, level, p))
  }
}

function shift(delta: 1 | -1): () => void {
  return () => {
    const editor = requireEditor()
    if (editor) run(editor, (s, lines, p) => shiftHeading(lines, s, delta, p))
  }
}

function list(kind: ListKind): () => void {
  return () => {
    const editor = requireEditor()
    if (editor) run(editor, (s, lines, p) => toggleList(lines, s, kind, p))
  }
}

function selectedText(editor: Editor): string {
  const selection = editor.getSelection()
  const model = editor.getModel()
  return selection && model ? model.getValueInRange(selection) : ''
}

/**
 * Markdown editing commands. Toolbar buttons, shortcuts, the command palette, the context menu
 * and completions all call these, so each behaves identically wherever it is started from.
 */
export const markdownCommands = {
  bold: inline('bold'),
  italic: inline('italic'),
  strikethrough: inline('strikethrough'),
  inlineCode: inline('code'),

  heading,
  headingUp: shift(1),
  headingDown: shift(-1),
  paragraph: heading(0),

  bulletList: list('bullet'),
  orderedList: list('ordered'),
  taskList: list('task'),
  blockquote() {
    const editor = requireEditor()
    if (editor) run(editor, (s, lines, p) => toggleQuote(lines, s, p))
  },

  link() {
    const editor = requireEditor()
    if (editor) insertSnippetText(editor, linkSnippet(selectedText(editor)))
  },
  image() {
    const editor = requireEditor()
    if (editor) insertSnippetText(editor, imageSnippet(selectedText(editor)))
  },
  codeBlock() {
    const editor = requireEditor()
    if (!editor) return
    const model = editor.getModel()!
    const selection = editor.getSelection()!
    if (!selection.isEmpty()) {
      // Wrap whole lines so the fences sit on their own lines.
      const last =
        selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber
          ? selection.endLineNumber - 1
          : selection.endLineNumber
      editor.setSelection(
        new monaco.Selection(selection.startLineNumber, 1, last, model.getLineMaxColumn(last))
      )
      insertSnippetText(editor, '```${2:}\n${TM_SELECTED_TEXT}\n```', {})
      return
    }
    insertBuiltInSnippet(
      editor,
      BUILT_IN_SNIPPETS.find((s) => s.id === 'codeBlock')!
    )
  },
  horizontalRule() {
    const editor = requireEditor()
    if (editor)
      insertBuiltInSnippet(
        editor,
        BUILT_IN_SNIPPETS.find((s) => s.id === 'horizontalRule')!
      )
  },
  insertSnippet(id: string) {
    const editor = requireEditor()
    const definition = BUILT_IN_SNIPPETS.find((s) => s.id === id)
    if (editor && definition) insertBuiltInSnippet(editor, definition)
  },
  insertSnippetBody(body: string, block: boolean) {
    const editor = requireEditor()
    if (editor) insertSnippetText(editor, body, { block })
  }
}
