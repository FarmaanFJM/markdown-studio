/**
 * The single definition of Markdown Studio's keyboard shortcuts. The renderer's key handler, the
 * native menu accelerators, the Keyboard Shortcuts dialog and docs/KEYBOARD_SHORTCUTS.md (checked
 * by a unit test) all read from this list, so they cannot drift apart.
 *
 * Standard Markdown shortcuts own their familiar keys: Ctrl/Cmd+B is bold and Ctrl/Cmd+I italic.
 * Application commands that used those keys were moved (the sidebar toggle is Ctrl/Cmd+\).
 */

export type ShortcutGroup =
  'Formatting' | 'Insert' | 'Editing' | 'Navigation' | 'Preview' | 'Files' | 'Application'

export interface ShortcutSpec {
  /** The command id: a registry command, or a menu command such as `file.save`. */
  id: string
  label: string
  group: ShortcutGroup
  /** Normalised key: a lower-case letter, digit or symbol, or a name such as `tab`. */
  key: string
  /** Ctrl on Windows and Linux, Cmd on macOS. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
  /** Only while the source editor has the keyboard focus (so text fields keep their keys). */
  editorOnly?: boolean
  /** Defers to Monaco while the editor, its find widget or a text field has focus. */
  editorHandles?: boolean
  /** Handled by Monaco itself; listed for the reference and the menu only. */
  native?: boolean
  /** A second key combination for the same command. */
  alternative?: Pick<ShortcutSpec, 'key' | 'mod' | 'shift' | 'alt'>
  /** Replaces the combination on macOS, where the platform convention differs. */
  mac?: Pick<ShortcutSpec, 'key' | 'mod' | 'shift' | 'alt'>
}

const md = { group: 'Formatting', editorOnly: true } as const
const ins = { group: 'Insert', editorOnly: true } as const

export const SHORTCUTS: ShortcutSpec[] = [
  // Formatting: the standard Markdown shortcuts.
  { id: 'markdown.bold', label: 'Bold', key: 'b', mod: true, ...md },
  { id: 'markdown.italic', label: 'Italic', key: 'i', mod: true, ...md },
  { id: 'markdown.strikethrough', label: 'Strikethrough', key: 'x', mod: true, shift: true, ...md },
  { id: 'markdown.inlineCode', label: 'Inline code', key: 'e', mod: true, ...md },
  { id: 'insert.link', label: 'Insert or edit link', key: 'k', mod: true, ...md },
  { id: 'markdown.orderedList', label: 'Numbered list', key: '7', mod: true, shift: true, ...md },
  { id: 'markdown.bulletList', label: 'Bulleted list', key: '8', mod: true, shift: true, ...md },
  { id: 'markdown.blockquote', label: 'Blockquote', key: '9', mod: true, shift: true, ...md },
  { id: 'markdown.taskList', label: 'Task list', key: '0', mod: true, shift: true, ...md },
  {
    id: 'markdown.headingUp',
    label: 'Increase heading level',
    key: ']',
    mod: true,
    shift: true,
    ...md
  },
  {
    id: 'markdown.headingDown',
    label: 'Decrease heading level',
    key: '[',
    mod: true,
    shift: true,
    ...md
  },

  // Insert.
  { id: 'insert.image', label: 'Insert image', key: 'g', mod: true, shift: true, ...ins },
  { id: 'insert.codeBlock', label: 'Insert code block', key: 'm', mod: true, shift: true, ...ins },
  {
    id: 'insert.figure',
    label: 'Insert figure with caption',
    key: 'f',
    mod: true,
    shift: true,
    ...ins
  },
  {
    id: 'insert.crossReference',
    label: 'Insert cross-reference',
    key: 'r',
    mod: true,
    shift: true,
    ...ins
  },
  { id: 'insert.citation', label: 'Insert citation', key: 'c', mod: true, shift: true, ...ins },
  { id: 'table.insert', label: 'Insert table', key: 't', mod: true, shift: true, ...ins },
  { id: 'table.format', label: 'Format table', key: 'f', alt: true, shift: true, ...ins },
  {
    id: 'table.editVisually',
    label: 'Edit table visually',
    key: 't',
    alt: true,
    shift: true,
    ...ins
  },

  // Editing (Monaco).
  { id: 'edit.undo', label: 'Undo', group: 'Editing', key: 'z', mod: true, native: true },
  {
    id: 'edit.redo',
    label: 'Redo',
    group: 'Editing',
    key: 'y',
    mod: true,
    native: true,
    alternative: { key: 'z', mod: true, shift: true },
    mac: { key: 'z', mod: true, shift: true }
  },
  {
    id: 'edit.selectAll',
    label: 'Select all',
    group: 'Editing',
    key: 'a',
    mod: true,
    native: true
  },
  { id: 'edit.find', label: 'Find', group: 'Editing', key: 'f', mod: true, editorHandles: true },
  {
    id: 'edit.replace',
    label: 'Replace',
    group: 'Editing',
    key: 'h',
    mod: true,
    editorHandles: true,
    mac: { key: 'f', mod: true, alt: true }
  },

  // Navigation.
  {
    id: 'palette.open',
    label: 'Command palette',
    group: 'Navigation',
    key: 'p',
    mod: true,
    shift: true
  },
  {
    id: 'navigate.heading',
    label: 'Go to heading',
    group: 'Navigation',
    key: 'o',
    mod: true,
    shift: true
  },
  {
    id: 'view.nextTab',
    label: 'Next tab',
    group: 'Navigation',
    key: 'tab',
    mod: true,
    alternative: { key: 'pagedown', mod: true }
  },
  {
    id: 'view.previousTab',
    label: 'Previous tab',
    group: 'Navigation',
    key: 'tab',
    mod: true,
    shift: true,
    alternative: { key: 'pageup', mod: true }
  },

  // Preview.
  {
    id: 'view.togglePreview',
    label: 'Show or hide the preview',
    group: 'Preview',
    key: 'v',
    mod: true,
    shift: true
  },

  // Files.
  { id: 'file.new', label: 'New Markdown file', group: 'Files', key: 'n', mod: true },
  {
    id: 'template.newDocument',
    label: 'New file from template',
    group: 'Files',
    key: 'n',
    mod: true,
    shift: true
  },
  { id: 'file.open', label: 'Open file', group: 'Files', key: 'o', mod: true },
  { id: 'file.save', label: 'Save', group: 'Files', key: 's', mod: true },
  { id: 'file.saveAs', label: 'Save as', group: 'Files', key: 's', mod: true, shift: true },
  { id: 'file.closeEditor', label: 'Close editor tab', group: 'Files', key: 'w', mod: true },
  { id: 'file.export', label: 'Export…', group: 'Files', key: 'u', mod: true, shift: true },

  // Application.
  {
    id: 'view.toggleSidebar',
    label: 'Show or hide the sidebar',
    group: 'Application',
    key: '\\',
    mod: true
  },
  {
    id: 'view.explorer',
    label: 'Show Explorer',
    group: 'Application',
    key: 'e',
    mod: true,
    shift: true
  },
  { id: 'view.settings', label: 'Settings', group: 'Application', key: ',', mod: true },
  {
    id: 'publication.show',
    label: 'Publication panel',
    group: 'Application',
    key: 'j',
    mod: true,
    shift: true
  },
  {
    id: 'document.settings',
    label: 'Document settings',
    group: 'Application',
    key: 'd',
    mod: true,
    shift: true
  },
  {
    id: 'view.toggleWordWrap',
    label: 'Toggle word wrap',
    group: 'Application',
    key: 'z',
    alt: true
  },
  {
    id: 'view.fontIncrease',
    label: 'Increase editor font size',
    group: 'Application',
    key: '=',
    mod: true
  },
  {
    id: 'view.fontDecrease',
    label: 'Decrease editor font size',
    group: 'Application',
    key: '-',
    mod: true
  },
  {
    id: 'view.fontReset',
    label: 'Reset editor font size',
    group: 'Application',
    key: '0',
    mod: true
  }
]

/** Shortcuts Monaco handles itself, shown in the reference but never registered by the app. */
export const EDITOR_SHORTCUTS: { keys: string; macKeys?: string; label: string }[] = [
  { keys: 'Ctrl+/', macKeys: 'Cmd+/', label: 'Toggle line comment' },
  { keys: 'Alt+Up / Alt+Down', macKeys: 'Option+Up / Option+Down', label: 'Move line up / down' },
  {
    keys: 'Shift+Alt+Up / Shift+Alt+Down',
    macKeys: 'Shift+Option+Up / Shift+Option+Down',
    label: 'Copy line up / down'
  },
  { keys: 'Ctrl+D', macKeys: 'Cmd+D', label: 'Add selection to next match' },
  { keys: 'Tab / Shift+Tab', label: 'Indent / outdent; nest list items; move between table cells' },
  { keys: 'Enter', label: 'Continue a list or quote; Enter on an empty item ends it' },
  { keys: 'Ctrl+Space', macKeys: 'Ctrl+Space', label: 'Show Markdown suggestions' },
  { keys: 'Ctrl+.', macKeys: 'Cmd+.', label: 'Quick Fix' },
  { keys: '/ on an empty line', label: 'Slash commands' },
  { keys: 'F8 / Shift+F8', label: 'Next / previous problem' }
]

type Combination = Pick<ShortcutSpec, 'key' | 'mod' | 'shift' | 'alt'>

const KEY_NAMES: Record<string, string> = { tab: 'Tab', pagedown: 'PageDown', pageup: 'PageUp' }

/** The combination for a platform: the macOS variant where there is one. */
export function combinationFor(spec: ShortcutSpec, platform: string): Combination {
  return platform === 'darwin' && spec.mac ? spec.mac : spec
}

function describe(combination: Combination, platform: string): string {
  const mac = platform === 'darwin'
  const parts: string[] = []
  if (combination.mod) parts.push(mac ? 'Cmd' : 'Ctrl')
  if (combination.shift) parts.push('Shift')
  if (combination.alt) parts.push(mac ? 'Option' : 'Alt')
  parts.push(KEY_NAMES[combination.key] ?? combination.key.toUpperCase())
  return parts.join('+')
}

/** Display text such as `Ctrl+Shift+8`; both combinations when there are two, joined by " / ". */
export function shortcutLabel(spec: ShortcutSpec, platform: string): string {
  const main = describe(combinationFor(spec, platform), platform)
  if (!spec.alternative || (platform === 'darwin' && spec.mac)) return main
  return `${main} / ${describe(spec.alternative, platform)}`
}

/** The Electron accelerator for the menu (`CmdOrCtrl+Shift+8`); menu accelerators are display-only. */
export function shortcutAccelerator(spec: ShortcutSpec, platform: string): string {
  const c = combinationFor(spec, platform)
  const parts: string[] = []
  if (c.mod) parts.push('CmdOrCtrl')
  if (c.shift) parts.push('Shift')
  if (c.alt) parts.push('Alt')
  const key: Record<string, string> = {
    tab: 'Tab',
    pagedown: 'PageDown',
    pageup: 'PageUp',
    '\\': '\\'
  }
  parts.push(key[c.key] ?? c.key.toUpperCase())
  return parts.join('+')
}

export function shortcutFor(id: string): ShortcutSpec | undefined {
  return SHORTCUTS.find((s) => s.id === id)
}

/** Every combination bound on a platform with the commands that use it, to spot duplicates. */
export function bindingsByCombination(platform: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const spec of SHORTCUTS) {
    const combos = [combinationFor(spec, platform)]
    if (spec.alternative && !(platform === 'darwin' && spec.mac)) combos.push(spec.alternative)
    for (const combination of combos) {
      const label = describe(combination, platform)
      map.set(label, [...(map.get(label) ?? []), spec.id])
    }
  }
  return map
}
