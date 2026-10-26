import {
  combinationFor,
  EDITOR_SHORTCUTS,
  SHORTCUTS,
  shortcutLabel,
  type ShortcutSpec
} from '@shared/shortcuts'
import type { MenuCommandMessage } from '@shared/ipc'
import { getActiveEditor } from '../editor/models'
import { isDialogOpen } from '../state/ui'
import { commands, runMenuCommand } from './commands'
import { getCommand, runCommand } from './registry'

export interface KeyBinding {
  /** Normalised key: a lower-case letter, digit or symbol, or a key name such as `tab`. */
  key: string
  mod?: boolean
  shift?: boolean
  alt?: boolean
  label: string
  /** The shortcut definition (shared/shortcuts.ts) this binding comes from. */
  id: string
  /** Bindings that defer to Monaco while the editor (or its find widget) has focus. */
  editorHandles?: boolean
  /** Bindings that only act while the source editor has the keyboard focus. */
  editorOnly?: boolean
}

const isMac = window.markdownStudio.platform === 'darwin'

/** Commands that are neither registry commands nor menu commands. */
const DIRECT: Record<string, () => unknown> = {
  'view.nextTab': commands.nextTab,
  'view.previousTab': commands.previousTab
}

/** Runs a shortcut's command: the direct ones, the registry (palette) commands, then menu commands. */
export function runShortcut(id: string): void {
  const direct = DIRECT[id]
  if (direct) return void direct()
  if (getCommand(id)) return runCommand(id)
  runMenuCommand({ command: id as MenuCommandMessage['command'] })
}

function bindingsOf(spec: ShortcutSpec): KeyBinding[] {
  if (spec.native) return []
  const combinations = [combinationFor(spec, window.markdownStudio.platform)]
  if (spec.alternative && !(isMac && spec.mac)) combinations.push(spec.alternative)
  return combinations.map((c) => ({
    key: c.key,
    mod: c.mod,
    shift: c.shift,
    alt: c.alt,
    label: spec.label,
    id: spec.id,
    editorOnly: spec.editorOnly,
    editorHandles: spec.editorHandles
  }))
}

/** Every application-level binding, generated from the shared shortcut definitions. */
export const KEYBINDINGS: KeyBinding[] = SHORTCUTS.flatMap(bindingsOf)

/** Shortcuts handled by Monaco itself, listed for the shortcuts reference. */
export { EDITOR_SHORTCUTS }

export function formatBinding(binding: KeyBinding): string {
  const spec = SHORTCUTS.find((s) => s.id === binding.id)
  return spec ? shortcutLabel(spec, window.markdownStudio.platform) : binding.key
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
  runShortcut(binding.id)
}
