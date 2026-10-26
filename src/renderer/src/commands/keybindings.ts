import { getActiveEditor } from '../editor/models'
import { isDialogOpen } from '../state/ui'
import { commands } from './commands'
import { runCommand } from './registry'

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
  /** Bindings that only act while the source editor has the keyboard focus. */
  editorOnly?: boolean
  /** The registry command this shortcut starts, so menus and the palette can show it. */
  command?: string
}

const bind = (
  command: string,
  label: string,
  key: string,
  modifiers: Pick<KeyBinding, 'mod' | 'shift' | 'alt'>,
  editorOnly = true
): KeyBinding => ({
  key,
  ...modifiers,
  label,
  command,
  editorOnly,
  run: () => runCommand(command)
})

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
  { key: 'u', mod: true, shift: true, label: 'Export…', run: commands.exportDialog },
  { key: 'z', alt: true, label: 'Toggle word wrap', run: commands.toggleWordWrap },
  { key: '=', mod: true, label: 'Increase editor font size', run: commands.increaseFontSize },
  { key: '-', mod: true, label: 'Decrease editor font size', run: commands.decreaseFontSize },
  { key: '0', mod: true, label: 'Reset editor font size', run: commands.resetFontSize },
  { key: 'tab', mod: true, label: 'Next tab', run: commands.nextTab },
  { key: 'tab', mod: true, shift: true, label: 'Previous tab', run: commands.previousTab },
  { key: 'pagedown', mod: true, label: 'Next tab', run: commands.nextTab },
  { key: 'pageup', mod: true, label: 'Previous tab', run: commands.previousTab },

  bind('palette.open', 'Command palette', 'p', { mod: true, shift: true }, false),
  bind('navigate.heading', 'Go to heading', 'o', { mod: true, shift: true }, false),
  bind('template.newDocument', 'New file from template', 'n', { mod: true, shift: true }, false),
  bind('markdown.bold', 'Bold', 'b', { mod: true, shift: true }),
  bind('markdown.italic', 'Italic', 'i', { mod: true }),
  bind('markdown.strikethrough', 'Strikethrough', 'x', { mod: true, shift: true }),
  bind('markdown.inlineCode', 'Inline code', 'e', { mod: true }),
  bind('insert.link', 'Insert link', 'k', { mod: true }),
  bind('insert.image', 'Insert image', 'g', { mod: true, shift: true }),
  bind('markdown.headingUp', 'Increase heading level', ']', { mod: true, shift: true }),
  bind('markdown.headingDown', 'Decrease heading level', '[', { mod: true, shift: true }),
  bind('markdown.orderedList', 'Numbered list', '7', { mod: true, shift: true }),
  bind('markdown.bulletList', 'Bulleted list', '8', { mod: true, shift: true }),
  bind('markdown.taskList', 'Task list', '9', { mod: true, shift: true }),
  bind('markdown.blockquote', 'Blockquote', '.', { mod: true, shift: true }),
  bind('insert.codeBlock', 'Insert code block', 'm', { mod: true, shift: true }),
  bind('insert.figure', 'Insert figure with caption', 'f', { mod: true, shift: true }),
  bind('insert.crossReference', 'Insert cross-reference', 'r', { mod: true, shift: true }),
  bind('insert.citation', 'Insert citation', 'c', { mod: true, shift: true }),
  bind('document.settings', 'Document settings', 'd', { mod: true, shift: true }, false),
  bind('publication.show', 'Publication panel', 'j', { mod: true, shift: true }, false),
  bind('table.insert', 'Insert table', 't', { mod: true, shift: true }),
  bind('table.format', 'Format table', 'f', { alt: true, shift: true }),
  bind('table.editVisually', 'Edit table visually', 't', { alt: true, shift: true })
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
  {
    keys: 'Tab / Shift+Tab',
    label: 'Indent / outdent (nest list items, move between table cells)'
  },
  { keys: 'Enter', label: 'Continue a list or quote; Enter on an empty item ends it' },
  { keys: 'Ctrl+Space', label: 'Show Markdown suggestions' },
  { keys: '/ on an empty line', label: 'Slash commands (headings, tables, code blocks, ...)' },
  { keys: 'F8 / Shift+F8', label: 'Next / previous problem' }
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
  Comma: ',',
  BracketLeft: '[',
  BracketRight: ']',
  Period: '.'
}

function normalisedKey(event: KeyboardEvent): string {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase()
  if (CODE_KEYS[event.code]) return CODE_KEYS[event.code]
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase()
  // Shift changes event.key for digits ("*" for 8), but the physical key is what the shortcut names.
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5)
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
  if (binding.editorOnly && !getActiveEditor()?.hasTextFocus()) return
  if (binding.editorHandles) {
    const editor = getActiveEditor()
    if (editor?.hasWidgetFocus() || isTextInput(event.target)) return
  }
  event.preventDefault()
  event.stopPropagation()
  void binding.run()
}
