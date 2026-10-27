import type { EditPlan, EditResult } from '@shared/markdown/formatting'
import { enterEdit, indentListItem, outdentListItem } from '@shared/markdown/lists'
import { useSettings } from '../../state/settings'
import { monaco } from '../monaco'
import { applyResults, currentSelections } from './apply'
import { isCodeAt, lineAccess } from './model'
import { tableCommands } from './tableCommands'

type Editor = monaco.editor.IStandaloneCodeEditor

/** Contexts in which Markdown Studio takes over Enter and Tab; everywhere else Monaco decides. */
const PLAIN_TYPING =
  'editorTextFocus && !editorReadonly && !editorHasSelection && !editorHasMultipleSelections && ' +
  '!suggestWidgetVisible && !inSnippetMode && !editorTabMovesFocus && !findWidgetVisible'

/**
 * Tab belongs to a visible ghost-text suggestion first (Copilot or Continue Writing accepts it);
 * only without one does it indent list items, move between table cells or reach snippets.
 */
const TAB_WITHOUT_SUGGESTION = `${PLAIN_TYPING} && !inlineSuggestionVisible`

function enabled(): { lists: boolean; tables: boolean } {
  const { smartLists, tableNavigation } = useSettings.getState().settings.markdown
  return { lists: smartLists, tables: tableNavigation }
}

function handleEnter(editor: Editor): boolean {
  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position || !enabled().lists) return false
  const line = position.lineNumber - 1
  if (isCodeAt(model, line)) return false
  const edit = enterEdit(lineAccess(model), line, position.column - 1)
  if (!edit) return false

  const [original] = currentSelections(editor)
  let plan: EditPlan
  let anchorOffset: number
  if (edit.replaceLine !== undefined) {
    plan = {
      range: {
        start: { line, column: 0 },
        end: { line, column: model.getLineMaxColumn(line + 1) - 1 }
      },
      text: edit.replaceLine
    }
    anchorOffset = edit.replaceLine.length
  } else {
    plan = { range: { start: original.start, end: original.start }, text: edit.insert! }
    anchorOffset = edit.insert!.length
  }
  const result: EditResult = {
    plans: [plan],
    select: { start: { plan: 0, offset: anchorOffset }, end: { plan: 0, offset: anchorOffset } }
  }
  return applyResults(editor, [result], [original])
}

function handleTab(editor: Editor, direction: 1 | -1): boolean {
  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) return false
  const settings = enabled()
  const line = position.lineNumber - 1

  if (settings.tables && tableCommands.navigate(editor, direction)) return true
  if (!settings.lists) return false
  if (isCodeAt(model, line)) return false

  const lines = lineAccess(model)
  const change = direction === 1 ? indentListItem(lines, line) : outdentListItem(lines, line)
  if (!change) return false

  const [original] = currentSelections(editor)
  const plans: EditPlan[] = []
  let cursorPlan = 0
  for (const [index, text] of [...change.lines].sort((a, b) => a[0] - b[0])) {
    if (index === line) cursorPlan = plans.length
    plans.push({
      range: {
        start: { line: index, column: 0 },
        end: { line: index, column: model.getLineMaxColumn(index + 1) - 1 }
      },
      text
    })
  }
  const offset = Math.max(0, original.start.column + change.delta)
  const result: EditResult = {
    plans,
    select: { start: { plan: cursorPlan, offset }, end: { plan: cursorPlan, offset } }
  }
  return applyResults(editor, [result], [original])
}

/**
 * Markdown-aware Enter, Tab and Shift+Tab. Each handler leaves the keystroke to Monaco (by
 * issuing the default command) whenever it does not apply, so ordinary typing is unchanged.
 */
export function installSmartEditing(editor: Editor): monaco.IDisposable {
  const disposables: (string | null)[] = []
  disposables.push(
    editor.addCommand(
      monaco.KeyCode.Enter,
      () => {
        if (!handleEnter(editor)) editor.trigger('keyboard', 'type', { text: '\n' })
      },
      PLAIN_TYPING
    ),
    editor.addCommand(
      monaco.KeyCode.Tab,
      () => {
        if (!handleTab(editor, 1)) editor.trigger('keyboard', 'tab', null)
      },
      TAB_WITHOUT_SUGGESTION
    ),
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyCode.Tab,
      () => {
        if (!handleTab(editor, -1)) editor.trigger('keyboard', 'outdent', null)
      },
      PLAIN_TYPING
    )
  )
  // `addCommand` registrations live as long as the editor, which disposes them with itself.
  return { dispose() {} }
}
