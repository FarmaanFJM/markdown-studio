import type { ReactNode } from 'react'
import { create } from 'zustand'
import { getActiveEditor } from '../editor/models'

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
  | {
      kind: 'choice'
      title: string
      message: string
      detail?: string
      items?: string[]
      options: { value: string; label: string; primary?: boolean; danger?: boolean }[]
      /** The chosen option's value, or null when the dialog was cancelled. */
      resolve: (value: string | null) => void
    }
  | {
      kind: 'custom'
      /** Renders the dialog; call `done` with its result (or null) to close it. */
      render: (done: (value: unknown) => void) => ReactNode
      resolve: (value: unknown) => void
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

export type SettingsCategoryId =
  'editor' | 'markdown' | 'appearance' | 'preview' | 'export' | 'files' | 'ai' | 'advanced'

interface UiState {
  /** The Settings page replaces the editor area while it is open. */
  settingsOpen: boolean
  /** Category the page should scroll to when it opens or the request changes. */
  settingsTarget: { category: SettingsCategoryId; nonce: number } | null
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
  settingsOpen: false,
  settingsTarget: null,
  dialogs: [],
  toasts: [],
  contextMenu: null,
  closeDialog: (request) => set((s) => ({ dialogs: s.dialogs.filter((d) => d !== request) })),
  showContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  hideContextMenu: () => set({ contextMenu: null }),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

let settingsNonce = 0

/** Opens the Settings page, optionally at one category. */
export function openSettings(category?: SettingsCategoryId): void {
  useUi.setState({
    settingsOpen: true,
    settingsTarget: category ? { category, nonce: ++settingsNonce } : null
  })
}

export function closeSettings(): void {
  useUi.setState({ settingsOpen: false })
  // Back to writing: the editor takes the keyboard again once it is visible.
  requestAnimationFrame(() => getActiveEditor()?.focus())
}

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
  choice: (options: Omit<Extract<DialogRequest, { kind: 'choice' }>, 'kind' | 'resolve'>) =>
    openDialog<string | null>({ kind: 'choice', ...options }),
  /** Shows a dialog rendered by the caller; resolves with whatever the dialog passes to `done`. */
  custom: <T>(render: (done: (value: T | null) => void) => ReactNode) =>
    openDialog<T | null>({
      kind: 'custom',
      render: render as (done: (value: unknown) => void) => ReactNode
    }),
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
