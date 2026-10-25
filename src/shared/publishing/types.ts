/** Shared types of the publishing layer (labels, numbering, citations). */

export type LabelKind = 'fig' | 'tbl' | 'sec'

export const LABEL_PREFIX: Record<LabelKind, string> = { fig: 'fig-', tbl: 'tbl-', sec: 'sec-' }

/** Identifiers: letters, digits, `_` and `-`, starting with a letter. */
export const LABEL_ID = /^[A-Za-z][A-Za-z0-9_-]*$/

export interface Label {
  id: string
  kind: LabelKind
  /** "3", "2.1" — the number without the word ("Figure"). Empty for unnumbered sections. */
  number: string
  /** Caption text for figures and tables; heading text for sections. */
  text: string
  /** Index of the chapter in a publication (1-based), or 0 for a single document. */
  chapter: number
  /** 0-based line in the source of the file the label is defined in. */
  line: number
  /** Source file of a chapter in a publication; '' for a single document. */
  file: string
}

export interface HeadingEntry {
  level: number
  /** The id the heading has in the rendered document (after any prefix). */
  id: string
  text: string
  number: string
  line: number
}

export type ProblemKind =
  'duplicate-id' | 'missing-target' | 'invalid-id' | 'misplaced' | 'missing-source' | 'bibliography'

export interface PublishingProblem {
  kind: ProblemKind
  message: string
  /** 0-based line in the file being analysed. */
  line: number
  /** Optional 0-based columns of the offending text. */
  startColumn?: number
  endColumn?: number
  /** The identifier or citation key involved. */
  id?: string
  /** Chapter file for publication-wide problems. */
  file?: string
}

export interface CitationItem {
  id: string
  /** Text before the citation ("see"). */
  prefix: string
  /** Locator and suffix text after the key ("p. 33"). */
  suffix: string
  suppressAuthor: boolean
}

export interface CitationCluster {
  items: CitationItem[]
  /** `@key` in running text (author outside the parentheses) rather than `[@key]`. */
  narrative: boolean
  line: number
}

export interface CitationResult {
  /** One HTML fragment per cluster, in the order of the request. */
  html: string[]
  /** Formatted bibliography entries (HTML) for everything cited, in style order. */
  bibliography: string[]
  /** Keys that no source defines. */
  missing: string[]
}

export type CitationProvider = (clusters: CitationCluster[]) => CitationResult

/** Counters at the start of a chapter, so a chapter can be rendered on its own. */
export interface NumberingStart {
  chapter: number
  headings: number[]
  figures: number
  tables: number
  /** True when the chapter's first level-1 heading is the chapter title (already counted). */
  chapterTitlePending: boolean
}

export function startOfDocument(): NumberingStart {
  return {
    chapter: 0,
    headings: [0, 0, 0, 0, 0, 0],
    figures: 0,
    tables: 0,
    chapterTitlePending: false
  }
}

export interface PublishingOptions {
  lang?: string
  numberSections?: boolean
  /** Number figures and tables per chapter ("2.1") instead of continuously. */
  chapterNumbers?: boolean
  /** First heading level that is numbered; 0 picks one from the document. */
  baseLevel?: number
  start?: NumberingStart
  /** Labels of the whole publication; omitted for a single document. */
  labels?: ReadonlyMap<string, Label>
  /** Prefix for generated heading ids, keeping ids unique inside a combined publication. */
  idPrefix?: string
  toc?: { enabled: boolean; depth: number }
  cite?: CitationProvider
  /** Append the bibliography when the document has citations but no `::: {#refs}` block. */
  bibliographyAtEnd?: boolean
}

export interface PublishingResult {
  labels: Label[]
  headings: HeadingEntry[]
  problems: PublishingProblem[]
  clusters: CitationCluster[]
  end: NumberingStart
  baseLevel: number
}

/** The slot in markdown-it's `env` that carries options in and results out. */
export interface PublishingEnv {
  ms?: PublishingOptions & { result?: PublishingResult }
}

export interface CaptionNames {
  figure: string
  table: string
  section: string
  chapter: string
  references: string
  contents: string
  figures: string
  tables: string
}

const NAMES: Record<string, CaptionNames> = {
  en: {
    figure: 'Figure',
    table: 'Table',
    section: 'Section',
    chapter: 'Chapter',
    references: 'References',
    contents: 'Contents',
    figures: 'List of figures',
    tables: 'List of tables'
  },
  nl: {
    figure: 'Figuur',
    table: 'Tabel',
    section: 'Paragraaf',
    chapter: 'Hoofdstuk',
    references: 'Referenties',
    contents: 'Inhoudsopgave',
    figures: 'Lijst van figuren',
    tables: 'Lijst van tabellen'
  },
  de: {
    figure: 'Abbildung',
    table: 'Tabelle',
    section: 'Abschnitt',
    chapter: 'Kapitel',
    references: 'Literatur',
    contents: 'Inhaltsverzeichnis',
    figures: 'Abbildungsverzeichnis',
    tables: 'Tabellenverzeichnis'
  }
}

export function captionNames(lang: string | undefined): CaptionNames {
  const base = (lang ?? 'en').toLowerCase().split('-')[0]
  return NAMES[base] ?? NAMES.en
}

/** The CSL locale for a language tag; English when we do not bundle that locale. */
export function cslLocale(lang: string | undefined): string {
  const base = (lang ?? 'en').toLowerCase().split('-')[0]
  return (
    ({ en: 'en-US', nl: 'nl-NL', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' } as Record<string, string>)[
      base
    ] ?? 'en-US'
  )
}
