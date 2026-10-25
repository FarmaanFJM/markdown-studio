/**
 * Commands of the publishing features: document settings, figures and captions, cross-references,
 * citations and sources, generated contents and bibliography, and publications (several chapters
 * combined). Registered with the others so the palette, menus, shortcuts and toolbar share them.
 */
import { commands } from './commands'
import { registerCommands } from './registry'
import {
  captionTable,
  insertCitation,
  insertCrossReference,
  insertFigure,
  openDocumentSettingsDialog,
  openSources,
  publishingBlocks
} from '../publishing/editing'
import { exportPublication, previewPublication } from '../publishing/PublicationPanel'
import { usePublicationView } from '../state/publicationView'

registerCommands([
  {
    id: 'document.settings',
    title: 'Document Settings…',
    category: 'Document',
    run: () => void openDocumentSettingsDialog(),
    needsDocument: true,
    keywords:
      'page size margins header footer columns two column title author language toc number sections front matter'
  },
  {
    id: 'insert.figure',
    title: 'Insert Figure with Caption…',
    category: 'Insert',
    run: () => void insertFigure(),
    needsDocument: true,
    keywords: 'image caption numbered figure label'
  },
  {
    id: 'insert.captionTable',
    title: 'Add Caption to Table…',
    category: 'Insert',
    run: () => void captionTable(),
    needsDocument: true,
    keywords: 'table caption numbered label'
  },
  {
    id: 'insert.crossReference',
    title: 'Insert Cross-reference…',
    category: 'Insert',
    run: () => void insertCrossReference(),
    needsDocument: true,
    keywords: 'reference figure table section see'
  },
  {
    id: 'insert.citation',
    title: 'Insert Citation…',
    category: 'Insert',
    run: () => void insertCitation(),
    needsDocument: true,
    keywords: 'cite source reference apa bibliography'
  },
  {
    id: 'sources.manage',
    title: 'Manage Sources…',
    category: 'Document',
    run: () => void openSources(),
    needsDocument: true,
    keywords: 'bibliography references library bibtex csl add source apa'
  },
  {
    id: 'insert.contents',
    title: 'Insert Automatic Table of Contents',
    category: 'Insert',
    run: publishingBlocks.contents,
    needsDocument: true,
    keywords: 'toc contents [TOC] updates'
  },
  {
    id: 'insert.bibliography',
    title: 'Insert Bibliography Here',
    category: 'Insert',
    run: publishingBlocks.bibliography,
    needsDocument: true,
    keywords: 'references literature list apa'
  },
  {
    id: 'insert.listOfFigures',
    title: 'Insert List of Figures',
    category: 'Insert',
    run: publishingBlocks.listOfFigures,
    needsDocument: true
  },
  {
    id: 'insert.listOfTables',
    title: 'Insert List of Tables',
    category: 'Insert',
    run: publishingBlocks.listOfTables,
    needsDocument: true
  },
  {
    id: 'publication.show',
    title: 'Show Publication Panel',
    category: 'View',
    run: commands.showPublication,
    keywords: 'book chapters combine project'
  },
  {
    id: 'publication.preview',
    title: 'Preview Publication',
    category: 'View',
    run: previewPublication,
    keywords: 'book chapters combine'
  },
  {
    id: 'publication.previewDocument',
    title: 'Preview the Active Document (not the publication)',
    category: 'View',
    run: () => usePublicationView.getState().setPreviewing(false)
  },
  {
    id: 'publication.export',
    title: 'Export Publication…',
    category: 'File',
    run: () => void exportPublication(),
    keywords: 'book chapters combine pdf html'
  }
])
