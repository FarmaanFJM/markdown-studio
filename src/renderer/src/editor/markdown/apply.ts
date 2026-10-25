import {
  mapPosition,
  resolveSelection,
  type EditPlan,
  type EditResult,
  type Selection as PureSelection
} from '@shared/markdown/formatting'
import { monaco } from '../monaco'
import { toMonaco, toPure } from './model'

const SOURCE = 'markdown-studio'

function overlaps(a: EditPlan, b: EditPlan): boolean {
  const before = (x: { line: number; column: number }, y: { line: number; column: number }) =>
    x.line < y.line || (x.line === y.line && x.column < y.column)
  return before(a.range.start, b.range.end) && before(b.range.start, a.range.end)
}

/**
 * Applies edit results (one per cursor) as a single undoable operation. Only the replaced ranges
 * change; line endings of inserted text follow the model, so CRLF documents stay CRLF.
 */
export function applyResults(
  editor: monaco.editor.IStandaloneCodeEditor,
  results: EditResult[],
  originals: PureSelection[]
): boolean {
  const model = editor.getModel()
  if (!model) return false

  // Results are ordered by cursor position, so each cursor's final selection only depends on
  // the edits made before it (which `resolveSelection` accounts for).
  const plans: EditPlan[] = []
  const finals: (PureSelection | null)[] = []
  const used: PureSelection[] = []
  results.forEach((result, index) => {
    // Drop results whose edits would collide with an earlier cursor's edits.
    if (result.plans.some((plan) => plans.some((existing) => overlaps(plan, existing)))) return
    const offset = plans.length
    plans.push(...result.plans)
    used.push(originals[index])
    finals.push(
      result.select
        ? resolveSelection({
            plans,
            select: {
              start: {
                plan: result.select.start.plan + offset,
                offset: result.select.start.offset
              },
              end: { plan: result.select.end.plan + offset, offset: result.select.end.offset }
            }
          })
        : null
    )
  })
  if (plans.length === 0) return false

  const eol = model.getEOL()
  const edits = plans.map((plan) => ({
    range: new monaco.Range(
      plan.range.start.line + 1,
      plan.range.start.column + 1,
      plan.range.end.line + 1,
      plan.range.end.column + 1
    ),
    text: plan.text.replace(/\n/g, eol)
  }))

  const selections = finals.map(
    (selection, index) =>
      selection ?? {
        start: mapPosition(plans, used[index].start),
        end: mapPosition(plans, used[index].end)
      }
  )

  editor.pushUndoStop()
  editor.executeEdits(SOURCE, edits, selections.map(toMonaco))
  editor.pushUndoStop()
  return true
}

export function currentSelections(editor: monaco.editor.IStandaloneCodeEditor): PureSelection[] {
  return (editor.getSelections() ?? []).map(toPure)
}
