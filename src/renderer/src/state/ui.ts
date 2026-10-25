import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: { label: string; run: () => void }
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export type DialogRequest =
  | {
      kind: 'unsaved'
      fileNames: string[]
      resolve: (choice: UnsavedChoice) => void
    }
  | {
      kind: 'confirm'
      title: string
      message: string
      detail?: string
      confirmLabel: string
      danger?: boolean
      resolve: (confirmed: boolean) => void
    }
  | {
      kind: 'prompt'
      title: string
      label: string
      initialValue: string
      /** Characters of `initialValue` to pre-select (e.g. the name without extension). */
      selectLength?: number
      confirmLabel: string
      validate?: (value: string) => string | null
      resolve: (value: string | null) => void
    }
  | { kind: 'about'; resolve: () => void }
  | { kind: 'shortcuts'; resolve: () => void }

export interface ContextMenuItem {
  label: string
  run: () => void
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
}

interface UiState {
  dialogs: DialogRequest[]
  toasts: Toast[]
  contextMenu: { x: number; y: number; items: ContextMenuItem[] } | null
  closeDialog(request: DialogRequest): void
  showContextMenu(x: number, y: number, items: ContextMenuItem[]): void
  hideContextMenu(): void
  dismissToast(id: number): void
}

let nextToastId = 1

export const useUi = create<UiState>((set) => ({
  dialogs: [],
  toasts: [],
  contextMenu: null,
  closeDialog: (request) => set((s) => ({ dialogs: s.dialogs.filter((d) => d !== request) })),
  showContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  hideContextMenu: () => set({ contextMenu: null }),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

type WithoutResolve<T> = T extends unknown ? Omit<T, 'resolve'> : never

function openDialog<R>(request: WithoutResolve<DialogRequest>): Promise<R> {
  return new Promise<R>((resolve) => {
    const full = {
      ...request,
      resolve: (value: R) => {
        useUi.getState().closeDialog(full)
        resolve(value)
      }
    } as unknown as DialogRequest
    useUi.setState((s) => ({ dialogs: [...s.dialogs, full] }))
  })
}

export const dialogs = {
  unsaved: (fileNames: string[]) => openDialog<UnsavedChoice>({ kind: 'unsaved', fileNames }),
  confirm: (options: Omit<Extract<DialogRequest, { kind: 'confirm' }>, 'kind' | 'resolve'>) =>
    openDialog<boolean>({ kind: 'confirm', ...options }),
  prompt: (options: Omit<Extract<DialogRequest, { kind: 'prompt' }>, 'kind' | 'resolve'>) =>
    openDialog<string | null>({ kind: 'prompt', ...options }),
  about: () => openDialog<void>({ kind: 'about' }),
  shortcuts: () => openDialog<void>({ kind: 'shortcuts' })
}

export function isDialogOpen(): boolean {
  return useUi.getState().dialogs.length > 0
}

export function notify(kind: ToastKind, message: string, action?: Toast['action']): void {
  const id = nextToastId++
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message, action }] }))
  setTimeout(() => useUi.getState().dismissToast(id), kind === 'error' ? 9000 : 5000)
}
