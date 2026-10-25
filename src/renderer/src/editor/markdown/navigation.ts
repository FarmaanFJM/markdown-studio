import { getActiveEditor } from '../models'
import { monaco } from '../monaco'

/** Moves the cursor to the start of a 0-based line of the active document and reveals it. */
export function goToLine(line: number, column = 0): void {
  const editor = getActiveEditor()
  const model = editor?.getModel()
  if (!editor || !model) return
  const lineNumber = Math.max(1, Math.min(line + 1, model.getLineCount()))
  const position = new monaco.Position(lineNumber, Math.max(1, column + 1))
  editor.setPosition(position)
  editor.revealPositionInCenterIfOutsideViewport(position, monaco.editor.ScrollType.Smooth)
  editor.focus()
}
