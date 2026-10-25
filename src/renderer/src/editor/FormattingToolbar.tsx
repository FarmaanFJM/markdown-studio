import {
  Bold,
  Code,
  FileCode,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  Minus,
  Quote,
  Strikethrough,
  Table,
  type LucideIcon
} from 'lucide-react'
import { headingLevelOf } from '@shared/markdown/formatting'
import { formatBinding, KEYBINDINGS } from '../commands/keybindings'
import { runCommand } from '../commands/registry'
import { useDocuments } from '../state/documents'
import { documentModels } from './models'

interface ToolbarButton {
  command: string
  label: string
  Icon: LucideIcon
}

const GROUPS: ToolbarButton[][] = [
  [
    { command: 'markdown.bold', label: 'Bold', Icon: Bold },
    { command: 'markdown.italic', label: 'Italic', Icon: Italic },
    { command: 'markdown.strikethrough', label: 'Strikethrough', Icon: Strikethrough },
    { command: 'markdown.inlineCode', label: 'Inline code', Icon: Code }
  ],
  [
    { command: 'markdown.bulletList', label: 'Bulleted list', Icon: List },
    { command: 'markdown.orderedList', label: 'Numbered list', Icon: ListOrdered },
    { command: 'markdown.taskList', label: 'Task list', Icon: ListChecks },
    { command: 'markdown.blockquote', label: 'Blockquote', Icon: Quote }
  ],
  [
    { command: 'insert.link', label: 'Insert link', Icon: Link },
    { command: 'insert.image', label: 'Insert image', Icon: Image },
    { command: 'insert.codeBlock', label: 'Insert code block', Icon: FileCode },
    { command: 'table.insert', label: 'Insert table', Icon: Table },
    { command: 'insert.horizontalRule', label: 'Insert horizontal rule', Icon: Minus },
    { command: 'toc.insert', label: 'Insert table of contents', Icon: ListTree }
  ]
]

function titleFor({ command, label }: ToolbarButton): string {
  const binding = KEYBINDINGS.find((b) => b.command === command)
  return binding ? `${label} (${formatBinding(binding)})` : label
}

/**
 * A slim row of the most common Markdown commands. It runs the same commands as the shortcuts,
 * the palette and the context menu, and can be hidden in Settings or the View menu.
 */
export function FormattingToolbar() {
  const documentId = useDocuments((s) => s.activeId)
  const line = useDocuments((s) => s.cursor.line)
  // Re-read the heading level when the text changes as well as when the cursor moves.
  useDocuments((s) => s.revision)
  const model = documentModels.get(documentId)
  const level =
    model && line <= model.getLineCount() ? headingLevelOf(model.getLineContent(line)) : 0

  return (
    <div
      className="format-toolbar"
      role="toolbar"
      aria-label="Markdown formatting"
      data-testid="format-toolbar"
    >
      <select
        className="select compact-select"
        aria-label="Heading level"
        value={level}
        onChange={(event) => {
          const chosen = Number(event.target.value)
          runCommand(chosen === 0 ? 'markdown.paragraph' : `markdown.heading${chosen}`)
        }}
      >
        <option value={0}>Paragraph</option>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <option key={n} value={n}>
            Heading {n}
          </option>
        ))}
      </select>
      {GROUPS.map((group, index) => (
        <div className="format-group" role="group" key={index}>
          {group.map((button) => (
            <button
              key={button.command}
              type="button"
              className="icon-button"
              title={titleFor(button)}
              aria-label={button.label}
              data-testid={`format-${button.command}`}
              // Keep the selection and the caret where they are while the button is pressed.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runCommand(button.command)}
            >
              <button.Icon size={15} />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
