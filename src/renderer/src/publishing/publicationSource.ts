import { joinPath, dirname } from '@shared/paths'
import type { PublicationConfig } from '@shared/publishing/project'
import { api, errorMessage } from '../bridge'
import { documentModels } from '../editor/models'
import type { ExportSource } from '../markdown/exporters'
import { useDocuments } from '../state/documents'
import { useProject } from '../state/project'
import { useWorkspace } from '../state/workspace'
import { pathsEqual } from '@shared/paths'
import { buildPublication, type ChapterInput, type PublicationBuild } from './build'

/**
 * Reads every chapter: the text of an open tab (including unsaved edits) when there is one,
 * otherwise the file. Unreadable chapters come back with an error instead of failing the build.
 */
export async function loadChapters(
  config: PublicationConfig,
  root: string
): Promise<ChapterInput[]> {
  const open = useDocuments.getState().documents
  return Promise.all(
    config.chapters.map(async (relative): Promise<ChapterInput> => {
      const absolute = joinPath(root, ...relative.split('/'))
      const directory = dirname(absolute)
      const tab = open.find((d) => d.path && pathsEqual(d.path, absolute))
      const model = tab ? documentModels.get(tab.id) : null
      if (model) return { path: relative, directory, text: model.getValue() }
      try {
        const file = await api.fs.readText(absolute)
        return { path: relative, directory, text: file.content }
      } catch (error) {
        return { path: relative, directory, text: null, error: errorMessage(error) }
      }
    })
  )
}

export interface LoadedPublication {
  config: PublicationConfig
  build: PublicationBuild
  root: string
}

/** Builds the open folder's publication, or returns null when there is none. */
export async function loadPublicationBuild(): Promise<LoadedPublication | null> {
  const root = useWorkspace.getState().root
  const { publication, sources } = useProject.getState()
  if (!root || !publication) return null
  const chapters = await loadChapters(publication, root)
  return {
    config: publication,
    build: buildPublication(publication, chapters, sources, root),
    root
  }
}

/** The export pipeline's view of a publication: its combined body, title and layout. */
export function publicationExportSource(loaded: LoadedPublication): ExportSource {
  const { config, build, root } = loaded
  return {
    source: '',
    fileName: `${build.title}.md`,
    context: { documentDirectory: root, workspaceRoot: root },
    body: (presentation) => build.body(presentation),
    title: build.title,
    settings: {
      ...config.layout,
      lang: config.lang,
      numberSections: config.numberSections
    },
    columns: config.layout.columns?.count === 2 ? config.layout.columns : null
  }
}
