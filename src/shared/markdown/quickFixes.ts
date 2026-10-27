/**
 * Deterministic Markdown corrections that go beyond what markdownlint can fix by itself: repeated
 * spaces inside sentences, tables that the renderer shows differently from what was written, and
 * "format this block" for tables, headings, lists and paragraphs. Everything here is a pure
 * function over a document analysis, so it is testable without an editor.
 *
 * Nothing is rewritten that could change what the document says: only whitespace, table
 * delimiters and (to keep content that would otherwise be dropped) missing table columns change.
 */

import { isInCodeBlock, tableAtLine, type DocumentAnalysis } from './analysis'
import { parseListLine } from './lists'
import {
  containerPrefix,
  formatTable,
  parseTableBlock,
  splitCells,
  type Alignment,
  type TableFormatOptions,
  type TableModel
} from './tables'

/** Replaces the whole lines `[startLine, endLine)` (0-based) with `lines`. */
export interface LineEdit {
  startLine: number
  endLine: number
  lines: string[]
}

export interface SpaceRun {
  /** 0-based line and column of the first space of the run. */
  line: number
  column: number
  length: number
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i])
}

function slice(analysis: DocumentAnalysis, start: number, end: number): string[] {
  return analysis.lines.slice(start, end)
}

// --- Repeated spaces ------------------------------------------------------------------------

const TEXT_START =
  /^(?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/

/** Replaces spans in which spacing is meaningful (code, math, HTML tags, link targets) with filler. */
function maskProtectedSpans(line: string): string {
  const mask = (match: string) => 'x'.repeat(match.length)
  return line
    .replace(/(`+)(?:(?!\1)[\s\S])+?\1(?!`)/g, mask)
    .replace(/\$\$[^$]*\$\$|\$[^$\s][^$]*\$/g, mask)
    .replace(/<[a-zA-Z/!][^>]*>/g, mask)
    .replace(/\]\([^)]*\)/g, mask)
}

const spaceRunCache = new WeakMap<DocumentAnalysis, SpaceRun[]>()

/**
 * Runs of two or more spaces between words in running text. Indentation, spaces before a hard
 * line break at the end of a line, table padding, code, math, HTML and link destinations are
 * never reported.
 */
export function findSpaceRuns(analysis: DocumentAnalysis): SpaceRun[] {
  const cached = spaceRunCache.get(analysis)
  if (cached) return cached
  const runs: SpaceRun[] = []
  const lines = new Set<number>()
  for (const region of analysis.inlineRegions) {
    for (let line = region.start; line < region.end; line++) lines.add(line)
  }
  for (const line of [...lines].sort((a, b) => a - b)) {
    if (tableAtLine(analysis, line) || isInCodeBlock(analysis, line)) continue
    if (analysis.htmlBlocks.some((b) => line >= b.start && line < b.end)) continue
    const text = analysis.lines[line]
    const from = TEXT_START.exec(text)![0].length
    const masked = maskProtectedSpans(text)
    for (const match of masked.slice(from).matchAll(/(?<=\S) {2,}(?=\S)/g)) {
      runs.push({ line, column: from + match.index, length: match[0].length })
    }
  }
  spaceRunCache.set(analysis, runs)
  return runs
}

/** Edits that turn every repeated-space run into one space (document order). */
export function collapseSpaceRuns(lines: string[], runs: readonly SpaceRun[]): string[] {
  const out = [...lines]
  for (const run of [...runs].sort((a, b) => b.line - a.line || b.column - a.column)) {
    const text = out[run.line]
    out[run.line] = text.slice(0, run.column) + ' ' + text.slice(run.column + run.length)
  }
  return out
}

// --- Table repair ---------------------------------------------------------------------------

const DELIMITER_CELL = /^:?-+:?$/

function alignmentOf(cell: string): Alignment {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  return left && right ? 'center' : right ? 'right' : left ? 'left' : 'none'
}

/**
 * Rebuilds a table whose header, delimiter row and body rows disagree about the number of
 * columns, using as many columns as the widest row so no cell is lost. Rows with fewer cells are
 * completed with empty cells. Returns null when the lines are not a header and delimiter row.
 */
export function repairTableLines(
  lines: string[],
  options: TableFormatOptions = {}
): string[] | null {
  if (lines.length < 2) return null
  const prefix = containerPrefix(lines[0])
  const header = splitCells(lines[0], prefix.length).map((c) => c.text)
  const delimiter = splitCells(lines[1], containerPrefix(lines[1]).length).map((c) => c.text)
  if (header.length === 0 || delimiter.length === 0) return null
  if (!delimiter.every((cell) => DELIMITER_CELL.test(cell))) return null
  const body = lines
    .slice(2)
    .map((l) => splitCells(l, containerPrefix(l).length).map((c) => c.text))

  const columns = Math.max(header.length, delimiter.length, ...body.map((row) => row.length))
  const fill = (cells: string[]) => [...cells, ...Array(columns - cells.length).fill('')]
  const alignments: Alignment[] = [
    ...delimiter.map(alignmentOf),
    ...Array<Alignment>(columns - delimiter.length).fill('none')
  ]
  const table: TableModel = {
    prefix,
    alignments,
    header: fill(header),
    rows: body.map(fill)
  }
  return formatTable(table, options)
}

/**
 * The line range of a table-like block that starts at `line` even when the renderer does not
 * recognise it as a table (header and delimiter row of different widths): the header, the
 * delimiter and the pipe-containing lines that follow.
 */
function looseTableRange(
  analysis: DocumentAnalysis,
  line: number
): { start: number; end: number } | null {
  const delimiterLike = /^[ \t>]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
  for (
    let start = Math.max(0, line - 1);
    start <= line && start + 1 < analysis.lines.length;
    start++
  ) {
    const header = analysis.lines[start]
    const delimiter = analysis.lines[start + 1]
    if (!header.includes('|') || !delimiter.includes('-') || !delimiterLike.test(delimiter))
      continue
    let end = start + 2
    while (
      end < analysis.lines.length &&
      analysis.lines[end].includes('|') &&
      analysis.lines[end].trim() !== ''
    )
      end++
    if (line >= start && line < end) return { start, end }
  }
  return null
}

/**
 * The corrected form of the table at `line`, when it has a problem that formatting alone would
 * not fix: a header and delimiter row of different widths (the table is shown as plain text) or
 * rows with more cells than the header (the extra cells are not displayed).
 */
export function repairTableAt(
  analysis: DocumentAnalysis,
  line: number,
  options: TableFormatOptions = {}
): LineEdit | null {
  const block = tableAtLine(analysis, line)
  const range = block ? { start: block.start, end: block.end } : looseTableRange(analysis, line)
  if (!range) return null
  if (block && parseTableBlock(analysis, block).ok) return null
  const original = slice(analysis, range.start, range.end)
  const repaired = repairTableLines(original, options)
  if (!repaired || sameLines(repaired, original)) return null
  return { startLine: range.start, endLine: range.end, lines: repaired }
}

// --- Format the block at the cursor -----------------------------------------------------------

export type BlockKind = 'table' | 'heading' | 'list' | 'paragraph'

export interface BlockFormat extends LineEdit {
  kind: BlockKind
  /** The table had mismatched columns and was repaired rather than just aligned. */
  repair?: boolean
}

const ATX_HEADING = /^[ \t]{0,3}(#{1,6})[ \t]*(.*?)(?:[ \t]+#+)?[ \t]*$/

/** `#Title`, `#   Title   ##` and an indented marker become `# Title`. */
function formatHeading(line: string, runs: SpaceRun[]): string | null {
  const match = ATX_HEADING.exec(line)
  if (!match || match[2] === '') return null
  const text = collapseSpaceRuns(
    [line],
    runs.map((r) => ({ ...r, line: 0 }))
  )[0]
  const body = ATX_HEADING.exec(text)![2]
  return `${match[1]} ${body}`
}

/** Contiguous list lines (items and their indented continuation) around `line`. */
function listRange(
  analysis: DocumentAnalysis,
  line: number
): { start: number; end: number } | null {
  const isListy = (i: number) => {
    const text = analysis.lines[i]
    if (text === undefined || text.trim() === '') return false
    if (isInCodeBlock(analysis, i)) return false
    return parseListLine(text) !== null || /^[ \t]+\S/.test(text)
  }
  if (!isListy(line)) return null
  let start = line
  while (start > 0 && isListy(start - 1)) start--
  let end = line + 1
  while (end < analysis.lines.length && isListy(end)) end++
  // A block must begin with an item.
  while (start < end && parseListLine(analysis.lines[start]) === null) start++
  return start < end && line >= start ? { start, end } : null
}

function formatList(lines: string[]): string[] {
  const parsed = lines.map(parseListLine)
  const bulletMarker = parsed.find((p) => p?.kind === 'bullet')?.marker
  const counters = new Map<number, { next: number; step: number; delimiter: string }>()
  return lines.map((text, index) => {
    const item = parsed[index]
    if (!item) return text.replace(/[ \t]+$/, '')
    let marker = item.marker
    if (item.kind === 'bullet' && bulletMarker) marker = bulletMarker
    if (item.kind === 'ordered') {
      let counter = counters.get(item.indent)
      if (!counter) {
        const following = parsed.slice(index + 1).find((p) => p && p.indent === item.indent)
        const step = following?.kind === 'ordered' && following.number === item.number ? 0 : 1
        counter = { next: item.number ?? 1, step, delimiter: item.delimiter ?? '.' }
        counters.set(item.indent, counter)
      }
      marker = `${counter.next}${counter.delimiter}`
      counter.next += counter.step
    } else {
      // Deeper levels restart their numbering after a bullet at a shallower level.
      for (const key of [...counters.keys()]) if (key > item.indent) counters.delete(key)
    }
    const task = item.task ? `[${item.task}] ` : ''
    return `${item.prefix}${marker} ${task}${item.content.replace(/[ \t]+$/, '')}`
  })
}

function formatParagraph(lines: string[], runs: SpaceRun[], first: number): string[] {
  const local = runs.map((r) => ({ ...r, line: r.line - first }))
  const collapsed = collapseSpaceRuns(lines, local)
  return collapsed.map((text, index) => {
    const last = index === collapsed.length - 1
    // Exactly two trailing spaces before another line are a hard line break and are kept.
    if (!last && /[^ ] {2}$/.test(text)) return text
    return text.replace(/[ \t]+$/, '')
  })
}

/**
 * The reformatted block (table, heading, list or paragraph) containing `line`, or null when the
 * block is already tidy or has no formatting that applies.
 */
export function formatBlockAt(
  analysis: DocumentAnalysis,
  line: number,
  options: TableFormatOptions = {}
): BlockFormat | null {
  if (isInCodeBlock(analysis, line)) return null
  const done = (
    kind: BlockKind,
    start: number,
    end: number,
    lines: string[]
  ): BlockFormat | null =>
    sameLines(lines, slice(analysis, start, end))
      ? null
      : { kind, startLine: start, endLine: end, lines }

  const table = tableAtLine(analysis, line)
  if (table) {
    const parsed = parseTableBlock(analysis, table)
    if (parsed.ok) return done('table', table.start, table.end, formatTable(parsed.table, options))
    const repair = repairTableAt(analysis, line, options)
    return repair ? { kind: 'table', repair: true, ...repair } : null
  }
  const loose = repairTableAt(analysis, line, options)
  if (loose) return { kind: 'table', repair: true, ...loose }

  const heading = analysis.headings.find((h) => line >= h.line && line < h.endLine)
  if (heading) {
    if (heading.setext) return null
    const formatted = formatHeading(
      analysis.lines[heading.line],
      findSpaceRuns(analysis).filter((r) => r.line === heading.line)
    )
    return formatted === null ? null : done('heading', heading.line, heading.line + 1, [formatted])
  }

  const list = listRange(analysis, line)
  if (list)
    return done('list', list.start, list.end, formatList(slice(analysis, list.start, list.end)))

  const region = analysis.inlineRegions.find((r) => line >= r.start && line < r.end)
  if (region) {
    const runs = findSpaceRuns(analysis).filter(
      (r) => r.line >= region.start && r.line < region.end
    )
    return done(
      'paragraph',
      region.start,
      region.end,
      formatParagraph(slice(analysis, region.start, region.end), runs, region.start)
    )
  }
  return null
}
