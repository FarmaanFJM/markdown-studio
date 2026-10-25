import { create } from 'zustand'

/**
 * Whether the preview shows the open folder's publication (all chapters combined) instead of
 * the active document. Switching it never changes any document.
 */
interface PublicationViewState {
  previewing: boolean
  setPreviewing(previewing: boolean): void
}

export const usePublicationView = create<PublicationViewState>((set) => ({
  previewing: false,
  setPreviewing: (previewing) => set({ previewing })
}))
