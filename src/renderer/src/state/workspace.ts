import { create } from 'zustand'
import type { DirEntry } from '@shared/ipc'
import { isPathInside, pathKey } from '@shared/paths'
import { api, errorMessage } from '../bridge'

export interface DirectoryState {
  entries: DirEntry[] | null
  loading: boolean
  error: string | null
}

interface WorkspaceState {
  root: string | null
  directories: Record<string, DirectoryState>
  expanded: Record<string, boolean>
  selected: string | null
  /** Folder shown by the thumbnail view. */
  folder: string | null
  setRoot(root: string | null): void
  loadDirectory(path: string): Promise<void>
  refresh(paths?: string[]): Promise<void>
  toggle(path: string): void
  expand(path: string): void
  collapseAll(): void
  select(path: string | null): void
  setFolder(path: string): void
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  root: null,
  directories: {},
  expanded: {},
  selected: null,
  folder: null,

  setRoot(root) {
    set({ root, directories: {}, expanded: {}, selected: null, folder: root })
    if (root) void get().loadDirectory(root)
  },

  async loadDirectory(path) {
    const key = pathKey(path)
    set((s) => ({
      directories: {
        ...s.directories,
        [key]: { entries: s.directories[key]?.entries ?? null, loading: true, error: null }
      }
    }))
    try {
      const entries = await api.fs.readDir(path)
      if (!get().root) return
      set((s) => ({
        directories: { ...s.directories, [key]: { entries, loading: false, error: null } }
      }))
    } catch (error) {
      set((s) => ({
        directories: {
          ...s.directories,
          [key]: { entries: null, loading: false, error: errorMessage(error) }
        }
      }))
    }
  },

  async refresh(paths) {
    const { root, directories } = get()
    if (!root) return
    const loaded = Object.keys(directories)
    const targets = paths ? paths.map(pathKey).filter((key) => key in directories) : loaded
    // Directory keys are normalised paths; reload the ones that are currently displayed.
    const byKey = new Map<string, string>()
    for (const dir of Object.values(directories)) {
      for (const entry of dir.entries ?? []) {
        if (entry.kind === 'directory') byKey.set(pathKey(entry.path), entry.path)
      }
    }
    byKey.set(pathKey(root), root)
    await Promise.all(
      [...new Set(targets)].map((key) => {
        const path = byKey.get(key)
        return path ? get().loadDirectory(path) : Promise.resolve()
      })
    )
    // Forget directories that no longer exist below the root.
    const folder = get().folder
    if (folder && get().directories[pathKey(folder)]?.error) set({ folder: root })
  },

  toggle(path) {
    const key = pathKey(path)
    const open = !get().expanded[key]
    set((s) => ({ expanded: { ...s.expanded, [key]: open } }))
    if (open && !get().directories[key]?.entries) void get().loadDirectory(path)
  },

  expand(path) {
    const key = pathKey(path)
    if (!get().expanded[key]) get().toggle(path)
  },

  collapseAll() {
    set({ expanded: {} })
  },

  select(path) {
    set({ selected: path })
  },

  setFolder(path) {
    const root = get().root
    if (!root || !isPathInside(root, path)) return
    set({ folder: path })
    if (!get().directories[pathKey(path)]?.entries) void get().loadDirectory(path)
  }
}))

export function directoryEntries(path: string): DirEntry[] | null {
  return useWorkspace.getState().directories[pathKey(path)]?.entries ?? null
}
