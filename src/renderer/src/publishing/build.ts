import { createApplicationMarkdownIt } from '@shared/markdown/plugins'
import { escapeHtml } from '@shared/markdown/blocks'
import { bibliographyMarkup, tocMarkup } from '@shared/publishing/plugin'
import { createCitationProvider } from '@shared/publishing/citations'
import { splitFrontMatter } from '@shared/publishing/frontMatter'
import { chapterPrefix, type PublicationConfig } from '@shared/publishing/project'
import { sanitizeSources, type Source } from '@shared/publishing/sources'
import {
  captionNames,
  startOfDocument,
  type CitationCluster,
  type HeadingEntry,
  type Label,
  type NumberingStart,
  type PublishingEnv,
  type PublishingOptions,
  type PublishingProblem
} from '@shared/publishing/types'
import { renderDocumentBodyDetailed, type RenderPresentation } from '../markdown/document'
import type { DocumentContext } from '../markdown/resolve'

/** One chapter as read from disk (or from an open editor tab). */
export interface ChapterInput {
  /** Workspace-relative path, as stored in the publication. */
  path: string
  /** Absolute directory of the chapter file: its images resolve from here. */
  directory: string
  text: string | null
  /** Why the text is missing (file not found, unreadable). */
  error?: string
}

export interface ChapterSummary {
  path: string
  title: string
  number: number
  missing: boolean
}

export interface PublicationBuild {
  /** Renders the whole publication as sanitised body HTML. */
  body(presentation: Pick<RenderPresentation, 'math' | 'diagrams'>): string
  title: string
  chapters: ChapterSummary[]
  problems: PublishingProblem[]
  labels: Label[]
  headings: HeadingEntry[]
}

const parser = createApplicationMarkdownIt()

function headingOf(text: string): string | null {
  const m = /^\s{0,3}#\s+(.+?)\s*#*\s*(?:\{[^{}\n]*\})?\s*$/m.exec(text)
  return m ? m[1].replace(/[*_`]/g, '') : null
}

function titleOfFile(path: string): string {
  return path
    .split('/')
    .pop()!
    .replace(/\.[^.]+$/, '')
}

/**
 * Combines the chapters into one document. Two passes keep every number and reference
 * consistent: the first walks all chapters in order to assign numbers, collect labels and
 * citations; the second renders each chapter with that shared knowledge, resolving its images
 * from the chapter's own folder, and joins the results.
 */
export function buildPublication(
  config: PublicationConfig,
  chapters: readonly ChapterInput[],
  librarySources: readonly Source[],
  workspaceRoot: string | null
): PublicationBuild {
  const names = captionNames(config.lang)
  const problems: PublishingProblem[] = []
  const labels = new Map<string, Label>()
  const labelList: Label[] = []
  const headings: HeadingEntry[] = []
  const starts: NumberingStart[] = []
  const clustersByChapter: CitationCluster[][] = []
  const summaries: ChapterSummary[] = []

  // Chapters can carry their own `references:`; they join the project library.
  const sources = new Map<string, Source>(librarySources.map((s) => [s.id, s]))
  for (const chapter of chapters) {
    if (chapter.text === null) continue
    const own = sanitizeSources(splitFrontMatter(chapter.text).data.references ?? [])
    for (const source of own.sources) sources.set(source.id, source)
  }
  const allSources = [...sources.values()]

  let running: NumberingStart = startOfDocument()
  chapters.forEach((chapter, index) => {
    const start: NumberingStart = {
      chapter: index + 1,
      headings: [index + 1, 0, 0, 0, 0, 0],
      figures: config.chapterNumbers ? 0 : running.figures,
      tables: config.chapterNumbers ? 0 : running.tables,
      chapterTitlePending: true
    }
    starts.push(start)
    if (chapter.text === null) {
      clustersByChapter.push([])
      summaries.push({
        path: chapter.path,
        title: titleOfFile(chapter.path),
        number: index + 1,
        missing: true
      })
      problems.push({
        kind: 'missing-target',
        file: chapter.path,
        line: 0,
        message: `The chapter ${chapter.path} could not be read${chapter.error ? `: ${chapter.error}` : ''}.`
      })
      running = { ...start, chapterTitlePending: false }
      return
    }
    const env: PublishingEnv = {
      ms: {
        lang: config.lang,
        numberSections: config.numberSections,
        chapterNumbers: config.chapterNumbers,
        baseLevel: 1,
        start,
        labels,
        idPrefix: chapterPrefix(index)
      }
    }
    parser.parse(chapter.text, env as never)
    const result = env.ms!.result!
    for (const label of result.labels) {
      const stored: Label = { ...label, file: chapter.path }
      labels.set(stored.id, stored)
      labelList.push(stored)
    }
    for (const problem of result.problems) problems.push({ ...problem, file: chapter.path })
    headings.push(...result.headings.filter((h) => h.id))
    clustersByChapter.push(result.clusters)
    running = result.end
    summaries.push({
      path: chapter.path,
      title: headingOf(chapter.text) ?? titleOfFile(chapter.path),
      number: index + 1,
      missing: false
    })
  })

  // One provider call over every chapter's citations gives consistent disambiguation.
  const allClusters = clustersByChapter.flat()
  const citation =
    allClusters.length > 0 ? createCitationProvider(allSources, config.lang)(allClusters) : null
  if (citation) {
    for (const key of citation.missing) {
      const index = clustersByChapter.findIndex((cl) =>
        cl.some((c) => c.items.some((i) => i.id === key))
      )
      problems.push({
        kind: 'missing-source',
        id: key,
        file: chapters[index]?.path,
        line: 0,
        message: `No source with the key "${key}". Add it under Sources.`
      })
    }
  }
  let offset = 0
  const offsets = clustersByChapter.map((clusters) => {
    const at = offset
    offset += clusters.length
    return at
  })

  const title = config.title.trim() || 'Untitled publication'

  const body = (presentation: Pick<RenderPresentation, 'math' | 'diagrams'>): string => {
    const parts: string[] = []
    if (config.titleBlock) {
      const meta = [config.author, config.date].filter(Boolean).map(escapeHtml).join(' · ')
      parts.push(
        `<header class="ms-publication-header"><h1 class="ms-publication-title">${escapeHtml(title)}</h1>` +
          (config.subtitle
            ? `<p class="ms-publication-subtitle">${escapeHtml(config.subtitle)}</p>`
            : '') +
          (meta ? `<p class="ms-publication-meta">${meta}</p>` : '') +
          `</header>\n`
      )
    }
    if (config.toc.enabled) {
      parts.push(
        tocMarkup(headings, config.toc.depth, names.contents, config.numberSections, false)
      )
    }
    let bibliographyPlaced = false
    chapters.forEach((chapter, index) => {
      const open = `<section class="ms-chapter" id="chapter-${index + 1}" data-newpage="${config.chapterPageBreaks}">\n`
      if (chapter.text === null) {
        parts.push(
          `${open}<p class="ms-chapter-missing">The chapter <code>${escapeHtml(chapter.path)}</code> could not be read.</p>\n</section>\n`
        )
        return
      }
      const context: DocumentContext = { documentDirectory: chapter.directory, workspaceRoot }
      const options: PublishingOptions = {
        lang: config.lang,
        numberSections: config.numberSections,
        chapterNumbers: config.chapterNumbers,
        baseLevel: 1,
        start: starts[index],
        labels,
        idPrefix: chapterPrefix(index),
        bibliographyAtEnd: false,
        cite: citation
          ? (clusters) => ({
              html: citation.html.slice(offsets[index], offsets[index] + clusters.length),
              bibliography: citation.bibliography,
              missing: citation.missing
            })
          : undefined
      }
      const rendered = renderDocumentBodyDetailed(chapter.text, context, presentation, options)
      if (rendered.html.includes('class="ms-bibliography"')) bibliographyPlaced = true
      parts.push(`${open}${rendered.html}</section>\n`)
    })
    if (citation && citation.bibliography.length > 0 && !bibliographyPlaced) {
      parts.push(bibliographyMarkup(citation.bibliography, names.references))
    }
    return parts.join('')
  }

  return { body, title, chapters: summaries, problems, labels: labelList, headings }
}
