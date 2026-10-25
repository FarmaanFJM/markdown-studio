import type { ExportSource } from '../markdown/exporters'
import { activeDocument, type EditorDocument } from '../state/documents'
import { dialogs, notify } from '../state/ui'
import { exportSourceFor } from '../export/source'
import { useExportSetup } from '../state/exportSetup'
import { ExportDialog } from './ExportDialog'

let open = false

/** Opens the Export dialog for the active document (one at a time). */
export async function openExportDialog(
  format?: 'pdf' | 'html',
  presetId?: string,
  target?: { doc: EditorDocument; source: ExportSource }
): Promise<void> {
  const doc = target?.doc ?? activeDocument()
  const source = target?.source ?? (doc && exportSourceFor(doc))
  if (!doc || !source) {
    notify('info', 'Open a Markdown document to export it.')
    return
  }
  if (open) return
  open = true
  if (presetId !== undefined) useExportSetup.getState().choose(presetId)
  void useExportSetup.getState().loadPresets()
  try {
    await dialogs.custom<null>((done) => (
      <ExportDialog doc={doc} source={source} initialFormat={format} done={() => done(null)} />
    ))
  } finally {
    open = false
  }
}
