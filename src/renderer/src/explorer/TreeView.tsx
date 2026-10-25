import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import { ChevronRight } from 'lucide-react'
import type { DirEntry } from '@shared/ipc'
import { isImagePath } from '@shared/fileTypes'
import { basename, dirname, pathKey, pathsEqual } from '@shared/paths'
import { EXPLORER_DRAG_MIME } from '../editor/imageDrop'
import { moveWithReferences } from '../references/moveWithReferences'
import { useDocuments } from '../state/documents'
import { useUi } from '../state/ui'
import { useWorkspace, type DirectoryState } from '../state/workspace'
import { deleteEntry, entryContextMenu, openEntry, renameEntry } from './actions'
import { FileIcon } from './FileIcon'

interface Row {
  entry: DirEntry
  depth: number
}

function flatten(
  path: string,
  depth: number,
  directories: Record<string, DirectoryState>,
  expanded: Record<string, boolean>,
  rows: Row[]
): void {
  for (const entry of directories[pathKey(path)]?.entries ?? []) {
    rows.push({ entry, depth })
    if (entry.kind === 'directory' && expanded[pathKey(entry.path)]) {
      flatten(entry.path, depth + 1, directories, expanded, rows)
    }
  }
}

export function startImageDrag(event: DragEvent, entry: DirEntry): void {
  if (!isImagePath(entry.path)) {
    event.preventDefault()
    return
  }
  event.dataTransfer.setData(EXPLORER_DRAG_MIME, entry.path)
  event.dataTransfer.effectAllowed = 'copy'
}

/** Private drag type for moving entries between folders of the Explorer. */
export const MOVE_DRAG_MIME = 'application/x-markdown-studio-move'

function startEntryDrag(event: DragEvent, entry: DirEntry): void {
  event.dataTransfer.setData(MOVE_DRAG_MIME, entry.path)
  // Images can also be dropped into the editor to insert a reference.
  if (isImagePath(entry.path)) event.dataTransfer.setData(EXPLORER_DRAG_MIME, entry.path)
  event.dataTransfer.effectAllowed = 'copyMove'
}

const carriesMove = (event: DragEvent) => event.dataTransfer.types.includes(MOVE_DRAG_MIME)

export function TreeView({ root }: { root: string }) {
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const directories = useWorkspace((s) => s.directories)
  const expanded = useWorkspace((s) => s.expanded)
  const selected = useWorkspace((s) => s.selected)
  const activePath = useDocuments((s) => s.documents.find((d) => d.id === s.activeId)?.path ?? null)
  const containerRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const result: Row[] = []
    flatten(root, 0, directories, expanded, result)
    return result
  }, [root, directories, expanded])

  const rootState = directories[pathKey(root)]

  useEffect(() => {
    if (!selected) return
    const element = containerRef.current?.querySelector('[aria-selected="true"]')
    element?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const activate = (entry: DirEntry) => {
    const workspace = useWorkspace.getState()
    workspace.select(entry.path)
    if (entry.kind === 'directory') workspace.toggle(entry.path)
    else openEntry(entry)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const workspace = useWorkspace.getState()
    const index = rows.findIndex((r) => selected && pathsEqual(r.entry.path, selected))
    const current = rows[index]?.entry
    const move = (to: number) => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, to))]
      if (row) workspace.select(row.entry.path)
    }
    switch (event.key) {
      case 'ArrowDown':
        move(index + 1)
        break
      case 'ArrowUp':
        move(index < 0 ? 0 : index - 1)
        break
      case 'Home':
        move(0)
        break
      case 'End':
        move(rows.length - 1)
        break
      case 'ArrowRight':
        if (current?.kind === 'directory' && !expanded[pathKey(current.path)])
          workspace.toggle(current.path)
        else move(index + 1)
        break
      case 'ArrowLeft':
        if (current?.kind === 'directory' && expanded[pathKey(current.path)])
          workspace.toggle(current.path)
        else if (current && !pathsEqual(dirname(current.path), root))
          workspace.select(dirname(current.path))
        break
      case 'Enter':
        if (current) activate(current)
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

  const dropOn = (event: DragEvent, folder: string) => {
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(null)
    const source = event.dataTransfer.getData(MOVE_DRAG_MIME)
    if (!source) return
    const known = rows.find((r) => pathsEqual(r.entry.path, source))?.entry
    const entry: DirEntry = known ?? {
      name: basename(source),
      path: source,
      kind: 'file',
      size: 0,
      mtimeMs: 0
    }
    void moveWithReferences(entry, folder)
  }

  const onContextMenu = (event: MouseEvent, entry: DirEntry | null) => {
    event.preventDefault()
    event.stopPropagation()
    if (entry) useWorkspace.getState().select(entry.path)
    useUi.getState().showContextMenu(event.clientX, event.clientY, entryContextMenu(entry, root))
  }

  if (rootState?.error) return <div className="explorer-message error">{rootState.error}</div>
  if (!rootState?.entries) return <div className="explorer-message">Loading…</div>

  return (
    <div
      ref={containerRef}
      className="tree"
      role="tree"
      aria-label="Files"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => onContextMenu(e, null)}
      onDragOver={(e) => {
        if (!carriesMove(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => dropOn(e, root)}
    >
      {rows.length === 0 && <div className="explorer-message">This folder is empty.</div>}
      {rows.map(({ entry, depth }) => {
        const isDir = entry.kind === 'directory'
        const isOpen = isDir && !!expanded[pathKey(entry.path)]
        const isSelected = !!selected && pathsEqual(selected, entry.path)
        const isActive = !!activePath && pathsEqual(activePath, entry.path)
        return (
          <div
            key={entry.path}
            className={`tree-row${isSelected ? ' selected' : ''}${isActive ? ' active' : ''}${dropTarget === entry.path ? ' drop-target' : ''}`}
            role="treeitem"
            aria-selected={isSelected}
            aria-expanded={isDir ? isOpen : undefined}
            aria-level={depth + 1}
            data-path={entry.path}
            title={entry.path}
            style={{ paddingLeft: 8 + depth * 14 }}
            draggable
            onDragStart={(e) => startEntryDrag(e, entry)}
            onDragEnd={() => setDropTarget(null)}
            onDragOver={
              isDir
                ? (e) => {
                    if (!carriesMove(e)) return
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'move'
                    setDropTarget(entry.path)
                  }
                : undefined
            }
            onDragLeave={isDir ? () => setDropTarget(null) : undefined}
            onDrop={isDir ? (e) => dropOn(e, entry.path) : undefined}
            onClick={() => activate(entry)}
            onContextMenu={(e) => onContextMenu(e, entry)}
          >
            <span className={`tree-chevron${isOpen ? ' open' : ''}`}>
              {isDir && <ChevronRight size={14} strokeWidth={1.8} aria-hidden />}
            </span>
            <FileIcon name={entry.name} directory={isDir} open={isOpen} />
            <span className="tree-label">{entry.name}</span>
          </div>
        )
      })}
    </div>
  )
}
