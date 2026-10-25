/**
 * Markdown list and quote editing rules (Enter, Tab and Shift+Tab inside lists). Pure functions
 * over lines, so the behaviour is testable without an editor.
 */

export interface LineAccess {
  count: number
  /** Text of a 0-based line. */
  get(line: number): string
}

export function linesOf(lines: string[]): LineAccess {
  return { count: lines.length, get: (line) => lines[line] ?? '' }
}

export interface ListLine {
  /** Quote markers (`> `) in front of the list. */
  quote: string
  /** Quote markers and indentation in front of the list marker. */
  prefix: string
  /** Width of the indentation only (quote markers excluded). */
  indent: number
  kind: 'bullet' | 'ordered'
  /** The marker as written: `-`, `*`, `+`, `1.` or `2)`. */
  marker: string
  number: number | null
  delimiter: '.' | ')' | null
  /** Whitespace between the marker and the content. */
  spacing: string
  /** Checkbox state of a task item. */
  task: ' ' | 'x' | 'X' | null
  /** Column where the item's text begins, after the marker and the checkbox. */
  contentColumn: number
  /** Column where nested content must start to belong to this item. */
  childColumn: number
  content: string
}

const LIST_PATTERN =
  /^((?:[ \t]*>[ \t]?)*)([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)(\[[ xX]\](?:[ \t]+|$))?/
const RULE_PATTERN = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/

export function parseListLine(line: string): ListLine | null {
  const match = LIST_PATTERN.exec(line)
  if (!match) return null
  const [whole, quote, indent, marker, spacing, checkbox] = match
  // `* * *`, `- - -` and `---` are thematic breaks, not list items.
  if (RULE_PATTERN.test(line)) return null
  const ordered = /^\d/.test(marker)
  const task = checkbox ? (checkbox[1] as ' ' | 'x' | 'X') : null
  // A bullet needs a space after it; `-text` is not a list.
  if (spacing === '' && line.length > whole.length) return null
  return {
    quote,
    prefix: quote + indent,
    indent: indent.replace(/\t/g, '    ').length,
    kind: ordered ? 'ordered' : 'bullet',
    marker,
    number: ordered ? Number.parseInt(marker, 10) : null,
    delimiter: ordered ? (marker.endsWith(')') ? ')' : '.') : null,
    spacing,
    task,
    contentColumn: whole.length,
    childColumn: quote.length + indent.length + marker.length + Math.max(1, spacing.length),
    content: line.slice(whole.length)
  }
}

const QUOTE_PATTERN = /^((?:[ \t]*>[ \t]?)+)(.*)$/

export interface EnterEdit {
  /** Replaces the whole line when set (used to exit a list or quote). */
  replaceLine?: string
  /** Text to insert at the cursor (starts with a line break). */
  insert?: string
}

function nearestParent(lines: LineAccess, from: number, indent: number): ListLine | null {
  for (let line = from - 1; line >= 0; line--) {
    const text = lines.get(line)
    if (text.trim() === '') continue
    const parsed = parseListLine(text)
    if (parsed && parsed.indent < indent) return parsed
    if (!parsed && !/^[ \t]/.test(text)) return null
  }
  return null
}

function previousSibling(lines: LineAccess, from: number, item: ListLine): ListLine | null {
  for (let line = from - 1; line >= 0; line--) {
    const text = lines.get(line)
    if (text.trim() === '') return null
    const parsed = parseListLine(text)
    if (parsed && parsed.indent === item.indent && parsed.kind === item.kind) return parsed
    if (parsed && parsed.indent < item.indent) return null
    if (!parsed && !/^[ \t]/.test(text)) return null
  }
  return null
}

/**
 * What Enter should do at `column` on `lineIndex`, or null to leave Enter to the editor.
 * Continues lists (bullets, ordered, tasks) and quotes; an empty item exits the list.
 */
export function enterEdit(lines: LineAccess, lineIndex: number, column: number): EnterEdit | null {
  const text = lines.get(lineIndex)
  const item = parseListLine(text)

  if (item) {
    // Enter inside the marker itself should simply break the line.
    if (column < item.contentColumn) return null
    if (item.content.trim() === '') {
      if (column < text.length) return null
      // Empty nested item: move it out one level; empty top-level item: end the list.
      if (item.indent > 0) {
        const parent = nearestParent(lines, lineIndex, item.indent)
        const target = ' '.repeat(parent ? parent.indent : 0)
        return {
          replaceLine: `${item.quote}${target}${item.marker}${item.spacing || ' '}${item.task ? '[ ] ' : ''}`
        }
      }
      return { replaceLine: item.quote.replace(/[ \t]+$/, '') }
    }

    let marker = item.marker
    if (item.kind === 'ordered') {
      const sibling = previousSibling(lines, lineIndex, item)
      const keep = sibling !== null && sibling.number === item.number
      marker = `${keep ? item.number : item.number! + 1}${item.delimiter}`
    }
    const spacing = item.spacing || ' '
    return { insert: `\n${item.prefix}${marker}${spacing}${item.task ? '[ ] ' : ''}` }
  }

  const quote = QUOTE_PATTERN.exec(text)
  if (quote) {
    if (column < quote[1].length) return null
    if (quote[2].trim() === '') {
      return column < text.length ? null : { replaceLine: '' }
    }
    return { insert: `\n${quote[1]}` }
  }
  return null
}

export interface IndentChange {
  /** Line index -> new text, for the item and the lines nested under it. */
  lines: Map<number, string>
  /** Columns the item moved (negative when outdented). */
  delta: number
}

function subtreeEnd(lines: LineAccess, from: number, indent: number): number {
  let end = from
  for (let line = from + 1; line < lines.count; line++) {
    const text = lines.get(line)
    if (text.trim() === '') continue
    const leading = text.length - text.trimStart().length
    if (leading <= indent) break
    end = line
  }
  return end
}

function shift(text: string, delta: number): string {
  if (text.trim() === '') return text
  if (delta > 0) return ' '.repeat(delta) + text
  const leading = text.length - text.trimStart().length
  return text.slice(Math.min(leading, -delta))
}

/** Indents a list item (with everything nested under it) one level, or returns null. */
export function indentListItem(lines: LineAccess, lineIndex: number): IndentChange | null {
  const item = parseListLine(lines.get(lineIndex))
  if (!item || item.prefix.includes('>')) return null
  let previous: ListLine | null = null
  for (let line = lineIndex - 1; line >= 0; line--) {
    const text = lines.get(line)
    if (text.trim() === '') return null
    const parsed = parseListLine(text)
    if (parsed) {
      previous = parsed
      break
    }
    if (!/^[ \t]/.test(text)) return null
  }
  if (!previous) return null
  const target = item.indent < previous.indent ? previous.indent : previous.childColumn
  const delta = target - item.indent
  if (delta <= 0 || (item.indent >= previous.indent && item.indent >= previous.childColumn)) {
    return null
  }
  return applyShift(lines, lineIndex, item.indent, delta)
}

/** Outdents a list item (with its nested lines) to the level of its parent's siblings. */
export function outdentListItem(lines: LineAccess, lineIndex: number): IndentChange | null {
  const item = parseListLine(lines.get(lineIndex))
  if (!item || item.indent === 0 || item.prefix.includes('>')) return null
  const parent = nearestParent(lines, lineIndex, item.indent)
  const target = parent ? parent.indent : 0
  return applyShift(lines, lineIndex, item.indent, target - item.indent)
}

function applyShift(
  lines: LineAccess,
  lineIndex: number,
  indent: number,
  delta: number
): IndentChange {
  const changed = new Map<number, string>()
  const end = subtreeEnd(lines, lineIndex, indent)
  for (let line = lineIndex; line <= end; line++) {
    changed.set(line, shift(lines.get(line), delta))
  }
  return { lines: changed, delta }
}
