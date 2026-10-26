import { pathsEqual } from '../paths'
import type { AppSettings } from '../settings'

export type AiBlock =
  'off' | 'no-provider' | 'workspace-disabled' | 'document-disabled' | 'not-configured'

export interface AiAvailability {
  available: boolean
  /** Why AI is not offered for this document, in the order a user would fix it. */
  blocked: AiBlock | null
}

/**
 * Whether AI actions are offered for a document. The master switch and provider come first, then
 * the per-workspace and per-document switches. Everything defaults to off, and the ordinary editor
 * never consults this unless the user opens an AI feature.
 */
export function aiAvailability(
  ai: AppSettings['ai'],
  workspaceRoot: string | null,
  documentPath: string | null
): AiAvailability {
  const blocked = (reason: AiBlock): AiAvailability => ({ available: false, blocked: reason })
  if (!ai.enabled) return blocked('off')
  if (ai.provider === 'none') return blocked('no-provider')
  if (!ai.model) return blocked('not-configured')
  if (workspaceRoot && ai.disabledWorkspaces.some((w) => pathsEqual(w, workspaceRoot))) {
    return blocked('workspace-disabled')
  }
  if (documentPath && ai.disabledDocuments.some((d) => pathsEqual(d, documentPath))) {
    return blocked('document-disabled')
  }
  return { available: true, blocked: null }
}

export const BLOCK_MESSAGES: Record<AiBlock, string> = {
  off: 'AI assistance is switched off.',
  'no-provider': 'Choose a provider in Settings › AI.',
  'not-configured': 'Enter a model name in Settings › AI.',
  'workspace-disabled': 'AI is switched off for this workspace.',
  'document-disabled': 'AI is switched off for this document.'
}

/** The list with `path` added or removed. */
export function toggledPath(list: readonly string[], path: string, present: boolean): string[] {
  const without = list.filter((p) => !pathsEqual(p, path))
  return present ? [...without, path] : without
}
