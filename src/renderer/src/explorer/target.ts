import { dirname, pathsEqual } from '@shared/paths'
import { useSettings } from '../state/settings'
import { useWorkspace } from '../state/workspace'

/** Directory that receives new files: the selected folder, the selected file's folder, or the root. */
export function targetDirectory(root: string): string {
  const { selected, folder, directories } = useWorkspace.getState()
  const mode = useSettings.getState().settings.explorer.mode
  if (mode === 'thumbnails') return folder ?? root
  if (!selected) return root
  const isDir = Object.values(directories).some((d) =>
    d.entries?.some((e) => e.kind === 'directory' && pathsEqual(e.path, selected))
  )
  return isDir ? selected : dirname(selected)
}
