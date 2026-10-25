import { useId, useMemo, useRef, useState } from 'react'
import { LABEL_ID } from '@shared/publishing/types'
import { Modal } from '../dialogs/Modal'

export interface CaptionResult {
  caption: string
  id: string
  fullWidth: boolean
}

/** Asks for a caption and a stable identifier for a figure or table. */
export function CaptionDialog({
  title,
  kind,
  initialCaption,
  suggestId,
  takenIds,
  confirmLabel,
  onDone
}: {
  title: string
  kind: 'fig' | 'tbl'
  initialCaption: string
  suggestId(caption: string): string
  takenIds: ReadonlySet<string>
  confirmLabel: string
  onDone(result: CaptionResult | null): void
}) {
  const uid = useId()
  const [caption, setCaption] = useState(initialCaption)
  const [id, setId] = useState(() => suggestId(initialCaption))
  const [idEdited, setIdEdited] = useState(false)
  const [fullWidth, setFullWidth] = useState(false)
  const prefix = kind === 'fig' ? 'fig-' : 'tbl-'
  const problem =
    caption.trim() === ''
      ? 'Enter a caption.'
      : !id.startsWith(prefix)
        ? `The identifier starts with “${prefix}”.`
        : !LABEL_ID.test(id)
          ? 'Use letters, digits, - and _ only.'
          : takenIds.has(id)
            ? 'This identifier is already used in the document.'
            : null

  const submit = () => {
    if (problem) return
    onDone({ caption: caption.trim().replace(/\s+/g, ' '), id, fullWidth })
  }

  return (
    <Modal
      title={title}
      onCancel={() => onDone(null)}
      footer={
        <>
          <button type="button" className="button" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            data-testid="caption-confirm"
            disabled={problem !== null}
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="field">
          <label htmlFor={`${uid}-caption`}>Caption</label>
          <input
            id={`${uid}-caption`}
            className="text-input"
            data-autofocus
            data-testid="caption-text"
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value)
              if (!idEdited) setId(suggestId(e.target.value))
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-id`}>Identifier</label>
          <input
            id={`${uid}-id`}
            className="text-input"
            data-testid="caption-id"
            value={id}
            spellCheck={false}
            aria-invalid={problem !== null && caption.trim() !== ''}
            onChange={(e) => {
              setId(e.target.value)
              setIdEdited(true)
            }}
          />
          <p className="setting-hint">
            Refer to it anywhere with <code>@{id || `${prefix}name`}</code>. The number is added
            automatically and updates when you move things around.
          </p>
          {problem && caption.trim() !== '' && (
            <p className="field-error" role="alert">
              {problem}
            </p>
          )}
        </div>
        {kind === 'fig' || kind === 'tbl' ? (
          <label className="check-row">
            <input
              type="checkbox"
              data-testid="caption-full-width"
              checked={fullWidth}
              onChange={(e) => setFullWidth(e.target.checked)}
            />
            Span both columns in a two-column document
          </label>
        ) : null}
      </form>
    </Modal>
  )
}

export interface PickerItem {
  key: string
  primary: string
  secondary?: string
  /** Shown as a small badge (the object kind or scope). */
  badge?: string
  warning?: string
}

/** A searchable list; Enter chooses, Up/Down move. With `multiple`, items toggle. */
export function ListPicker({
  title,
  items,
  multiple = false,
  confirmLabel,
  emptyMessage,
  extra,
  secondaryAction,
  onDone
}: {
  title: string
  items: PickerItem[]
  multiple?: boolean
  confirmLabel: string
  emptyMessage: string
  /** Extra form controls shown below the list (for example a page locator). */
  extra?: React.ReactNode
  secondaryAction?: { label: string; run(): void }
  onDone(keys: string[] | null): void
}) {
  const uid = useId()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q === ''
      ? items
      : items.filter((i) =>
          `${i.primary} ${i.secondary ?? ''} ${i.key} ${i.badge ?? ''}`.toLowerCase().includes(q)
        )
  }, [items, query])

  const choose = (key: string) => {
    if (multiple) {
      setChosen((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]))
    } else onDone([key])
  }

  return (
    <Modal
      title={title}
      size="wide"
      onCancel={() => onDone(null)}
      footer={
        <>
          {secondaryAction && (
            <button type="button" className="button" onClick={secondaryAction.run}>
              {secondaryAction.label}
            </button>
          )}
          <span className="toolbar-spacer" />
          <button type="button" className="button" onClick={() => onDone(null)}>
            Cancel
          </button>
          {multiple && (
            <button
              type="button"
              className="button primary"
              data-testid="picker-confirm"
              disabled={chosen.length === 0}
              onClick={() => onDone(chosen)}
            >
              {confirmLabel}
            </button>
          )}
        </>
      }
    >
      <div className="field">
        <label htmlFor={`${uid}-q`}>Search</label>
        <input
          id={`${uid}-q`}
          className="text-input"
          data-autofocus
          data-testid="picker-search"
          value={query}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(shown.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter' && shown[active]) {
              e.preventDefault()
              choose(shown[active].key)
            }
          }}
        />
      </div>
      {shown.length === 0 ? (
        <p className="setting-hint" data-testid="picker-empty">
          {items.length === 0 ? emptyMessage : 'Nothing matches your search.'}
        </p>
      ) : (
        <ul
          className="picker-list"
          ref={listRef}
          role={multiple ? 'listbox' : 'list'}
          aria-multiselectable={multiple}
        >
          {shown.map((item, index) => {
            const selected = chosen.includes(item.key)
            return (
              <li key={item.key}>
                <button
                  type="button"
                  role={multiple ? 'option' : undefined}
                  aria-selected={multiple ? selected : undefined}
                  className={`picker-item${index === active ? ' active' : ''}${selected ? ' selected' : ''}`}
                  data-testid={`picker-item-${item.key}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item.key)}
                >
                  {multiple && (
                    <input
                      type="checkbox"
                      tabIndex={-1}
                      readOnly
                      checked={selected}
                      aria-hidden="true"
                    />
                  )}
                  <span className="picker-main">
                    <span className="picker-primary">{item.primary}</span>
                    {item.secondary && <span className="picker-secondary">{item.secondary}</span>}
                    {item.warning && <span className="picker-warning">{item.warning}</span>}
                  </span>
                  {item.badge && <span className="chip-badge">{item.badge}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {extra}
    </Modal>
  )
}
