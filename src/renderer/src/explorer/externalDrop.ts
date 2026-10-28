import { isMarkdownPath } from '@shared/fileTypes'
import { basename, dirname, isPathInside, pathsEqual } from '@shared/paths'
import { api, errorMessage } from '../bridge'
import { EXPLORER_DRAG_MIME } from '../editor/imageDrop'
import { openDocument, activeDocument } from '../state/documents'
import { notify } from '../state/ui'
import { useWorkspace } from '../state/workspace'
import { targetDirectory } from './target'

/** Private drag type for moving entries between folders of the Explorer. */
export const MOVE_DRAG_MIME = 'application/x-markdown-studio-move'

/**
 * True while files or folders from the operating system (Windows Explorer, Finder, ...) are
 * being dragged. Their contents are only readable on drop, so this looks at the types alone.
 * Drags that start inside the application carry their own types and are never "external".
 */
export function carriesExternalFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  const types = [...dataTransfer.types]
  return (
    types.includes('Files') &&
    !types.includes(MOVE_DRAG_MIME) &&
    !types.includes(EXPLORER_DRAG_MIME)
  )
}

/** Absolute paths of the dropped files and folders. Must be called during the drop event. */
export function externalPathsFrom(dataTransfer: DataTransfer): string[] {
  return [...dataTransfer.files].map((file) => api.assets.pathForFile(file)).filter(Boolean)
}

/**
 * Copies dropped files and folders into `folder` (a workspace folder), then makes the result
 * visible: the destination is expanded and the first imported item is selected.
 */
export async function importIntoFolder(paths: string[], folder: string): Promise<boolean> {
  const workspace = useWorkspace.getState()
  const root = workspace.root
  if (!root || !isPathInside(root, folder)) {
    notify('error', 'Open a folder first: dropped files are copied into the open project.')
    return false
  }
  if (paths.length === 0) {
    notify('error', 'The dropped items have no location on disk and could not be imported.')
    return false
  }
  try {
    const result = await api.assets.importExternal(paths, folder)
    await useWorkspace.getState().refresh([folder])
    const after = useWorkspace.getState()
    if (!pathsEqual(folder, root)) after.expand(folder)
    for (const item of result.imported) {
      if (item.kind === 'directory') after.expand(item.path)
    }
    after.select(result.imported[0].path)

    const where = pathsEqual(folder, root) ? 'the project root' : basename(folder)
    const first = result.imported[0]
    const renamed = result.imported.filter((i) => basename(i.path) !== basename(i.source))
    let message: string
    if (result.imported.length === 1) {
      message =
        first.kind === 'directory'
          ? `Imported folder "${basename(first.path)}" (${first.fileCount} ${first.fileCount === 1 ? 'file' : 'files'}) into ${where}.`
          : `Imported "${basename(first.path)}" into ${where}.`
    } else {
      message = `Imported ${result.imported.length} items (${result.fileCount} files) into ${where}.`
    }
    if (renamed.length > 0) {
      message += ` Renamed to avoid overwriting: ${renamed.map((i) => `${basename(i.source)} → ${basename(i.path)}`).join(', ')}.`
    }
    if (result.skipped.length > 0) message += ` Skipped: ${result.skipped.join(', ')}.`
    notify(result.skipped.length > 0 || renamed.length > 0 ? 'info' : 'success', message)
    return true
  } catch (error) {
    notify('error', `Could not import: ${errorMessage(error)}`)
    return false
  }
}

/**
 * Opens dropped Markdown files as documents. Files already in the project are opened where
 * they are; others are first copied into the project (beside the active document, else the
 * Explorer's current folder) so the document no longer depends on the original.
 */
export async function openMarkdownDrops(paths: string[]): Promise<void> {
  const root = useWorkspace.getState().root
  if (!root) {
    notify('error', 'Open a folder first: dropped Markdown files are copied into the open project.')
    return
  }
  const documentPath = activeDocument()?.path
  const folder =
    documentPath && isPathInside(root, documentPath) ? dirname(documentPath) : targetDirectory(root)
  for (const path of paths.filter(isMarkdownPath)) {
    if (isPathInside(root, path)) {
      await openDocument(path)
      continue
    }
    try {
      const result = await api.assets.importExternal([path], folder)
      await useWorkspace.getState().refresh([folder])
      await openDocument(result.imported[0].path)
      notify('success', `Imported "${basename(result.imported[0].path)}" into the project.`)
    } catch (error) {
      notify('error', `Could not import ${basename(path)}: ${errorMessage(error)}`)
    }
  }
}
