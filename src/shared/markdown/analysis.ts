import type { MarkdownIt, Token } from 'markdown-it'
import { createApplicationMarkdownIt, inlineText } from './plugins'

/** A run of whole lines. `start` is 0-based and inclusive, `end` exclusive. */
export interface LineRange {
  start: number
  end: number
}

export interface Heading {
  level: number
  /** Plain text, as the preview shows it (inline formatting removed). */
  text: string
  /** The `id` the preview gives the rendered heading; the target of `#fragment` links. */
  id: string
  /** 0-based line of the heading text. For Setext headings the underline is on `endLine - 1`. */
  line: number
  endLine: number
  setext: boolean
  /** The author marked the heading with `<!-- omit in toc -->`. */
  omitFromToc: boolean
}

export interface FenceBlock extends LineRange {
  /** The info string after the opening marker (usually the language). */
  info: string
  /** True when the closing marker line exists (the last line of the range). */
  closed: boolean
}

export interface TableBlock extends LineRange {
  /** Nesting depth; greater than 0 for tables inside quotes or list items. */
  level: number
}

/**
 * Structure of a Markdown document, derived from markdown-it's token stream (the same parser and
 * plugins as the preview). Everything is line-based so the Monaco adapters can map results
 * directly onto model lines.
 */
export interface DocumentAnalysis {
  source: string
  lines: string[]
  headings: Heading[]
  fences: FenceBlock[]
  /** Fenced and indented code: text inside is never Markdown. */
  codeBlocks: LineRange[]
  htmlBlocks: LineRange[]
  tables: TableBlock[]
  /** Line ranges of every inline-content token (paragraphs, headings, table rows, ...). */
  inlineRegions: LineRange[]
  /** Lines claimed by some block token. Unclaimed non-blank lines can only be definitions. */
  coveredLines: Set<number>
  /** Anchors authored in HTML: `<a id="x">`, `<a name="x">`, `<h2 id="x">`. */
  htmlAnchors: Set<string>
}

let parser: MarkdownIt | null = null

function getParser(): MarkdownIt {
  // Linkify only affects inline link detection, never the block structure analysed here.
  parser ??= createApplicationMarkdownIt({ linkify: false })
  return parser
}

const OMIT_PATTERN = /<!--\s*omit\s+(?:in|from)\s+toc\s*-->/i
const HTML_ANCHOR_PATTERN = /\b(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi

export function splitLines(source: string): string[] {
  return source.split(/\r\n|\r|\n/)
}

function collectHtmlAnchors(html: string, into: Set<string>): void {
  for (const match of html.matchAll(HTML_ANCHOR_PATTERN)) {
    const value = match[1] ?? match[2] ?? match[3]
    if (value) into.add(value)
  }
}

export function analyzeDocument(source: string): DocumentAnalysis {
  const lines = splitLines(source)
  const tokens: Token[] = getParser().parse(source, {})
  const analysis: DocumentAnalysis = {
    source,
    lines,
    headings: [],
    fences: [],
    codeBlocks: [],
    htmlBlocks: [],
    tables: [],
    inlineRegions: [],
    coveredLines: new Set(),
    htmlAnchors: new Set()
  }

  const cover = (map: [number, number] | null) => {
    if (!map) return
    for (let line = map[0]; line < map[1]; line++) analysis.coveredLines.add(line)
  }

  tokens.forEach((token, index) => {
    const map = token.map
    switch (token.type) {
      case 'heading_open': {
        if (!map) break
        const inline = tokens[index + 1]
        const range = lines.slice(map[0], map[1]).join('\n')
        analysis.headings.push({
          level: Number(token.tag.slice(1)),
          text: inlineText(inline).trim(),
          id: String(token.attrGet('id') ?? ''),
          line: map[0],
          endLine: map[1],
          setext: token.markup === '=' || token.markup === '-',
          omitFromToc: OMIT_PATTERN.test(range)
        })
        cover(map)
        break
      }
      case 'fence': {
        if (!map) break
        const last = lines[map[1] - 1] ?? ''
        const marker = token.markup
        analysis.fences.push({
          start: map[0],
          end: map[1],
          info: token.info.trim(),
          // markdown-it ends an unclosed fence at the end of its container.
          closed:
            map[1] - map[0] >= 2 &&
            new RegExp(`^[\\s>]*${marker[0]}{${marker.length},}\\s*$`).test(last)
        })
        analysis.codeBlocks.push({ start: map[0], end: map[1] })
        cover(map)
        break
      }
      case 'code_block':
        if (map) {
          analysis.codeBlocks.push({ start: map[0], end: map[1] })
          cover(map)
        }
        break
      case 'html_block':
        if (map) {
          analysis.htmlBlocks.push({ start: map[0], end: map[1] })
          cover(map)
          collectHtmlAnchors(token.content, analysis.htmlAnchors)
        }
        break
      case 'table_open':
        if (map) {
          analysis.tables.push({ start: map[0], end: map[1], level: token.level })
          // Cell contents carry no line map of their own; every row except the delimiter row is
          // inline content.
          for (let line = map[0]; line < map[1]; line++) {
            if (line !== map[0] + 1) analysis.inlineRegions.push({ start: line, end: line + 1 })
          }
        }
        cover(map)
        break
      case 'inline':
        if (map) {
          analysis.inlineRegions.push({ start: map[0], end: map[1] })
          cover(map)
        }
        for (const child of token.children ?? []) {
          if (child.type === 'html_inline') collectHtmlAnchors(child.content, analysis.htmlAnchors)
        }
        break
      case 'hr':
        cover(map)
        break
    }
  })

  return analysis
}

/** True when `line` (0-based) lies in a fenced or indented code block, markers included. */
export function isInCodeBlock(analysis: DocumentAnalysis, line: number): boolean {
  return analysis.codeBlocks.some((block) => line >= block.start && line < block.end)
}

/**
 * True when `line` is inside the content of a fenced block (between the markers), where Markdown
 * constructs must not be offered or reformatted.
 */
export function isInsideFenceContent(analysis: DocumentAnalysis, line: number): boolean {
  return analysis.fences.some(
    (fence) => line > fence.start && (fence.closed ? line < fence.end - 1 : line < fence.end)
  )
}

/** The fence whose opening line is `line`, for language completion after the marker. */
export function fenceOpeningAt(analysis: DocumentAnalysis, line: number): FenceBlock | null {
  return analysis.fences.find((fence) => fence.start === line) ?? null
}

export function tableAtLine(analysis: DocumentAnalysis, line: number): TableBlock | null {
  return analysis.tables.find((table) => line >= table.start && line < table.end) ?? null
}

/** The heading that contains `line` or, for lines below one, the nearest heading above. */
export function headingAtLine(analysis: DocumentAnalysis, line: number): Heading | null {
  let current: Heading | null = null
  for (const heading of analysis.headings) {
    if (heading.line <= line) current = heading
    else break
  }
  return current
}

/** Every anchor a `#fragment` link in this document can target. */
export function documentAnchors(analysis: DocumentAnalysis): Set<string> {
  const anchors = new Set<string>(analysis.htmlAnchors)
  for (const heading of analysis.headings) if (heading.id) anchors.add(heading.id)
  return anchors
}
