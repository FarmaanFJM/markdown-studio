import { parseListLine, type LineAccess } from './lists'

/**
 * Pure Markdown formatting transformations. Each function receives the document lines and the
 * selection and returns edit plans; the editor adapter applies them as one undoable operation.
 * Only the lines a command is meant to change are ever touched.
 */

export interface Position {
  /** 0-based line. */
  line: number
  /** 0-based column (UTF-16 offset within the line). */
  column: number
}

export interface Selection {
  start: Position
  end: Position
}

export interface EditPlan {
  range: Selection
  /** Replacement text; line breaks are `\n` (the editor converts to the model's EOL). */
  text: string
}

export interface Anchor {
  /** Index into `plans`. */
  plan: number
  /** Offset into that plan's text. */
  offset: number
}

export interface EditResult {
  plans: EditPlan[]
  /** Where the selection goes afterwards; the editor keeps its own selection when omitted. */
  select?: { start: Anchor; end: Anchor }
}

export const EMPTY_RESULT: EditResult = { plans: [] }

export function isCollapsed(selection: Selection): boolean {
  return (
    selection.start.line === selection.end.line && selection.start.column === selection.end.column
  )
}

// --- Inline styles --------------------------------------------------------------------------

export type InlineStyleName = 'bold' | 'italic' | 'strikethrough' | 'code'

export const INLINE_MARKERS: Record<InlineStyleName, string> = {
  bold: '**',
  italic: '*',
  strikethrough: '~~',
  code: '`'
}

const WORD_CHARACTER = /[\p{L}\p{N}_]/u

interface Segment {
  line: number
  from: number
  to: number
}

function segmentsOf(lines: LineAccess, selection: Selection): Segment[] {
  const segments: Segment[] = []
  for (let line = selection.start.line; line <= selection.end.line; line++) {
    const text = lines.get(line)
    let from = line === selection.start.line ? selection.start.column : 0
    let to = line === selection.end.line ? selection.end.column : text.length
    while (from < to && /\s/.test(text[from])) from++
    while (to > from && /\s/.test(text[to - 1])) to--
    if (from < to) segments.push({ line, from, to })
  }
  return segments
}

function wordAround(text: string, column: number): { from: number; to: number } | null {
  let from = column
  let to = column
  while (from > 0 && WORD_CHARACTER.test(text[from - 1])) from--
  while (to < text.length && WORD_CHARACTER.test(text[to])) to++
  return from < to ? { from, to } : null
}

function runLength(text: string, index: number, step: 1 | -1, character: string): number {
  let count = 0
  for (let i = index; i >= 0 && i < text.length && text[i] === character; i += step) count++
  return count
}

interface Detected {
  /** Where the markers are relative to the segment. */
  where: 'inside' | 'outside'
  count: number
}

/** Whether `text[from, to)` is already wrapped by the style, either by its own edges or around it. */
function detect(text: string, from: number, to: number, style: InlineStyleName): Detected | null {
  const marker = INLINE_MARKERS[style]
  const character = marker[0]
  const inner = text.slice(from, to)
  const candidates = style === 'italic' ? ['*', '_'] : style === 'bold' ? ['*', '_'] : [character]
  const fits = (count: number): number => {
    switch (style) {
      case 'bold':
        return count >= 2 ? 2 : 0
      case 'italic':
        return count % 2 === 1 ? 1 : 0
      case 'strikethrough':
        return count >= 2 ? 2 : 0
      case 'code':
        return count
    }
  }

  for (const c of candidates) {
    const leading = runLength(inner, 0, 1, c)
    const trailing = runLength(inner, inner.length - 1, -1, c)
    if (leading < inner.length && trailing < inner.length) {
      const count = fits(Math.min(leading, trailing))
      if (count > 0) return { where: 'inside', count }
    }
    const before = runLength(text, from - 1, -1, c)
    const after = runLength(text, to, 1, c)
    const count = fits(Math.min(before, after))
    if (count > 0) return { where: 'outside', count }
  }
  return null
}

function wrapWith(style: InlineStyleName, inner: string): { text: string; offset: number } {
  if (style !== 'code') {
    const marker = INLINE_MARKERS[style]
    return { text: marker + inner + marker, offset: marker.length }
  }
  const longest = Math.max(0, ...(inner.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  const padded = /^`|`$/.test(inner) ? ` ${inner} ` : inner
  return {
    text: fence + padded + fence,
    offset: fence.length + (padded.length - inner.length) / 2
  }
}

/**
 * Toggles bold, italic, strikethrough or inline code on the selection. With nothing selected
 * the word at the cursor is used, or an empty marker pair is inserted around the cursor.
 */
export function toggleInline(
  lines: LineAccess,
  selection: Selection,
  style: InlineStyleName
): EditResult {
  const collapsed = isCollapsed(selection)
  let segments: Segment[]
  let cursorColumn = 0

  if (collapsed) {
    const { line, column } = selection.start
    const text = lines.get(line)
    cursorColumn = column
    const word = wordAround(text, column)
    if (!word) {
      // Between an empty marker pair: remove it. Otherwise insert one around the cursor.
      const marker = INLINE_MARKERS[style]
      if (
        text.slice(column - marker.length, column) === marker &&
        text.slice(column, column + marker.length) === marker
      ) {
        return {
          plans: [
            {
              range: {
                start: { line, column: column - marker.length },
                end: { line, column: column + marker.length }
              },
              text: ''
            }
          ],
          select: { start: { plan: 0, offset: 0 }, end: { plan: 0, offset: 0 } }
        }
      }
      return {
        plans: [{ range: selection, text: marker + marker }],
        select: {
          start: { plan: 0, offset: marker.length },
          end: { plan: 0, offset: marker.length }
        }
      }
    }
    segments = [{ line, ...word }]
  } else {
    segments = segmentsOf(lines, selection)
  }
  if (segments.length === 0) return EMPTY_RESULT

  const detected = segments.map((s) => detect(lines.get(s.line), s.from, s.to, style))
  const removing = detected.every((d) => d !== null)

  const plans: EditPlan[] = []
  const selects: Anchor[][] = []
  segments.forEach((segment, i) => {
    const text = lines.get(segment.line)
    const inner = text.slice(segment.from, segment.to)
    const found = detected[i]
    if (removing && found) {
      if (found.where === 'inside') {
        const stripped = inner.slice(found.count, inner.length - found.count)
        plans.push({
          range: {
            start: { line: segment.line, column: segment.from },
            end: { line: segment.line, column: segment.to }
          },
          text: stripped
        })
        selects.push([
          {
            plan: plans.length - 1,
            offset: collapsed ? Math.max(0, cursorColumn - segment.from - found.count) : 0
          },
          {
            plan: plans.length - 1,
            offset: collapsed
              ? Math.max(0, cursorColumn - segment.from - found.count)
              : stripped.length
          }
        ])
      } else {
        plans.push({
          range: {
            start: { line: segment.line, column: segment.from - found.count },
            end: { line: segment.line, column: segment.to + found.count }
          },
          text: inner
        })
        const at = collapsed ? cursorColumn - segment.from : 0
        selects.push([
          { plan: plans.length - 1, offset: at },
          { plan: plans.length - 1, offset: collapsed ? at : inner.length }
        ])
      }
    } else if (!found) {
      const wrapped = wrapWith(style, inner)
      plans.push({
        range: {
          start: { line: segment.line, column: segment.from },
          end: { line: segment.line, column: segment.to }
        },
        text: wrapped.text
      })
      const at = collapsed ? wrapped.offset + (cursorColumn - segment.from) : wrapped.offset
      selects.push([
        { plan: plans.length - 1, offset: at },
        { plan: plans.length - 1, offset: collapsed ? at : wrapped.offset + inner.length }
      ])
    }
  })
  if (plans.length === 0) return EMPTY_RESULT
  return {
    plans,
    select: { start: selects[0][0], end: selects[selects.length - 1][1] }
  }
}

// --- Line-oriented styles ---------------------------------------------------------------------

/** Replaces the text of whole lines, touching only those that actually change. */
function rewriteLines(
  lines: LineAccess,
  selection: Selection,
  isProtected: (line: number) => boolean,
  transform: (text: string, index: number, block: string[]) => string
): EditResult {
  const first = selection.start.line
  // A selection that ends at column 0 of the next line does not include that line.
  const last =
    selection.end.line > first && selection.end.column === 0
      ? selection.end.line - 1
      : selection.end.line
  const before: string[] = []
  for (let line = first; line <= last; line++) before.push(lines.get(line))
  const after = before.map((text, i) =>
    isProtected(first + i) ? text : transform(text, first + i, before)
  )

  let head = 0
  while (head < before.length && before[head] === after[head]) head++
  if (head === before.length) return EMPTY_RESULT
  let tail = 0
  while (
    tail < before.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++
  }

  const startLine = first + head
  const endLine = last - tail
  const text = after.slice(head, after.length - tail).join('\n')
  const plan: EditPlan = {
    range: {
      start: { line: startLine, column: 0 },
      end: { line: endLine, column: lines.get(endLine).length }
    },
    text
  }

  if (isCollapsed(selection)) {
    const delta =
      after[selection.start.line - first].length - before[selection.start.line - first].length
    const base = selection.start.column + delta
    const offsetInPlan = Math.max(0, Math.min(base, after[selection.start.line - first].length))
    const lineOffset = after
      .slice(head, selection.start.line - first)
      .reduce((sum, line) => sum + line.length + 1, 0)
    const anchor = { plan: 0, offset: Math.max(0, lineOffset + offsetInPlan) }
    return { plans: [plan], select: { start: anchor, end: anchor } }
  }
  return {
    plans: [plan],
    select: { start: { plan: 0, offset: 0 }, end: { plan: 0, offset: text.length } }
  }
}

const HEADING_PATTERN = /^([ \t]{0,3})(#{1,6})([ \t]+|$)/

export function headingLevelOf(text: string): number {
  return HEADING_PATTERN.exec(text)?.[2].length ?? 0
}

function withHeading(text: string, level: number): string {
  const match = HEADING_PATTERN.exec(text)
  const rest = match ? text.slice(match[0].length) : text.trimStart()
  const indent = match ? match[1] : ''
  if (level === 0) return indent + rest
  return `${indent}${'#'.repeat(level)} ${rest}`
}

/**
 * Sets the heading level of the selected lines. Choosing the level a line already has turns it
 * back into a paragraph; level 0 always does.
 */
export function setHeading(
  lines: LineAccess,
  selection: Selection,
  level: number,
  isProtected: (line: number) => boolean
): EditResult {
  const lastLine =
    selection.end.line > selection.start.line && selection.end.column === 0
      ? selection.end.line - 1
      : selection.end.line
  let allSame = true
  for (let line = selection.start.line; line <= lastLine; line++) {
    const text = lines.get(line)
    if (text.trim() !== '' && !isProtected(line) && headingLevelOf(text) !== level) allSame = false
  }
  const target = allSame ? 0 : level
  return rewriteLines(lines, selection, isProtected, (text) =>
    text.trim() === '' ? text : withHeading(text, target)
  )
}

/** Raises or lowers heading levels by `delta`; plain lines become level 1 or 2 when raised. */
export function shiftHeading(
  lines: LineAccess,
  selection: Selection,
  delta: 1 | -1,
  isProtected: (line: number) => boolean
): EditResult {
  return rewriteLines(lines, selection, isProtected, (text) => {
    if (text.trim() === '') return text
    const current = headingLevelOf(text)
    // Raising a paragraph produces a heading at the lowest level that still fits in; lowering
    // the top level returns to a paragraph.
    const next = current === 0 ? (delta > 0 ? 2 : 0) : Math.max(0, Math.min(6, current - delta))
    return withHeading(text, next)
  })
}

export type ListKind = 'bullet' | 'ordered' | 'task'

const BARE_MARKER = /^((?:[ \t]*>[ \t]?)*)([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/

function stripListMarker(text: string): { prefix: string; indent: string; content: string } {
  const match = BARE_MARKER.exec(text)
  if (match && parseListLine(text)) {
    return { prefix: match[1], indent: match[2], content: text.slice(match[0].length) }
  }
  const leading = /^((?:[ \t]*>[ \t]?)*)([ \t]*)/.exec(text)!
  return { prefix: leading[1], indent: leading[2], content: text.slice(leading[0].length) }
}

function hasListKind(text: string, kind: ListKind): boolean {
  const item = parseListLine(text)
  if (!item) return false
  if (kind === 'ordered') return item.kind === 'ordered'
  if (kind === 'task') return item.kind === 'bullet' && item.task !== null
  return item.kind === 'bullet' && item.task === null
}

/**
 * Converts the selected lines to a list of the given kind, or back to plain lines when they are
 * all already in that list kind. Indentation and quote markers are kept; ordered items are
 * numbered per nesting level.
 */
export function toggleList(
  lines: LineAccess,
  selection: Selection,
  kind: ListKind,
  isProtected: (line: number) => boolean
): EditResult {
  const first = selection.start.line
  const last =
    selection.end.line > first && selection.end.column === 0
      ? selection.end.line - 1
      : selection.end.line
  let candidates = 0
  let matching = 0
  for (let line = first; line <= last; line++) {
    const text = lines.get(line)
    if (text.trim() === '' || isProtected(line)) continue
    candidates++
    if (hasListKind(text, kind)) matching++
  }
  const removing = candidates > 0 && matching === candidates

  const counters = new Map<number, number>()
  return rewriteLines(lines, selection, isProtected, (text) => {
    if (text.trim() === '') {
      counters.clear()
      return text
    }
    const { prefix, indent, content } = stripListMarker(text)
    if (removing) return prefix + indent + content
    const width = indent.replace(/\t/g, '    ').length
    for (const level of [...counters.keys()]) if (level > width) counters.delete(level)
    let marker: string
    if (kind === 'ordered') {
      const number = (counters.get(width) ?? 0) + 1
      counters.set(width, number)
      marker = `${number}. `
    } else {
      const existing = parseListLine(text)
      const bullet = existing?.kind === 'bullet' ? existing.marker : '-'
      marker = kind === 'task' ? `${bullet} [ ] ` : `${bullet} `
    }
    const kept = parseListLine(text)
    // Keep the checkbox state when turning a task list into another task list.
    if (kind === 'task' && kept?.task)
      return `${prefix}${indent}${kept.marker} [${kept.task}] ${content}`
    return prefix + indent + marker + content
  })
}

/** Quotes the selected lines, or removes one quote level when they are all quoted already. */
export function toggleQuote(
  lines: LineAccess,
  selection: Selection,
  isProtected: (line: number) => boolean
): EditResult {
  const first = selection.start.line
  const last =
    selection.end.line > first && selection.end.column === 0
      ? selection.end.line - 1
      : selection.end.line
  let content = 0
  let quoted = 0
  for (let line = first; line <= last; line++) {
    const text = lines.get(line)
    if (isProtected(line) || text.trim() === '') continue
    content++
    if (/^[ \t]{0,3}>/.test(text)) quoted++
  }
  const removing = content > 0 && quoted === content

  return rewriteLines(lines, selection, isProtected, (text, index) => {
    if (removing) return text.replace(/^([ \t]{0,3})>[ \t]?/, '$1')
    if (text.trim() === '') {
      // Blank lines between quoted lines keep the quote in one piece.
      const inside = index > first && index < last
      return inside ? '>' : text
    }
    return `> ${text}`
  })
}

// --- Applying plans -----------------------------------------------------------------------

function newlineCount(text: string): number {
  let count = 0
  for (const ch of text) if (ch === '\n') count++
  return count
}

interface PlacedPlan {
  index: number
  /** Where the plan's replacement text starts in the edited document. */
  start: Position
}

/** Where each plan's text lands in the document after all (non-overlapping) plans are applied. */
function placePlans(plans: EditPlan[]): PlacedPlan[] {
  const ordered = plans
    .map((plan, index) => ({ plan, index }))
    .sort(
      (a, b) =>
        a.plan.range.start.line - b.plan.range.start.line ||
        a.plan.range.start.column - b.plan.range.start.column
    )
  const placed: PlacedPlan[] = []
  let previousEndOriginal: Position = { line: 0, column: 0 }
  let previousEndNew: Position = { line: 0, column: 0 }
  for (const { plan, index } of ordered) {
    const { start, end } = plan.range
    const lineGap = start.line - previousEndOriginal.line
    const newStart: Position =
      lineGap === 0
        ? {
            line: previousEndNew.line,
            column: previousEndNew.column + (start.column - previousEndOriginal.column)
          }
        : { line: previousEndNew.line + lineGap, column: start.column }
    const parts = plan.text.split('\n')
    const newEnd: Position =
      parts.length === 1
        ? { line: newStart.line, column: newStart.column + plan.text.length }
        : { line: newStart.line + parts.length - 1, column: parts[parts.length - 1].length }
    placed.push({ index, start: newStart })
    previousEndOriginal = end
    previousEndNew = newEnd
  }
  return placed
}

function positionInPlan(placed: PlacedPlan, text: string, offset: number): Position {
  const clamped = Math.max(0, Math.min(offset, text.length))
  const before = text.slice(0, clamped)
  const breaks = newlineCount(before)
  if (breaks === 0) return { line: placed.start.line, column: placed.start.column + clamped }
  return { line: placed.start.line + breaks, column: clamped - (before.lastIndexOf('\n') + 1) }
}

/** Resolves a result's selection anchors to positions in the edited document. */
export function resolveSelection(result: EditResult): Selection | null {
  if (!result.select) return null
  const placed = placePlans(result.plans)
  const resolve = (anchor: Anchor) => {
    const entry = placed.find((p) => p.index === anchor.plan)!
    return positionInPlan(entry, result.plans[anchor.plan].text, anchor.offset)
  }
  return { start: resolve(result.select.start), end: resolve(result.select.end) }
}

/** Maps a position outside the plans' ranges to its place in the edited document. */
export function mapPosition(plans: EditPlan[], position: Position): Position {
  const placed = placePlans(plans)
  let previousEndOriginal: Position = { line: 0, column: 0 }
  let previousEndNew: Position = { line: 0, column: 0 }
  for (const entry of placed) {
    const plan = plans[entry.index]
    const isBefore =
      position.line < plan.range.start.line ||
      (position.line === plan.range.start.line && position.column <= plan.range.start.column)
    if (isBefore) break
    const parts = plan.text.split('\n')
    previousEndOriginal = plan.range.end
    previousEndNew =
      parts.length === 1
        ? { line: entry.start.line, column: entry.start.column + plan.text.length }
        : { line: entry.start.line + parts.length - 1, column: parts[parts.length - 1].length }
    const afterEnd =
      position.line > plan.range.end.line ||
      (position.line === plan.range.end.line && position.column >= plan.range.end.column)
    if (!afterEnd) return previousEndNew
  }
  const gap = position.line - previousEndOriginal.line
  return gap === 0
    ? {
        line: previousEndNew.line,
        column: previousEndNew.column + (position.column - previousEndOriginal.column)
      }
    : { line: previousEndNew.line + gap, column: position.column }
}
