import { notify, openSettings } from '../state/ui'
import { useSettings } from '../state/settings'
import { activeDocument } from '../state/documents'
import { useWorkspace } from '../state/workspace'
import { requireEditor } from '../editor/markdown/commands'
import { monaco } from '../editor/monaco'
import { pathsEqual } from '@shared/paths'
import { toggledPath, BLOCK_MESSAGES } from '@shared/ai/availability'
import { offerContinuation } from './inline'
import { rewriteWithChoice } from './rewrite'
import { runTask } from './run'
import { currentAvailability } from './state'

export const aiCommands = {
  /** Writes the next sentences as ghost text at the cursor; Tab accepts, Escape dismisses. */
  async continueWriting() {
    const editor = requireEditor()
    const position = editor?.getPosition()
    if (!editor || !position) return
    const availability = currentAvailability()
    if (!availability.available)
      return void notify('info', BLOCK_MESSAGES[availability.blocked ?? 'off'])
    // Copilot answers through the editor's own inline-suggestion request (explicit trigger).
    if (useSettings.getState().settings.ai.provider === 'github-copilot') {
      editor.focus()
      return void editor.trigger('markdown-studio-ai', 'editor.action.inlineSuggest.trigger', null)
    }
    const result = await runTask(editor, 'continue', '', monaco.Range.fromPositions(position))
    if (!result.ok) return
    const current = editor.getPosition()
    if (!current || !current.equals(position)) {
      return void notify('info', 'The cursor moved, so the suggestion was dropped.')
    }
    const text = /^[\s.,;:!?)]/.test(result.text) ? result.text : ` ${result.text}`
    offerContinuation(editor, position, text)
  },

  rewriteSelection: () => void rewriteWithChoice(),

  /** Switches AI off or on for the active (saved) document. */
  toggleForDocument() {
    const doc = activeDocument()
    if (!doc?.path)
      return void notify('info', 'Save the document first; the choice is remembered per file.')
    const { ai } = useSettings.getState().settings
    const disabled = ai.disabledDocuments.some((d) => pathsEqual(d, doc.path!))
    useSettings.getState().update({
      ai: { disabledDocuments: toggledPath(ai.disabledDocuments, doc.path, !disabled) }
    })
  },

  toggleForWorkspace() {
    const root = useWorkspace.getState().root
    if (!root) return void notify('info', 'Open a folder first.')
    const { ai } = useSettings.getState().settings
    const disabled = ai.disabledWorkspaces.some((w) => pathsEqual(w, root))
    useSettings.getState().update({
      ai: { disabledWorkspaces: toggledPath(ai.disabledWorkspaces, root, !disabled) }
    })
  },

  openSettings: () => openSettings('ai')
}
