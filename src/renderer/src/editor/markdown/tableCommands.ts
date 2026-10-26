import { tableAtLine } from '@shared/markdown/analysis'
import {
  cellPosition,
  deleteColumn,
  deleteRow,
  formatTable,
  insertColumn,
  insertRow,
  locateInTable,
  parseTableBlock,
  setColumnAlignment,
  type Alignment,
  type ParsedTable,
  type TableCursor,
  type TableFormatOptions,
  type TableModel
} from '@shared/markdown/tables'
import { useSettings } from '../../state/settings'
import { repairTableAt } from '@shared/markdown/quickFixes'
import { notify } from '../../state/ui'
import { monaco } from '../monaco'
import { analysisFor } from './model'
import { requireEditor } from './commands'

type Editor = monaco.editor.IStandaloneCodeEditor

const SOURCE = 'markdown-studio'

/** The width Format Table aims for, from Settings. */
export function tableFormatOptions(): TableFormatOptions {
  return { maxWidth: useSettings.getState().settings.markdown.tableMaxWidth }
}

export interface TableAtCursor {
  parsed: ParsedTable
  cursor: TableCursor
}

/** The table under the cursor, `null` outside tables, or a message when it cannot be edited. */
export function tableAtCursor(editor: Editor): TableAtCursor | null | { error: string } {
  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) return null
  const analysis = analysisFor(model)
  const line = position.lineNumber - 1
  const block = tableAtLine(analysis, line)
  if (!block) return null
  const result = parseTableBlock(analysis, block)
  if (!result.ok) return { error: result.reason }
  return { parsed: result, cursor: locateInTable(analysis, result, line, position.column - 1) }
}

function replaceTable(
  editor: Editor,
  parsed: { start: number; end: number },
  lines: string[],
  caret?: { line: number; column: number }
): void {
  const model = editor.getModel()!
  const last = parsed.end
  const range = new monaco.Range(parsed.start + 1, 1, last, model.getLineMaxColumn(last))
  const selection = caret
    ? new monaco.Selection(caret.line + 1, caret.column + 1, caret.line + 1, caret.column + 1)
    : (editor.getSelection() ?? undefined)
  editor.pushUndoStop()
  editor.executeEdits(
    SOURCE,
    [{ range, text: lines.join(model.getEOL()) }],
    selection ? [selection] : undefined
  )
  editor.pushUndoStop()
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i])
}

function currentLines(editor: Editor, parsed: ParsedTable): string[] {
  const model = editor.getModel()!
  const lines: string[] = []
  for (let line = parsed.start; line < parsed.end; line++)
    lines.push(model.getLineContent(line + 1))
  return lines
}

/** Needs the cursor in an editable table; explains why otherwise. */
function withTable(editor: Editor): TableAtCursor | null {
  const found = tableAtCursor(editor)
  if (!found) {
    notify('info', 'Place the cursor inside a Markdown table first.')
    return null
  }
  if ('error' in found) {
    notify('error', found.error)
    return null
  }
  return found
}

// --- Formatting ---------------------------------------------------------------------------------

function formatBlocks(editor: Editor, from: number, to: number, scope: string): void {
  const model = editor.getModel()!
  const analysis = analysisFor(model)
  const blocks = analysis.tables.filter((t) => t.start <= to && t.end > from)
  if (blocks.length === 0) {
    notify(
      'info',
      scope === 'document' ? 'There are no tables in this document.' : 'No table found here.'
    )
    return
  }

  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = []
  const skipped: string[] = []
  let alreadyTidy = 0
  for (const block of blocks) {
    const result = parseTableBlock(analysis, block)
    if (!result.ok) {
      skipped.push(`line ${block.start + 1}: ${result.reason}`)
      continue
    }
    const formatted = formatTable(result.table, tableFormatOptions())
    if (sameLines(formatted, currentLines(editor, result))) {
      alreadyTidy++
      continue
    }
    edits.push({
      range: new monaco.Range(result.start + 1, 1, result.end, model.getLineMaxColumn(result.end)),
      text: formatted.join(model.getEOL())
    })
  }

  if (edits.length > 0) {
    editor.pushUndoStop()
    editor.executeEdits(SOURCE, edits)
    editor.pushUndoStop()
  }
  const done = edits.length
  if (skipped.length > 0) {
    notify(
      'error',
      `${done > 0 ? `Formatted ${done} table${done === 1 ? '' : 's'}. ` : ''}Could not format ${skipped.length}: ${skipped[0]}`
    )
  } else if (done === 0) {
    notify(
      'info',
      alreadyTidy === 1 ? 'The table is already formatted.' : 'All tables are already formatted.'
    )
  } else if (scope !== 'cursor') {
    notify('success', `Formatted ${done} table${done === 1 ? '' : 's'}.`)
  }
  editor.focus()
}

function repairAtCursor(editor: Editor, found: ReturnType<typeof tableAtCursor>): void {
  const model = editor.getModel()
  const position = editor.getPosition()
  const repair =
    model && position
      ? repairTableAt(analysisFor(model), position.lineNumber - 1, tableFormatOptions())
      : null
  if (!model || !repair) {
    if (found && 'error' in found) return notify('error', found.error)
    return notify(
      'info',
      found
        ? 'The table has no problems to repair.'
        : 'Place the cursor inside a Markdown table first.'
    )
  }
  const last = repair.endLine
  editor.pushUndoStop()
  editor.executeEdits(SOURCE, [
    {
      range: new monaco.Range(repair.startLine + 1, 1, last, model.getLineMaxColumn(last)),
      text: repair.lines.join(model.getEOL())
    }
  ])
  editor.pushUndoStop()
  notify('success', 'Table repaired: missing columns were added so no cell is lost.')
  editor.focus()
}

export const tableCommands = {
  formatAtCursor() {
    const editor = requireEditor()
    if (!editor) return
    const found = tableAtCursor(editor)
    // A header and delimiter row of different widths are not a table to the renderer; completing
    // the missing columns (never dropping a cell) is what "format" means for such a block.
    if (found === null) return repairAtCursor(editor, found)
    if ('error' in found) {
      return notify('error', `${found.error} Use Repair Table to add the missing columns instead.`)
    }
    formatBlocks(editor, found.parsed.start, found.parsed.start, 'cursor')
  },

  repair() {
    const editor = requireEditor()
    if (editor) repairAtCursor(editor, tableAtCursor(editor))
  },

  formatInSelection() {
    const editor = requireEditor()
    if (!editor) return
    const selections = editor.getSelections() ?? []
    if (selections.every((s) => s.isEmpty())) return tableCommands.formatAtCursor()
    for (const selection of selections) {
      formatBlocks(editor, selection.startLineNumber - 1, selection.endLineNumber - 1, 'selection')
    }
  },

  formatAll() {
    const editor = requireEditor()
    if (editor) formatBlocks(editor, 0, Number.MAX_SAFE_INTEGER, 'document')
  },

  insertRowAbove: () => rowOperation('above'),
  insertRowBelow: () => rowOperation('below'),
  deleteRow: () => rowOperation('delete'),
  insertColumnLeft: () => columnOperation('left'),
  insertColumnRight: () => columnOperation('right'),
  deleteColumn: () => columnOperation('delete'),
  alignColumn: (alignment: Alignment) => alignOperation(alignment),

  /** Tab (`1`) and Shift+Tab (`-1`) between cells. Returns false when the keystroke is not ours. */
  navigate: (editor: Editor, direction: 1 | -1) => navigate(editor, direction)
}

// --- Structure ----------------------------------------------------------------------------------

function apply(
  editor: Editor,
  found: TableAtCursor,
  table: TableModel,
  cursor: { row: 'header' | number; column: number }
): void {
  const formatted = formatTable(table, tableFormatOptions())
  const caret = cellPosition(formatted, found.parsed.start, cursor.row, cursor.column)
  replaceTable(editor, found.parsed, formatted, caret)
  editor.focus()
}

function bodyIndex(cursor: TableCursor): number | null {
  return typeof cursor.row === 'number' ? cursor.row : null
}

function rowOperation(kind: 'above' | 'below' | 'delete'): void {
  const editor = requireEditor()
  const found = editor && withTable(editor)
  if (!editor || !found) return
  const { table } = found.parsed
  const index = bodyIndex(found.cursor)
  const column = found.cursor.column

  if (kind === 'above') {
    if (index === null) return notify('info', 'Rows cannot be inserted above the header row.')
    apply(editor, found, insertRow(table, index), { row: index, column })
  } else if (kind === 'below') {
    const at = index === null ? 0 : index + 1
    apply(editor, found, insertRow(table, at), { row: at, column })
  } else {
    if (index === null)
      return notify('info', 'The header row cannot be deleted. Move to a body row.')
    const next = deleteRow(table, index)
    apply(
      editor,
      found,
      next,
      next.rows.length === 0
        ? { row: 'header', column }
        : { row: Math.min(index, next.rows.length - 1), column }
    )
  }
}

function columnOperation(kind: 'left' | 'right' | 'delete'): void {
  const editor = requireEditor()
  const found = editor && withTable(editor)
  if (!editor || !found) return
  const { table } = found.parsed
  const column = found.cursor.column
  const row = found.cursor.row === 'delimiter' ? 'header' : found.cursor.row

  if (kind === 'delete') {
    if (table.header.length === 1) return notify('info', 'A table needs at least one column.')
    const next = deleteColumn(table, column)
    apply(editor, found, next, { row, column: Math.min(column, next.header.length - 1) })
  } else {
    const at = kind === 'left' ? column : column + 1
    apply(editor, found, insertColumn(table, at), { row, column: at })
  }
}

function alignOperation(alignment: Alignment): void {
  const editor = requireEditor()
  const found = editor && withTable(editor)
  if (!editor || !found) return
  const row = found.cursor.row === 'delimiter' ? 'header' : found.cursor.row
  apply(editor, found, setColumnAlignment(found.parsed.table, found.cursor.column, alignment), {
    row,
    column: found.cursor.column
  })
}

// --- Navigation ---------------------------------------------------------------------------------

function navigate(editor: Editor, direction: 1 | -1): boolean {
  const found = tableAtCursor(editor)
  if (!found || 'error' in found) return false
  const { table } = found.parsed
  const columns = table.header.length
  const cursor = found.cursor
  let row: 'header' | number = cursor.row === 'delimiter' ? 'header' : cursor.row
  let column = cursor.column
  let next: TableModel = table

  if (direction === 1) {
    if (column < columns - 1) {
      column++
    } else {
      column = 0
      if (row === 'header') row = 0
      else row += 1
      if (typeof row === 'number' && row >= table.rows.length) {
        next = insertRow(table, table.rows.length)
        row = table.rows.length
      }
      if (table.rows.length === 0 && row === 0) {
        next = insertRow(table, 0)
      }
    }
  } else {
    if (column > 0) {
      column--
    } else if (row === 'header') {
      return false
    } else {
      column = columns - 1
      row = row === 0 ? 'header' : row - 1
    }
  }

  apply(editor, found, next, { row, column })
  return true
}

/** True when the cursor is inside a table that can be edited. */
export function isInTableCell(editor: Editor): boolean {
  const found = tableAtCursor(editor)
  return !!found && !('error' in found)
}
