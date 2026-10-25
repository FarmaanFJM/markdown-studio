import { create } from 'zustand'
import {
  renameInChapters,
  sanitizePublication,
  type PublicationConfig
} from '@shared/publishing/project'
import type { Source } from '@shared/publishing/sources'
import { relativePath } from '@shared/paths'
import type { ProjectState } from '@shared/ipc'
import { api, errorMessage } from '../bridge'
import { notify } from './ui'
import { useWorkspace } from './workspace'

interface ProjectStore {
  loaded: boolean
  available: boolean
  publication: PublicationConfig | null
  sources: Source[]
  problems: string[]
  load(): Promise<void>
  savePublication(publication: PublicationConfig | null): Promise<boolean>
  saveSources(sources: Source[]): Promise<boolean>
}

function apply(state: ProjectState) {
  return {
    loaded: true,
    available: state.available,
    publication: state.publication,
    sources: state.sources,
    problems: state.problems
  }
}

export const useProject = create<ProjectStore>((set, get) => ({
  loaded: false,
  available: false,
  publication: null,
  sources: [],
  problems: [],

  async load() {
    try {
      set(apply(await api.project.get()))
    } catch (error) {
      notify('error', `The project settings could not be loaded: ${errorMessage(error)}`)
      set({ loaded: true, available: false, publication: null, sources: [], problems: [] })
    }
  },

  async savePublication(publication) {
    const previous = get().publication
    // Optimistic: the UI answers at once; a failed write restores the previous value.
    set({ publication })
    try {
      set(apply(await api.project.setPublication(publication)))
      return true
    } catch (error) {
      set({ publication: previous })
      notify('error', `The publication could not be saved: ${errorMessage(error)}`)
      return false
    }
  },

  async saveSources(sources) {
    const previous = get().sources
    set({ sources })
    try {
      set(apply(await api.project.setSources(sources)))
      return true
    } catch (error) {
      set({ sources: previous })
      notify('error', `The sources could not be saved: ${errorMessage(error)}`)
      return false
    }
  }
}))

let started = false

/** Loads the project data whenever the open folder changes. */
export function startProjectStore(): void {
  if (started) return
  started = true
  let lastRoot = useWorkspace.getState().root
  useWorkspace.subscribe((state) => {
    if (state.root === lastRoot) return
    lastRoot = state.root
    void useProject.getState().load()
  })
  void useProject.getState().load()
}

/** Keeps the chapter list in step when a chapter file (or its folder) is renamed or moved. */
export function followPathChange(oldPath: string, newPath: string): void {
  const root = useWorkspace.getState().root
  const { publication } = useProject.getState()
  if (!root || !publication) return
  const oldRelative = relativePath(root, oldPath)
  const newRelative = relativePath(root, newPath)
  if (oldRelative === null || newRelative === null) return
  const chapters = renameInChapters(publication.chapters, oldRelative, newRelative)
  if (chapters.some((c, i) => c !== publication.chapters[i])) {
    void useProject.getState().savePublication(sanitizePublication({ ...publication, chapters }))
  }
}
