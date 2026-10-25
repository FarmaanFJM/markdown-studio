import { useEffect, useId, useMemo, useState } from 'react'
import { createCitationProvider, CITATION_STYLE } from '@shared/publishing/citations'
import { importSourcesText } from '@shared/publishing/importSources'
import {
  describeSource,
  formatNameList,
  missingFields,
  parseNameList,
  SOURCE_KEY,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPES,
  suggestKey,
  type Source,
  type SourceType
} from '@shared/publishing/sources'
import { basename } from '@shared/paths'
import { api, errorMessage } from '../bridge'
import { Modal } from '../dialogs/Modal'
import { Field, SelectInput } from '../presentation/fields'
import { notify } from '../state/ui'

export type SourceScope = 'project' | 'document'

export interface ScopedSource {
  source: Source
  scope: SourceScope
}

export interface SourcesHost {
  /** False when no folder is open, so there is no project library. */
  projectAvailable: boolean
  /** False when no document is open to hold its own sources. */
  documentAvailable: boolean
  load(): ScopedSource[]
  /** Replaces the sources of one scope. Returns false (after explaining) when saving failed. */
  save(scope: SourceScope, sources: Source[]): Promise<boolean>
}

interface Draft {
  /** Key of the entry being edited; null for a new one. */
  original: string | null
  scope: SourceScope
  type: SourceType
  id: string
  authors: string
  editors: string
  year: string
  title: string
  container: string
  publisher: string
  volume: string
  issue: string
  page: string
  doi: string
  url: string
}

function toDraft(entry: ScopedSource | null, scope: SourceScope): Draft {
  const s = entry?.source
  return {
    original: s?.id ?? null,
    scope: entry?.scope ?? scope,
    type: s?.type ?? 'webpage',
    id: s?.id ?? '',
    authors: formatNameList(s?.author),
    editors: formatNameList(s?.editor),
    year: String(s?.issued?.['date-parts']?.[0]?.[0] ?? s?.issued?.literal ?? ''),
    title: s?.title ?? '',
    container: s?.['container-title'] ?? '',
    publisher: s?.publisher ?? '',
    volume: s?.volume ?? '',
    issue: s?.issue ?? '',
    page: s?.page ?? '',
    doi: s?.DOI ?? '',
    url: s?.URL ?? ''
  }
}

/** Builds a source from the form. Only what the user typed is stored. */
function fromDraft(draft: Draft, previous: Source | undefined): Source {
  const source: Source = { ...(previous ?? {}), id: draft.id.trim(), type: draft.type }
  const set = (key: keyof Source, value: string) => {
    if (value.trim() === '') delete source[key]
    else (source as Record<string, unknown>)[key] = value.trim()
  }
  set('title', draft.title)
  set('container-title', draft.container)
  set('publisher', draft.publisher)
  set('volume', draft.volume)
  set('issue', draft.issue)
  set('page', draft.page)
  set('DOI', draft.doi)
  set('URL', draft.url)
  const authors = parseNameList(draft.authors)
  if (authors.length > 0) source.author = authors
  else delete source.author
  const editors = parseNameList(draft.editors)
  if (editors.length > 0) source.editor = editors
  else delete source.editor
  const year = draft.year.trim()
  if (/^\d{1,4}$/.test(year)) source.issued = { 'date-parts': [[Number(year)]] }
  else if (year !== '') source.issued = { literal: year }
  else delete source.issued
  return source
}

function containerLabel(type: SourceType): string {
  switch (type) {
    case 'article-journal':
      return 'Journal'
    case 'chapter':
    case 'paper-conference':
      return 'Book or proceedings title'
    case 'webpage':
    case 'post-weblog':
      return 'Website name'
    case 'article-newspaper':
    case 'article-magazine':
      return 'Publication'
    default:
      return 'Container title (optional)'
  }
}

export function SourcesDialog({
  host,
  initialKey,
  onDone
}: {
  host: SourcesHost
  initialKey?: string
  onDone(): void
}) {
  const uid = useId()
  const [entries, setEntries] = useState<ScopedSource[]>(() => host.load())
  const defaultScope: SourceScope = host.projectAvailable ? 'project' : 'document'
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(entries.find((e) => e.source.id === initialKey) ?? null, defaultScope)
  )
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const taken = useMemo(() => new Set(entries.map((e) => e.source.id)), [entries])
  const shown = entries.filter(
    (e) =>
      query.trim() === '' ||
      `${describeSource(e.source)} ${e.source.id}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  )
  const previous = entries.find((e) => e.source.id === draft.original)?.source
  const candidate = useMemo(() => fromDraft(draft, previous), [draft, previous])
  const missing = missingFields(candidate)
  const preview = useMemo(() => {
    if (!SOURCE_KEY.test(candidate.id || 'x')) return ''
    try {
      const probe = { ...candidate, id: candidate.id || 'preview' }
      const { bibliography } = createCitationProvider(
        [probe],
        'en'
      )([
        {
          items: [{ id: probe.id, prefix: '', suffix: '', suppressAuthor: false }],
          narrative: false,
          line: 0
        }
      ])
      // Shown as plain text: the entry is built from what the user typed.
      return (
        new DOMParser()
          .parseFromString(bibliography[0] ?? '', 'text/html')
          .body.textContent?.trim() ?? ''
      )
    } catch {
      return ''
    }
  }, [candidate])

  const keyProblem =
    draft.id.trim() === ''
      ? 'Enter a key (for example smith2020).'
      : !SOURCE_KEY.test(draft.id.trim())
        ? 'Use letters, digits and _ - : . only, without spaces.'
        : draft.id.trim() !== draft.original && taken.has(draft.id.trim())
          ? 'This key is already used by another source.'
          : null
  const scopeProblem =
    draft.scope === 'project' && !host.projectAvailable
      ? 'Open a folder to keep a project library, or store this source in the document.'
      : draft.scope === 'document' && !host.documentAvailable
        ? 'Open a document to store the source in it.'
        : null

  const persist = async (next: ScopedSource[]): Promise<boolean> => {
    setBusy(true)
    try {
      for (const scope of ['project', 'document'] as const) {
        const before = JSON.stringify(entries.filter((e) => e.scope === scope).map((e) => e.source))
        const after = next.filter((e) => e.scope === scope).map((e) => e.source)
        if (before !== JSON.stringify(after) && !(await host.save(scope, after))) return false
      }
      setEntries(next)
      return true
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (keyProblem || scopeProblem) return
    const source = fromDraft(draft, previous)
    const without = entries.filter((e) => e.source.id !== draft.original)
    const index = entries.findIndex((e) => e.source.id === draft.original)
    const entry: ScopedSource = { source, scope: draft.scope }
    const next =
      index >= 0
        ? [...without.slice(0, index), entry, ...without.slice(index)]
        : [...without, entry]
    if (await persist(next)) {
      setDraft(toDraft(entry, defaultScope))
      setMessage(`Saved “${source.id}”.`)
    }
  }

  const remove = async () => {
    if (draft.original === null) return
    if (await persist(entries.filter((e) => e.source.id !== draft.original))) {
      setDraft(toDraft(null, defaultScope))
      setMessage(`Removed “${draft.original}”.`)
    }
  }

  const importFile = async () => {
    try {
      const path = await api.dialogs.openSources()
      if (!path) return
      const file = await api.fs.readText(path)
      const result = importSourcesText(file.content, basename(path))
      const fresh = result.sources.filter((s) => !taken.has(s.id))
      const skipped = result.sources.length - fresh.length
      if (fresh.length > 0) {
        const scope = defaultScope
        if (await persist([...entries, ...fresh.map((source) => ({ source, scope }))])) {
          const parts = [
            `Imported ${fresh.length} source${fresh.length === 1 ? '' : 's'} from ${basename(path)}.`
          ]
          if (skipped > 0) parts.push(`${skipped} with an existing key were skipped.`)
          if (result.problems.length > 0)
            parts.push(`${result.problems.length} entries had problems.`)
          setMessage(parts.join(' '))
        }
      } else {
        setMessage(result.problems[0] ?? 'Nothing new to import.')
      }
    } catch (error) {
      notify('error', `Import failed: ${errorMessage(error)}`)
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  // Suggest a key from the first author and year until the user types their own.
  const [keyTouched, setKeyTouched] = useState(initialKey !== undefined)
  useEffect(() => {
    if (draft.original !== null || keyTouched) return
    const suggested = suggestKey(candidate, taken)
    if (suggested !== draft.id && (draft.authors || draft.year)) set({ id: suggested })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.authors, draft.year])

  return (
    <Modal
      title="Sources"
      size="xwide"
      className="sources-modal"
      onCancel={onDone}
      footer={
        <>
          <span className="setting-hint">
            Citations are formatted as {CITATION_STYLE.name}. Missing details are shown, never
            filled in.
          </span>
          <span className="toolbar-spacer" />
          <button
            type="button"
            className="button primary"
            data-testid="sources-close"
            onClick={onDone}
          >
            Close
          </button>
        </>
      }
    >
      <div className="sources-layout">
        <div className="sources-list-pane">
          <div className="button-row">
            <button
              type="button"
              className="button compact"
              data-testid="source-new"
              onClick={() => {
                setDraft(toDraft(null, defaultScope))
                setKeyTouched(false)
                setMessage(null)
              }}
            >
              New source
            </button>
            <button
              type="button"
              className="button compact"
              data-testid="source-import"
              onClick={() => void importFile()}
            >
              Import…
            </button>
          </div>
          <input
            className="text-input"
            aria-label="Filter sources"
            placeholder="Filter sources"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="picker-list" data-testid="sources-list">
            {shown.length === 0 && (
              <li className="setting-hint">
                {entries.length === 0
                  ? 'No sources yet. Add one on the right, or import a BibTeX or CSL JSON file.'
                  : 'Nothing matches.'}
              </li>
            )}
            {shown.map((entry) => {
              const gaps = missingFields(entry.source)
              return (
                <li key={`${entry.scope}:${entry.source.id}`}>
                  <button
                    type="button"
                    className={`picker-item${draft.original === entry.source.id ? ' active' : ''}`}
                    data-testid={`source-${entry.source.id}`}
                    onClick={() => {
                      setDraft(toDraft(entry, defaultScope))
                      setKeyTouched(true)
                      setMessage(null)
                    }}
                  >
                    <span className="picker-main">
                      <span className="picker-primary">{entry.source.id}</span>
                      <span className="picker-secondary">{describeSource(entry.source)}</span>
                      {gaps.length > 0 && (
                        <span className="picker-warning">
                          Missing: {gaps.map((g) => g.field).join(', ')}
                        </span>
                      )}
                    </span>
                    <span className="chip-badge">
                      {entry.scope === 'project' ? 'Project' : 'Document'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <form
          className="sources-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <Field label="Type" htmlFor={`${uid}-type`}>
            <SelectInput<SourceType>
              id={`${uid}-type`}
              testId="source-type"
              value={draft.type}
              options={SOURCE_TYPES.map((t) => ({ value: t, label: SOURCE_TYPE_LABELS[t] }))}
              onChange={(type) => set({ type })}
            />
          </Field>
          <Field
            label="Key"
            htmlFor={`${uid}-key`}
            hint="Used in the text as @key."
            error={draft.id !== '' || draft.authors !== '' ? keyProblem : null}
          >
            <input
              id={`${uid}-key`}
              className="text-input"
              data-testid="source-key"
              value={draft.id}
              spellCheck={false}
              onChange={(e) => {
                setKeyTouched(true)
                set({ id: e.target.value })
              }}
            />
          </Field>
          <Field
            label="Authors"
            htmlFor={`${uid}-authors`}
            hint="Family, Given; Family, Given — or an organisation name."
          >
            <input
              id={`${uid}-authors`}
              className="text-input"
              data-testid="source-authors"
              value={draft.authors}
              onChange={(e) => set({ authors: e.target.value })}
            />
          </Field>
          {(draft.type === 'book' || draft.type === 'chapter') && (
            <Field label="Editors" htmlFor={`${uid}-editors`}>
              <input
                id={`${uid}-editors`}
                className="text-input"
                value={draft.editors}
                onChange={(e) => set({ editors: e.target.value })}
              />
            </Field>
          )}
          <Field
            label="Year"
            htmlFor={`${uid}-year`}
            hint="Leave empty if unknown (shown as n.d.)."
          >
            <input
              id={`${uid}-year`}
              className="text-input"
              data-testid="source-year"
              value={draft.year}
              onChange={(e) => set({ year: e.target.value })}
            />
          </Field>
          <Field label="Title" htmlFor={`${uid}-title`}>
            <input
              id={`${uid}-title`}
              className="text-input"
              data-testid="source-title"
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
          <Field label={containerLabel(draft.type)} htmlFor={`${uid}-container`}>
            <input
              id={`${uid}-container`}
              className="text-input"
              data-testid="source-container"
              value={draft.container}
              onChange={(e) => set({ container: e.target.value })}
            />
          </Field>
          <Field label="Publisher or developer" htmlFor={`${uid}-publisher`}>
            <input
              id={`${uid}-publisher`}
              className="text-input"
              data-testid="source-publisher"
              value={draft.publisher}
              onChange={(e) => set({ publisher: e.target.value })}
            />
          </Field>
          <div className="layout-margins">
            <Field label="Volume" htmlFor={`${uid}-volume`}>
              <input
                id={`${uid}-volume`}
                className="text-input"
                value={draft.volume}
                onChange={(e) => set({ volume: e.target.value })}
              />
            </Field>
            <Field label="Issue" htmlFor={`${uid}-issue`}>
              <input
                id={`${uid}-issue`}
                className="text-input"
                value={draft.issue}
                onChange={(e) => set({ issue: e.target.value })}
              />
            </Field>
            <Field label="Pages" htmlFor={`${uid}-page`}>
              <input
                id={`${uid}-page`}
                className="text-input"
                value={draft.page}
                onChange={(e) => set({ page: e.target.value })}
              />
            </Field>
          </div>
          <Field label="DOI" htmlFor={`${uid}-doi`}>
            <input
              id={`${uid}-doi`}
              className="text-input"
              value={draft.doi}
              spellCheck={false}
              onChange={(e) => set({ doi: e.target.value })}
            />
          </Field>
          <Field label="URL" htmlFor={`${uid}-url`}>
            <input
              id={`${uid}-url`}
              className="text-input"
              data-testid="source-url"
              value={draft.url}
              spellCheck={false}
              onChange={(e) => set({ url: e.target.value })}
            />
          </Field>
          <Field
            label="Stored in"
            htmlFor={`${uid}-scope`}
            hint={
              draft.scope === 'project'
                ? 'The project library (.markdown-studio/sources.json) is shared by every document in this folder.'
                : 'Saved in this document’s front matter (references:), so the file carries its own sources.'
            }
            error={scopeProblem}
          >
            <SelectInput<SourceScope>
              id={`${uid}-scope`}
              testId="source-scope"
              value={draft.scope}
              disabled={draft.original !== null}
              options={[
                { value: 'project', label: 'Project library' },
                { value: 'document', label: 'This document' }
              ]}
              onChange={(scope) => set({ scope })}
            />
          </Field>
          {missing.length > 0 && (
            <p className="source-missing" data-testid="source-missing" role="status">
              Missing for APA: {missing.map((m) => m.message).join('; ')}.
            </p>
          )}
          {preview && (
            <div className="source-preview" data-testid="source-preview">
              <span className="setting-hint">Reference list entry</span>
              <div>{preview}</div>
            </div>
          )}
          <div className="button-row">
            <button
              type="submit"
              className="button primary"
              data-testid="source-save"
              disabled={busy || keyProblem !== null || scopeProblem !== null}
            >
              {draft.original === null ? 'Add source' : 'Save changes'}
            </button>
            {draft.original !== null && (
              <button
                type="button"
                className="button danger"
                data-testid="source-delete"
                disabled={busy}
                onClick={() => void remove()}
              >
                Delete
              </button>
            )}
          </div>
          {message && (
            <p className="setting-hint" role="status" data-testid="sources-message">
              {message}
            </p>
          )}
        </form>
      </div>
    </Modal>
  )
}
