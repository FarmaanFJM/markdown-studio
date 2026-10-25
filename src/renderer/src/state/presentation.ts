import { create } from 'zustand'
import { contentHeightPx, type PdfOptions } from '@shared/export/pdf'
import {
  resolvePresentation,
  type EffectivePresentation,
  type ExportOverrides,
  type WorkspacePresentation
} from '@shared/presentation/settings'
import { api, errorMessage } from '../bridge'
import { DEFAULT_PRESENTATION, type RenderPresentation } from '../markdown/document'
import type { ExportSource } from '../markdown/exporters'
import { resolveTheme } from '@shared/presentation/theme'
import { NO_CSS, resolveCustomCss, type CssResult } from '../presentation/customCss'
import { notify } from './ui'
import { useSettings } from './settings'
import { useWorkspace } from './workspace'

interface PresentationState {
  workspace: WorkspacePresentation | null
  workspaceAvailable: boolean
  /** Result for the document's own (non-export) custom CSS. */
  css: CssResult
  effective: EffectivePresentation
  /** What the HTML preview renders. */
  render: RenderPresentation
  loadWorkspace(): Promise<void>
  setWorkspace(overrides: WorkspacePresentation | null): Promise<void>
  reloadCss(announce?: boolean): Promise<void>
}

function compute(css: CssResult, workspace: WorkspacePresentation | null) {
  const settings = useSettings.getState().settings.document
  const effective = resolvePresentation(settings, workspace)
  const render: RenderPresentation = {
    theme: effective.theme,
    customCss: css.css,
    math: effective.math,
    diagrams: effective.diagrams
  }
  return { effective, render }
}

export const usePresentation = create<PresentationState>((set, get) => ({
  workspace: null,
  workspaceAvailable: false,
  css: NO_CSS,
  ...compute(NO_CSS, null),

  async loadWorkspace() {
    try {
      const state = await api.presentation.getWorkspace()
      set({ workspace: state.overrides, workspaceAvailable: state.available })
    } catch {
      set({ workspace: null, workspaceAvailable: false })
    }
    await get().reloadCss()
  },

  async setWorkspace(overrides) {
    try {
      const state = await api.presentation.setWorkspace(overrides)
      set({ workspace: state.overrides, workspaceAvailable: state.available })
      await get().reloadCss()
    } catch (error) {
      notify('error', errorMessage(error))
    }
  },

  async reloadCss(announce = false) {
    const { effective } = compute(get().css, get().workspace)
    const css = await resolveCustomCss(effective.customCss)
    const previous = get().css
    set({ css, ...compute(css, get().workspace) })
    if (announce && css.status === 'ok' && previous.mtimeMs && css.mtimeMs !== previous.mtimeMs) {
      notify('info', 'The custom stylesheet changed on disk and was reloaded.')
    }
  }
}))

let started = false

/** Keeps the effective presentation in step with settings, the open folder and the CSS file. */
export function startPresentationStore(): void {
  if (started) return
  started = true
  let lastDocument = useSettings.getState().settings.document
  useSettings.subscribe((state) => {
    if (state.settings.document === lastDocument) return
    const cssChanged =
      JSON.stringify(state.settings.document.customCss) !== JSON.stringify(lastDocument.customCss)
    lastDocument = state.settings.document
    if (cssChanged) void usePresentation.getState().reloadCss()
    else
      usePresentation.setState(
        compute(usePresentation.getState().css, usePresentation.getState().workspace)
      )
  })
  let lastRoot = useWorkspace.getState().root
  useWorkspace.subscribe((state) => {
    if (state.root === lastRoot) return
    lastRoot = state.root
    void usePresentation.getState().loadWorkspace()
  })
  // A stylesheet edited in another program takes effect when the application is focused again.
  window.addEventListener('focus', () => {
    if (usePresentation.getState().effective.customCss.source === 'file') {
      void usePresentation.getState().reloadCss(true)
    }
  })
  void usePresentation.getState().loadWorkspace()
}

/**
 * Presentation for an export or the PDF preview: the document's appearance with the setup's
 * overrides on top, and the page geometry of `pdf` when given.
 */
export async function renderPresentationFor(
  overrides: ExportOverrides | null | undefined,
  pdf?: PdfOptions,
  documentLayer?: Pick<ExportSource, 'settings' | 'columns'>
): Promise<RenderPresentation> {
  const state = usePresentation.getState()
  const effective = resolvePresentation(
    useSettings.getState().settings.document,
    state.workspace,
    overrides
  )
  const usesDocumentCss = effective.origin.customCss !== 'export'
  const css = usesDocumentCss ? state.css : await resolveCustomCss(effective.customCss)
  const settings = documentLayer?.settings
  // The document's own theme sits between the workspace and the export choices: an explicit
  // export override (preset or dialog) still wins.
  const theme =
    settings?.theme && effective.origin.theme !== 'export'
      ? resolveTheme(settings.theme, effective.customization)
      : effective.theme
  return {
    ...DEFAULT_PRESENTATION,
    theme,
    columns: documentLayer?.columns ?? null,
    numberedSections: settings?.numberSections === true,
    customCss: css.css,
    math: effective.math,
    diagrams: effective.diagrams,
    ...(pdf
      ? {
          pageContentHeightPx: contentHeightPx(pdf),
          pageBackground: pdf.printBackground ? pdf.backgroundColor : null
        }
      : {})
  }
}
