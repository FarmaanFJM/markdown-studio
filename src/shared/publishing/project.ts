/**
 * A publication: several Markdown documents combined, in a chosen order, into one document.
 * The chapters stay ordinary Markdown files; this configuration only names them and records the
 * options of the combined output. It is stored in the workspace as
 * `.markdown-studio/publication.json`, outside every document.
 */
import {
  readDocumentSettings,
  settingsToPatch,
  type DocumentSettingsData
} from './documentSettings'

export const PUBLICATION_LIMITS = { chapters: 200, pathLength: 500, text: 300 } as const

/** Page, column and theme choices of the whole publication (same shape as a document's). */
export type PublicationLayout = Pick<
  DocumentSettingsData,
  'theme' | 'columns' | 'page' | 'header' | 'footer'
>

export interface PublicationConfig {
  version: 1
  title: string
  subtitle: string
  author: string
  date: string
  /** Language tag (en, nl, de, fr, es); drives caption words and citation terms. */
  lang: string
  /** Workspace-relative paths with forward slashes, in publication order. */
  chapters: string[]
  /** Number headings (chapter 1, section 1.1 …). */
  numberSections: boolean
  /** Number figures and tables per chapter ("Figure 2.1") instead of continuously. */
  chapterNumbers: boolean
  /** Start every chapter on a new page. */
  chapterPageBreaks: boolean
  /** Print the title, subtitle, author and date above the contents. */
  titleBlock: boolean
  toc: { enabled: boolean; depth: number }
  /** Page size, margins, header and footer, columns and theme for the whole publication. */
  layout: PublicationLayout
}

export const DEFAULT_PUBLICATION: PublicationConfig = {
  version: 1,
  title: '',
  subtitle: '',
  author: '',
  date: '',
  lang: 'en',
  chapters: [],
  numberSections: true,
  chapterNumbers: true,
  chapterPageBreaks: true,
  titleBlock: true,
  toc: { enabled: true, depth: 3 },
  layout: {}
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string'
    ? value
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, PUBLICATION_LIMITS.text)
    : fallback
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** A chapter path is workspace-relative: no drive, no `..`, forward slashes, a Markdown file. */
export function normalizeChapterPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (cleaned === '' || cleaned.length > PUBLICATION_LIMITS.pathLength) return null
  if (/^[a-zA-Z]:/.test(cleaned) || cleaned.startsWith('/') || cleaned.startsWith('//')) return null
  const parts = cleaned.split('/')
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null
  // eslint-disable-next-line no-control-regex -- control characters are never valid in names
  if (parts.some((p) => /[\u0000-\u001f<>:"|?*]/.test(p))) return null
  if (!/\.(?:md|markdown|mdown)$/i.test(cleaned)) return null
  return cleaned
}

/**
 * Validates a layout by round-tripping it through the front-matter reader, so a publication and
 * a document accept exactly the same values. Unusable values are dropped.
 */
export function sanitizeLayout(input: unknown): PublicationLayout {
  if (!isObject(input)) return {}
  try {
    const studio = settingsToPatch(input as DocumentSettingsData).studio
    if (!studio) return {}
    const { theme, columns, page, header, footer } = readDocumentSettings({ studio }).settings
    const layout: PublicationLayout = {}
    if (theme) layout.theme = theme
    if (columns && columns.count === 2) layout.columns = columns
    if (page) layout.page = page
    if (header) layout.header = header
    if (footer) layout.footer = footer
    return layout
  } catch {
    return {}
  }
}

export function sanitizePublication(input: unknown): PublicationConfig {
  const d = DEFAULT_PUBLICATION
  const v = isObject(input) ? input : {}
  const toc = isObject(v.toc) ? v.toc : {}
  const depth = typeof toc.depth === 'number' ? Math.round(toc.depth) : d.toc.depth
  const seen = new Set<string>()
  const chapters: string[] = []
  for (const entry of Array.isArray(v.chapters) ? v.chapters : []) {
    const normalized = normalizeChapterPath(entry)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    chapters.push(normalized)
    if (chapters.length >= PUBLICATION_LIMITS.chapters) break
  }
  const lang = text(v.lang, d.lang)
  return {
    version: 1,
    title: text(v.title, d.title),
    subtitle: text(v.subtitle, d.subtitle),
    author: text(v.author, d.author),
    date: text(v.date, d.date),
    lang: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang) ? lang : d.lang,
    chapters,
    numberSections: flag(v.numberSections, d.numberSections),
    chapterNumbers: flag(v.chapterNumbers, d.chapterNumbers),
    chapterPageBreaks: flag(v.chapterPageBreaks, d.chapterPageBreaks),
    titleBlock: flag(v.titleBlock, d.titleBlock),
    toc: {
      enabled: flag(toc.enabled, d.toc.enabled),
      depth: depth >= 1 && depth <= 6 ? depth : d.toc.depth
    },
    layout: sanitizeLayout(v.layout)
  }
}

export function publicationsEqual(a: PublicationConfig, b: PublicationConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Moves a chapter within the order. Out-of-range moves leave the list unchanged. */
export function moveChapter(chapters: readonly string[], from: number, to: number): string[] {
  if (from < 0 || from >= chapters.length || to < 0 || to >= chapters.length || from === to) {
    return [...chapters]
  }
  const next = [...chapters]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Follows a renamed or moved file or folder in the chapter list. */
export function renameInChapters(
  chapters: readonly string[],
  oldRelative: string,
  newRelative: string
): string[] {
  const oldPath = oldRelative.replace(/\\/g, '/')
  const newPath = newRelative.replace(/\\/g, '/')
  return chapters.map((chapter) => {
    if (chapter === oldPath) return newPath
    if (chapter.startsWith(`${oldPath}/`)) return `${newPath}${chapter.slice(oldPath.length)}`
    return chapter
  })
}

/** Heading anchor prefix for chapter `index` (0-based). Never collides with label ids. */
export function chapterPrefix(index: number): string {
  return `c${index + 1}-`
}
