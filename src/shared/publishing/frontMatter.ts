/**
 * YAML front matter: the optional `---` block at the top of a Markdown file. It is the standard
 * place for document metadata (Pandoc, Quarto, Jekyll and Obsidian all read it), so a document
 * that carries Markdown Studio settings is still an ordinary Markdown file everywhere else.
 *
 * Reading is lenient (a broken block is reported and the text is left alone); writing goes
 * through the `yaml` Document API so comments, key order and unrelated keys survive.
 */
import { isMap, parseDocument, stringify, type Document } from 'yaml'

export const FRONT_MATTER_MAX_CHARS = 64 * 1024

export interface FrontMatter {
  /** Parsed YAML as plain data; `{}` when there is no block or it is damaged. */
  data: Record<string, unknown>
  /** True when the text starts with a closed front-matter block. */
  present: boolean
  /** Text of the block between the fences (without them), or '' when absent. */
  raw: string
  /** Number of lines the block occupies, fences included (0 when absent). */
  lineCount: number
  /** Character offset where the body starts. */
  bodyOffset: number
  /** Why the block could not be read (invalid YAML, not a mapping, too large). */
  error: string | null
}

const NONE: FrontMatter = {
  data: {},
  present: false,
  raw: '',
  lineCount: 0,
  bodyOffset: 0,
  error: null
}

const OPEN = /^\ufeff?---[ \t]*\r?\n/

/** Locates the block without parsing it. */
function locate(text: string): { raw: string; end: number; lineCount: number } | null {
  const open = OPEN.exec(text)
  if (!open) return null
  const fence = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm
  fence.lastIndex = open[0].length
  const close = fence.exec(text)
  if (!close) return null
  const raw = text.slice(open[0].length, close.index)
  const end = close.index + close[0].length
  const lineCount =
    text.slice(0, end).split('\n').length - (text.slice(0, end).endsWith('\n') ? 1 : 0)
  return { raw, end, lineCount }
}

let lastParsed: { raw: string; data: Record<string, unknown>; error: string | null } | null = null

export function splitFrontMatter(text: string): FrontMatter {
  const found = locate(text)
  if (!found) return NONE
  const base = { present: true, raw: found.raw, lineCount: found.lineCount, bodyOffset: found.end }
  if (found.raw.length > FRONT_MATTER_MAX_CHARS) {
    return { ...base, data: {}, error: 'The front matter is too large to read.' }
  }
  if (found.raw.trim() === '') return { ...base, data: {}, error: null }
  // The front matter rarely changes while the body is edited: reuse the last parse.
  if (lastParsed && lastParsed.raw === found.raw) {
    return { ...base, data: lastParsed.data, error: lastParsed.error }
  }
  const parsed = parseRaw(found.raw)
  lastParsed = { raw: found.raw, ...parsed }
  return { ...base, ...parsed }
}

function parseRaw(raw: string): { data: Record<string, unknown>; error: string | null } {
  const doc = parseDocument(raw, { strict: false, uniqueKeys: true })
  if (doc.errors.length > 0) return { data: {}, error: doc.errors[0].message.split('\n')[0] }
  const value = doc.toJS({ maxAliasCount: 20 }) as unknown
  if (value === null || value === undefined) return { data: {}, error: null }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { data: {}, error: 'The front matter must be a list of "key: value" lines.' }
  }
  return { data: value as Record<string, unknown>, error: null }
}

/** The document text without its front matter. */
export function bodyOf(text: string): string {
  const fm = splitFrontMatter(text)
  return fm.present ? text.slice(fm.bodyOffset) : text
}

export type FrontMatterPatch = Record<string, unknown>

function eolOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * Sets (or, for `undefined`, removes) top-level keys and returns the new document text. Other
 * keys, their order and comments are kept. A damaged block is never rewritten: the function
 * throws so the caller can explain instead of destroying text.
 */
export function updateFrontMatter(text: string, patch: FrontMatterPatch): string {
  const eol = eolOf(text)
  const found = locate(text)
  if (!found) {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return text
    const yaml = stringify(Object.fromEntries(entries), { lineWidth: 0 }).replace(/\n/g, eol)
    return `---${eol}${yaml}---${eol}${eol}${text}`
  }
  const fm = splitFrontMatter(text)
  if (fm.error) throw new Error(`The front matter cannot be edited: ${fm.error}`)
  const doc: Document = parseDocument(found.raw === '' ? '{}' : found.raw, { strict: false })
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) doc.delete(key)
    else doc.set(key, doc.createNode(value))
  }
  let yaml = doc.toString({ lineWidth: 0 })
  if (yaml.trim() === '{}') yaml = ''
  const bom = text.startsWith('\ufeff') ? '\ufeff' : ''
  const body = text.slice(found.end)
  if (yaml === '') {
    // Nothing left: drop the empty block and the blank line that followed it.
    return bom + body.replace(/^\r?\n/, '')
  }
  const block = `${bom}---${eol}${yaml.replace(/\r?\n$/, '').replace(/\n/g, eol)}${eol}---${eol}`
  return block + body
}
