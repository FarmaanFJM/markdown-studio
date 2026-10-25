import { isMarkdownPath } from '@shared/fileTypes'
import { basename } from '@shared/paths'
import { api, errorMessage } from '../bridge'
import { getActiveEditor } from '../editor/models'
import { resolveLocalPath, type DocumentContext } from '../markdown/resolve'
import { openDocument } from '../state/documents'
import { notify } from '../state/ui'

/**
 * A rendering error shown in the preview (a diagram or an equation that could not be drawn)
 * leads back to its place in the source when it is clicked or activated with Enter.
 */
export function jumpToPreviewSource(target: Element | null): boolean {
  const box = target?.closest?.('.ms-diagram-error, .ms-math-error')
  const holder = box?.closest('[data-ms-source-line], [data-ms-line]')
  const line = Number(
    holder?.getAttribute('data-ms-source-line') ?? holder?.getAttribute('data-ms-line')
  )
  const editor = getActiveEditor()
  if (!box || !line || !editor) return false
  editor.revealLineInCenter(line)
  editor.setPosition({ lineNumber: line, column: 1 })
  editor.focus()
  return true
}

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
  if (jumpToPreviewSource(event.target as Element | null)) {
    event.preventDefault()
    return
  }
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
