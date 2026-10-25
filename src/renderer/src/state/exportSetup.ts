import { useMemo } from 'react'
import { create } from 'zustand'
import {
  effectivePresets,
  type EffectivePreset,
  type PresetScope,
  type StoredPreset
} from '@shared/export/presets'
import { setupFromPreset, settingsSetup, type ExportSetup } from '@shared/export/setup'
import type { DocumentSettings } from '@shared/presentation/settings'
import { api, errorMessage } from '../bridge'
import { useSettings } from './settings'
import { notify } from './ui'

interface ExportSetupState {
  presets: EffectivePreset[]
  workspacePresetsAvailable: boolean
  loaded: boolean
  /** Id of the preset chosen as the active setup; '' means the Settings defaults. */
  presetId: string
  /** A setup edited in the Export dialog and not stored as a preset. */
  draft: ExportSetup | null
  loadPresets(): Promise<void>
  choose(presetId: string): void
  setDraft(setup: ExportSetup | null): void
  savePreset(scope: PresetScope, preset: Partial<StoredPreset>): Promise<StoredPreset | null>
  deletePreset(scope: PresetScope, id: string): Promise<boolean>
  restoreBuiltins(scope: PresetScope): Promise<number>
}

export const useExportSetup = create<ExportSetupState>((set, get) => ({
  presets: effectivePresets([], []),
  workspacePresetsAvailable: false,
  loaded: false,
  presetId: '',
  draft: null,

  async loadPresets() {
    try {
      const listing = await api.presets.list()
      set({
        presets: effectivePresets(listing.global, listing.workspace),
        workspacePresetsAvailable: listing.workspaceAvailable,
        loaded: true
      })
    } catch (error) {
      notify('error', `Export presets could not be loaded: ${errorMessage(error)}`)
      set({ loaded: true })
    }
    const wanted = useSettings.getState().settings.document.exportPreset
    if (get().presetId !== wanted && get().draft === null) set({ presetId: wanted })
  },

  choose(presetId) {
    set({ presetId, draft: null })
    useSettings.getState().update({ document: { exportPreset: presetId } })
  },

  setDraft: (draft) => set({ draft }),

  async savePreset(scope, preset) {
    try {
      const saved = await api.presets.save(scope, preset)
      await get().loadPresets()
      return saved
    } catch (error) {
      notify('error', errorMessage(error))
      return null
    }
  },

  async deletePreset(scope, id) {
    try {
      await api.presets.delete(scope, id)
      if (get().presetId === id) get().choose('')
      await get().loadPresets()
      return true
    } catch (error) {
      notify('error', errorMessage(error))
      return false
    }
  },

  async restoreBuiltins(scope) {
    try {
      const count = await api.presets.restoreBuiltins(scope)
      await get().loadPresets()
      return count
    } catch (error) {
      notify('error', errorMessage(error))
      return 0
    }
  }
}))

/** The setup the PDF preview and the Export dialog start from. */
export function activeSetup(
  document: DocumentSettings,
  presets: readonly EffectivePreset[],
  presetId: string,
  draft: ExportSetup | null
): ExportSetup {
  if (draft) return draft
  const preset = presets.find((p) => p.id === presetId)
  return preset ? setupFromPreset(preset, document) : settingsSetup(document)
}

export function useActiveSetup(): ExportSetup {
  const document = useSettings((s) => s.settings.document)
  const presets = useExportSetup((s) => s.presets)
  const presetId = useExportSetup((s) => s.presetId)
  const draft = useExportSetup((s) => s.draft)
  return useMemo(
    () => activeSetup(document, presets, presetId, draft),
    [document, presets, presetId, draft]
  )
}

export function currentSetup(): ExportSetup {
  const { presets, presetId, draft } = useExportSetup.getState()
  return activeSetup(useSettings.getState().settings.document, presets, presetId, draft)
}
