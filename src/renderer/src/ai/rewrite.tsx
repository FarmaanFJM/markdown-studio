import { isPlausibleRewrite } from '@shared/ai/prompts'
import { REWRITE_PRESETS } from '@shared/ai/types'
import { Modal } from '../dialogs/Modal'
import { requireEditor } from '../editor/markdown/commands'
import { dialogs, notify } from '../state/ui'
import { currentAvailability } from './state'
import { runTask } from './run'

function RewritePreview({
  original,
  suggestion,
  done
}: {
  original: string
  suggestion: string
  done(apply: boolean): void
}) {
  return (
    <Modal
      title="Review the suggestion"
      size="wide"
      className="ai-preview"
      onCancel={() => done(false)}
      footer={
        <>
          <button type="button" className="button" onClick={() => done(false)}>
            Discard
          </button>
          <button
            type="button"
            className="button primary"
            data-autofocus
            data-testid="ai-apply"
            onClick={() => done(true)}
          >
            Replace selection
          </button>
        </>
      }
    >
      <div className="ai-compare">
        <section>
          <h4>Your text</h4>
          <pre data-testid="ai-original">{original}</pre>
        </section>
        <section>
          <h4>Suggestion</h4>
          <pre data-testid="ai-suggestion">{suggestion}</pre>
        </section>
      </div>
      <p className="setting-hint">
        Nothing changes until you replace the selection. Undo restores your text.
      </p>
    </Modal>
  )
}

/** Asks the provider to rewrite the selection and shows the result for approval. */
export async function rewriteSelection(instruction: string): Promise<void> {
  const editor = requireEditor()
  const model = editor?.getModel()
  const selection = editor?.getSelection()
  if (!editor || !model || !selection) return
  if (selection.isEmpty()) return void notify('info', 'Select the text you want to rewrite first.')
  const original = model.getValueInRange(selection)
  const version = model.getVersionId()
  const result = await runTask(editor, 'rewrite', instruction, selection)
  if (!result.ok) return
  if (!isPlausibleRewrite(original, result.text)) {
    return void notify('error', 'The suggestion did not look usable, so nothing was changed.')
  }
  const accepted = await dialogs.custom<boolean>((done) => (
    <RewritePreview original={original} suggestion={result.text} done={done} />
  ))
  if (!accepted) return void editor.focus()
  if (model.isDisposed() || model.getVersionId() !== version) {
    return void notify(
      'error',
      'The document changed meanwhile, so the suggestion was not applied.'
    )
  }
  editor.pushUndoStop()
  editor.executeEdits('markdown-studio-ai', [{ range: selection, text: result.text }])
  editor.pushUndoStop()
  editor.focus()
}

/** Chooses an instruction (or writes one) and rewrites the selection. */
export async function rewriteWithChoice(): Promise<void> {
  const availability = currentAvailability()
  if (!availability.available) return void notify('info', 'AI is not available for this document.')
  const choice = await dialogs.choice({
    title: 'Rewrite selection',
    message: 'What should the AI do with the selected text?',
    options: [
      ...REWRITE_PRESETS.map((p) => ({ value: p.id, label: p.label })),
      { value: 'custom', label: 'Write my own instruction…' }
    ]
  })
  if (!choice) return
  if (choice === 'custom') {
    const instruction = await dialogs.prompt({
      title: 'Rewrite selection',
      label: 'Instruction',
      initialValue: '',
      confirmLabel: 'Rewrite',
      validate: (v) => (v.trim() === '' ? 'Describe what to change.' : null)
    })
    if (instruction) await rewriteSelection(instruction.trim())
    return
  }
  const preset = REWRITE_PRESETS.find((p) => p.id === choice)
  if (preset) await rewriteSelection(preset.instruction)
}
