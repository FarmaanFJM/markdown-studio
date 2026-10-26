import { aiCommands } from '../ai/commands'
import { markdownCommands } from '../editor/markdown/commands'
import { registerRunner } from '../editor/markdown/runners'
import { quickFixCommands } from '../editor/markdown/quickFixActions'
import { tableCommands } from '../editor/markdown/tableCommands'
import { activeDocument } from '../state/documents'
import { commands } from './commands'
import { setRegistryRunner } from './dispatch'

export type CommandCategory =
  | 'File'
  | 'Edit'
  | 'View'
  | 'Format'
  | 'Insert'
  | 'Table'
  | 'Templates'
  | 'Navigate'
  | 'Document'
  | 'Help'

export interface AppCommand {
  id: string
  title: string
  category: CommandCategory
  run(): unknown
  /** Extra words the palette matches besides the title. */
  keywords?: string
  /** Commands that need an open Markdown document. */
  needsDocument?: boolean
}

const doc = true

/**
 * Every user-facing command. The palette, shortcuts, toolbar, context menu and slash commands
 * all run commands from here, so a command behaves the same wherever it is started.
 */
export const APP_COMMANDS: AppCommand[] = [
  { id: 'file.new', title: 'New Markdown File', category: 'File', run: commands.newFile },
  { id: 'file.open', title: 'Open File…', category: 'File', run: commands.openFile },
  {
    id: 'file.openFolder',
    title: 'Open Folder…',
    category: 'File',
    run: () => commands.openFolder()
  },
  { id: 'file.save', title: 'Save', category: 'File', run: commands.save, needsDocument: doc },
  {
    id: 'file.saveAs',
    title: 'Save As…',
    category: 'File',
    run: commands.saveAs,
    needsDocument: doc
  },
  { id: 'file.saveAll', title: 'Save All', category: 'File', run: commands.saveAll },
  {
    id: 'file.export',
    title: 'Export…',
    category: 'File',
    run: commands.exportDialog,
    needsDocument: doc,
    keywords: 'publish pdf html preset page setup'
  },
  {
    id: 'export.active',
    title: 'Export with Current Preset',
    category: 'File',
    run: commands.exportWithActiveSetup,
    needsDocument: doc,
    keywords: 'publish pdf html quick'
  },
  {
    id: 'file.exportHtml',
    title: 'Export as HTML…',
    category: 'File',
    run: commands.exportHtml,
    needsDocument: doc
  },
  {
    id: 'file.exportPdf',
    title: 'Export as PDF…',
    category: 'File',
    run: commands.exportPdf,
    needsDocument: doc
  },
  {
    id: 'file.closeEditor',
    title: 'Close Editor Tab',
    category: 'File',
    run: commands.closeEditor,
    needsDocument: doc
  },
  { id: 'file.closeFolder', title: 'Close Folder', category: 'File', run: commands.closeFolder },

  { id: 'edit.find', title: 'Find', category: 'Edit', run: commands.find, needsDocument: doc },
  {
    id: 'edit.replace',
    title: 'Replace',
    category: 'Edit',
    run: commands.replace,
    needsDocument: doc
  },

  {
    id: 'view.toggleSidebar',
    title: 'Toggle Sidebar',
    category: 'View',
    run: commands.toggleSidebar
  },
  { id: 'view.explorer', title: 'Show Explorer', category: 'View', run: commands.showExplorer },
  {
    id: 'view.settings',
    title: 'Open Settings',
    category: 'View',
    run: () => commands.showSettings()
  },
  {
    id: 'view.ai',
    title: 'Show AI Assistant',
    category: 'View',
    run: commands.showAi,
    keywords: 'copilot'
  },
  {
    id: 'ai.continue',
    title: 'AI: Continue Writing',
    category: 'Edit',
    run: aiCommands.continueWriting,
    needsDocument: doc,
    keywords: 'ai suggest complete'
  },
  {
    id: 'ai.rewrite',
    title: 'AI: Rewrite Selection…',
    category: 'Edit',
    run: aiCommands.rewriteSelection,
    needsDocument: doc,
    keywords: 'ai improve grammar shorten formal'
  },
  {
    id: 'ai.toggleDocument',
    title: 'AI: Turn Off/On for This Document',
    category: 'Edit',
    run: aiCommands.toggleForDocument,
    needsDocument: doc,
    keywords: 'ai disable enable'
  },
  {
    id: 'ai.toggleWorkspace',
    title: 'AI: Turn Off/On for This Workspace',
    category: 'Edit',
    run: aiCommands.toggleForWorkspace,
    keywords: 'ai disable enable folder'
  },
  {
    id: 'ai.settings',
    title: 'AI: Open Settings',
    category: 'View',
    run: aiCommands.openSettings,
    keywords: 'ai provider model key'
  },
  {
    id: 'view.previewNone',
    title: 'Close Preview',
    category: 'View',
    run: () => commands.setPreview('none'),
    keywords: 'preview hide'
  },
  {
    id: 'view.previewHtml',
    title: 'Show HTML Preview',
    category: 'View',
    run: () => commands.setPreview('html')
  },
  {
    id: 'view.previewPdf',
    title: 'Show PDF Preview',
    category: 'View',
    run: () => commands.setPreview('pdf')
  },
  {
    id: 'view.togglePreview',
    title: 'Toggle Preview',
    category: 'View',
    run: commands.togglePreview
  },
  {
    id: 'view.explorerTree',
    title: 'Explorer as List',
    category: 'View',
    run: () => commands.setExplorerMode('tree')
  },
  {
    id: 'view.explorerThumbnails',
    title: 'Explorer as Thumbnails',
    category: 'View',
    run: () => commands.setExplorerMode('thumbnails')
  },
  {
    id: 'view.toggleToolbar',
    title: 'Toggle Formatting Toolbar',
    category: 'View',
    run: commands.toggleToolbar
  },
  {
    id: 'view.toggleWordWrap',
    title: 'Toggle Word Wrap',
    category: 'View',
    run: commands.toggleWordWrap
  },
  {
    id: 'view.fontIncrease',
    title: 'Increase Editor Font Size',
    category: 'View',
    run: commands.increaseFontSize
  },
  {
    id: 'view.fontDecrease',
    title: 'Decrease Editor Font Size',
    category: 'View',
    run: commands.decreaseFontSize
  },
  {
    id: 'view.fontReset',
    title: 'Reset Editor Font Size',
    category: 'View',
    run: commands.resetFontSize
  },

  {
    id: 'markdown.bold',
    title: 'Bold',
    category: 'Format',
    run: markdownCommands.bold,
    needsDocument: doc,
    keywords: 'strong'
  },
  {
    id: 'markdown.italic',
    title: 'Italic',
    category: 'Format',
    run: markdownCommands.italic,
    needsDocument: doc,
    keywords: 'emphasis'
  },
  {
    id: 'markdown.strikethrough',
    title: 'Strikethrough',
    category: 'Format',
    run: markdownCommands.strikethrough,
    needsDocument: doc
  },
  {
    id: 'markdown.inlineCode',
    title: 'Inline Code',
    category: 'Format',
    run: markdownCommands.inlineCode,
    needsDocument: doc,
    keywords: 'monospace'
  },
  ...[1, 2, 3, 4, 5, 6].map((level): AppCommand => ({
    id: `markdown.heading${level}`,
    title: `Heading ${level}`,
    category: 'Format',
    run: () => markdownCommands.heading(level)(),
    needsDocument: doc,
    keywords: 'title'
  })),
  {
    id: 'markdown.paragraph',
    title: 'Paragraph (remove heading)',
    category: 'Format',
    run: markdownCommands.paragraph,
    needsDocument: doc,
    keywords: 'heading plain'
  },
  {
    id: 'markdown.headingUp',
    title: 'Increase Heading Level',
    category: 'Format',
    run: markdownCommands.headingUp,
    needsDocument: doc
  },
  {
    id: 'markdown.headingDown',
    title: 'Decrease Heading Level',
    category: 'Format',
    run: markdownCommands.headingDown,
    needsDocument: doc
  },
  {
    id: 'markdown.bulletList',
    title: 'Bulleted List',
    category: 'Format',
    run: markdownCommands.bulletList,
    needsDocument: doc,
    keywords: 'unordered'
  },
  {
    id: 'markdown.orderedList',
    title: 'Numbered List',
    category: 'Format',
    run: markdownCommands.orderedList,
    needsDocument: doc,
    keywords: 'ordered'
  },
  {
    id: 'markdown.taskList',
    title: 'Task List',
    category: 'Format',
    run: markdownCommands.taskList,
    needsDocument: doc,
    keywords: 'checklist todo checkbox'
  },
  {
    id: 'markdown.blockquote',
    title: 'Blockquote',
    category: 'Format',
    run: markdownCommands.blockquote,
    needsDocument: doc,
    keywords: 'quote'
  },

  {
    id: 'insert.link',
    title: 'Insert Link',
    category: 'Insert',
    run: markdownCommands.link,
    needsDocument: doc,
    keywords: 'hyperlink url'
  },
  {
    id: 'insert.image',
    title: 'Insert Image',
    category: 'Insert',
    run: markdownCommands.image,
    needsDocument: doc,
    keywords: 'picture'
  },
  {
    id: 'insert.codeBlock',
    title: 'Insert Code Block',
    category: 'Insert',
    run: markdownCommands.codeBlock,
    needsDocument: doc,
    keywords: 'fence'
  },
  {
    id: 'insert.horizontalRule',
    title: 'Insert Horizontal Rule',
    category: 'Insert',
    run: markdownCommands.horizontalRule,
    needsDocument: doc,
    keywords: 'divider line'
  },
  {
    id: 'insert.details',
    title: 'Insert Collapsible Section',
    category: 'Insert',
    run: () => markdownCommands.insertSnippet('details'),
    needsDocument: doc,
    keywords: 'details summary'
  },

  {
    id: 'table.format',
    title: 'Format Table',
    category: 'Table',
    run: tableCommands.formatAtCursor,
    needsDocument: doc,
    keywords: 'reformat align prettify tidy'
  },
  {
    id: 'table.repair',
    title: 'Repair Table (add missing columns)',
    category: 'Table',
    run: tableCommands.repair,
    needsDocument: doc,
    keywords: 'fix broken mismatch columns delimiter'
  },
  {
    id: 'markdown.formatBlock',
    title: 'Format Markdown Block',
    category: 'Format',
    run: quickFixCommands.formatBlock,
    needsDocument: doc,
    keywords: 'reformat tidy table heading list paragraph spaces'
  },
  {
    id: 'markdown.removeExtraSpaces',
    title: 'Remove Extra Spaces',
    category: 'Format',
    run: quickFixCommands.removeExtraSpaces,
    needsDocument: doc,
    keywords: 'whitespace double spaces collapse'
  },
  {
    id: 'markdown.quickFix',
    title: 'Quick Fix…',
    category: 'Format',
    run: quickFixCommands.showQuickFixes,
    needsDocument: doc,
    keywords: 'lightbulb problem fix suggestion'
  },
  {
    id: 'table.formatSelection',
    title: 'Format Tables in Selection',
    category: 'Table',
    run: tableCommands.formatInSelection,
    needsDocument: doc
  },
  {
    id: 'table.formatAll',
    title: 'Format All Tables',
    category: 'Table',
    run: tableCommands.formatAll,
    needsDocument: doc
  },
  {
    id: 'table.insertRowAbove',
    title: 'Table: Insert Row Above',
    category: 'Table',
    run: tableCommands.insertRowAbove,
    needsDocument: doc
  },
  {
    id: 'table.insertRowBelow',
    title: 'Table: Insert Row Below',
    category: 'Table',
    run: tableCommands.insertRowBelow,
    needsDocument: doc
  },
  {
    id: 'table.deleteRow',
    title: 'Table: Delete Row',
    category: 'Table',
    run: tableCommands.deleteRow,
    needsDocument: doc
  },
  {
    id: 'table.insertColumnLeft',
    title: 'Table: Insert Column Left',
    category: 'Table',
    run: tableCommands.insertColumnLeft,
    needsDocument: doc
  },
  {
    id: 'table.insertColumnRight',
    title: 'Table: Insert Column Right',
    category: 'Table',
    run: tableCommands.insertColumnRight,
    needsDocument: doc
  },
  {
    id: 'table.deleteColumn',
    title: 'Table: Delete Column',
    category: 'Table',
    run: tableCommands.deleteColumn,
    needsDocument: doc
  },
  {
    id: 'table.alignLeft',
    title: 'Table: Align Column Left',
    category: 'Table',
    run: () => tableCommands.alignColumn('left'),
    needsDocument: doc
  },
  {
    id: 'table.alignCenter',
    title: 'Table: Center Column',
    category: 'Table',
    run: () => tableCommands.alignColumn('center'),
    needsDocument: doc
  },
  {
    id: 'table.alignRight',
    title: 'Table: Align Column Right',
    category: 'Table',
    run: () => tableCommands.alignColumn('right'),
    needsDocument: doc
  },
  {
    id: 'table.alignNone',
    title: 'Table: Reset Column Alignment',
    category: 'Table',
    run: () => tableCommands.alignColumn('none'),
    needsDocument: doc
  },

  { id: 'help.shortcuts', title: 'Keyboard Shortcuts', category: 'Help', run: commands.shortcuts },
  { id: 'help.about', title: 'About Markdown Studio', category: 'Help', run: commands.about }
]

const byId = new Map<string, AppCommand>()

/** Adds commands from modules that load after the registry (dialogs, templates, outline...). */
export function registerCommands(more: AppCommand[]): void {
  for (const command of more) {
    if (byId.has(command.id)) continue
    APP_COMMANDS.push(command)
    byId.set(command.id, command)
    registerRunner(command.id, command.run)
  }
}

for (const command of APP_COMMANDS) {
  byId.set(command.id, command)
  registerRunner(command.id, command.run)
}

setRegistryRunner((id) => runCommand(id))

export function getCommand(id: string): AppCommand | undefined {
  return byId.get(id)
}

export function runCommand(id: string): void {
  const command = byId.get(id)
  if (command) void command.run()
}

export function isCommandEnabled(command: AppCommand): boolean {
  return !command.needsDocument || activeDocument() !== null
}
