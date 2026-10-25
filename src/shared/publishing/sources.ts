/**
 * Bibliographic sources, stored as CSL JSON (the data model of the Citation Style Language),
 * so a library can be shared with Zotero, Pandoc and Quarto. Input is untrusted data: it is
 * validated, size-limited and never evaluated. Nothing is ever filled in on the user's behalf.
 */

export const SOURCE_TYPES = [
  'article-journal',
  'book',
  'chapter',
  'paper-conference',
  'report',
  'thesis',
  'webpage',
  'article-newspaper',
  'article-magazine',
  'post-weblog',
  'software',
  'video-game',
  'motion_picture',
  'dataset',
  'speech',
  'interview',
  'personal_communication',
  'figure',
  'graphic',
  'document'
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  'article-journal': 'Journal article',
  book: 'Book',
  chapter: 'Book chapter',
  'paper-conference': 'Conference paper',
  report: 'Report',
  thesis: 'Thesis',
  webpage: 'Web page',
  'article-newspaper': 'Newspaper article',
  'article-magazine': 'Magazine article',
  'post-weblog': 'Blog post',
  software: 'Software',
  'video-game': 'Video game',
  motion_picture: 'Film or video',
  dataset: 'Dataset',
  speech: 'Speech or talk',
  interview: 'Interview',
  personal_communication: 'Personal communication',
  figure: 'Figure',
  graphic: 'Image or graphic',
  document: 'Other document'
}

export interface SourceName {
  family?: string
  given?: string
  /** A single-field name such as an organisation ("World Health Organization"). */
  literal?: string
}

export interface Source {
  id: string
  type: SourceType
  title?: string
  author?: SourceName[]
  editor?: SourceName[]
  /** `{ 'date-parts': [[2020, 5, 17]] }` or `{ literal: 'n.d.' }`. */
  issued?: { 'date-parts'?: number[][]; literal?: string }
  accessed?: { 'date-parts'?: number[][] }
  'container-title'?: string
  publisher?: string
  'publisher-place'?: string
  volume?: string
  issue?: string
  page?: string
  edition?: string
  DOI?: string
  URL?: string
  ISBN?: string
  genre?: string
  medium?: string
  note?: string
  abstract?: string
  [key: string]: unknown
}

export const SOURCE_LIMITS = {
  maxEntries: 5000,
  maxFileChars: 4 * 1024 * 1024,
  maxField: 4000,
  maxNames: 100
} as const

/** Citation keys: Pandoc's rule, restricted to what is safe in file names, ids and URLs. */
export const SOURCE_KEY = /^[A-Za-z0-9_](?:[A-Za-z0-9_]|[:.#$%&+?<>~/-](?=[A-Za-z0-9_]))*$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return undefined
  // eslint-disable-next-line no-control-regex -- control characters are stripped from imported text
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
  return cleaned === '' ? undefined : cleaned.slice(0, SOURCE_LIMITS.maxField)
}

function names(value: unknown): SourceName[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: SourceName[] = []
  for (const item of value.slice(0, SOURCE_LIMITS.maxNames)) {
    if (!isObject(item)) continue
    const name: SourceName = {}
    const family = text(item.family)
    const given = text(item.given)
    const literal = text(item.literal)
    if (family) name.family = family
    if (given) name.given = given
    if (literal) name.literal = literal
    if (Object.keys(name).length > 0) out.push(name)
  }
  return out.length > 0 ? out : undefined
}

function dateParts(value: unknown): Source['issued'] | undefined {
  if (!isObject(value)) return undefined
  const raw = value['date-parts']
  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    const parts = (raw[0] as unknown[])
      .slice(0, 3)
      .map((n) => (typeof n === 'string' ? Number(n) : n))
      .filter(
        (n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 10000
      )
    if (parts.length > 0) return { 'date-parts': [parts] }
  }
  const literal = text(value.literal)
  return literal ? { literal } : undefined
}

export interface SanitizedSources {
  sources: Source[]
  /** Entries that were skipped or changed, with the reason. */
  problems: string[]
}

const STRING_FIELDS = [
  'title',
  'container-title',
  'publisher',
  'publisher-place',
  'volume',
  'issue',
  'page',
  'edition',
  'DOI',
  'URL',
  'ISBN',
  'genre',
  'medium',
  'note',
  'abstract'
] as const

/** Validates CSL JSON. Unknown keys are dropped; entries without a usable key are reported. */
export function sanitizeSources(input: unknown): SanitizedSources {
  const problems: string[] = []
  const sources: Source[] = []
  if (!Array.isArray(input)) {
    return { sources, problems: ['The bibliography must be a list of sources.'] }
  }
  const seen = new Set<string>()
  for (const [index, raw] of input.entries()) {
    if (sources.length >= SOURCE_LIMITS.maxEntries) {
      problems.push(`Only the first ${SOURCE_LIMITS.maxEntries} sources are used.`)
      break
    }
    if (!isObject(raw)) {
      problems.push(`Entry ${index + 1} is not a source.`)
      continue
    }
    const id = text(raw.id)
    if (!id || !SOURCE_KEY.test(id)) {
      problems.push(`Entry ${index + 1} has no usable key (letters, digits and _ - : . only).`)
      continue
    }
    if (seen.has(id)) {
      problems.push(`The key "${id}" is used twice; the second entry was skipped.`)
      continue
    }
    seen.add(id)
    const type = (SOURCE_TYPES as readonly unknown[]).includes(raw.type)
      ? (raw.type as SourceType)
      : 'document'
    if (raw.type !== type)
      problems.push(`"${id}": type "${String(raw.type)}" is treated as "document".`)
    const source: Source = { id, type }
    for (const field of STRING_FIELDS) {
      const value = text(raw[field])
      if (value !== undefined) source[field] = value
    }
    const author = names(raw.author)
    if (author) source.author = author
    const editor = names(raw.editor)
    if (editor) source.editor = editor
    const issued = dateParts(raw.issued)
    if (issued) source.issued = issued
    const accessed = dateParts(raw.accessed)
    if (accessed && accessed['date-parts'])
      source.accessed = { 'date-parts': accessed['date-parts'] }
    sources.push(source)
  }
  return { sources, problems }
}

/** Parses the text of a CSL JSON file. */
export function parseSourcesJson(textContent: string): SanitizedSources {
  if (textContent.length > SOURCE_LIMITS.maxFileChars) {
    return { sources: [], problems: ['The bibliography file is too large.'] }
  }
  if (textContent.trim() === '') return { sources: [], problems: [] }
  let data: unknown
  try {
    data = JSON.parse(textContent)
  } catch {
    return { sources: [], problems: ['The bibliography is not valid JSON.'] }
  }
  return sanitizeSources(data)
}

export function serializeSources(sources: readonly Source[]): string {
  return `${JSON.stringify(sources, null, 2)}\n`
}

// ------------------------------------------------------------------ completeness for APA

export interface MissingField {
  field: string
  message: string
}

function hasPeople(list: SourceName[] | undefined): boolean {
  return !!list && list.length > 0
}

/**
 * Fields APA 7 expects but the source lacks. This only reports; it never invents values (APA
 * itself falls back to the title and "n.d." when author or date are absent).
 */
export function missingFields(source: Source): MissingField[] {
  const out: MissingField[] = []
  if (!source.title) out.push({ field: 'title', message: 'no title' })
  if (!hasPeople(source.author) && !(source.type === 'book' && hasPeople(source.editor))) {
    out.push({ field: 'author', message: 'no author or organisation' })
  }
  if (!source.issued) out.push({ field: 'issued', message: 'no date (APA prints "n.d.")' })
  switch (source.type) {
    case 'article-journal':
    case 'article-magazine':
    case 'article-newspaper':
      if (!source['container-title'])
        out.push({ field: 'container-title', message: 'no journal or periodical name' })
      break
    case 'chapter':
    case 'paper-conference':
      if (!source['container-title'])
        out.push({ field: 'container-title', message: 'no book or proceedings title' })
      break
    case 'book':
    case 'report':
      if (!source.publisher) out.push({ field: 'publisher', message: 'no publisher' })
      break
    case 'webpage':
    case 'post-weblog':
      if (!source.URL) out.push({ field: 'URL', message: 'no URL' })
      break
    case 'video-game':
    case 'software':
      if (!source.publisher) out.push({ field: 'publisher', message: 'no publisher or developer' })
      break
    default:
      break
  }
  return out
}

/** One-line description used in lists: "Smith (2020) — Title". */
export function describeSource(source: Source): string {
  const first = source.author?.[0] ?? source.editor?.[0]
  const who = first?.family ?? first?.literal ?? '(no author)'
  const year = source.issued?.['date-parts']?.[0]?.[0] ?? source.issued?.literal ?? 'n.d.'
  return `${who} (${year})${source.title ? ` — ${source.title}` : ''}`
}

/** A key suggestion such as `smith2020`, unique among `taken`. Never overwrites a key. */
export function suggestKey(source: Partial<Source>, taken: ReadonlySet<string>): string {
  const first = source.author?.[0] ?? source.editor?.[0]
  const family = (first?.family ?? first?.literal ?? 'source')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
    .slice(0, 24)
  const year = source.issued?.['date-parts']?.[0]?.[0]
  const base = `${family || 'source'}${year ?? ''}`
  if (!taken.has(base)) return base
  for (let i = 0; i < 26; i++) {
    const candidate = `${base}${String.fromCharCode(97 + i)}`
    if (!taken.has(candidate)) return candidate
  }
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Parses "Family, Given; Family, Given" or an organisation name into CSL names. */
export function parseNameList(textValue: string): SourceName[] {
  return textValue
    .split(/\s*;\s*|\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const comma = entry.indexOf(',')
      if (comma > 0) {
        return { family: entry.slice(0, comma).trim(), given: entry.slice(comma + 1).trim() }
      }
      // No comma: an organisation or a single name, kept exactly as written.
      return { literal: entry }
    })
}

export function formatNameList(list: SourceName[] | undefined): string {
  return (list ?? [])
    .map((n) => (n.literal ? n.literal : [n.family, n.given].filter(Boolean).join(', ')))
    .join('; ')
}
