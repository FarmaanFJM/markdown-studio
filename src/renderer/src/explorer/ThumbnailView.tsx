import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import { ArrowUp, ChevronRight } from 'lucide-react'
import type { DirEntry } from '@shared/ipc'
import { thumbnailUrl } from '@shared/ipc'
import { isImagePath } from '@shared/fileTypes'
import {
  basename,
  dirname,
  isPathInside,
  pathKey,
  pathsEqual,
  relativePath,
  joinPath
} from '@shared/paths'
import { useSettings } from '../state/settings'
import { useUi } from '../state/ui'
import { useWorkspace } from '../state/workspace'
import { deleteEntry, entryContextMenu, openEntry, renameEntry } from './actions'
import { carriesExternalFiles, externalPathsFrom, importIntoFolder } from './externalDrop'
import { FileIcon } from './FileIcon'
import { startImageDrag } from './TreeView'

function Thumbnail({ entry, size }: { entry: DirEntry; size: number }) {
  const [failed, setFailed] = useState(false)
  const pixels = Math.round(size * Math.min(2, window.devicePixelRatio || 1))
  if (failed) return <FileIcon name={entry.name} size={Math.round(size * 0.42)} />
  return (
    <img
      className="thumb-image"
      src={thumbnailUrl(entry.path, pixels, entry.mtimeMs)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

function Breadcrumbs({ root, folder }: { root: string; folder: string }) {
  const relative = relativePath(root, folder)
  const segments = relative && relative !== '.' ? relative.split('/') : []
  const setFolder = useWorkspace((s) => s.setFolder)
  return (
    <nav className="breadcrumbs" aria-label="Current folder">
      <button type="button" className="crumb" onClick={() => setFolder(root)} title={root}>
        {basename(root) || root}
      </button>
      {segments.map((segment, i) => {
        const target = joinPath(root, ...segments.slice(0, i + 1))
        return (
          <span key={target} className="crumb-wrap">
            <ChevronRight size={12} aria-hidden className="crumb-sep" />
            <button type="button" className="crumb" onClick={() => setFolder(target)}>
              {segment}
            </button>
          </span>
        )
      })}
    </nav>
  )
}

/**
 * Visual browser for the workspace, inspired by asset browsers: one folder at a time, with
 * real thumbnails for images. Thumbnails load lazily and are cached by the main process.
 */
export function ThumbnailView({ root }: { root: string }) {
  const folder = useWorkspace((s) => s.folder) ?? root
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const state = useWorkspace((s) => s.directories[pathKey(folder)])
  const selected = useWorkspace((s) => s.selected)
  const size = useSettings((s) => s.settings.explorer.thumbnailSize)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state?.entries && !state?.loading && !state?.error)
      void useWorkspace.getState().loadDirectory(folder)
  }, [folder, state])

  const entries = state?.entries ?? []
  const atRoot = pathsEqual(folder, root)

  const activate = (entry: DirEntry) => {
    if (entry.kind === 'directory') useWorkspace.getState().setFolder(entry.path)
    else openEntry(entry)
  }

  const goUp = () => {
    if (!atRoot) {
      useWorkspace.getState().select(folder)
      useWorkspace.getState().setFolder(dirname(folder))
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const workspace = useWorkspace.getState()
    const index = entries.findIndex((e) => selected && pathsEqual(e.path, selected))
    const current = entries[index]
    const width = gridRef.current?.clientWidth ?? size
    const columns = Math.max(1, Math.floor((width - 8) / (size + 16)))
    const move = (to: number) => {
      const entry = entries[Math.max(0, Math.min(entries.length - 1, to))]
      if (entry) workspace.select(entry.path)
    }
    switch (event.key) {
      case 'ArrowRight':
        move(index + 1)
        break
      case 'ArrowLeft':
        move(index - 1)
        break
      case 'ArrowDown':
        move(index < 0 ? 0 : index + columns)
        break
      case 'ArrowUp':
        move(index - columns)
        break
      case 'Enter':
        if (current) activate(current)
        break
      case 'Backspace':
        goUp()
        break
      case 'F2':
        if (current) void renameEntry(current)
        break
      case 'Delete':
        if (current) void deleteEntry(current)
        break
      default:
        return
    }
    event.preventDefault()
  }

  useEffect(() => {
    gridRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const onContextMenu = (event: MouseEvent, entry: DirEntry | null) => {
    event.preventDefault()
    event.stopPropagation()
    if (entry) useWorkspace.getState().select(entry.path)
    useUi.getState().showContextMenu(event.clientX, event.clientY, entryContextMenu(entry, folder))
  }

  /** Folder tile under the pointer, else the folder being shown. */
  const externalDestination = (event: DragEvent): string => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>('[data-path]')
    const entry = tile ? entries.find((e) => e.path === tile.dataset.path) : undefined
    return entry?.kind === 'directory' ? entry.path : folder
  }

  return (
    <div
      className={`thumbs${dropTarget !== null && pathsEqual(dropTarget, folder) ? ' drop-root' : ''}`}
      onDragOver={(e) => {
        if (!carriesExternalFiles(e.dataTransfer)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'copy'
        setDropTarget(externalDestination(e))
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null)
      }}
      onDrop={(e) => {
        if (!carriesExternalFiles(e.dataTransfer)) return
        e.preventDefault()
        e.stopPropagation()
        const destination = externalDestination(e)
        setDropTarget(null)
        void importIntoFolder(externalPathsFrom(e.dataTransfer), destination)
      }}
    >
      <div className="thumbs-nav">
        <button
          type="button"
          className="icon-button"
          title="Up one folder (Backspace)"
          aria-label="Up one folder"
          disabled={atRoot}
          onClick={goUp}
        >
          <ArrowUp size={15} />
        </button>
        <Breadcrumbs root={root} folder={isPathInside(root, folder) ? folder : root} />
      </div>
      {state?.error && <div className="explorer-message error">{state.error}</div>}
      <div
        ref={gridRef}
        className="thumb-grid"
        role="listbox"
        aria-label="Folder contents"
        tabIndex={0}
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size + 12}px, 1fr))` }}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => onContextMenu(e, null)}
      >
        {!state?.entries && !state?.error && <div className="explorer-message">Loading…</div>}
        {state?.entries && entries.length === 0 && (
          <div className="explorer-message">This folder is empty.</div>
        )}
        {entries.map((entry) => {
          const isSelected = !!selected && pathsEqual(selected, entry.path)
          const image = entry.kind === 'file' && isImagePath(entry.path)
          return (
            <div
              key={entry.path}
              className={`thumb-tile${isSelected ? ' selected' : ''}${dropTarget !== null && pathsEqual(dropTarget, entry.path) ? ' drop-target' : ''}`}
              role="option"
              aria-selected={isSelected}
              data-path={entry.path}
              title={entry.name}
              draggable={image}
              onDragStart={(e) => startImageDrag(e, entry)}
              onClick={() => useWorkspace.getState().select(entry.path)}
              onDoubleClick={() => activate(entry)}
              onContextMenu={(e) => onContextMenu(e, entry)}
            >
              <div
                className={`thumb-frame${image ? ' image' : ''}`}
                style={{ width: size, height: size }}
              >
                {image ? (
                  <Thumbnail entry={entry} size={size} />
                ) : (
                  <FileIcon
                    name={entry.name}
                    directory={entry.kind === 'directory'}
                    size={Math.round(size * 0.42)}
                  />
                )}
              </div>
              <span className="thumb-name">{entry.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
