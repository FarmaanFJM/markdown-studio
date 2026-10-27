import { create } from 'zustand'
import { aiAvailability, type AiAvailability } from '@shared/ai/availability'
import { COPILOT_OFF, type CopilotStatus } from '@shared/ai/copilot'
import type { AiStatus } from '@shared/ipc'
import { api } from '../bridge'
import { activeDocument } from '../state/documents'
import { useSettings } from '../state/settings'
import { useWorkspace } from '../state/workspace'

interface AiState {
  status: AiStatus | null
  copilot: CopilotStatus
  /** Id of the request in flight, or null. */
  busy: string | null
  refreshStatus(): Promise<void>
  setStatus(status: AiStatus): void
  refreshCopilot(): Promise<void>
  setCopilot(status: CopilotStatus): void
}

export const useAi = create<AiState>((set) => ({
  status: null,
  copilot: COPILOT_OFF,
  busy: null,
  async refreshStatus() {
    try {
      set({ status: await api.ai.status() })
    } catch {
      set({ status: { hasKey: false, canStoreKey: false } })
    }
  },
  setStatus: (status) => set({ status }),
  async refreshCopilot() {
    try {
      set({ copilot: await api.copilot.status() })
    } catch {
      set({ copilot: COPILOT_OFF })
    }
  },
  setCopilot: (copilot) => set({ copilot })
}))

/** Whether AI actions are offered for the active document right now. */
export function currentAvailability(): AiAvailability {
  const ai = useSettings.getState().settings.ai
  return aiAvailability(
    ai,
    useWorkspace.getState().root,
    activeDocument()?.path ?? null,
    useAi.getState().copilot.state
  )
}
