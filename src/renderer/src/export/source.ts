import { dirname } from '@shared/paths'
import { applyDocumentPage } from '@shared/publishing/documentSettings'
import type { ExportSetup } from '@shared/export/setup'
import { documentModels } from '../editor/models'
import type { ExportSource } from '../markdown/exporters'
import { documentPublishing } from '../publishing/documentPublishing'
import { documentName, type EditorDocument } from '../state/documents'
import { useWorkspace } from '../state/workspace'

/** The text and location of a document, as the export pipeline needs them. */
export function exportSourceFor(doc: EditorDocument): ExportSource | null {
  const model = documentModels.get(doc.id)
  if (!model) return null
  const source = model.getValue()
  const publishing = documentPublishing(source)
  return {
    source,
    fileName: documentName(doc),
    context: {
      documentDirectory: doc.path ? dirname(doc.path) : null,
      workspaceRoot: useWorkspace.getState().root
    },
    publishing: publishing.options,
    settings: publishing.settings,
    columns: publishing.columns
  }
}

/**
 * The setup with the document's own page choices (front matter) applied: a document that sets
 * its page size, margins, header or footer keeps them whichever preset is active.
 */
export function setupForSource(setup: ExportSetup, source: ExportSource): ExportSetup {
  const settings = source.settings
  return settings ? { ...setup, pdf: applyDocumentPage(setup.pdf, settings) } : setup
}
