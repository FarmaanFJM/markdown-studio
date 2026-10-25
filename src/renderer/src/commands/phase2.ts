/**
 * Registers the commands of features that live in their own modules (dialogs, templates, the
 * outline...). Imported once by the application shell so the registry is complete before the
 * editor builds its menus.
 */
import { openCommandPalette, openHeadingPicker } from '../palette/openPalette'
import { editTableVisually, insertTableVisually } from '../tables/openTableEditor'
import { registerCommands } from './registry'

registerCommands([
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
