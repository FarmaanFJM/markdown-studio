import { useEffect, useState } from 'react'
import { ArrowUp, Folder } from 'lucide-react'
import type { DirEntry } from '@shared/ipc'
import { basename, isPathInside, pathsEqual, relativePath } from '@shared/paths'
import { Modal } from '../dialogs/Modal'
import { listDirectory } from '../workspace'

interface Props {
  title: string
  root: string
  start: string
  /** A folder that cannot be chosen (nor anything inside it), such as the one being moved. */
  excluded: string
  confirmLabel: string
  onDone(folder: string | null): void
}

/** Choose a folder of the workspace by walking through it. */
export function FolderPicker({ title, root, start, excluded, confirmLabel, onDone }: Props) {
  const [current, setCurrent] = useState(start)
  const [folders, setFolders] = useState<DirEntry[]>([])

  useEffect(() => {
    let cancelled = false
    void listDirectory(current).then((entries) => {
      if (!cancelled) {
        setFolders(entries.filter((e) => e.kind === 'directory' && !isPathInside(excluded, e.path)))
      }
    })
    return () => {
      cancelled = true
    }
  }, [current, excluded])

  const label = pathsEqual(current, root)
    ? basename(root)
    : `${basename(root)}/${relativePath(root, current)}`
  const parent = pathsEqual(current, root) ? null : current.replace(/[\\/][^\\/]+$/, '')
  const invalid = isPathInside(excluded, current)

  return (
    <Modal
      title={title}
      size="wide"
      onCancel={() => onDone(null)}
      footer={
        <>
          <button
            type="button"
            className="button primary"
            disabled={invalid}
            data-testid="folder-picker-confirm"
            onClick={() => onDone(current)}
          >
            {confirmLabel}
          </button>
          <button type="button" className="button" onClick={() => onDone(null)}>
            Cancel
          </button>
        </>
      }
    >
      <div className="folder-picker-path" aria-live="polite">
        <button
          type="button"
          className="icon-button"
          aria-label="Up one folder"
          disabled={parent === null}
          onClick={() => parent && setCurrent(parent)}
        >
          <ArrowUp size={15} />
        </button>
        <span data-testid="folder-picker-current">{label}</span>
      </div>
      <ul className="folder-picker-list" aria-label="Folders">
        {folders.map((folder) => (
          <li key={folder.path}>
            <button
              type="button"
              className="folder-picker-item"
              onClick={() => setCurrent(folder.path)}
              data-autofocus={folder === folders[0] ? '' : undefined}
            >
              <Folder size={15} /> {folder.name}
            </button>
          </li>
        ))}
        {folders.length === 0 && <li className="muted folder-picker-empty">No subfolders</li>}
      </ul>
    </Modal>
  )
}
