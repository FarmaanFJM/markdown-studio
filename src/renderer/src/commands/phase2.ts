/**
 * Registers the commands of features that live in their own modules (dialogs, templates, the
 * outline...). Imported once by the application shell so the registry is complete before the
 * editor builds its menus.
 */
import { getActiveEditor } from '../editor/models'
import { fixAllProblems } from '../diagnostics/manager'
import { startTemplateStore } from '../templates/store'
import { templateCommands } from '../templates/flows'
import { insertTableOfContents, updateTableOfContents } from '../outline/toc'
import { openCommandPalette, openHeadingPicker } from '../palette/openPalette'
import { editTableVisually, insertTableVisually } from '../tables/openTableEditor'
import { registerCommands } from './registry'
import './phase3'

startTemplateStore()

registerCommands([
  {
    id: 'problems.next',
    title: 'Go to Next Problem',
    category: 'Navigate',
    run: () => getActiveEditor()?.trigger('palette', 'editor.action.marker.next', null),
    needsDocument: true,
    keywords: 'warning error diagnostics'
  },
  {
    id: 'problems.previous',
    title: 'Go to Previous Problem',
    category: 'Navigate',
    run: () => getActiveEditor()?.trigger('palette', 'editor.action.marker.prev', null),
    needsDocument: true,
    keywords: 'warning error diagnostics'
  },
  {
    id: 'problems.fixAll',
    title: 'Fix All Automatic Style Problems',
    category: 'Format',
    run: fixAllProblems,
    needsDocument: true,
    keywords: 'lint markdownlint spacing'
  },
  {
    id: 'template.newDocument',
    title: 'New File from Template…',
    category: 'Templates',
    run: templateCommands.newDocument,
    keywords: 'create document readme notes report'
  },
  {
    id: 'template.manage',
    title: 'Manage Templates and Snippets…',
    category: 'Templates',
    run: templateCommands.manage,
    keywords: 'edit rename duplicate delete'
  },
  {
    id: 'template.saveDocument',
    title: 'Save Document as Template…',
    category: 'Templates',
    run: templateCommands.saveDocument,
    needsDocument: true
  },
  {
    id: 'template.saveSelection',
    title: 'Save Selection as Snippet or Template…',
    category: 'Templates',
    run: templateCommands.saveSelection,
    needsDocument: true
  },
  {
    id: 'snippet.insertSaved',
    title: 'Insert Saved Snippet…',
    category: 'Templates',
    run: templateCommands.insertSnippet,
    needsDocument: true
  },
  {
    id: 'palette.open',
    title: 'Show All Commands',
    category: 'Navigate',
    run: openCommandPalette
  },
  {
    id: 'navigate.heading',
    title: 'Go to Heading…',
    category: 'Navigate',
    run: openHeadingPicker,
    needsDocument: true,
    keywords: 'outline section jump'
  },
  {
    id: 'toc.insert',
    title: 'Insert Table of Contents',
    category: 'Insert',
    run: insertTableOfContents,
    needsDocument: true,
    keywords: 'contents headings'
  },
  {
    id: 'toc.update',
    title: 'Update Table of Contents',
    category: 'Insert',
    run: () => void updateTableOfContents(),
    needsDocument: true,
    keywords: 'contents headings refresh'
  },
  {
    id: 'table.insert',
    title: 'Insert Table…',
    category: 'Table',
    run: insertTableVisually,
    needsDocument: true,
    keywords: 'grid rows columns'
  },
  {
    id: 'table.editVisually',
    title: 'Edit Table Visually…',
    category: 'Table',
    run: editTableVisually,
    needsDocument: true,
    keywords: 'grid graphical'
  }
])
