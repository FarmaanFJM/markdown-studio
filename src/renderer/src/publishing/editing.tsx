import { formatLinkDestination } from '@shared/imageReference'
import { escapeSnippetText } from '@shared/markdown/snippets'
import { analyzePublishing, suggestLabelId } from '@shared/publishing/analyze'
import {
  writeDocumentSettings,
  type DocumentSettingsData
} from '@shared/publishing/documentSettings'
import { splitFrontMatter, updateFrontMatter } from '@shared/publishing/frontMatter'
import {
  describeSource,
  missingFields,
  sanitizeSources,
  type Source
} from '@shared/publishing/sources'
import { captionNames, type Label } from '@shared/publishing/types'
import { api, errorMessage } from '../bridge'
import { requireEditor } from '../editor/markdown/commands'
import { insertSnippetText } from '../editor/markdown/insert'
import { tableAtCursor } from '../editor/markdown/tableCommands'
import { importImageForDocument } from '../editor/imageDrop'
import { monaco } from '../editor/monaco'
import { activeDocument } from '../state/documents'
import { useProject } from '../state/project'
import { dialogs, notify } from '../state/ui'
import type { ChapterSummary } from './build'
import { documentPublishing } from './documentPublishing'
import { loadPublicationBuild } from './publicationSource'
import { CaptionDialog, ListPicker, type CaptionResult, type PickerItem } from './dialogs'
import { DocumentSettingsDialog } from './DocumentSettingsDialog'
import {
  SourcesDialog,
  type ScopedSource,
  type SourceScope,
  type SourcesHost
} from './SourcesDialog'

const SOURCE = 'markdown-studio'
type Editor = monaco.editor.IStandaloneCodeEditor

/** Replaces the front matter of the document (and only that) as one undoable edit. */
function replaceFrontMatter(
  editor: Editor,
  build: (text: string) => string
): 'changed' | 'same' | 'error' {
  const model = editor.getModel()
  if (!model) return 'error'
  const eol = model.getEOL()
  const text = model.getValue()
  const before = splitFrontMatter(text)
  let next: string
  try {
    next = build(text.replace(/\r\n/g, '\n')).replace(/\n/g, eol)
  } catch (error) {
    notify('error', errorMessage(error))
    return 'error'
  }
  if (next === text) return 'same'
  const after = splitFrontMatter(next)
  const oldEnd = before.present ? before.bodyOffset : 0
  const newEnd = after.present ? after.bodyOffset : 0
  // The body is untouched; only the leading block changes.
  const range = new monaco.Range(1, 1, ...endOf(model, oldEnd))
  editor.pushUndoStop()
  editor.executeEdits(SOURCE, [{ range, text: next.slice(0, newEnd) }])
  editor.pushUndoStop()
  return 'changed'
}

function endOf(model: monaco.editor.ITextModel, offset: number): [number, number] {
  const position = model.getPositionAt(offset)
  return [position.lineNumber, position.column]
}

export async function openDocumentSettingsDialog(): Promise<void> {
  const editor = requireEditor()
  if (!editor) return
  const model = editor.getModel()!
  const result = await dialogs.custom<DocumentSettingsData>((done) => (
    <DocumentSettingsDialog text={model.getValue().replace(/\r\n/g, '\n')} onDone={done} />
  ))
  if (result) {
    const outcome = replaceFrontMatter(editor, (text) => writeDocumentSettings(text, result))
    if (outcome === 'changed') notify('success', 'Document settings saved in the front matter.')
    else if (outcome === 'same') notify('info', 'Nothing changed.')
  }
  editor.focus()
}

function takenIds(editor: Editor): Set<string> {
  const text = editor.getModel()!.getValue()
  const result = analyzePublishing(text)
  const taken = new Set<string>(result.labels.map((l) => l.id))
  for (const h of result.headings) if (h.id) taken.add(h.id)
  return taken
}

const IMAGE_AT = /!\[([^\]]*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)(\{[^}\n]*\})?/g

/** Finds an image reference that contains the cursor on its line. */
function imageAtCursor(editor: Editor) {
  const model = editor.getModel()!
  const position = editor.getPosition()!
  const line = model.getLineContent(position.lineNumber)
  for (const match of line.matchAll(IMAGE_AT)) {
    const start = match.index ?? 0
    if (position.column - 1 >= start && position.column - 1 <= start + match[0].length) {
      return { match, start, line, lineNumber: position.lineNumber }
    }
  }
  return null
}

/**
 * Adds a numbered caption to the image under the cursor, or — when the cursor is not on an
 * image — lets the user pick an image file and inserts it as a captioned figure.
 */
export async function insertFigure(): Promise<void> {
  const editor = requireEditor()
  const doc = activeDocument()
  if (!editor || !doc) return
  const model = editor.getModel()!
  const taken = takenIds(editor)
  const found = imageAtCursor(editor)

  if (found) {
    if (found.match[3]) {
      notify('info', 'This image already has an identifier, so it is a numbered figure.')
      return
    }
    const alone = found.line.trim() === found.match[0]
    if (!alone) {
      notify('info', 'Put the image on a line of its own to turn it into a numbered figure.')
      return
    }
    const result = await dialogs.custom<CaptionResult>((done) => (
      <CaptionDialog
        title="Caption Figure"
        kind="fig"
        initialCaption={found.match[1]}
        suggestId={(caption) => suggestLabelId('fig', caption, taken)}
        takenIds={taken}
        confirmLabel="Add Caption"
        onDone={done}
      />
    ))
    if (result) {
      const start = found.start
      const range = new monaco.Range(
        found.lineNumber,
        start + 1,
        found.lineNumber,
        start + found.match[0].length + 1
      )
      editor.pushUndoStop()
      editor.executeEdits(SOURCE, [
        {
          range,
          text: `![${escapeAlt(result.caption)}](${found.match[2]}){#${result.id}${result.fullWidth ? ' .full-width' : ''}}`
        }
      ])
      editor.pushUndoStop()
    }
    editor.focus()
    return
  }

  const path = await api.dialogs.openImage()
  if (!path) return
  const imported = await importImageForDocument(doc, { path, external: true })
  if (!imported) return
  const fileName = path.split(/[\\/]/).pop() ?? 'image'
  const result = await dialogs.custom<CaptionResult>((done) => (
    <CaptionDialog
      title="Insert Figure"
      kind="fig"
      initialCaption=""
      suggestId={(caption) =>
        suggestLabelId('fig', caption || fileName.replace(/\.[^.]+$/, ''), taken)
      }
      takenIds={taken}
      confirmLabel="Insert Figure"
      onDone={done}
    />
  ))
  if (!result) {
    editor.focus()
    return
  }
  const destination = formatLinkDestination(imported.relative)
  const text = `![${escapeAlt(result.caption)}](${destination}){#${result.id}${result.fullWidth ? ' .full-width' : ''}}`
  insertSnippetText(editor, escapeSnippetText(text), { block: true })
  void model
}

function escapeAlt(text: string): string {
  return text.replace(/([[\]\\])/g, '\\$1')
}

/** Adds (or replaces) the numbered caption line under the table at the cursor. */
export async function captionTable(): Promise<void> {
  const editor = requireEditor()
  if (!editor) return
  const found = tableAtCursor(editor)
  if (found === null) return notify('info', 'Place the cursor inside a Markdown table first.')
  if ('error' in found) return notify('error', found.error)
  const model = editor.getModel()!
  const end = found.parsed.end // 1-based number of the table's last line
  const taken = takenIds(editor)

  // An existing caption: a blank line, then ": text {#tbl-id}".
  let existing: { line: number; caption: string; id: string | null } | null = null
  if (end + 2 <= model.getLineCount()) {
    const gap = model.getLineContent(end + 1)
    const candidate = /^:\s+(.*?)(?:\s*\{#([^\s}]+)[^}]*\})?\s*$/.exec(
      model.getLineContent(end + 2)
    )
    if (gap.trim() === '' && candidate) {
      existing = { line: end + 2, caption: candidate[1], id: candidate[2] ?? null }
      if (existing.id) taken.delete(existing.id)
    }
  }
  const result = await dialogs.custom<CaptionResult>((done) => (
    <CaptionDialog
      title={existing ? 'Edit Table Caption' : 'Caption Table'}
      kind="tbl"
      initialCaption={existing?.caption ?? ''}
      suggestId={(caption) => existing?.id ?? suggestLabelId('tbl', caption, taken)}
      takenIds={taken}
      confirmLabel={existing ? 'Update Caption' : 'Add Caption'}
      onDone={done}
    />
  ))
  if (!result) return editor.focus()
  const line = `: ${result.caption} {#${result.id}${result.fullWidth ? ' .full-width' : ''}}`
  const eol = model.getEOL()
  editor.pushUndoStop()
  if (existing) {
    editor.executeEdits(SOURCE, [
      {
        range: new monaco.Range(
          existing.line,
          1,
          existing.line,
          model.getLineMaxColumn(existing.line)
        ),
        text: line
      }
    ])
  } else {
    editor.executeEdits(SOURCE, [
      {
        range: new monaco.Range(end, model.getLineMaxColumn(end), end, model.getLineMaxColumn(end)),
        text: `${eol}${eol}${line}`
      }
    ])
  }
  editor.pushUndoStop()
  editor.focus()
}

function labelItems(labels: Label[], lang: string | undefined, withFile: boolean): PickerItem[] {
  const names = captionNames(lang)
  return labels.map((l) => {
    const word = l.kind === 'fig' ? names.figure : l.kind === 'tbl' ? names.table : names.section
    return {
      key: l.id,
      primary: l.number ? `${word} ${l.number}` : word,
      secondary: `${l.text}${withFile && l.file ? ` — ${l.file}` : ''}`,
      badge: `@${l.id}`
    }
  })
}

/** Labels the current document can refer to (its own, plus other chapters of its publication). */
async function availableLabels(editor: Editor): Promise<{ labels: Label[]; lang?: string }> {
  const text = editor.getModel()!.getValue()
  const publishing = documentPublishing(text)
  const own = analyzePublishing(text, { ...publishing.options, cite: undefined }).labels
  const { publication } = useProject.getState()
  const doc = activeDocument()
  if (publication && doc?.path) {
    const loaded = await loadPublicationBuild()
    if (
      loaded &&
      loaded.build.chapters.some((c: ChapterSummary) =>
        doc.path!.replace(/\\/g, '/').endsWith(c.path)
      )
    ) {
      return { labels: loaded.build.labels, lang: publication.lang }
    }
  }
  return { labels: own, lang: publishing.settings.lang }
}

export async function insertCrossReference(): Promise<void> {
  const editor = requireEditor()
  if (!editor) return
  const { labels, lang } = await availableLabels(editor)
  const keys = await dialogs.custom<string[]>((done) => (
    <ListPicker
      title="Insert Cross-reference"
      items={labelItems(
        labels,
        lang,
        labels.some((l) => l.file)
      )}
      confirmLabel="Insert"
      emptyMessage="This document has no numbered figures, tables or labelled sections yet. Caption a figure or table first (Insert → Figure…), or add {#sec-name} to a heading."
      onDone={done}
    />
  ))
  if (keys?.[0]) insertSnippetText(editor, escapeSnippetText(`@${keys[0]}`))
  else editor.focus()
}

function currentSourcesHost(editor: Editor): SourcesHost {
  return {
    projectAvailable: useProject.getState().available,
    documentAvailable: true,
    load: () => {
      const text = editor.getModel()!.getValue()
      const own = sanitizeSources(splitFrontMatter(text).data.references ?? []).sources
      return [
        ...useProject
          .getState()
          .sources.map((source): ScopedSource => ({ source, scope: 'project' })),
        ...own.map((source): ScopedSource => ({ source, scope: 'document' }))
      ]
    },
    save: async (scope: SourceScope, sources: Source[]) => {
      if (scope === 'project') return useProject.getState().saveSources(sources)
      return (
        replaceFrontMatter(editor, (text) =>
          updateFrontMatter(text, { references: sources.length > 0 ? sources : undefined })
        ) !== 'error'
      )
    }
  }
}

export async function openSources(initialKey?: string): Promise<void> {
  const editor = requireEditor()
  if (!editor) return
  await useProject.getState().load()
  await dialogs.custom<null>((done) => (
    <SourcesDialog
      host={currentSourcesHost(editor)}
      initialKey={initialKey}
      onDone={() => done(null)}
    />
  ))
  editor.focus()
}

export async function insertCitation(): Promise<void> {
  const editor = requireEditor()
  if (!editor) return
  const open = async () => {
    const publishing = documentPublishing(editor.getModel()!.getValue())
    const project = new Set(useProject.getState().sources.map((s) => s.id))
    const items: PickerItem[] = publishing.sources.map((s) => {
      const gaps = missingFields(s)
      return {
        key: s.id,
        primary: s.id,
        secondary: describeSource(s),
        badge: project.has(s.id) ? 'Project' : 'Document',
        warning: gaps.length > 0 ? `Missing: ${gaps.map((g) => g.field).join(', ')}` : undefined
      }
    })
    const options = { locator: '', mode: 'cluster' as 'cluster' | 'narrative' | 'year' }
    let manage = false
    const keys = await dialogs.custom<string[]>((done) => (
      <ListPicker
        title="Insert Citation"
        multiple
        items={items}
        confirmLabel="Insert"
        emptyMessage="No sources yet. Choose “Manage sources…” to add one or import a BibTeX file."
        secondaryAction={{
          label: 'Manage sources…',
          run: () => {
            manage = true
            done(null)
          }
        }}
        extra={
          <div className="citation-options">
            <label>
              Page or location (optional, one source)
              <input
                className="text-input"
                data-testid="citation-locator"
                placeholder="p. 33"
                onChange={(e) => (options.locator = e.target.value.trim())}
              />
            </label>
            <label>
              Form
              <select
                className="select"
                data-testid="citation-mode"
                defaultValue="cluster"
                onChange={(e) => (options.mode = e.target.value as typeof options.mode)}
              >
                <option value="cluster">(Author, 2020)</option>
                <option value="narrative">Author (2020)</option>
                <option value="year">(2020) — year only</option>
              </select>
            </label>
          </div>
        }
        onDone={done}
      />
    ))
    if (manage) {
      await openSources()
      return open()
    }
    if (!keys || keys.length === 0) return editor.focus()
    let text: string
    const { locator, mode } = options
    if (mode === 'narrative') {
      text = keys.map((k) => `@${k}`).join(' and ')
    } else {
      const suffix = (index: number) =>
        locator && keys.length === 1 && index === 0 ? `, ${locator}` : ''
      text = `[${keys.map((k, i) => `${mode === 'year' ? '-' : ''}@${k}${suffix(i)}`).join('; ')}]`
    }
    insertSnippetText(editor, escapeSnippetText(text))
  }
  await open()
}

function insertBlock(text: string): void {
  const editor = requireEditor()
  if (editor) insertSnippetText(editor, escapeSnippetText(text), { block: true })
}

export const publishingBlocks = {
  contents: () => insertBlock('[TOC]'),
  bibliography: () => insertBlock('::: {#refs}\n:::'),
  listOfFigures: () => insertBlock('[LOF]'),
  listOfTables: () => insertBlock('[LOT]')
}
