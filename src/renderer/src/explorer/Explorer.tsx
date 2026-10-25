import {
  FilePlus,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  List,
  ListCollapse,
  RefreshCw
} from 'lucide-react'
import { basename, dirname, pathsEqual } from '@shared/paths'
import { LIMITS } from '@shared/settings'
import { commands } from '../commands/commands'
import { useSettings } from '../state/settings'
import { useWorkspace } from '../state/workspace'
import { createFileIn, createFolderIn } from './actions'
import { ThumbnailView } from './ThumbnailView'
import { TreeView } from './TreeView'

function NoFolder() {
  const recent = useSettings((s) => s.settings.workspace.recent)
  return (
    <div className="no-folder">
      <p>No folder is open.</p>
      <button type="button" className="button primary" onClick={() => void commands.openFolder()}>
        <FolderOpen size={15} /> Open Folder
      </button>
      {recent.length > 0 && (
        <div className="recent-list">
          <div className="recent-title">Recent</div>
          {recent.map((path) => (
            <button
              key={path}
              type="button"
              className="recent-item"
              title={path}
              onClick={() => void commands.openFolder(path)}
            >
              <span className="recent-name">{basename(path) || path}</span>
              <span className="recent-path">{path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Directory that receives new files: the selected folder, the selected file's folder, or the root. */
function targetDirectory(root: string): string {
  const { selected, folder, directories } = useWorkspace.getState()
  const mode = useSettings.getState().settings.explorer.mode
  if (mode === 'thumbnails') return folder ?? root
  if (!selected) return root
  const isDir = Object.values(directories).some((d) =>
    d.entries?.some((e) => e.kind === 'directory' && pathsEqual(e.path, selected))
  )
  return isDir ? selected : dirname(selected)
}

export function Explorer() {
  const root = useWorkspace((s) => s.root)
  const mode = useSettings((s) => s.settings.explorer.mode)
  const thumbnailSize = useSettings((s) => s.settings.explorer.thumbnailSize)
  const update = useSettings((s) => s.update)

  return (
    <section className="sidebar-view explorer" aria-label="Explorer">
      <header className="sidebar-header">
        <span className="sidebar-title">Explorer</span>
        {root && (
          <div className="sidebar-actions">
            <button
              type="button"
              className="icon-button"
              title="New Markdown File"
              aria-label="New Markdown File"
              onClick={() => void createFileIn(targetDirectory(root))}
            >
              <FilePlus size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              title="New Folder"
              aria-label="New Folder"
              onClick={() => void createFolderIn(targetDirectory(root))}
            >
              <FolderPlus size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Refresh Explorer"
              aria-label="Refresh Explorer"
              onClick={() => void useWorkspace.getState().refresh()}
            >
              <RefreshCw size={14} />
            </button>
            {mode === 'tree' && (
              <button
                type="button"
                className="icon-button"
                title="Collapse Folders"
                aria-label="Collapse Folders"
                onClick={() => useWorkspace.getState().collapseAll()}
              >
                <ListCollapse size={15} />
              </button>
            )}
          </div>
        )}
      </header>
      {root && (
        <div className="explorer-toolbar">
          <span className="workspace-name" title={root}>
            {basename(root) || root}
          </span>
          <div className="segmented" role="radiogroup" aria-label="Explorer presentation">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'tree'}
              className={mode === 'tree' ? 'active' : ''}
              title="Show as list"
              aria-label="Show as list"
              onClick={() => update({ explorer: { mode: 'tree' } })}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'thumbnails'}
              className={mode === 'thumbnails' ? 'active' : ''}
              title="Show as thumbnails"
              aria-label="Show as thumbnails"
              onClick={() => update({ explorer: { mode: 'thumbnails' } })}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      )}
      {root && mode === 'thumbnails' && (
        <div className="thumb-size">
          <label htmlFor="thumb-size">Size</label>
          <input
            id="thumb-size"
            type="range"
            min={LIMITS.thumbnailSize.min}
            max={LIMITS.thumbnailSize.max}
            step={8}
            value={thumbnailSize}
            onChange={(e) => update({ explorer: { thumbnailSize: Number(e.target.value) } })}
          />
        </div>
      )}
      <div className="sidebar-body">
        {!root ? (
          <NoFolder />
        ) : mode === 'tree' ? (
          <TreeView root={root} />
        ) : (
          <ThumbnailView root={root} />
        )}
      </div>
    </section>
  )
}
