import type { PreviewKind } from '@shared/settings'

/**
 * The preview openers shown next to the editor tabs. Hiding the preview is deliberately not one
 * of them: the preview panel's own close button is the single control for that.
 */
export const PREVIEW_LAYOUTS: { mode: PreviewKind; label: string }[] = [
  { mode: 'html', label: 'Source and HTML preview' },
  { mode: 'pdf', label: 'Source and PDF preview' }
]
