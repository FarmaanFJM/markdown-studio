import { isMarkdownPath } from '@shared/fileTypes'
import { basename } from '@shared/paths'
import { api, errorMessage } from '../bridge'
import { resolveLocalPath, type DocumentContext } from '../markdown/resolve'
import { openDocument } from '../state/documents'
import { notify } from '../state/ui'

/**
 * Handles every click inside the preview. The rendered document never navigates itself:
 * fragments scroll, web links open in the system browser and links to Markdown files open
 * them in a tab. Anything else is refused.
 */
export function handlePreviewClick(
  event: MouseEvent,
  previewDocument: Document,
  context: DocumentContext
): void {
  const anchor = (event.target as Element | null)?.closest?.('a')
  if (!anchor) return
  event.preventDefault()
  const href = anchor.getAttribute('href')?.trim()
  if (!href) return

  if (href.startsWith('#')) {
    const id = decodeURIComponent(href.slice(1))
    const target = previewDocument.getElementById(id) ?? previewDocument.getElementsByName(id)[0]
    target?.scrollIntoView({ block: 'start' })
    return
  }
  if (/^(https?:|mailto:)/i.test(href)) {
    api.shell.openExternal(href).catch((error) => notify('error', errorMessage(error)))
    return
  }
  const local = resolveLocalPath(href, context)
  if (local && isMarkdownPath(local)) {
    void openDocument(local)
    return
  }
  notify(
    'info',
    local ? `${basename(local)} cannot be opened from the preview.` : `Unsupported link: ${href}`
  )
}
