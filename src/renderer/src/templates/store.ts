import { create } from 'zustand'
import { BUILT_IN_TEMPLATES } from '@shared/builtinTemplates'
import type { StoredTemplate, Template, TemplateScope } from '@shared/templates'
import { api, errorMessage } from '../bridge'
import { setCustomSnippets } from '../editor/markdown/customSnippets'
import { notify } from '../state/ui'
import { useWorkspace } from '../state/workspace'

export type TemplateOrigin = TemplateScope | 'built-in'

export interface TemplateEntry {
  template: Template
  origin: TemplateOrigin
}

interface TemplatesState {
  global: StoredTemplate[]
  workspace: StoredTemplate[]
  workspaceAvailable: boolean
  loaded: boolean
}

export const useTemplates = create<TemplatesState>(() => ({
  global: [],
  workspace: [],
  workspaceAvailable: false,
  loaded: false
}))

/** Reads the stored templates and refreshes the saved snippets offered by the editor. */
export async function refreshTemplates(): Promise<void> {
  try {
    const listing = await api.templates.list()
    useTemplates.setState({ ...listing, loaded: true })
    setCustomSnippets([...listing.workspace, ...listing.global])
  } catch (error) {
    notify('error', `Could not read templates: ${errorMessage(error)}`)
  }
}

/** Every template, user templates of this folder first, built-in ones last. */
export function allTemplates(): TemplateEntry[] {
  const { global, workspace } = useTemplates.getState()
  return [
    ...workspace.map((template) => ({ template, origin: 'workspace' as const })),
    ...global.map((template) => ({ template, origin: 'global' as const })),
    ...BUILT_IN_TEMPLATES.map((template) => ({ template, origin: 'built-in' as const }))
  ]
}

export async function saveTemplate(
  scope: TemplateScope,
  template: Partial<StoredTemplate>
): Promise<StoredTemplate | null> {
  try {
    const saved = await api.templates.save(scope, template)
    await refreshTemplates()
    return saved
  } catch (error) {
    notify('error', errorMessage(error))
    return null
  }
}

export async function removeTemplate(scope: TemplateScope, id: string): Promise<boolean> {
  try {
    await api.templates.delete(scope, id)
    await refreshTemplates()
    return true
  } catch (error) {
    notify('error', errorMessage(error))
    return false
  }
}

let started = false
/** Loads templates now and again whenever the open folder changes. */
export function startTemplateStore(): void {
  if (started) return
  started = true
  void refreshTemplates()
  useWorkspace.subscribe((state, previous) => {
    if (state.root !== previous.root) void refreshTemplates()
  })
}

export function originLabel(origin: TemplateOrigin): string {
  return origin === 'workspace' ? 'This folder' : origin === 'global' ? 'Global' : 'Built-in'
}
