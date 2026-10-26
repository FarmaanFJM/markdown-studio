import { AI_LIMITS, type AiTaskKind, type AiTaskResult } from '@shared/ai/types'
import { BLOCK_MESSAGES } from '@shared/ai/availability'
import { api } from '../bridge'
import { monaco } from '../editor/monaco'
import { notify } from '../state/ui'
import { currentAvailability, useAi } from './state'

type Editor = monaco.editor.IStandaloneCodeEditor

let counter = 0

/** Sends one task to the configured provider and reports a failure to the user. */
export async function runTask(
  editor: Editor,
  kind: AiTaskKind,
  instruction: string,
  range: monaco.Range,
  quiet = false,
  signal?: { onCancel(listener: () => void): void }
): Promise<AiTaskResult> {
  const model = editor.getModel()
  if (!model) return { ok: false, code: 'disabled', message: 'No document is open.' }
  const availability = currentAvailability()
  if (!availability.available) {
    const message = BLOCK_MESSAGES[availability.blocked ?? 'off']
    if (!quiet) notify('info', message)
    return { ok: false, code: 'disabled', message }
  }

  const start = range.getStartPosition()
  const end = range.getEndPosition()
  const full = model.getFullModelRange()
  const task = {
    kind,
    before: model.getValueInRange(
      monaco.Range.fromPositions(
        model.getPositionAt(Math.max(0, model.getOffsetAt(start) - AI_LIMITS.beforeCharacters)),
        start
      )
    ),
    after: model.getValueInRange(
      monaco.Range.fromPositions(
        end,
        model.getPositionAt(
          Math.min(
            model.getOffsetAt(full.getEndPosition()),
            model.getOffsetAt(end) + AI_LIMITS.afterCharacters
          )
        )
      )
    ),
    selection: kind === 'rewrite' ? model.getValueInRange(range) : '',
    instruction,
    language: ''
  }

  const id = `ai-${Date.now()}-${counter++}`
  signal?.onCancel(() => void api.ai.cancel(id))
  useAi.setState({ busy: id })
  try {
    const result = await api.ai.run(id, task)
    if (!result.ok && result.code !== 'cancelled' && !quiet) notify('error', result.message)
    return result
  } catch {
    if (!quiet) notify('error', 'The AI request could not be started.')
    return { ok: false, code: 'network', message: 'The AI request could not be started.' }
  } finally {
    if (useAi.getState().busy === id) useAi.setState({ busy: null })
  }
}
