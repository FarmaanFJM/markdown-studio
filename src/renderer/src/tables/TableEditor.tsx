import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Trash2
} from 'lucide-react'
import {
  deleteColumn,
  deleteRow,
  escapeTableCell,
  insertColumn,
  insertRow,
  setColumnAlignment,
  unescapeTableCell,
  type Alignment,
  type TableModel
} from '@shared/markdown/tables'
import { Modal } from '../dialogs/Modal'

/** Cells are shown as the reader sees them (`\|` as `|`) and escaped again when applied. */
export function toEditable(table: TableModel): TableModel {
  return {
    ...table,
    header: table.header.map(unescapeTableCell),
    rows: table.rows.map((row) => row.map(unescapeTableCell))
  }
}

export function fromEditable(table: TableModel): TableModel {
  const clean = (cell: string) => escapeTableCell(cell.trim())
  return { ...table, header: table.header.map(clean), rows: table.rows.map((r) => r.map(clean)) }
}

export interface StaleSignal {
  subscribe(listener: () => void): () => void
  isStale(): boolean
  /** Re-reads the table from the document; null when it can no longer be edited here. */
  reload(): TableModel | null
}

interface Props {
  title: string
  initial: TableModel
  confirmLabel: string
  stale?: StaleSignal
  onDone(result: TableModel | null): void
}

interface Active {
  /** -1 is the header row. */
  row: number
  column: number
}

const ALIGNMENTS: { value: Alignment; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Align left', Icon: AlignLeft },
  { value: 'center', label: 'Center', Icon: AlignCenter },
  { value: 'right', label: 'Align right', Icon: AlignRight }
]

const noSubscription = () => () => undefined

export function TableEditor({ title, initial, confirmLabel, stale, onDone }: Props) {
  const [table, setTable] = useState<TableModel>(() => toEditable(initial))
  const [active, setActive] = useState<Active>({ row: -1, column: 0 })
  const gridRef = useRef<HTMLTableElement>(null)
  /** A cell to focus once the next render has been committed (after rows or columns change). */
  const pendingFocus = useRef<Active | null>(null)
  const isStale = useSyncExternalStore(
    stale?.subscribe ?? noSubscription,
    () => stale?.isStale() ?? false
  )

  const columns = table.header.length
  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    gridRef.current
      ?.querySelector<HTMLInputElement>(`[data-cell="${target.row}:${target.column}"]`)
      ?.focus()
  })
  const focusCell = (row: number, column: number) => {
    pendingFocus.current = { row, column }
    setActive({ row, column })
  }

  const mutate = (next: TableModel, row: number, column: number) => {
    setTable(next)
    focusCell(row, column)
  }

  const setCell = (row: number, column: number, value: string) => {
    if (row < 0) {
      setTable({ ...table, header: table.header.map((c, i) => (i === column ? value : c)) })
    } else {
      setTable({
        ...table,
        rows: table.rows.map((cells, r) =>
          r === row ? cells.map((c, i) => (i === column ? value : c)) : cells
        )
      })
    }
  }

  const bodyIndex = active.row
  const actions = [
    {
      label: 'Row above',
      Icon: ArrowUp,
      disabled: bodyIndex < 0,
      run: () => mutate(insertRow(table, bodyIndex), bodyIndex, active.column)
    },
    {
      label: 'Row below',
      Icon: ArrowDown,
      run: () => mutate(insertRow(table, bodyIndex + 1), bodyIndex + 1, active.column)
    },
    {
      label: 'Delete row',
      Icon: Trash2,
      disabled: bodyIndex < 0,
      run: () => {
        const next = deleteRow(table, bodyIndex)
        mutate(next, Math.min(bodyIndex, next.rows.length - 1), active.column)
      }
    },
    {
      label: 'Column left',
      Icon: ArrowLeft,
      run: () => mutate(insertColumn(table, active.column), active.row, active.column)
    },
    {
      label: 'Column right',
      Icon: ArrowRight,
      run: () => mutate(insertColumn(table, active.column + 1), active.row, active.column + 1)
    },
    {
      label: 'Delete column',
      Icon: Trash2,
      disabled: columns <= 1,
      run: () =>
        mutate(deleteColumn(table, active.column), active.row, Math.min(active.column, columns - 2))
    }
  ]

  const apply = () => {
    if (isStale) return
    onDone(fromEditable(table))
  }

  const reload = () => {
    const next = stale?.reload()
    if (next) {
      setTable(toEditable(next))
      setActive({ row: -1, column: 0 })
    }
  }

  return (
    <Modal
      title={title}
      size="xwide"
      className="table-editor"
      onCancel={() => onDone(null)}
      footer={
        <>
          <span className="table-editor-hint muted">Ctrl+Enter applies</span>
          <button
            type="button"
            className="button primary"
            disabled={isStale}
            onClick={apply}
            data-testid="table-editor-apply"
          >
            {confirmLabel}
          </button>
          <button type="button" className="button" onClick={() => onDone(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            apply()
          }
        }}
      >
        {isStale && (
          <div className="table-editor-stale" role="alert" data-testid="table-editor-stale">
            <span>The table was changed in the document while this window was open.</span>
            <button type="button" className="button" onClick={reload}>
              Reload from document
            </button>
          </div>
        )}
        <div className="table-editor-toolbar" role="toolbar" aria-label="Table structure">
          {actions.map(({ label, Icon, disabled, run }) => (
            <button
              key={label}
              type="button"
              className="button compact"
              disabled={disabled || isStale}
              onClick={run}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
          <span className="table-editor-position muted" aria-live="polite">
            {active.row < 0 ? 'Header' : `Row ${active.row + 1}`}, column {active.column + 1} of{' '}
            {columns}
          </span>
        </div>
        <div className="table-editor-grid">
          <table ref={gridRef} aria-label="Table cells">
            <thead>
              <tr className="te-align-row">
                {table.header.map((_, c) => (
                  <th key={c} scope="col">
                    <div className="te-align" role="group" aria-label={`Column ${c + 1} alignment`}>
                      {ALIGNMENTS.map(({ value, label, Icon }) => (
                        <button
                          key={value}
                          type="button"
                          className="icon-button compact"
                          title={label}
                          aria-label={`${label}, column ${c + 1}`}
                          aria-pressed={table.alignments[c] === value}
                          disabled={isStale}
                          onClick={() =>
                            setTable(
                              setColumnAlignment(
                                table,
                                c,
                                table.alignments[c] === value ? 'none' : value
                              )
                            )
                          }
                        >
                          <Icon size={13} />
                        </button>
                      ))}
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                {table.header.map((cell, c) => (
                  <th key={c} className={active.column === c ? 'te-active-column' : undefined}>
                    <input
                      data-cell={`-1:${c}`}
                      className="te-cell te-header"
                      aria-label={`Header, column ${c + 1}`}
                      value={cell}
                      readOnly={isStale}
                      style={{
                        textAlign: table.alignments[c] === 'none' ? 'left' : table.alignments[c]
                      }}
                      onFocus={() => setActive({ row: -1, column: c })}
                      onChange={(e) => setCell(-1, c, e.target.value)}
                      autoFocus={c === 0}
                      data-autofocus={c === 0 ? '' : undefined}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((cells, r) => (
                <tr key={r}>
                  {cells.map((cell, c) => (
                    <td key={c} className={active.column === c ? 'te-active-column' : undefined}>
                      <input
                        data-cell={`${r}:${c}`}
                        className="te-cell"
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        value={cell}
                        readOnly={isStale}
                        style={{
                          textAlign: table.alignments[c] === 'none' ? 'left' : table.alignments[c]
                        }}
                        onFocus={() => setActive({ row: r, column: c })}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault()
                            focusCell(Math.min(r + 1, table.rows.length - 1), c)
                          }
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted table-editor-note">
          Cells hold inline Markdown. Pipes are escaped automatically; merged cells and multi-line
          cells are not part of GitHub Flavored Markdown tables.
        </p>
      </div>
    </Modal>
  )
}
