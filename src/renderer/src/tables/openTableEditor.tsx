import { tableAtLine } from '@shared/markdown/analysis'
import { escapeSnippetText } from '@shared/markdown/snippets'
import { formatTable, parseTableBlock, type TableModel } from '@shared/markdown/tables'
import { requireEditor } from '../editor/markdown/commands'
import { insertSnippetText } from '../editor/markdown/insert'
import { analysisFor } from '../editor/markdown/model'
import { tableAtCursor } from '../editor/markdown/tableCommands'
import { monaco } from '../editor/monaco'
import { dialogs, notify } from '../state/ui'
import { TableEditor, type StaleSignal } from './TableEditor'

const SOURCE = 'markdown-studio'

/**
 * Opens the table under the cursor in the graphical editor. The editor works on the real
 * source range (tracked through edits elsewhere in the document), applies its result as one
 * undoable replacement of just that table, and refuses to overwrite a table that changed while
 * it was open.
 */
export async function editTableVisually(): Promise<void> {
  const editor = requireEditor()
  if (!editor) return
  const model = editor.getModel()!
  const found = tableAtCursor(editor)
  if (!found) return notify('info', 'Place the cursor inside a Markdown table first.')
  if ('error' in found) return notify('error', found.error)

  const { start, end } = found.parsed
  const trackedOptions = {
    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
  }
  const tracked = editor.createDecorationsCollection([
    {
      range: new monaco.Range(start + 1, 1, end, model.getLineMaxColumn(end)),
      options: trackedOptions
    }
  ])

  /**
   * The table as it is now: the decoration follows edits above it, and the table is re-detected
   * from there, so changes at its edges (a new row, text after the last cell) are noticed too.
   */
  const current = () => {
    const range = tracked.getRange(0)
    if (!range) return null
    const analysis = analysisFor(model)
    const block = tableAtLine(analysis, range.startLineNumber - 1)
    if (!block || block.start !== range.startLineNumber - 1) return null
    const lines = analysis.lines.slice(block.start, block.end)
    return { block, text: lines.join('\n') }
  }
  let baseline = current()?.text ?? null

  const listeners = new Set<() => void>()
  const subscription = model.onDidChangeContent(() => listeners.forEach((l) => l()))
  const stale: StaleSignal = {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isStale: () => current()?.text !== baseline,
    reload() {
      const now = current()
      const parsed = now && parseTableBlock(analysisFor(model), now.block)
      if (!now || !parsed?.ok) {
        notify('error', 'The table can no longer be edited here.')
        return null
      }
      tracked.set([
        {
          range: new monaco.Range(
            now.block.start + 1,
            1,
            now.block.end,
            model.getLineMaxColumn(now.block.end)
          ),
          options: trackedOptions
        }
      ])
      baseline = now.text
      listeners.forEach((l) => l())
      return parsed.table
    }
  }

  try {
    const result = await dialogs.custom<TableModel>((done) => (
      <TableEditor
        title="Edit Table"
        initial={found.parsed.table}
        confirmLabel="Apply to Document"
        stale={stale}
        onDone={done}
      />
    ))
    const range = tracked.getRange(0)
    if (result && range && !stale.isStale()) {
      editor.pushUndoStop()
      editor.executeEdits(SOURCE, [{ range, text: formatTable(result).join(model.getEOL()) }])
      editor.pushUndoStop()
      notify('success', 'Table updated.')
    } else if (result) {
      notify('error', 'The table changed in the document, so the edit was not applied.')
    }
  } finally {
    subscription.dispose()
    tracked.clear()
    editor.focus()
  }
}

/** Designs a new table in the grid and inserts it at the cursor. */
export async function insertTableVisually(): Promise<void> {
  const editor = requireEditor()
  if (!editor) return
  const initial: TableModel = {
    prefix: '',
    alignments: ['none', 'none', 'none'],
    header: ['Column 1', 'Column 2', 'Column 3'],
    rows: [
      ['', '', ''],
      ['', '', '']
    ]
  }
  const result = await dialogs.custom<TableModel>((done) => (
    <TableEditor title="Insert Table" initial={initial} confirmLabel="Insert Table" onDone={done} />
  ))
  if (result) {
    insertSnippetText(editor, escapeSnippetText(formatTable(result).join('\n')), { block: true })
  } else {
    editor.focus()
  }
}
