import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../dialogs/Modal'

export interface PaletteItem {
  id: string
  label: string
  /** Small text before the label, such as a category. */
  category?: string
  /** Right-aligned hint, such as a keyboard shortcut. */
  hint?: string
  /** Extra words that match the search. */
  keywords?: string
  /** Indentation level, used for the heading list. */
  depth?: number
  disabled?: boolean
}

interface Props {
  title: string
  placeholder: string
  items: PaletteItem[]
  emptyText: string
  onDone(id: string | null): void
}

function score(item: PaletteItem, tokens: string[]): number {
  const label = item.label.toLowerCase()
  const haystack = `${item.category ?? ''} ${item.label} ${item.keywords ?? ''}`.toLowerCase()
  let total = 0
  for (const token of tokens) {
    const index = haystack.indexOf(token)
    if (index < 0) return -1
    const inLabel = label.indexOf(token)
    total += inLabel === 0 ? 3 : inLabel > 0 ? 2 : 1
  }
  return total
}

/** A searchable list of commands (or headings) driven entirely from the keyboard. */
export function CommandPalette({ title, placeholder, items, emptyText, onDone }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const visible = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return items
    return items
      .map((item, order) => ({ item, order, rank: score(item, tokens) }))
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => b.rank - a.rank || a.order - b.order)
      .map((entry) => entry.item)
  }, [items, query])

  const selected = Math.min(index, Math.max(0, visible.length - 1))
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, visible])

  const choose = (item: PaletteItem | undefined) => {
    if (item && !item.disabled) onDone(item.id)
  }

  return (
    <Modal title={title} className="palette" top onCancel={() => onDone(null)} footer={null}>
      <input
        className="text-input wide palette-input"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={visible[selected] ? `palette-option-${selected}` : undefined}
        aria-label={title}
        placeholder={placeholder}
        value={query}
        spellCheck={false}
        data-autofocus
        data-testid="palette-input"
        onChange={(e) => {
          setQuery(e.target.value)
          setIndex(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setIndex((selected + 1) % Math.max(1, visible.length))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIndex((selected - 1 + visible.length) % Math.max(1, visible.length))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            choose(visible[selected])
          }
        }}
      />
      <ul
        id="palette-list"
        ref={listRef}
        className="palette-list"
        role="listbox"
        aria-label="Results"
        data-testid="palette-list"
      >
        {visible.map((item, i) => (
          <li
            key={item.id}
            id={`palette-option-${i}`}
            role="option"
            aria-selected={i === selected}
            aria-disabled={item.disabled || undefined}
            className={`palette-item${i === selected ? ' selected' : ''}${item.disabled ? ' disabled' : ''}`}
            style={item.depth ? { paddingLeft: 12 + item.depth * 14 } : undefined}
            onMouseMove={() => setIndex(i)}
            onClick={() => choose(item)}
          >
            {item.category && <span className="palette-category">{item.category}</span>}
            <span className="palette-label">{item.label}</span>
            {item.hint && <kbd className="palette-hint">{item.hint}</kbd>}
          </li>
        ))}
        {visible.length === 0 && <li className="palette-empty">{emptyText}</li>}
      </ul>
    </Modal>
  )
}
