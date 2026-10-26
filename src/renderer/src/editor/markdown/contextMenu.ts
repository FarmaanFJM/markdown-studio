import { getCommand } from '../../commands/registry'
import { monaco } from '../monaco'
import { tableAtLine } from '@shared/markdown/analysis'
import { analysisFor, LARGE_DOCUMENT_CHARACTERS } from './model'
import { isInTableCell } from './tableCommands'

type Editor = monaco.editor.IStandaloneCodeEditor

interface MenuEntry {
  command: string
  group: string
  order: number
  /** Shown only while the cursor is inside a table. */
  table?: boolean
}

const ENTRIES: MenuEntry[] = [
  { command: 'markdown.bold', group: '8_markdown_format', order: 1 },
  { command: 'markdown.italic', group: '8_markdown_format', order: 2 },
  { command: 'markdown.inlineCode', group: '8_markdown_format', order: 3 },
  { command: 'markdown.strikethrough', group: '8_markdown_format', order: 4 },
  { command: 'markdown.bulletList', group: '8_markdown_format', order: 5 },
  { command: 'markdown.orderedList', group: '8_markdown_format', order: 6 },
  { command: 'markdown.taskList', group: '8_markdown_format', order: 7 },
  { command: 'markdown.blockquote', group: '8_markdown_format', order: 8 },
  { command: 'insert.link', group: '8_markdown_insert', order: 1 },
  { command: 'insert.image', group: '8_markdown_insert', order: 2 },
  { command: 'insert.codeBlock', group: '8_markdown_insert', order: 3 },
  { command: 'table.insert', group: '8_markdown_insert', order: 4 },
  { command: 'toc.insert', group: '8_markdown_insert', order: 5 },
  { command: 'insert.mathInline', group: '8_markdown_insert', order: 6 },
  { command: 'insert.mathBlock', group: '8_markdown_insert', order: 7 },
  { command: 'insert.mermaid', group: '8_markdown_insert', order: 8 },
  { command: 'table.format', group: '9_markdown_table', order: 1, table: true },
  { command: 'table.editVisually', group: '9_markdown_table', order: 2, table: true },
  { command: 'table.repair', group: '9_markdown_table', order: 2.5, table: true },
  { command: 'table.insertRowBelow', group: '9_markdown_table', order: 3, table: true },
  { command: 'table.insertColumnRight', group: '9_markdown_table', order: 4, table: true },
  { command: 'table.deleteRow', group: '9_markdown_table', order: 5, table: true },
  { command: 'table.deleteColumn', group: '9_markdown_table', order: 6, table: true },
  { command: 'markdown.quickFix', group: '9_markdown_fix', order: 1 },
  { command: 'markdown.formatBlock', group: '9_markdown_fix', order: 2 },
  { command: 'markdown.removeExtraSpaces', group: '9_markdown_fix', order: 3 },
  { command: 'problems.fixAll', group: '9_markdown_fix', order: 4 }
]

/**
 * Adds Markdown commands to the editor's right-click menu. Table commands appear only while the
 * cursor is inside a table (tracked with a context key refreshed shortly after cursor moves).
 */
export function installContextMenu(editor: Editor): monaco.IDisposable {
  const inTable = editor.createContextKey<boolean>('markdownStudio.inTable', false)
  let timer: ReturnType<typeof setTimeout> | null = null
  const refresh = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const model = editor.getModel()
      // Re-parsing a huge document after every pause would be felt while typing; for those the
      // key is only set when the context menu is opened with the mouse.
      if (!model || model.getValueLength() > LARGE_DOCUMENT_CHARACTERS) return
      inTable.set(isInTableCell(editor))
    }, 120)
  }
  const disposables: monaco.IDisposable[] = [
    // A right-click builds the menu before the debounced refresh would run, so the key is set
    // from the clicked line right away.
    editor.onMouseDown((event) => {
      const model = editor.getModel()
      const line = event.target.position?.lineNumber
      if (!event.event.rightButton || !model || !line) return
      inTable.set(tableAtLine(analysisFor(model), line - 1) !== null)
    }),
    editor.onDidChangeCursorPosition(refresh),
    editor.onDidChangeModel(refresh),
    editor.onDidChangeModelContent(refresh)
  ]

  for (const entry of ENTRIES) {
    const command = getCommand(entry.command)
    if (!command) continue
    disposables.push(
      editor.addAction({
        id: `markdown-studio.${entry.command}`,
        label: command.title,
        contextMenuGroupId: entry.group,
        contextMenuOrder: entry.order,
        precondition: entry.table ? 'markdownStudio.inTable' : undefined,
        run: () => {
          void command.run()
        }
      })
    )
  }

  return {
    dispose() {
      if (timer) clearTimeout(timer)
      disposables.forEach((d) => d.dispose())
    }
  }
}
