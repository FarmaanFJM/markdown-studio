import { analyzeDocument, isInCodeBlock, type DocumentAnalysis } from '@shared/markdown/analysis'
import type { LineAccess } from '@shared/markdown/lists'
import type { Selection as PureSelection } from '@shared/markdown/formatting'
import { monaco } from '../monaco'

const cache = new WeakMap<
  monaco.editor.ITextModel,
  { version: number; analysis: DocumentAnalysis }
>()

/**
 * Structure of the model's current text. One parse is shared by the outline, completions,
 * commands and diagnostics for as long as the text does not change.
 */
export function analysisFor(model: monaco.editor.ITextModel): DocumentAnalysis {
  const version = model.getVersionId()
  const cached = cache.get(model)
  if (cached && cached.version === version) return cached.analysis
  const analysis = analyzeDocument(model.getValue())
  cache.set(model, { version, analysis })
  return analysis
}

export function lineAccess(model: monaco.editor.ITextModel): LineAccess {
  return { count: model.getLineCount(), get: (line) => model.getLineContent(line + 1) }
}

export function toPure(selection: monaco.Selection): PureSelection {
  const start = selection.getStartPosition()
  const end = selection.getEndPosition()
  return {
    start: { line: start.lineNumber - 1, column: start.column - 1 },
    end: { line: end.lineNumber - 1, column: end.column - 1 }
  }
}

export function toMonaco(selection: PureSelection): monaco.Selection {
  return new monaco.Selection(
    selection.start.line + 1,
    selection.start.column + 1,
    selection.end.line + 1,
    selection.end.column + 1
  )
}

/** Lines in which Markdown must not be rewritten: fenced and indented code. */
export function protectedLines(model: monaco.editor.ITextModel): (line: number) => boolean {
  const analysis = analysisFor(model)
  return (line) => isInCodeBlock(analysis, line)
}

/** Above this size, per-keystroke features avoid re-parsing the whole document. */
export const LARGE_DOCUMENT_CHARACTERS = 200_000

const FENCE_PATTERN = /^[ \t>]*(`{3,}|~{3,})(.*)$/

/**
 * Whether `line` (0-based) is inside a fenced code block, found by scanning fence markers
 * instead of parsing. Used for very large documents, where a full parse on every Enter would
 * be noticeable; it follows CommonMark's fence rules (matching character, closing at least as
 * long, no info string on the closing fence).
 */
export function insideFenceByScan(model: monaco.editor.ITextModel, line: number): boolean {
  let open: { char: string; length: number } | null = null
  for (let number = 1; number <= line; number++) {
    const match = FENCE_PATTERN.exec(model.getLineContent(number))
    if (!match) continue
    const char = match[1][0]
    if (!open) {
      if (char === '`' && match[2].includes('`')) continue // an inline code span, not a fence
      open = { char, length: match[1].length }
    } else if (char === open.char && match[1].length >= open.length && match[2].trim() === '') {
      open = null
    }
  }
  return open !== null
}

/** True for code blocks, using the cheap scan for very large documents. */
export function isCodeAt(model: monaco.editor.ITextModel, line: number): boolean {
  if (model.getValueLength() > LARGE_DOCUMENT_CHARACTERS) return insideFenceByScan(model, line)
  return isInCodeBlock(analysisFor(model), line)
}
