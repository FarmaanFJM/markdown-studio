import type { EditResult, Selection } from '@shared/markdown/formatting'
import { linesOf } from '@shared/markdown/lists'
import { splitLines } from '@shared/markdown/analysis'

export function lines(source: string) {
  return linesOf(splitLines(source))
}

/** Position helper: `at(line, column)` with 0-based values. */
export function sel(
  startLine: number,
  startColumn: number,
  endLine = startLine,
  endColumn = startColumn
): Selection {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn }
  }
}

/** Selection covering `needle` (first occurrence) in `source`. */
export function selectText(source: string, needle: string, occurrence = 0): Selection {
  let index = -1
  for (let i = 0; i <= occurrence; i++) index = source.indexOf(needle, index + 1)
  if (index < 0) throw new Error(`"${needle}" not found`)
  return range(source, index, index + needle.length)
}

export function range(source: string, from: number, to: number): Selection {
  const toPosition = (offset: number) => {
    const before = source.slice(0, offset).split('\n')
    return { line: before.length - 1, column: before[before.length - 1].length }
  }
  return { start: toPosition(from), end: toPosition(to) }
}

function offsetOf(source: string, line: number, column: number): number {
  const all = source.split('\n')
  let offset = 0
  for (let i = 0; i < line; i++) offset += all[i].length + 1
  return offset + column
}

/** Applies edit plans to `source` and returns the new text and the text left selected. */
export function apply(source: string, result: EditResult): { text: string; selected: string } {
  const edits = result.plans.map((plan, index) => ({
    index,
    from: offsetOf(source, plan.range.start.line, plan.range.start.column),
    to: offsetOf(source, plan.range.end.line, plan.range.end.column),
    text: plan.text
  }))
  const ordered = [...edits].sort((a, b) => a.from - b.from)
  let text = ''
  let cursor = 0
  const newStart = new Map<number, number>()
  for (const edit of ordered) {
    text += source.slice(cursor, edit.from)
    newStart.set(edit.index, text.length)
    text += edit.text
    cursor = edit.to
  }
  text += source.slice(cursor)
  let selected = ''
  if (result.select) {
    const a = newStart.get(result.select.start.plan)! + result.select.start.offset
    const b = newStart.get(result.select.end.plan)! + result.select.end.offset
    selected = text.slice(Math.min(a, b), Math.max(a, b))
  }
  return { text, selected }
}
