import type { DirEntry } from '@shared/ipc'
import { isImagePath, isMarkdownPath } from '@shared/fileTypes'
import { basename, dirname, relativePath, stripExtension } from '@shared/paths'
import { api, errorMessage } from '../bridge'
import { getActiveEditor } from '../editor/models'
import { insertImages } from '../editor/imageDrop'
import { activeDocument, handlePathDeleted, openDocument } from '../state/documents'
import { dialogs, notify, type ContextMenuItem } from '../state/ui'
import { useWorkspace } from '../state/workspace'
import { FolderPicker } from '../references/FolderPicker'
import { moveWithReferences, renameWithReferences } from '../references/moveWithReferences'

const isWindows = window.markdownStudio.platform === 'win32'
const trashName = isWindows ? 'Recycle Bin' : 'Trash'
const fileManagerName =
  window.markdownStudio.platform === 'darwin'
    ? 'Finder'
    : isWindows
      ? 'File Explorer'
      : 'File Manager'

export function validateName(value: string): string | null {
  const name = value.trim()
  if (!name) return 'A name is required.'
  if (/[/\\]/.test(name)) return 'Names cannot contain "/" or "\\".'
  if (/[<>:"|?*]/.test(name)) return 'Names cannot contain < > : " | ? *'
  return null
}

export async function createFileIn(directory: string): Promise<void> {
  const name = await dialogs.prompt({
    title: 'New Markdown File',
    label: 'File name',
    initialValue: 'Untitled.md',
    selectLength: 'Untitled'.length,
    confirmLabel: 'Create',
    validate: validateName
  })
  if (!name) return
  try {
    const created = await api.fs.createFile(directory, name)
    const workspace = useWorkspace.getState()
    workspace.expand(directory)
    await workspace.refresh([directory])
    workspace.select(created)
    if (isMarkdownPath(created)) await openDocument(created)
  } catch (error) {
    notify('error', errorMessage(error))
  }
}

export async function createFolderIn(directory: string): Promise<void> {
  const name = await dialogs.prompt({
    title: 'New Folder',
    label: 'Folder name',
    initialValue: '',
    confirmLabel: 'Create',
    validate: validateName
  })
  if (!name) return
  try {
    const created = await api.fs.createDirectory(directory, name)
    const workspace = useWorkspace.getState()
    workspace.expand(directory)
    await workspace.refresh([directory])
    workspace.select(created)
  } catch (error) {
    notify('error', errorMessage(error))
  }
}

export async function renameEntry(entry: DirEntry): Promise<void> {
  const stem = entry.kind === 'file' ? stripExtension(entry.name) : entry.name
  const name = await dialogs.prompt({
    title: entry.kind === 'directory' ? 'Rename Folder' : 'Rename File',
    label: 'New name',
    initialValue: entry.name,
    selectLength: stem.length,
    confirmLabel: 'Rename',
    validate: validateName
  })
  if (!name || name === entry.name) return
  // Markdown references to the file (and a document's own relative links) are kept valid.
  await renameWithReferences(entry, name)
}

/** Moves a file or folder into another folder of the workspace, chosen in a dialog. */
export async function moveEntry(entry: DirEntry): Promise<void> {
  const root = useWorkspace.getState().root
  if (!root) return
  const target = await dialogs.custom<string>((done) => (
    <FolderPicker
      title={`Move "${entry.name}" to…`}
      root={root}
      start={dirname(entry.path)}
      excluded={entry.path}
      confirmLabel="Move Here"
      onDone={done}
    />
  ))
  if (target) await moveWithReferences(entry, target)
}

export async function deleteEntry(entry: DirEntry): Promise<void> {
  const confirmed = await dialogs.confirm({
    title: entry.kind === 'directory' ? 'Delete Folder' : 'Delete File',
    message: `Are you sure you want to delete "${entry.name}"${entry.kind === 'directory' ? ' and its contents' : ''}?`,
    detail: `It will be moved to the ${trashName}.`,
    confirmLabel: `Move to ${trashName}`,
    danger: true
  })
  if (!confirmed) return
  try {
    await api.fs.trash(entry.path)
  } catch (error) {
    const permanent = await dialogs.confirm({
      title: 'Delete Permanently?',
      message: `"${entry.name}" could not be moved to the ${trashName}.`,
      detail: `${errorMessage(error)}\nDeleting it permanently cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      danger: true
    })
    if (!permanent) return
    try {
      await api.fs.deletePermanently(entry.path)
    } catch (inner) {
      notify('error', errorMessage(inner))
      return
    }
  }
  handlePathDeleted(entry.path)
  const workspace = useWorkspace.getState()
  if (workspace.selected === entry.path) workspace.select(null)
  await workspace.refresh([dirname(entry.path)])
}

export async function insertImageReference(path: string): Promise<void> {
  const editor = getActiveEditor()
  if (!editor || !activeDocument()) {
    notify('info', 'Open a Markdown document first.')
    return
  }
  await insertImages(editor, [{ path, external: false }], editor.getPosition())
}

/** Opens a file from the Explorer: Markdown in the editor, anything else is not editable here. */
export function openEntry(entry: DirEntry): void {
  if (entry.kind === 'directory') return
  if (isMarkdownPath(entry.path)) void openDocument(entry.path)
  else if (isImagePath(entry.path)) {
    notify('info', `Drag ${entry.name} into a document, or right-click it to insert a reference.`)
  } else {
    notify('info', `Markdown Studio edits Markdown files (.md, .markdown).`)
  }
}

function copyText(text: string): void {
  navigator.clipboard.writeText(text).then(
    () => notify('info', 'Copied to clipboard.'),
    () => notify('error', 'Could not access the clipboard.')
  )
}

export function entryContextMenu(entry: DirEntry | null, folder: string): ContextMenuItem[] {
  const root = useWorkspace.getState().root
  const items: ContextMenuItem[] = []
  const target = entry?.kind === 'directory' ? entry.path : entry ? dirname(entry.path) : folder
  if (entry?.kind === 'file' && isMarkdownPath(entry.path)) {
    items.push({ label: 'Open', run: () => openEntry(entry) })
  }
  if (entry?.kind === 'file' && isImagePath(entry.path)) {
    items.push({
      label: 'Insert Image Reference',
      run: () => void insertImageReference(entry.path),
      disabled: !activeDocument()
    })
  }
  items.push(
    {
      label: 'New Markdown File…',
      run: () => void createFileIn(target),
      separatorBefore: items.length > 0
    },
    { label: 'New Folder…', run: () => void createFolderIn(target) }
  )
  if (entry) {
    items.push(
      {
        label: `Reveal in ${fileManagerName}`,
        run: () => void api.shell.showItemInFolder(entry.path),
        separatorBefore: true
      },
      { label: 'Copy Path', run: () => copyText(entry.path) },
      {
        label: 'Copy Relative Path',
        run: () => copyText((root && relativePath(root, entry.path)) ?? basename(entry.path))
      },
      { label: 'Rename…', run: () => void renameEntry(entry), separatorBefore: true },
      { label: 'Move…', run: () => void moveEntry(entry) },
      { label: 'Delete', run: () => void deleteEntry(entry), danger: true }
    )
  } else {
    items.push({
      label: 'Refresh',
      run: () => void useWorkspace.getState().refresh(),
      separatorBefore: true
    })
  }
  return items
}
