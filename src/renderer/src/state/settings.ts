import { create } from 'zustand'
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  type AppSettings,
  type SettingsPatch
} from '@shared/settings'
import { api } from '../bridge'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load(): Promise<AppSettings>
  /** Applies a change immediately and persists it shortly afterwards. */
  update(patch: SettingsPatch): void
}

let pending: SettingsPatch[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function mergePatches(patches: SettingsPatch[]): SettingsPatch {
  const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
    const out = { ...a }
    for (const [key, value] of Object.entries(b)) {
      const prev = out[key]
      out[key] =
        value && typeof value === 'object' && !Array.isArray(value) && prev && typeof prev === 'object'
          ? merge(prev as Record<string, unknown>, value as Record<string, unknown>)
          : value
    }
    return out
  }
  return patches.reduce<Record<string, unknown>>(
    (acc, patch) => merge(acc, patch as Record<string, unknown>),
    {}
  ) as SettingsPatch
}

export function flushSettings(): Promise<unknown> {
  if (timer) clearTimeout(timer)
  timer = null
  if (pending.length === 0) return Promise.resolve()
  const patch = mergePatches(pending)
  pending = []
  return api.settings.update(patch).catch((error) => console.error('Settings update failed', error))
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    const settings = await api.settings.get()
    set({ settings, loaded: true })
    return settings
  },
  update(patch) {
    set({ settings: applySettingsPatch(get().settings, patch) })
    pending.push(patch)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flushSettings(), 250)
  }
}))

/** Re-reads settings owned by the main process (for example the recent-folder list). */
export async function refreshSettings(): Promise<void> {
  await flushSettings()
  useSettings.setState({ settings: await api.settings.get() })
}
