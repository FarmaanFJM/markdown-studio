import { useEffect, useId, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Eye,
  FileDown,
  FilePlus,
  GripVertical,
  Trash2
} from 'lucide-react'
import { basename, joinPath } from '@shared/paths'
import {
  DEFAULT_PUBLICATION,
  moveChapter,
  sanitizePublication,
  type PublicationConfig
} from '@shared/publishing/project'
import type { PublishingProblem } from '@shared/publishing/types'
import { api, errorMessage } from '../bridge'
import { commands } from '../commands/commands'
import { openDocument, useDocuments } from '../state/documents'
import { useProject } from '../state/project'
import { usePublicationView } from '../state/publicationView'
import { dialogs, notify } from '../state/ui'
import { useWorkspace } from '../state/workspace'
import { Field, SelectInput, Switch } from '../presentation/fields'
import type { PublicationBuild } from './build'
import { ListPicker } from './dialogs'
import { LANGUAGES } from './DocumentSettingsDialog'
import { openSources } from './editing'
import { LayoutEditor } from './LayoutEditor'
import { loadPublicationBuild, publicationExportSource } from './publicationSource'
import { openExportDialog } from '../presentation/openExportDialog'

const CHAPTER_DRAG = 'application/x-markdown-studio-chapter'

function CommitInput({
  id,
  value,
  placeholder,
  testId,
  onCommit
}: {
  id: string
  value: string
  placeholder?: string
  testId?: string
  onCommit(value: string): void
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => text !== value && onCommit(text)
  return (
    <input
      id={id}
      className="text-input"
      data-testid={testId}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** Opens the preview on the publication and makes sure a preview pane is visible. */
export function previewPublication(): void {
  usePublicationView.getState().setPreviewing(true)
  commands.setPreview('html')
}

export async function exportPublication(): Promise<void> {
  const loaded = await loadPublicationBuild()
  if (!loaded)
    return notify(
      'info',
      'This folder has no publication yet. Create one in the Publication panel.'
    )
  if (loaded.config.chapters.length === 0) return notify('info', 'Add at least one chapter first.')
  const fake = {
    id: 'publication',
    path: null,
    untitledName: loaded.build.title,
    hasBom: false,
    dirty: false,
    savedVersion: 0
  }
  await openExportDialog(undefined, undefined, {
    doc: fake,
    source: publicationExportSource(loaded)
  })
}

async function addChapters(config: PublicationConfig, root: string): Promise<void> {
  try {
    const listing = await api.fs.listFiles({ extensions: ['md', 'markdown'], limit: 3000 })
    const have = new Set(config.chapters)
    const candidates = listing.files
      .map((file) => ({
        file,
        relative: file.replace(/\\/g, '/').slice(root.replace(/\\/g, '/').length).replace(/^\//, '')
      }))
      .filter((c) => !have.has(c.relative))
      .sort((a, b) => a.relative.localeCompare(b.relative, undefined, { numeric: true }))
    const chosen = await dialogs.custom<string[]>((done) => (
      <ListPicker
        title="Add Chapters"
        multiple
        items={candidates.map((c) => ({
          key: c.relative,
          primary: basename(c.relative),
          secondary: c.relative
        }))}
        confirmLabel="Add to Publication"
        emptyMessage="Every Markdown file of this folder is already a chapter."
        onDone={done}
      />
    ))
    if (chosen && chosen.length > 0) {
      // Keep the order in which the user ticked them: that is the order they thought of.
      await useProject
        .getState()
        .savePublication(
          sanitizePublication({ ...config, chapters: [...config.chapters, ...chosen] })
        )
    }
  } catch (error) {
    notify('error', `Could not list the folder: ${errorMessage(error)}`)
  }
}

export function PublicationPanel() {
  const uid = useId()
  const root = useWorkspace((s) => s.root)
  const available = useProject((s) => s.available)
  const config = useProject((s) => s.publication)
  const sources = useProject((s) => s.sources)
  const revision = useDocuments((s) => s.revision)
  const previewing = usePublicationView((s) => s.previewing)
  const [build, setBuild] = useState<PublicationBuild | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  useEffect(() => {
    if (!config) {
      setBuild(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void loadPublicationBuild().then((loaded) => !cancelled && setBuild(loaded?.build ?? null))
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [config, sources, revision])

  if (!root) {
    return (
      <section className="sidebar-view publication" aria-label="Publication">
        <header className="sidebar-header">
          <span className="sidebar-title">Publication</span>
        </header>
        <div className="no-folder">
          <p>Open a project folder to combine its documents into one publication.</p>
          <button
            type="button"
            className="button primary"
            onClick={() => void commands.openFolder()}
          >
            Open Folder
          </button>
        </div>
      </section>
    )
  }

  const save = (patch: Partial<PublicationConfig>) =>
    config &&
    void useProject.getState().savePublication(sanitizePublication({ ...config, ...patch }))

  const header = (
    <header className="sidebar-header">
      <span className="sidebar-title">Publication</span>
    </header>
  )

  if (!config) {
    return (
      <section className="sidebar-view publication" aria-label="Publication">
        {header}
        <div className="publication-empty" data-testid="publication-empty">
          <BookOpen size={28} strokeWidth={1.3} aria-hidden="true" />
          <p>
            A publication combines several Markdown documents — chapters — into one document with a
            shared table of contents, numbering, references and bibliography. The chapters stay
            ordinary files you can keep editing.
          </p>
          <button
            type="button"
            className="button primary"
            data-testid="publication-create"
            disabled={!available}
            onClick={() =>
              void useProject
                .getState()
                .savePublication({ ...DEFAULT_PUBLICATION, title: basename(root) })
            }
          >
            Create Publication
          </button>
        </div>
      </section>
    )
  }

  const problems: PublishingProblem[] = build?.problems ?? []
  const summaries = build?.chapters ?? []

  return (
    <section
      className="sidebar-view publication"
      aria-label="Publication"
      data-testid="publication-panel"
    >
      {header}
      <div className="publication-body">
        <div className="button-row">
          <button
            type="button"
            className={`button compact${previewing ? ' active' : ''}`}
            data-testid="publication-preview"
            aria-pressed={previewing}
            onClick={() =>
              previewing ? usePublicationView.getState().setPreviewing(false) : previewPublication()
            }
          >
            <Eye size={14} /> {previewing ? 'Back to document' : 'Preview publication'}
          </button>
          <button
            type="button"
            className="button compact primary"
            data-testid="publication-export"
            onClick={() => void exportPublication()}
          >
            <FileDown size={14} /> Export…
          </button>
        </div>

        <h3 className="panel-subtitle">Chapters</h3>
        {config.chapters.length === 0 ? (
          <p className="setting-hint" data-testid="publication-no-chapters">
            No chapters yet. Add the documents that belong to this publication.
          </p>
        ) : (
          <ol className="chapter-list" data-testid="chapter-list">
            {config.chapters.map((chapter, index) => {
              const summary = summaries[index]
              return (
                <li
                  key={chapter}
                  className={`chapter-row${dragFrom === index ? ' dragging' : ''}`}
                  draggable
                  data-testid={`chapter-${index + 1}`}
                  onDragStart={(e) => {
                    setDragFrom(index)
                    e.dataTransfer.setData(CHAPTER_DRAG, String(index))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(CHAPTER_DRAG)) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                    }
                  }}
                  onDrop={(e) => {
                    const from = Number(e.dataTransfer.getData(CHAPTER_DRAG))
                    e.preventDefault()
                    setDragFrom(null)
                    if (Number.isInteger(from))
                      save({ chapters: moveChapter(config.chapters, from, index) })
                  }}
                  onDragEnd={() => setDragFrom(null)}
                >
                  <GripVertical size={14} className="chapter-grip" aria-hidden="true" />
                  <span className="chapter-number">{index + 1}</span>
                  <button
                    type="button"
                    className="chapter-open"
                    title={`Open ${chapter}`}
                    onClick={() => void openDocument(joinPath(root, ...chapter.split('/')))}
                  >
                    <span className="chapter-title">{summary?.title ?? basename(chapter)}</span>
                    <span className="chapter-path">{chapter}</span>
                    {summary?.missing && <span className="picker-warning">File not found</span>}
                  </button>
                  <span className="chapter-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${chapter} up`}
                      title="Move up"
                      disabled={index === 0}
                      data-testid={`chapter-up-${index + 1}`}
                      onClick={() =>
                        save({ chapters: moveChapter(config.chapters, index, index - 1) })
                      }
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${chapter} down`}
                      title="Move down"
                      disabled={index === config.chapters.length - 1}
                      data-testid={`chapter-down-${index + 1}`}
                      onClick={() =>
                        save({ chapters: moveChapter(config.chapters, index, index + 1) })
                      }
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${chapter} from the publication`}
                      title="Remove from publication (the file stays)"
                      onClick={() =>
                        save({ chapters: config.chapters.filter((c) => c !== chapter) })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
        <button
          type="button"
          className="button compact"
          data-testid="chapter-add"
          onClick={() => void addChapters(config, root)}
        >
          <FilePlus size={14} /> Add chapters…
        </button>

        {problems.length > 0 && (
          <div className="publication-problems" data-testid="publication-problems" role="status">
            <h3 className="panel-subtitle">
              {problems.length} problem{problems.length === 1 ? '' : 's'}
            </h3>
            <ul>
              {problems.slice(0, 25).map((p, i) => (
                <li key={i}>
                  {p.file && <code>{p.file}</code>} {p.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <h3 className="panel-subtitle">Title page</h3>
        <Field label="Title" htmlFor={`${uid}-title`}>
          <CommitInput
            id={`${uid}-title`}
            testId="publication-title"
            value={config.title}
            onCommit={(title) => save({ title })}
          />
        </Field>
        <Field label="Subtitle" htmlFor={`${uid}-subtitle`}>
          <CommitInput
            id={`${uid}-subtitle`}
            value={config.subtitle}
            onCommit={(subtitle) => save({ subtitle })}
          />
        </Field>
        <Field label="Author" htmlFor={`${uid}-author`}>
          <CommitInput
            id={`${uid}-author`}
            testId="publication-author"
            value={config.author}
            onCommit={(author) => save({ author })}
          />
        </Field>
        <Field label="Date" htmlFor={`${uid}-date`}>
          <CommitInput id={`${uid}-date`} value={config.date} onCommit={(date) => save({ date })} />
        </Field>
        <Field label="Language" htmlFor={`${uid}-lang`}>
          <SelectInput
            id={`${uid}-lang`}
            testId="publication-lang"
            value={config.lang}
            options={LANGUAGES}
            onChange={(lang) => save({ lang })}
          />
        </Field>

        <h3 className="panel-subtitle">Structure</h3>
        <Field label="Print title block" htmlFor={`${uid}-titleblock`}>
          <Switch
            id={`${uid}-titleblock`}
            checked={config.titleBlock}
            onChange={(titleBlock) => save({ titleBlock })}
          />
        </Field>
        <Field label="Table of contents" htmlFor={`${uid}-toc`}>
          <Switch
            id={`${uid}-toc`}
            checked={config.toc.enabled}
            onChange={(enabled) => save({ toc: { ...config.toc, enabled } })}
          />
        </Field>
        <Field label="Number chapters and sections" htmlFor={`${uid}-numbers`}>
          <Switch
            id={`${uid}-numbers`}
            checked={config.numberSections}
            onChange={(numberSections) => save({ numberSections })}
          />
        </Field>
        <Field
          label="Number figures per chapter"
          htmlFor={`${uid}-chnum`}
          hint="Figure 2.1 instead of Figure 7."
        >
          <Switch
            id={`${uid}-chnum`}
            checked={config.chapterNumbers}
            onChange={(chapterNumbers) => save({ chapterNumbers })}
          />
        </Field>
        <Field label="Start chapters on a new page" htmlFor={`${uid}-breaks`}>
          <Switch
            id={`${uid}-breaks`}
            checked={config.chapterPageBreaks}
            onChange={(chapterPageBreaks) => save({ chapterPageBreaks })}
          />
        </Field>

        <details className="publication-layout">
          <summary>Page, columns and theme</summary>
          <LayoutEditor value={config.layout} onChange={(layout) => save({ layout })} />
        </details>

        <div className="button-row">
          <button
            type="button"
            className="button compact"
            data-testid="publication-sources"
            onClick={() => void openSources()}
          >
            Manage sources…
          </button>
          <button
            type="button"
            className="button compact danger"
            onClick={async () => {
              const ok = await dialogs.confirm({
                title: 'Remove the publication?',
                message:
                  'The chapter files are not touched. Only the chapter list and options are removed.',
                confirmLabel: 'Remove Publication',
                danger: true
              })
              if (ok) {
                usePublicationView.getState().setPreviewing(false)
                await useProject.getState().savePublication(null)
              }
            }}
          >
            Remove publication
          </button>
        </div>
      </div>
    </section>
  )
}
