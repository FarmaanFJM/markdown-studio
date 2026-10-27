import { create } from 'zustand'
import { aiAvailability, type AiAvailability } from '@shared/ai/availability'
import type { AiStatus } from '@shared/ipc'
import { api } from '../bridge'
import { activeDocument } from '../state/documents'
import { useSettings } from '../state/settings'
import { useWorkspace } from '../state/workspace'

interface AiState {
  status: AiStatus | null
  /** Id of the request in flight, or null. */
  busy: string | null
  refreshStatus(): Promise<void>
  setStatus(status: AiStatus): void
}

export const useAi = create<AiState>((set) => ({
  status: null,
  busy: null,
  async refreshStatus() {
    try {
      set({ status: await api.ai.status() })
    } catch {
      set({ status: { hasKey: false, canStoreKey: false } })
    }
  },
  setStatus: (status) => set({ status })
}))

/** Whether AI actions are offered for the active document right now. */
export function currentAvailability(): AiAvailability {
  const ai = useSettings.getState().settings.ai
  return aiAvailability(ai, useWorkspace.getState().root, activeDocument()?.path ?? null)
}
