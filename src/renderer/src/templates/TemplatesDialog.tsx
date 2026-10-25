import { useMemo, useState } from 'react'
import { Copy, FilePlus2, Pencil, Trash2 } from 'lucide-react'
import type { TemplateKind, TemplateScope } from '@shared/templates'
import { Modal } from '../dialogs/Modal'
import { activeDocument } from '../state/documents'
import { dialogs } from '../state/ui'
import {
  allTemplates,
  originLabel,
  removeTemplate,
  saveTemplate,
  useTemplates,
  type TemplateEntry,
  type TemplateOrigin
} from './store'
import { draftFrom, TemplateForm, type TemplateDraft } from './TemplateForm'

export type TemplatesPurpose = 'create' | 'insert' | 'manage'

export interface TemplateChoice {
  action: 'create' | 'insert'
  entry: TemplateEntry
}

interface Props {
  purpose: TemplatesPurpose
  onDone(result: TemplateChoice | null): void
}

const entryKey = (entry: TemplateEntry) => `${entry.origin}:${entry.template.id}`
const ORIGIN_ORDER: TemplateOrigin[] = ['workspace', 'global', 'built-in']

type View = { name: 'list' } | { name: 'form'; draft: TemplateDraft; editing: boolean }

/** Browse, create, edit, duplicate and delete templates; or pick one to use. */
export function TemplatesDialog({ purpose, onDone }: Props) {
  const store = useTemplates()
  const [kind, setKind] = useState<TemplateKind>(purpose === 'insert' ? 'snippet' : 'document')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [view, setView] = useState<View>({ name: 'list' })

  const entries = useMemo(
    () => {
      const needle = query.trim().toLowerCase()
      return allTemplates().filter(
        ({ template }) =>
          template.kind === kind &&
          (!needle ||
            template.name.toLowerCase().includes(needle) ||
            template.description.toLowerCase().includes(needle))
      )
    },
    // The store changes whenever templates are saved or deleted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, kind, query]
  )
  const selected = entries.find((entry) => entryKey(entry) === selectedKey) ?? entries[0] ?? null
  const canUseSnippet = activeDocument() !== null
  const custom = selected !== null && selected.origin !== 'built-in'
  const defaultScope: TemplateScope = store.workspaceAvailable ? 'workspace' : 'global'

  const move = (delta: number) => {
    if (entries.length === 0) return
    const index = Math.max(
      0,
      entries.findIndex((e) => selected && entryKey(e) === entryKey(selected))
    )
    setSelectedKey(entryKey(entries[(index + delta + entries.length) % entries.length]))
  }

  const openForm = (draft: TemplateDraft, editing: boolean) =>
    setView({ name: 'form', draft, editing })

  const submitForm = async (draft: TemplateDraft) => {
    const saved = await saveTemplate(draft.scope, draft)
    if (!saved) return
    setKind(saved.kind)
    setQuery('')
    setSelectedKey(`${saved.scope}:${saved.id}`)
    setView({ name: 'list' })
  }

  const duplicate = async () => {
    if (!selected) return
    const { template } = selected
    if (selected.origin === 'built-in') {
      openForm(
        draftFrom({ ...template, id: '', name: `${template.name} copy` }, defaultScope),
        false
      )
      return
    }
    const saved = await saveTemplate(selected.origin as TemplateScope, {
      ...template,
      id: '',
      name: `${template.name} copy`
    })
    if (saved) setSelectedKey(`${saved.scope}:${saved.id}`)
  }

  const remove = async () => {
    if (!selected || !custom) return
    const confirmed = await dialogs.confirm({
      title: 'Delete Template',
      message: `Delete "${selected.template.name}"?`,
      detail:
        selected.origin === 'workspace'
          ? 'This removes it from this folder for everyone who uses the folder.'
          : 'It will no longer be available in any folder.',
      confirmLabel: 'Delete',
      danger: true
    })
    if (confirmed) {
      await removeTemplate(selected.origin as TemplateScope, selected.template.id)
      setSelectedKey(null)
    }
  }

  const title =
    view.name === 'form'
      ? view.editing
        ? 'Edit Template'
        : 'New Template'
      : purpose === 'create'
        ? 'New File from Template'
        : purpose === 'insert'
          ? 'Insert Saved Snippet'
          : 'Templates and Snippets'

  if (view.name === 'form') {
    return (
      <Modal title={title} size="wide" footer={null} onCancel={() => setView({ name: 'list' })}>
        <TemplateForm
          draft={view.draft}
          editing={view.editing}
          workspaceAvailable={store.workspaceAvailable}
          onSave={(draft) => void submitForm(draft)}
          onCancel={() => setView({ name: 'list' })}
        />
      </Modal>
    )
  }

  const primary =
    selected &&
    (selected.template.kind === 'document' ? (
      <button
        type="button"
        className="button primary"
        data-testid="template-use"
        onClick={() => onDone({ action: 'create', entry: selected })}
      >
        Create Document
      </button>
    ) : (
      <button
        type="button"
        className="button primary"
        data-testid="template-use"
        disabled={!canUseSnippet}
        title={canUseSnippet ? undefined : 'Open a document to insert a snippet'}
        onClick={() => onDone({ action: 'insert', entry: selected })}
      >
        Insert Snippet
      </button>
    ))

  return (
    <Modal
      title={title}
      size="xwide"
      className="templates-dialog"
      onCancel={() => onDone(null)}
      footer={
        <>
          <div className="templates-actions">
            <button
              type="button"
              className="button"
              onClick={() => openForm(draftFrom({ kind }, defaultScope), false)}
            >
              <FilePlus2 size={14} /> New Template…
            </button>
            <button
              type="button"
              className="button"
              disabled={!custom}
              onClick={() =>
                selected &&
                openForm(draftFrom(selected.template, selected.origin as TemplateScope), true)
              }
            >
              <Pencil size={14} /> Edit…
            </button>
            <button
              type="button"
              className="button"
              disabled={!selected}
              onClick={() => void duplicate()}
            >
              <Copy size={14} /> Duplicate
            </button>
            <button
              type="button"
              className="button"
              disabled={!custom}
              onClick={() => void remove()}
            >
              <Trash2 size={14} /> Delete…
            </button>
          </div>
          {primary}
          <button type="button" className="button" onClick={() => onDone(null)}>
            {purpose === 'manage' ? 'Close' : 'Cancel'}
          </button>
        </>
      }
    >
      <div className="templates-layout">
        <div className="templates-list-pane">
          <div className="templates-filter">
            <div className="segmented" role="radiogroup" aria-label="Type">
              {(['document', 'snippet'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  className={kind === value ? 'active' : ''}
                  onClick={() => {
                    setKind(value)
                    setSelectedKey(null)
                  }}
                >
                  {value === 'document' ? 'Documents' : 'Snippets'}
                </button>
              ))}
            </div>
            <input
              className="text-input"
              type="search"
              placeholder="Search"
              aria-label="Search templates"
              value={query}
              data-autofocus
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  move(1)
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  move(-1)
                } else if (event.key === 'Enter' && selected) {
                  event.preventDefault()
                  if (selected.template.kind === 'document') {
                    onDone({ action: 'create', entry: selected })
                  } else if (canUseSnippet) {
                    onDone({ action: 'insert', entry: selected })
                  }
                }
              }}
            />
          </div>
          <div
            className="templates-list"
            role="listbox"
            aria-label={kind === 'document' ? 'Document templates' : 'Snippets'}
            data-testid="template-list"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                move(1)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                move(-1)
              }
            }}
          >
            {ORIGIN_ORDER.map((origin) => {
              const group = entries.filter((entry) => entry.origin === origin)
              if (group.length === 0) return null
              return (
                <div key={origin} role="group" aria-label={originLabel(origin)}>
                  <div className="templates-group">{originLabel(origin)}</div>
                  {group.map((entry) => {
                    const isSelected = selected !== null && entryKey(entry) === entryKey(selected)
                    return (
                      <button
                        key={entryKey(entry)}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`templates-item${isSelected ? ' selected' : ''}`}
                        onClick={() => setSelectedKey(entryKey(entry))}
                        onDoubleClick={() =>
                          entry.template.kind === 'document'
                            ? onDone({ action: 'create', entry })
                            : canUseSnippet && onDone({ action: 'insert', entry })
                        }
                      >
                        <span className="templates-item-name">{entry.template.name}</span>
                        {entry.template.description && (
                          <span className="templates-item-description">
                            {entry.template.description}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {entries.length === 0 && (
              <p className="templates-empty">
                {query
                  ? 'Nothing matches your search.'
                  : kind === 'snippet'
                    ? 'No saved snippets yet. Use "New Template…" or "Save Selection as Snippet" to add one.'
                    : 'No templates.'}
              </p>
            )}
          </div>
        </div>
        <div className="templates-detail" aria-live="polite">
          {selected ? (
            <>
              <h3 className="templates-detail-name">{selected.template.name}</h3>
              <p className="muted">
                {originLabel(selected.origin)}
                {selected.template.description ? ` · ${selected.template.description}` : ''}
              </p>
              <pre className="templates-preview" data-testid="template-preview">
                {selected.template.body.slice(0, 6000) || '(empty document)'}
              </pre>
            </>
          ) : (
            <p className="muted">Select a template to see its content.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
