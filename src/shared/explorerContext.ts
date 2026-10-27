import { dirname, isPathInside, joinPath, pathsEqual, relativePath } from './paths'

/**
 * The folder the thumbnail view should open at for the current selection: the selected folder
 * itself, the folder containing the selected file, or — when nothing usable is selected — the
 * folder it was last browsing, falling back to the root.
 */
export function folderForSelection(
  root: string,
  selected: string | null,
  selectedIsDirectory: boolean,
  currentFolder: string | null
): string {
  if (selected && pathsEqual(selected, root)) return root
  if (selected && isPathInside(root, selected)) {
    return selectedIsDirectory ? selected : dirname(selected)
  }
  return currentFolder && isPathInside(root, currentFolder) ? currentFolder : root
}

/** Every folder from just below `root` down to `folder`, outermost first (to expand in a tree). */
export function ancestorFolders(root: string, folder: string): string[] {
  if (!isPathInside(root, folder) || pathsEqual(root, folder)) return []
  const relative = relativePath(root, folder)
  const segments = relative ? relative.split('/').filter(Boolean) : []
  return segments.map((_, i) => joinPath(root, ...segments.slice(0, i + 1)))
}
