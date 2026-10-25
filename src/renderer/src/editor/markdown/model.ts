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
