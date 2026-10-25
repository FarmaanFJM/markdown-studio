import createMarkdownIt from 'markdown-it'
import type { DocumentAnalysis, LineRange } from './analysis'
import { isInCodeBlock } from './analysis'

/**
 * Local references (links, images, definitions, HTML `src`/`href`) with their exact source
 * positions. Positions come from scanning only the inline regions that markdown-it identified, so
 * text inside code blocks and code spans is never mistaken for a reference.
 */

export type ReferenceKind = 'link' | 'image' | 'definition' | 'html-img' | 'html-link'

export interface DocReference {
  kind: ReferenceKind
  /** The destination exactly as written, including `<...>` when it is wrapped. */
  raw: string
  /** What the renderer sees: wrapping removed, backslash escapes and entities resolved. */
  value: string
  wrapped: boolean
  /** 0-based position of the first character of `raw`. */
  line: number
  column: number
  /** Exclusive end of `raw`. */
  endLine: number
  endColumn: number
}

const utils = createMarkdownIt().utils

interface Region {
  text: string
  startLine: number
  /** Offset of the first character of each line within `text`. */
  lineStarts: number[]
}

function makeRegion(lines: string[], range: LineRange): Region {
  const lineStarts: number[] = []
  let offset = 0
  for (let line = range.start; line < range.end; line++) {
    lineStarts.push(offset)
    offset += (lines[line] ?? '').length + 1
  }
  return {
    text: lines.slice(range.start, range.end).join('\n'),
    startLine: range.start,
    lineStarts
  }
}

function positionOf(region: Region, offset: number): { line: number; column: number } {
  let low = 0
  let high = region.lineStarts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (region.lineStarts[mid] <= offset) low = mid
    else high = mid - 1
  }
  return { line: region.startLine + low, column: offset - region.lineStarts[low] }
}

interface Found {
  kind: ReferenceKind
  start: number
  end: number
  wrapped: boolean
  /** Attribute values are entity-decoded; Markdown destinations also unescape backslashes. */
  value: string
}

const WHITESPACE = /[ \t\n]/

function skipWhitespace(text: string, from: number): number {
  let i = from
  while (i < text.length && WHITESPACE.test(text[i])) i++
  return i
}

interface ParsedDestination {
  start: number
  end: number
  wrapped: boolean
  /** Index just after the closing parenthesis of the link. */
  after: number
}

/** Parses `dest "title")` following the opening parenthesis of an inline link. */
function parseInlineDestination(text: string, from: number): ParsedDestination | null {
  let i = skipWhitespace(text, from)
  let start: number
  let end: number
  let wrapped = false
  if (text[i] === '<') {
    let j = i + 1
    while (j < text.length) {
      const ch = text[j]
      if (ch === '\\') {
        j += 2
        continue
      }
      if (ch === '>') break
      if (ch === '\n' || ch === '<') return null
      j++
    }
    if (text[j] !== '>') return null
    wrapped = true
    start = i
    end = j + 1
    i = end
  } else {
    start = i
    let depth = 0
    while (i < text.length) {
      const ch = text[i]
      if (ch === '\\' && i + 1 < text.length) {
        i += 2
        continue
      }
      // eslint-disable-next-line no-control-regex
      if (/[\s\u0000-\u001f]/.test(ch)) break
      if (ch === '(') depth++
      else if (ch === ')') {
        if (depth === 0) break
        depth--
      }
      i++
    }
    if (depth !== 0) return null
    end = i
  }
  i = skipWhitespace(text, i)
  const opener = text[i]
  if (opener === '"' || opener === "'" || opener === '(') {
    const closer = opener === '(' ? ')' : opener
    let j = i + 1
    while (j < text.length && text[j] !== closer) j += text[j] === '\\' ? 2 : 1
    if (j >= text.length) return null
    i = skipWhitespace(text, j + 1)
  }
  if (text[i] !== ')') return null
  return { start, end, wrapped, after: i + 1 }
}

const TAG_PATTERN = /<\/?[A-Za-z][A-Za-z0-9-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/y
const AUTOLINK_PATTERN = /<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*>/y
const ATTRIBUTE_PATTERN = /\b(src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/dgi

function scanTag(tag: string, offset: number, found: Found[]): void {
  const name = /^<\/?([A-Za-z][A-Za-z0-9-]*)/.exec(tag)?.[1].toLowerCase()
  if (tag.startsWith('</') || (name !== 'img' && name !== 'a')) return
  const wanted = name === 'img' ? 'src' : 'href'
  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    if (match[1].toLowerCase() !== wanted) continue
    const group = match[2] !== undefined ? 2 : 3
    const [start, end] = match.indices![group] as [number, number]
    found.push({
      kind: name === 'img' ? 'html-img' : 'html-link',
      start: offset + start,
      end: offset + end,
      wrapped: false,
      value: utils.unescapeAll(match[group])
    })
  }
}

function countRun(text: string, from: number, ch: string): number {
  let i = from
  while (text[i] === ch) i++
  return i - from
}

/** Finds the end of the code span opened by a run of `length` backticks, or -1 if unclosed. */
function findClosingRun(text: string, from: number, length: number): number {
  let i = from
  while (i < text.length) {
    if (text[i] !== '`') {
      i++
      continue
    }
    const run = countRun(text, i, '`')
    if (run === length) return i
    i += run
  }
  return -1
}

function scanInline(text: string, found: Found[]): void {
  const open: { image: boolean }[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      i += 2
    } else if (ch === '`') {
      const run = countRun(text, i, '`')
      const close = findClosingRun(text, i + run, run)
      i = close >= 0 ? close + run : i + run
    } else if (ch === '<') {
      TAG_PATTERN.lastIndex = i
      AUTOLINK_PATTERN.lastIndex = i
      const autolink = AUTOLINK_PATTERN.exec(text)
      if (autolink) {
        i += autolink[0].length
        continue
      }
      const tag = TAG_PATTERN.exec(text)
      if (tag) {
        scanTag(tag[0], i, found)
        i += tag[0].length
      } else {
        i++
      }
    } else if (ch === '!' && text[i + 1] === '[') {
      open.push({ image: true })
      i += 2
    } else if (ch === '[') {
      open.push({ image: false })
      i++
    } else if (ch === ']') {
      const opener = open.pop()
      const destination = opener && text[i + 1] === '(' ? parseInlineDestination(text, i + 2) : null
      if (opener && destination) {
        const raw = text.slice(destination.start, destination.end)
        found.push({
          kind: opener.image ? 'image' : 'link',
          start: destination.start,
          end: destination.end,
          wrapped: destination.wrapped,
          value: utils.unescapeAll(destination.wrapped ? raw.slice(1, -1) : raw)
        })
        i = destination.after
      } else {
        i++
      }
    } else {
      i++
    }
  }
}

const DEFINITION_PATTERN =
  /^([\s>]*(?:[-*+]|\d+[.)])?[\s>]*)\[((?:[^\]\\]|\\.)+)\]:[ \t]*(<(?:[^<>\\\n]|\\.)*>|\S+)/d

/**
 * Every local-capable reference in the document with exact positions, in source order.
 * Code blocks, code spans and text that markdown-it did not parse as inline content are skipped.
 */
export function extractReferences(analysis: DocumentAnalysis): DocReference[] {
  const { lines } = analysis
  const results: DocReference[] = []
  const seen = new Set<string>()

  const add = (region: Region, found: Found) => {
    const start = positionOf(region, found.start)
    const end = positionOf(region, found.end)
    const key = `${start.line}:${start.column}`
    if (seen.has(key)) return
    seen.add(key)
    results.push({
      kind: found.kind,
      raw: region.text.slice(found.start, found.end),
      value: found.value,
      wrapped: found.wrapped,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column
    })
  }

  for (const range of analysis.inlineRegions) {
    const region = makeRegion(lines, range)
    const found: Found[] = []
    scanInline(region.text, found)
    found.forEach((f) => add(region, f))
  }

  for (const range of analysis.htmlBlocks) {
    const region = makeRegion(lines, range)
    const found: Found[] = []
    for (const match of region.text.matchAll(new RegExp(TAG_PATTERN.source, 'g'))) {
      scanTag(match[0], match.index, found)
    }
    found.forEach((f) => add(region, f))
  }

  lines.forEach((text, line) => {
    if (analysis.coveredLines.has(line) || !text.includes(']:') || isInCodeBlock(analysis, line)) {
      return
    }
    const match = DEFINITION_PATTERN.exec(text)
    if (!match || match[2].startsWith('^')) return
    const [start, end] = match.indices![3] as [number, number]
    const raw = match[3]
    const wrapped = raw.startsWith('<')
    const region: Region = { text, startLine: line, lineStarts: [0] }
    add(region, {
      kind: 'definition',
      start,
      end,
      wrapped,
      value: utils.unescapeAll(wrapped ? raw.slice(1, -1) : raw)
    })
  })

  return results.sort((a, b) => a.line - b.line || a.column - b.column)
}

export type ReferenceTarget =
  | { type: 'empty' }
  | { type: 'external' }
  | { type: 'anchor'; fragment: string }
  | {
      type: 'local'
      /** The path part, still percent-encoded as written. */
      path: string
      /** The `?query` and `#fragment` tail, kept verbatim. */
      suffix: string
      /** The fragment without `#`, or null. */
      fragment: string | null
    }

/** Splits a reference value into what it points at. Web URLs and other schemes are external. */
export function classifyReference(value: string): ReferenceTarget {
  const trimmed = value.trim()
  if (!trimmed) return { type: 'empty' }
  if (trimmed.startsWith('#')) return { type: 'anchor', fragment: trimmed.slice(1) }
  if (trimmed.startsWith('//')) return { type: 'external' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[a-z]:[\\/]/i.test(trimmed)) {
    return { type: 'external' }
  }
  const cut = trimmed.search(/[?#]/)
  const path = cut < 0 ? trimmed : trimmed.slice(0, cut)
  const suffix = cut < 0 ? '' : trimmed.slice(cut)
  const hash = suffix.indexOf('#')
  return {
    type: 'local',
    path,
    suffix,
    fragment: hash < 0 ? null : suffix.slice(hash + 1)
  }
}
