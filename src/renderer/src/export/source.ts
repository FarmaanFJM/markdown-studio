import { dirname } from '@shared/paths'
import { documentModels } from '../editor/models'
import type { ExportSource } from '../markdown/exporters'
import { documentName, type EditorDocument } from '../state/documents'
import { useWorkspace } from '../state/workspace'

/** The text and location of a document, as the export pipeline needs them. */
export function exportSourceFor(doc: EditorDocument): ExportSource | null {
  const model = documentModels.get(doc.id)
  if (!model) return null
  return {
    source: model.getValue(),
    fileName: documentName(doc),
    context: {
      documentDirectory: doc.path ? dirname(doc.path) : null,
      workspaceRoot: useWorkspace.getState().root
    }
  }
}
