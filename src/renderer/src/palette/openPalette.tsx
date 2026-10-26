import { analyzeDocument } from '@shared/markdown/analysis'
import { documentModels, getActiveEditor } from '../editor/models'
import { goToLine } from '../editor/markdown/navigation'
import { formatBinding, KEYBINDINGS } from '../commands/keybindings'
import { APP_COMMANDS, isCommandEnabled, runCommand } from '../commands/registry'
import { activeDocument } from '../state/documents'
import { dialogs, notify } from '../state/ui'
import { CommandPalette, type PaletteItem } from './CommandPalette'

function shortcutFor(commandId: string): string | undefined {
  const binding = KEYBINDINGS.find((b) => b.id === commandId)
  return binding ? formatBinding(binding) : undefined
}

/** The command palette: every Markdown Studio command, searchable by name. */
export async function openCommandPalette(): Promise<void> {
  const items: PaletteItem[] = APP_COMMANDS.filter((c) => c.id !== 'palette.open').map(
    (command) => ({
      id: command.id,
      label: command.title,
      category: command.category,
      hint: shortcutFor(command.id),
      keywords: command.keywords,
      disabled: !isCommandEnabled(command)
    })
  )
  // Commands that can run now come first within the same relevance.
  items.sort((a, b) => Number(a.disabled) - Number(b.disabled))
  const choice = await dialogs.custom<string>((done) => (
    <CommandPalette
      title="Command Palette"
      placeholder="Type a command"
      items={items}
      emptyText="No matching commands"
      onDone={done}
    />
  ))
  if (choice) runCommand(choice)
  else getActiveEditor()?.focus()
}

/** Quick pick over the headings of the active document. */
export async function openHeadingPicker(): Promise<void> {
  const doc = activeDocument()
  const model = documentModels.get(doc?.id ?? null)
  if (!doc || !model) return void notify('info', 'Open a Markdown document first.')
  const headings = analyzeDocument(model.getValue()).headings
  if (headings.length === 0) return void notify('info', 'This document has no headings yet.')
  const top = Math.min(...headings.map((h) => h.level))
  const items: PaletteItem[] = headings.map((heading, i) => ({
    id: String(i),
    label: heading.text || '(empty heading)',
    category: `H${heading.level}`,
    depth: heading.level - top
  }))
  const choice = await dialogs.custom<string>((done) => (
    <CommandPalette
      title="Go to Heading"
      placeholder="Type a heading"
      items={items}
      emptyText="No matching headings"
      onDone={done}
    />
  ))
  if (choice !== null) goToLine(headings[Number(choice)].line)
  else getActiveEditor()?.focus()
}
