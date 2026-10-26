import { pathsEqual } from '@shared/paths'
import { ancestorFolders, folderForSelection } from '@shared/explorerContext'
import type { ExplorerMode } from '@shared/settings'
import { useSettings } from '../state/settings'
import { useWorkspace } from '../state/workspace'

function isKnownDirectory(path: string): boolean {
  return Object.values(useWorkspace.getState().directories).some((d) =>
    d.entries?.some((e) => e.kind === 'directory' && pathsEqual(e.path, path))
  )
}

/**
 * Switches between the list and thumbnail presentations. Only the presentation changes: the
 * thumbnail view opens at the folder (or the selected file's folder) the user was working in,
 * and the list reveals the folder the thumbnails were showing.
 */
export function setExplorerMode(mode: ExplorerMode): void {
  const workspace = useWorkspace.getState()
  const { root, selected, folder } = workspace
  if (root) {
    if (mode === 'thumbnails') {
      const target = folderForSelection(
        root,
        selected,
        selected !== null && isKnownDirectory(selected),
        folder
      )
      workspace.setFolder(target)
    } else if (folder) {
      // Make the browsed folder visible in the tree, keeping a selected file inside it selected.
      for (const ancestor of ancestorFolders(root, folder)) workspace.expand(ancestor)
      const selectionInside =
        selected !== null &&
        (pathsEqual(selected, folder) || folderForSelection(root, selected, false, null) === folder)
      // The tree has no row for the root, so browsing the root means nothing is selected.
      if (!selectionInside) workspace.select(pathsEqual(folder, root) ? null : folder)
    }
  }
  useSettings.getState().update({ explorer: { mode } })
}
