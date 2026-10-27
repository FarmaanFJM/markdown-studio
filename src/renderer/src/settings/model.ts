import type { SettingsCategoryId } from '../state/ui'

export const SETTINGS_CATEGORIES: { id: SettingsCategoryId; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'preview', label: 'Preview' },
  { id: 'export', label: 'PDF / Export' },
  { id: 'files', label: 'Files & Assets' },
  { id: 'ai', label: 'AI' },
  { id: 'advanced', label: 'Advanced' }
]

/** Whether `entry` matches every word of `query` (case-insensitive); an empty query matches. */
export function matchesQuery(entry: { title: string; keywords: string }, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = `${entry.title} ${entry.keywords}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}
