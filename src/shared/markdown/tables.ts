import type { DocumentAnalysis, TableBlock } from './analysis'

/**
 * GitHub Flavored Markdown table parsing, formatting and structural edits.
 *
 * Cell splitting mirrors markdown-it's table rule exactly (a pipe separates cells unless the
 * character before it is a backslash; one empty leading and one empty trailing cell are dropped),
 * so a table that is formatted here renders in the preview with the same cells as before.
 * Cell text is kept as written, including escapes such as `\|`.
 */

export type Alignment = 'none' | 'left' | 'center' | 'right'

export interface TableModel {
  /** Container prefix (indentation and quote markers) repeated in front of every line. */
  prefix: string
  alignments: Alignment[]
  header: string[]
  rows: string[][]
}

export interface CellSpan {
  /** Trimmed cell text. */
  text: string
  /** Column range of the trimmed text within the line (empty cells collapse to one column). */
  start: number
  end: number
  /** Column range between the surrounding pipes. */
  segmentStart: number
  segmentEnd: number
}

const PREFIX_PATTERN = /^(?:[ \t]*>)*[ \t]*/

export function containerPrefix(line: string): string {
  return PREFIX_PATTERN.exec(line)![0]
}

/** Splits one table row into cells, keeping column offsets for cursor navigation. */
export function splitCells(line: string, prefixLength: number): CellSpan[] {
  const rest = line.slice(prefixLength)
  const leading = rest.length - rest.trimStart().length
  const trimmedEnd = prefixLength + rest.trimEnd().length
  const from = prefixLength + leading
  if (from >= trimmedEnd) return []

  const segments: { start: number; end: number }[] = []
  let segmentStart = from
  for (let i = from; i < trimmedEnd; i++) {
    if (line[i] === '|' && line[i - 1] !== '\\') {
      segments.push({ start: segmentStart, end: i })
      segmentStart = i + 1
    }
  }
  segments.push({ start: segmentStart, end: trimmedEnd })

  if (segments.length > 0 && segments[0].start === segments[0].end) segments.shift()
  if (segments.length > 0) {
    const last = segments[segments.length - 1]
    if (last.start === last.end) segments.pop()
  }

  return segments.map(({ start, end }) => {
    const raw = line.slice(start, end)
    const lead = raw.length - raw.trimStart().length
    const text = raw.trim()
    const textStart = start + lead
    return {
      text,
      start: textStart,
      end: textStart + text.length,
      segmentStart: start,
      segmentEnd: end
    }
  })
}

const DELIMITER_CELL = /^:?-+:?$/

function parseAlignment(cell: string): Alignment | null {
  const text = cell.trim()
  if (!DELIMITER_CELL.test(text)) return null
  const left = text.startsWith(':')
  const right = text.endsWith(':')
  return left && right ? 'center' : right ? 'right' : left ? 'left' : 'none'
}

/** Parses the delimiter row the way markdown-it does (a naive split on every pipe). */
function parseDelimiterRow(line: string, prefixLength: number): Alignment[] | null {
  const parts = line.slice(prefixLength).split('|')
  const alignments: Alignment[] = []
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].trim()) {
      if (i === 0 || i === parts.length - 1) continue
      return null
    }
    const alignment = parseAlignment(parts[i])
    if (!alignment) return null
    alignments.push(alignment)
  }
  return alignments
}

export interface ParsedTable {
  table: TableModel
  /** 0-based line range of the table in the document. */
  start: number
  end: number
}

export type TableParseResult = ({ ok: true } & ParsedTable) | { ok: false; reason: string }

const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])[ \t]+/

/**
 * Reads the table that markdown-it found at `block`. Tables that cannot be rewritten without
 * losing content are reported with a reason instead of being returned.
 */
export function parseTableBlock(analysis: DocumentAnalysis, block: TableBlock): TableParseResult {
  const lines = analysis.lines.slice(block.start, block.end)
  if (lines.length < 2) return { ok: false, reason: 'The table is incomplete.' }

  const prefix = containerPrefix(lines[0])
  if (block.level > 0 && LIST_MARKER.test(lines[0].slice(prefix.length))) {
    return {
      ok: false,
      reason:
        'Tables that start on a list item line cannot be formatted. Move the table onto its own line.'
    }
  }

  const header = splitCells(lines[0], prefix.length).map((cell) => cell.text)
  const alignments = parseDelimiterRow(lines[1], containerPrefix(lines[1]).length)
  if (!alignments || alignments.length !== header.length) {
    return { ok: false, reason: 'The delimiter row does not match the header.' }
  }

  const rows: string[][] = []
  for (let i = 2; i < lines.length; i++) {
    const cells = splitCells(lines[i], containerPrefix(lines[i]).length).map((cell) => cell.text)
    if (cells.length > header.length) {
      const extra = cells.slice(header.length)
      if (extra.some((cell) => cell !== '')) {
        return {
          ok: false,
          reason: `Row ${i - 1} has ${cells.length} cells but the table has ${header.length} columns. Formatting would drop the extra cells; remove them or add a column first.`
        }
      }
      cells.length = header.length
    }
    while (cells.length < header.length) cells.push('')
    rows.push(cells)
  }

  return {
    ok: true,
    table: { prefix, alignments, header, rows },
    start: block.start,
    end: block.end
  }
}

export function tableColumnCount(table: TableModel): number {
  return table.header.length
}

// --- Display width -----------------------------------------------------------------------

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}|\p{Regional_Indicator}|️|⃣/u
const ZERO_WIDTH = /^[\p{Cc}\p{Cf}\p{Mn}\p{Me}]+$/u

function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x2fffd) ||
    (cp >= 0x30000 && cp <= 0x3fffd)
  )
}

/**
 * Number of monospace columns `text` occupies: East Asian wide characters and emoji take two,
 * combining marks and zero-width characters none, a ZWJ emoji sequence counts as one emoji.
 */
export function displayWidth(text: string): number {
  if (/^[\x20-\x7e]*$/.test(text)) return text.length
  let width = 0
  for (const { segment } of segmenter.segment(text)) {
    if (ZERO_WIDTH.test(segment)) continue
    if (EMOJI_PRESENTATION.test(segment)) {
      width += 2
      continue
    }
    width += isWideCodePoint(segment.codePointAt(0)!) ? 2 : 1
  }
  return width
}

function pad(text: string, width: number, alignment: Alignment): string {
  const gap = Math.max(0, width - displayWidth(text))
  if (alignment === 'right') return ' '.repeat(gap) + text
  if (alignment === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + text + ' '.repeat(gap - left)
  }
  return text + ' '.repeat(gap)
}

function delimiterCell(width: number, alignment: Alignment): string {
  const inner = width + 2
  switch (alignment) {
    case 'left':
      return ':' + '-'.repeat(inner - 1)
    case 'right':
      return '-'.repeat(inner - 1) + ':'
    case 'center':
      return ':' + '-'.repeat(inner - 2) + ':'
    default:
      return '-'.repeat(inner)
  }
}

/** Renders the table as aligned, consistently spaced source lines. */
export function formatTable(table: TableModel): string[] {
  const columns = table.header.length
  const widths = Array.from({ length: columns }, (_, c) =>
    Math.max(
      3,
      displayWidth(table.header[c]),
      ...table.rows.map((row) => displayWidth(row[c] ?? ''))
    )
  )
  const row = (cells: string[]) =>
    table.prefix +
    '|' +
    widths.map((w, c) => ` ${pad(cells[c] ?? '', w, table.alignments[c])} |`).join('')
  const delimiter =
    table.prefix + '|' + widths.map((w, c) => delimiterCell(w, table.alignments[c]) + '|').join('')
  return [row(table.header), delimiter, ...table.rows.map(row)]
}

// --- Structural edits ---------------------------------------------------------------------

function emptyRow(table: TableModel): string[] {
  return Array.from({ length: table.header.length }, () => '')
}

export function insertRow(table: TableModel, bodyIndex: number): TableModel {
  const rows = [...table.rows]
  rows.splice(Math.max(0, Math.min(bodyIndex, rows.length)), 0, emptyRow(table))
  return { ...table, rows }
}

export function deleteRow(table: TableModel, bodyIndex: number): TableModel {
  return { ...table, rows: table.rows.filter((_, i) => i !== bodyIndex) }
}

export function insertColumn(table: TableModel, index: number): TableModel {
  const at = Math.max(0, Math.min(index, table.header.length))
  const withCell = (cells: string[]) => [...cells.slice(0, at), '', ...cells.slice(at)]
  return {
    ...table,
    header: withCell(table.header),
    alignments: [...table.alignments.slice(0, at), 'none', ...table.alignments.slice(at)],
    rows: table.rows.map(withCell)
  }
}

export function deleteColumn(table: TableModel, index: number): TableModel {
  const without = (cells: string[]) => cells.filter((_, i) => i !== index)
  return {
    ...table,
    header: without(table.header),
    alignments: table.alignments.filter((_, i) => i !== index),
    rows: table.rows.map(without)
  }
}

export function setColumnAlignment(
  table: TableModel,
  index: number,
  alignment: Alignment
): TableModel {
  return { ...table, alignments: table.alignments.map((a, i) => (i === index ? alignment : a)) }
}

export function moveColumn(table: TableModel, from: number, to: number): TableModel {
  const move = <T>(cells: T[]): T[] => {
    const copy = [...cells]
    const [item] = copy.splice(from, 1)
    copy.splice(to, 0, item)
    return copy
  }
  return {
    ...table,
    header: move(table.header),
    alignments: move(table.alignments),
    rows: table.rows.map(move)
  }
}

/** Escapes text typed into a graphical cell so it stays a single GFM table cell. */
export function escapeTableCell(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '<br>').replace(/\|/g, '\\|')
}

/** The inverse of `escapeTableCell` for display in the graphical editor. */
export function unescapeTableCell(text: string): string {
  return text.replace(/\\\|/g, '|')
}

// --- Cursor mapping -----------------------------------------------------------------------

export interface TableCursor {
  /** `header`, `delimiter` or the 0-based body row index. */
  row: 'header' | 'delimiter' | number
  column: number
}

/** The row and column of a document position inside the table at `parsed`. */
export function locateInTable(
  analysis: DocumentAnalysis,
  parsed: ParsedTable,
  line: number,
  column: number
): TableCursor {
  const offset = line - parsed.start
  const row = offset === 0 ? 'header' : offset === 1 ? 'delimiter' : offset - 2
  const text = analysis.lines[line]
  const cells = splitCells(text, containerPrefix(text).length)
  let index = 0
  for (let c = 0; c < cells.length; c++) {
    if (column >= cells[c].segmentStart) index = c
  }
  return { row, column: Math.min(index, parsed.table.header.length - 1) }
}

/** The line and column of the end of a cell's text in already-formatted table lines. */
export function cellPosition(
  formatted: string[],
  tableStart: number,
  row: 'header' | number,
  column: number
): { line: number; column: number } {
  const lineIndex = row === 'header' ? 0 : row + 2
  const text = formatted[lineIndex]
  const cells = splitCells(text, containerPrefix(text).length)
  const cell = cells[Math.min(column, cells.length - 1)]
  return { line: tableStart + lineIndex, column: cell.end }
}

// --- Diagnostics --------------------------------------------------------------------------

export interface TableProblem {
  /** 0-based line. */
  line: number
  message: string
}

const DELIMITER_LIKE = /^[ \t>]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/

/**
 * Tables that look like tables but are rendered differently from what the author intended:
 * a header and delimiter row with different column counts (the whole table is shown as plain
 * text), and body rows with surplus cells (silently dropped by the renderer).
 */
export function findTableProblems(analysis: DocumentAnalysis): TableProblem[] {
  const problems: TableProblem[] = []
  const tableLines = new Set<number>()
  for (const table of analysis.tables) {
    for (let line = table.start; line < table.end; line++) tableLines.add(line)
  }

  for (const region of analysis.inlineRegions) {
    for (let line = region.start; line + 1 < region.end; line++) {
      const header = analysis.lines[line]
      const delimiter = analysis.lines[line + 1]
      if (tableLines.has(line) || !header.includes('|') || !delimiter.includes('-')) continue
      if (!DELIMITER_LIKE.test(delimiter)) continue
      const headerCount = splitCells(header, containerPrefix(header).length).length
      const delimiterCount = parseDelimiterRow(delimiter, containerPrefix(delimiter).length)?.length
      if (delimiterCount !== undefined && delimiterCount !== headerCount) {
        problems.push({
          line,
          message: `This is not rendered as a table: the header has ${headerCount} column${headerCount === 1 ? '' : 's'} but the delimiter row has ${delimiterCount}.`
        })
      }
    }
  }

  for (const block of analysis.tables) {
    const parsed = parseTableBlock(analysis, block)
    if (parsed.ok) continue
    if (/^Row \d+ has/.test(parsed.reason)) {
      const row = Number(/^Row (\d+)/.exec(parsed.reason)![1])
      problems.push({
        line: block.start + row + 1,
        message: parsed.reason.replace(
          / Formatting would drop.*$/,
          ' Extra cells are not displayed.'
        )
      })
    }
  }

  return problems.sort((a, b) => a.line - b.line)
}
