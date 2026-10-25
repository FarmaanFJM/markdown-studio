import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { headingAtLine, type DocumentAnalysis, type Heading } from '@shared/markdown/analysis'
import { documentModels } from '../editor/models'
import { analysisFor } from '../editor/markdown/model'
import { goToLine } from '../editor/markdown/navigation'
import { useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'

interface OutlineNode {
  heading: Heading
  key: string
  children: OutlineNode[]
}

/** Headings nested by level. Keys are stable across edits that do not rename the heading. */
export function buildOutlineTree(headings: Heading[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  const seen = new Map<string, number>()
  for (const heading of headings) {
    const base = `${heading.level}|${heading.text}`
    const occurrence = seen.get(base) ?? 0
    seen.set(base, occurrence + 1)
    const node: OutlineNode = { heading, key: `${base}|${occurrence}`, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].heading.level >= heading.level) stack.pop()
    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  return roots
}

interface Row {
  node: OutlineNode
  depth: number
  parent: Row | null
  expandable: boolean
  expanded: boolean
}

function flatten(
  nodes: OutlineNode[],
  collapsed: Set<string>,
  depth = 0,
  parent: Row | null = null
): Row[] {
  const rows: Row[] = []
  for (const node of nodes) {
    const expandable = node.children.length > 0
    const row: Row = { node, depth, parent, expandable, expanded: !collapsed.has(node.key) }
    rows.push(row)
    if (expandable && row.expanded) rows.push(...flatten(node.children, collapsed, depth + 1, row))
  }
  return rows
}

/** Collapsed groups per document, kept for the session so switching tabs does not reset them. */
const collapsedByDocument = new Map<string, Set<string>>()

function useOutline(): { analysis: DocumentAnalysis | null; activeId: string | null } {
  const activeId = useDocuments((s) => s.activeId)
  const revision = useDocuments((s) => s.revision)
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null)

  useEffect(() => {
    const model = documentModels.get(activeId)
    if (!model) {
      setAnalysis(null)
      return
    }
    // Typing updates the outline after a short pause; switching tabs updates it at once.
    const timer = setTimeout(() => setAnalysis(analysisFor(model)), 200)
    return () => clearTimeout(timer)
    // `revision` changes whenever the active text does.
  }, [activeId, revision])

  useEffect(() => {
    const model = documentModels.get(activeId)
    setAnalysis(model ? analysisFor(model) : null)
  }, [activeId])

  return { analysis, activeId }
}

function OutlineTree({ analysis, documentId }: { analysis: DocumentAnalysis; documentId: string }) {
  const cursorLine = useDocuments((s) => s.cursor.line)
  const tree = useMemo(() => buildOutlineTree(analysis.headings), [analysis])
  const [, bump] = useState(0)
  const collapsed = useMemo(() => {
    let set = collapsedByDocument.get(documentId)
    if (!set) {
      set = new Set()
      collapsedByDocument.set(documentId, set)
    }
    return set
    // The set is mutated in place; `bump` re-renders after changes.
  }, [documentId])
  const rows = flatten(tree, collapsed)
  const current = headingAtLine(analysis, cursorLine - 1)
  const listRef = useRef<HTMLUListElement>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)

  // Keep the heading under the cursor in view when it changes.
  useEffect(() => {
    listRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current?.line])

  const toggle = (row: Row) => {
    if (collapsed.has(row.node.key)) collapsed.delete(row.node.key)
    else collapsed.add(row.node.key)
    bump((n) => n + 1)
  }

  const tabStop =
    rows.find((r) => r.node.key === focusKey) ??
    rows.find((r) => r.node.heading === current) ??
    rows[0]
  const focusRow = (row: Row | undefined) => {
    if (!row) return
    setFocusKey(row.node.key)
    const find = () =>
      listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(row.node.key)}"]`)
    // Focus moves at once when the row is on screen, so a quick next keystroke reaches it.
    const element = find()
    if (element) element.focus()
    else requestAnimationFrame(() => find()?.focus())
  }

  const onKeyDown = (event: React.KeyboardEvent, row: Row, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRow(rows[index + 1])
        break
      case 'ArrowUp':
        event.preventDefault()
        focusRow(rows[index - 1])
        break
      case 'Home':
        event.preventDefault()
        focusRow(rows[0])
        break
      case 'End':
        event.preventDefault()
        focusRow(rows[rows.length - 1])
        break
      case 'ArrowRight':
        event.preventDefault()
        if (row.expandable && !row.expanded) toggle(row)
        else focusRow(rows[index + 1]?.parent === row ? rows[index + 1] : undefined)
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (row.expandable && row.expanded) toggle(row)
        else focusRow(row.parent ?? undefined)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        goToLine(row.node.heading.line)
        break
    }
  }

  return (
    <ul ref={listRef} className="outline-tree" role="tree" aria-label="Document outline">
      {rows.map((row, index) => {
        const heading = row.node.heading
        const isCurrent = heading === current
        return (
          <li
            key={row.node.key}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-expanded={row.expandable ? row.expanded : undefined}
            aria-selected={isCurrent}
            tabIndex={row === tabStop ? 0 : -1}
            data-key={row.node.key}
            data-current={isCurrent}
            data-testid="outline-item"
            className={`outline-item${isCurrent ? ' current' : ''}`}
            style={{ paddingLeft: 6 + row.depth * 14 }}
            onClick={() => {
              setFocusKey(row.node.key)
              goToLine(heading.line)
            }}
            onFocus={() => setFocusKey(row.node.key)}
            onKeyDown={(event) => onKeyDown(event, row, index)}
          >
            <button
              type="button"
              tabIndex={-1}
              className={`outline-twisty${row.expandable ? '' : ' hidden'}`}
              aria-label={row.expanded ? 'Collapse' : 'Expand'}
              onClick={(event) => {
                event.stopPropagation()
                toggle(row)
              }}
            >
              {row.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            <span className="outline-level">H{heading.level}</span>
            <span className="outline-text" title={heading.text}>
              {heading.text || '(empty heading)'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** The Outline section of the Explorer: the headings of the active document, as a tree. */
export function OutlineSection() {
  const open = useSettings((s) => s.settings.layout.outlineOpen)
  const update = useSettings((s) => s.update)
  const { analysis, activeId } = useOutline()

  return (
    <section className={`outline-section${open ? ' open' : ''}`} aria-label="Outline">
      <button
        type="button"
        className="outline-header"
        aria-expanded={open}
        aria-controls="outline-body"
        data-testid="outline-toggle"
        onClick={() => update({ layout: { outlineOpen: !open } })}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Outline</span>
      </button>
      {open && (
        <div id="outline-body" className="outline-body" data-testid="outline">
          {!analysis || !activeId ? (
            <p className="outline-empty">Open a Markdown document to see its outline.</p>
          ) : analysis.headings.length === 0 ? (
            <p className="outline-empty">This document has no headings yet.</p>
          ) : (
            <OutlineTree analysis={analysis} documentId={activeId} />
          )}
        </div>
      )}
    </section>
  )
}
