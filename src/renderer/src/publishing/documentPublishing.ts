import {
  readDocumentSettings,
  type DocumentColumns,
  type DocumentSettingsData
} from '@shared/publishing/documentSettings'
import { splitFrontMatter } from '@shared/publishing/frontMatter'
import { createCitationProvider } from '@shared/publishing/citations'
import { sanitizeSources, type Source } from '@shared/publishing/sources'
import type { CitationProvider, PublishingOptions } from '@shared/publishing/types'
import { resolveTheme, type ThemeCustomization } from '@shared/presentation/theme'
import type { RenderPresentation } from '../markdown/document'
import { useProject } from '../state/project'

export interface DocumentPublishing {
  settings: DocumentSettingsData
  /** Settings that were ignored, with the reason. */
  settingProblems: string[]
  frontMatterError: string | null
  /** Sources the document may cite: the project library plus its own `references:`. */
  sources: readonly Source[]
  /** Problems inside the document's own `references:`. */
  referenceProblems: string[]
  options: PublishingOptions
  columns: DocumentColumns | null
}

const providers = new WeakMap<readonly Source[], Map<string, CitationProvider>>()

/** One provider per (sources, language): building the id index is not free for large libraries. */
function providerFor(sources: readonly Source[], lang: string | undefined): CitationProvider {
  let byLang = providers.get(sources)
  if (!byLang) providers.set(sources, (byLang = new Map()))
  const key = lang ?? ''
  let provider = byLang.get(key)
  if (!provider) byLang.set(key, (provider = createCitationProvider(sources, lang)))
  return provider
}

let mergedKey: { project: readonly Source[]; own: string } | null = null
let merged: Source[] = []

function mergeSources(project: readonly Source[], own: Source[], ownKey: string): Source[] {
  if (mergedKey && mergedKey.project === project && mergedKey.own === ownKey) return merged
  const ids = new Set(own.map((s) => s.id))
  merged = [...own, ...project.filter((s) => !ids.has(s.id))]
  mergedKey = { project, own: ownKey }
  return merged
}

/**
 * Everything the publishing layer needs to know about one document: its settings (front
 * matter), the sources it can cite, and the options for the shared render pipeline.
 */
export function documentPublishing(text: string): DocumentPublishing {
  const fm = splitFrontMatter(text)
  const read = readDocumentSettings(fm.data)
  const own = sanitizeSources(fm.data.references ?? [])
  const project = useProject.getState().sources
  const sources =
    own.sources.length === 0
      ? project
      : mergeSources(project, own.sources, JSON.stringify(own.sources))
  const settings = read.settings
  const options: PublishingOptions = {
    lang: settings.lang,
    numberSections: settings.numberSections === true,
    toc: settings.toc,
    cite: providerFor(sources, settings.lang),
    bibliographyAtEnd: true
  }
  return {
    settings,
    settingProblems: read.problems,
    frontMatterError: fm.error,
    sources,
    referenceProblems: Array.isArray(fm.data.references) ? own.problems : [],
    options,
    columns: settings.columns && settings.columns.count === 2 ? settings.columns : null
  }
}

/** The document's own choices layered on a presentation (theme, columns, numbering). */
export function presentationForDocument(
  base: RenderPresentation,
  publishing: Pick<DocumentPublishing, 'settings' | 'columns'>,
  customization: ThemeCustomization
): RenderPresentation {
  const { settings } = publishing
  const theme =
    settings.theme && settings.theme !== base.theme.id
      ? resolveTheme(settings.theme, customization)
      : base.theme
  return {
    ...base,
    theme,
    columns: publishing.columns,
    numberedSections: settings.numberSections === true
  }
}
