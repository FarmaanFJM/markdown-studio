import { isImagePath } from '@shared/fileTypes'
import {
  altTextFromFileName,
  buildImageReference,
  imagePathForDocument
} from '@shared/imageReference'
import { basename, dirname, isPathInside, joinPath, relativePath } from '@shared/paths'
import { api, errorMessage } from '../bridge'
import { activeDocument, type EditorDocument } from '../state/documents'
import { useSettings } from '../state/settings'
import { notify } from '../state/ui'
import { useWorkspace } from '../state/workspace'
import { monaco } from './monaco'

/** MIME type used when dragging files out of the Explorer. Value: newline-separated paths. */
export const EXPLORER_DRAG_MIME = 'application/x-markdown-studio-paths'

export interface DropSource {
  path: string
  /** True for files dropped from the operating system rather than the Explorer. */
  external: boolean
}

export function dataTransferHasDroppable(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  const types = [...dataTransfer.types]
  return types.includes(EXPLORER_DRAG_MIME) || types.includes('Files')
}

export function sourcesFromDataTransfer(dataTransfer: DataTransfer): DropSource[] {
  const internal = dataTransfer.getData(EXPLORER_DRAG_MIME)
  if (internal) {
    return internal
      .split('\n')
      .filter(Boolean)
      .map((path) => ({ path, external: false }))
  }
  return [...dataTransfer.files]
    .map((file) => api.assets.pathForFile(file))
    .filter(Boolean)
    .map((path) => ({ path, external: true }))
}

interface Placement {
  /** Directory that relative references are computed from. */
  baseDirectory: string
  /** Absolute directory that receives imported images. */
  assetDirectory: string
}

function placementFor(doc: EditorDocument): Placement | null {
  const root = useWorkspace.getState().root
  const assetFolder = useSettings.getState().settings.assets.directory
  if (doc.path) {
    const baseDirectory = dirname(doc.path)
    const inWorkspace = root !== null && isPathInside(root, doc.path)
    return {
      baseDirectory,
      assetDirectory: joinPath(inWorkspace ? root : baseDirectory, assetFolder)
    }
  }
  if (!root) return null
  return { baseDirectory: root, assetDirectory: joinPath(root, assetFolder) }
}

/**
 * Inserts Markdown image references for the given files at `position` (or the cursor).
 *
 * Workspace images are referenced in place. External images are first copied into the asset
 * folder by the main process, which never overwrites an existing file. The insertion is a
 * single undoable edit, and the alt text of a single image is selected so it can be retyped.
 */
export async function insertImages(
  editor: monaco.editor.IStandaloneCodeEditor,
  sources: DropSource[],
  position: monaco.IPosition | null
): Promise<boolean> {
  const doc = activeDocument()
  const model = editor.getModel()
  if (!doc || !model) return false

  const images = sources.filter((s) => isImagePath(s.path))
  const rejected = sources.filter((s) => !isImagePath(s.path))
  if (rejected.length > 0) {
    notify(
      'error',
      `${rejected.map((s) => basename(s.path)).join(', ')} ${rejected.length === 1 ? 'is' : 'are'} not a supported image (PNG, JPEG, GIF, WebP, SVG, BMP, AVIF).`
    )
  }
  if (images.length === 0) return false

  const placement = placementFor(doc)
  if (!placement) {
    notify('error', 'Save this document or open a folder before inserting images.')
    return false
  }

  // Track the drop point with a decoration so it survives edits made while files are copied.
  const at = position ?? editor.getPosition() ?? { lineNumber: 1, column: 1 }
  const [marker] = model.deltaDecorations(
    [],
    [
      {
        range: new monaco.Range(at.lineNumber, at.column, at.lineNumber, at.column),
        options: { stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
      }
    ]
  )

  const references: { text: string; altOffset: number; altLength: number }[] = []
  const copied: string[] = []
  let range: monaco.Range | null
  try {
    for (const source of images) {
      let imagePath = source.path
      if (source.external) {
        try {
          const imported = await api.assets.importImage(source.path, placement.assetDirectory)
          imagePath = imported.path
          if (imported.copied) copied.push(imported.path)
        } catch (error) {
          notify('error', `Could not import ${basename(source.path)}: ${errorMessage(error)}`)
          continue
        }
      }
      const relative = imagePathForDocument(placement.baseDirectory, imagePath)
      if (relative === null) {
        notify('error', `${basename(imagePath)} is on a different drive than the document.`)
        continue
      }
      // Alt text describes the file the user chose, even if the copy had to be renamed.
      references.push(buildImageReference(altTextFromFileName(source.path), relative))
    }
  } finally {
    // Read the tracked position before removing the marker.
    range = model.isDisposed() ? null : model.getDecorationRange(marker)
    if (!model.isDisposed()) model.deltaDecorations([marker], [])
  }
  if (references.length === 0 || model.isDisposed()) return false

  const start = range ? range.getStartPosition() : new monaco.Position(at.lineNumber, at.column)
  const text = references.map((r) => r.text).join('\n')
  // Edit the model directly: the user may have switched tabs while files were being copied.
  model.pushStackElement()
  model.pushEditOperations(
    editor.getModel() === model ? editor.getSelections() : [],
    [{ range: monaco.Range.fromPositions(start, start), text, forceMoveMarkers: true }],
    () => null
  )
  model.pushStackElement()

  if (editor.getModel() === model) {
    const startOffset = model.getOffsetAt(start)
    if (references.length === 1) {
      const ref = references[0]
      const altStart = model.getPositionAt(startOffset + ref.altOffset)
      const altEnd = model.getPositionAt(startOffset + ref.altOffset + ref.altLength)
      editor.setSelection(monaco.Selection.fromPositions(altStart, altEnd))
    } else {
      editor.setPosition(model.getPositionAt(startOffset + text.length))
    }
    editor.focus()
  }

  if (copied.length > 0) {
    const root = useWorkspace.getState().root
    const shown = copied.map((p) => (root ? (relativePath(root, p) ?? p) : basename(p)))
    notify('success', `Copied ${shown.join(', ')} into the project.`)
    void useWorkspace
      .getState()
      .refresh([placement.assetDirectory, dirname(placement.assetDirectory)])
  }
  return true
}
