import { getActiveEditor } from '../editor/models'
import { isDialogOpen } from '../state/ui'
import { commands } from './commands'

export interface KeyBinding {
  /** Normalised key: a lower-case letter, digit or symbol, or a key name such as `tab`. */
  key: string
  mod?: boolean
  shift?: boolean
  alt?: boolean
  label: string
  run: () => unknown
  /** Bindings that defer to Monaco while the editor (or its find widget) has focus. */
  editorHandles?: boolean
}

const isMac = window.markdownStudio.platform === 'darwin'

export const KEYBINDINGS: KeyBinding[] = [
  { key: 'n', mod: true, label: 'New Markdown file', run: commands.newFile },
  { key: 'o', mod: true, label: 'Open file', run: commands.openFile },
  { key: 's', mod: true, label: 'Save', run: commands.save },
  { key: 's', mod: true, shift: true, label: 'Save as', run: commands.saveAs },
  { key: 'w', mod: true, label: 'Close editor tab', run: commands.closeEditor },
  { key: 'f', mod: true, label: 'Find', run: commands.find, editorHandles: true },
  { key: 'h', mod: true, label: 'Replace', run: commands.replace, editorHandles: true },
  { key: 'b', mod: true, label: 'Toggle sidebar', run: commands.toggleSidebar },
  { key: 'e', mod: true, shift: true, label: 'Show Explorer', run: commands.showExplorer },
  { key: ',', mod: true, label: 'Settings', run: commands.showSettings },
  { key: 'v', mod: true, shift: true, label: 'Toggle preview', run: commands.togglePreview },
  { key: 'z', alt: true, label: 'Toggle word wrap', run: commands.toggleWordWrap },
  { key: '=', mod: true, label: 'Increase editor font size', run: commands.increaseFontSize },
  { key: '-', mod: true, label: 'Decrease editor font size', run: commands.decreaseFontSize },
  { key: '0', mod: true, label: 'Reset editor font size', run: commands.resetFontSize },
  { key: 'tab', mod: true, label: 'Next tab', run: commands.nextTab },
  { key: 'tab', mod: true, shift: true, label: 'Previous tab', run: commands.previousTab },
  { key: 'pagedown', mod: true, label: 'Next tab', run: commands.nextTab },
  { key: 'pageup', mod: true, label: 'Previous tab', run: commands.previousTab }
]

/** Shortcuts handled by Monaco itself, listed for the shortcuts reference. */
export const EDITOR_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: `${isMac ? 'Cmd' : 'Ctrl'}+Z`, label: 'Undo' },
  { keys: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y / Ctrl+Shift+Z', label: 'Redo' },
  { keys: `${isMac ? 'Cmd' : 'Ctrl'}+A`, label: 'Select all' },
  { keys: `${isMac ? 'Cmd' : 'Ctrl'}+/`, label: 'Toggle line comment' },
  { keys: 'Alt+Up / Alt+Down', label: 'Move line up / down' },
  { keys: 'Shift+Alt+Up / Shift+Alt+Down', label: 'Copy line up / down' },
  { keys: `${isMac ? 'Cmd' : 'Ctrl'}+D`, label: 'Add selection to next match' },
  { keys: 'Tab / Shift+Tab', label: 'Indent / outdent' }
]

export function formatBinding(binding: KeyBinding): string {
  const parts: string[] = []
  if (binding.mod) parts.push(isMac ? 'Cmd' : 'Ctrl')
  if (binding.shift) parts.push('Shift')
  if (binding.alt) parts.push(isMac ? 'Option' : 'Alt')
  const names: Record<string, string> = { tab: 'Tab', pagedown: 'PageDown', pageup: 'PageUp' }
  parts.push(names[binding.key] ?? binding.key.toUpperCase())
  return parts.join('+')
}

const CODE_KEYS: Record<string, string> = {
  Equal: '=',
  NumpadAdd: '=',
  Minus: '-',
  NumpadSubtract: '-',
  Digit0: '0',
  Numpad0: '0',
  Comma: ','
}

function normalisedKey(event: KeyboardEvent): string {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase()
  if (CODE_KEYS[event.code]) return CODE_KEYS[event.code]
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase()
  if (event.key === '+') return '='
  return event.key.toLowerCase()
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('.monaco-editor')) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Application-level shortcuts, handled in the capture phase so they work regardless of which
 * part of the window has focus. Monaco keeps its own editing shortcuts (undo, redo, find,
 * replace, multi-cursor and so on).
 */
export function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || isDialogOpen()) return
  const mod = isMac ? event.metaKey : event.ctrlKey
  const key = normalisedKey(event)
  const binding = KEYBINDINGS.find(
    (b) =>
      b.key === key && !!b.mod === mod && !!b.shift === event.shiftKey && !!b.alt === event.altKey
  )
  if (!binding) return
  if (binding.editorHandles) {
    const editor = getActiveEditor()
    if (editor?.hasWidgetFocus() || isTextInput(event.target)) return
  }
  event.preventDefault()
  event.stopPropagation()
  void binding.run()
}
