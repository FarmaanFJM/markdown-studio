import {
  collapseSpaceRuns,
  findSpaceRuns,
  formatBlockAt,
  repairTableAt,
  type BlockFormat,
  type LineEdit
} from '@shared/markdown/quickFixes'
import { notify } from '../../state/ui'
import { monaco } from '../monaco'
import { analysisFor } from './model'
import { requireEditor } from './commands'
import { tableFormatOptions } from './tableCommands'

type Editor = monaco.editor.IStandaloneCodeEditor
type Model = monaco.editor.ITextModel

const SOURCE = 'markdown-studio'

const KIND_LABEL: Record<BlockFormat['kind'], string> = {
  table: 'Format table',
  heading: 'Normalize heading spacing',
  list: 'Normalize list formatting',
  paragraph: 'Remove extra spaces in paragraph'
}

export function blockActionTitle(format: BlockFormat): string {
  return format.repair ? 'Repair table: add the missing columns' : KIND_LABEL[format.kind]
}

/** A whole-line replacement as a Monaco text edit. */
export function lineEditToTextEdit(model: Model, edit: LineEdit): monaco.languages.TextEdit {
  const last = edit.endLine
  return {
    range: new monaco.Range(edit.startLine + 1, 1, last, model.getLineMaxColumn(last)),
    text: edit.lines.join(model.getEOL())
  }
}

/** The block under `line` (0-based) that Format Block would rewrite, or null when it is tidy. */
export function blockFormatAt(model: Model, line: number): BlockFormat | null {
  return formatBlockAt(analysisFor(model), line, tableFormatOptions())
}

/** Repair for the table at `line` (shown as a quick fix on its problem marker). */
export function tableRepairAt(model: Model, line: number): LineEdit | null {
  return repairTableAt(analysisFor(model), line, tableFormatOptions())
}

/** Lines `[from, to]` (0-based) touched by the selections, or just the cursor line. */
function selectedLines(editor: Editor): { from: number; to: number; empty: boolean } {
  const selections = editor.getSelections() ?? []
  const from = Math.min(...selections.map((s) => s.startLineNumber)) - 1
  const to = Math.max(...selections.map((s) => s.endLineNumber)) - 1
  return { from, to, empty: selections.every((s) => s.isEmpty()) }
}

export const quickFixCommands = {
  /** Reformats the block (table, heading, list or paragraph) under the cursor, or each in the selection. */
  formatBlock() {
    const editor = requireEditor()
    const model = editor?.getModel()
    if (!editor || !model) return
    const { from, to } = selectedLines(editor)
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = []
    const kinds = new Set<string>()
    for (let line = from; line <= to;) {
      const format = blockFormatAt(model, line)
      if (format) {
        edits.push(lineEditToTextEdit(model, format))
        kinds.add(format.kind)
        line = Math.max(line + 1, format.endLine)
      } else {
        line++
      }
    }
    if (edits.length === 0) return notify('info', 'This block is already formatted.')
    editor.pushUndoStop()
    editor.executeEdits(SOURCE, edits)
    editor.pushUndoStop()
    editor.focus()
  },

  /** Turns repeated spaces inside sentences into single spaces: the selection, or the document. */
  removeExtraSpaces() {
    const editor = requireEditor()
    const model = editor?.getModel()
    if (!editor || !model) return
    const { from, to, empty } = selectedLines(editor)
    const analysis = analysisFor(model)
    const runs = findSpaceRuns(analysis).filter((r) => empty || (r.line >= from && r.line <= to))
    if (runs.length === 0) return notify('info', 'There are no extra spaces to remove.')
    const lines = [...new Set(runs.map((r) => r.line))].sort((a, b) => a - b)
    const collapsed = collapseSpaceRuns(analysis.lines, runs)
    editor.pushUndoStop()
    editor.executeEdits(
      SOURCE,
      lines.map((line) => ({
        range: new monaco.Range(line + 1, 1, line + 1, model.getLineMaxColumn(line + 1)),
        text: collapsed[line]
      }))
    )
    editor.pushUndoStop()
    notify(
      'success',
      `Removed extra spaces on ${lines.length} line${lines.length === 1 ? '' : 's'}.`
    )
    editor.focus()
  },

  /** Opens Monaco's Quick Fix menu for the cursor position. */
  showQuickFixes() {
    const editor = requireEditor()
    editor?.focus()
    editor?.trigger('markdown-studio', 'editor.action.quickFix', null)
  }
}
