import { useEffect, useMemo, useRef, useState } from 'react'
import { dirname } from '@shared/paths'
import { handleGlobalKeydown } from '../commands/keybindings'
import { documentModels } from '../editor/models'
import { buildHtmlDocument, renderDocumentBody } from '../markdown/document'
import type { DocumentContext } from '../markdown/resolve'
import { useDocuments } from '../state/documents'
import { useWorkspace } from '../state/workspace'
import { handlePreviewClick } from './links'

const RENDER_DELAY_MS = 120

/**
 * Live HTML preview.
 *
 * The document is shown in an iframe sandboxed *without* `allow-scripts`, so nothing in it can
 * run, even if sanitisation missed something. `allow-same-origin` lets the application update
 * the body in place (keeping the scroll position) and intercept link clicks.
 */
export function HtmlPreview() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [frameDocument, setFrameDocument] = useState<Document | null>(null)
  const activeId = useDocuments((s) => s.activeId)
  const activePath = useDocuments((s) => s.documents.find((d) => d.id === s.activeId)?.path ?? null)
  const revision = useDocuments((s) => s.revision)
  const root = useWorkspace((s) => s.root)
  const contextRef = useRef<DocumentContext>({ documentDirectory: null, workspaceRoot: null })
  contextRef.current = {
    documentDirectory: activePath ? dirname(activePath) : null,
    workspaceRoot: root
  }

  const shell = useMemo(
    () => buildHtmlDocument({ title: 'Preview', body: '', purpose: 'preview' }),
    []
  )

  useEffect(() => {
    if (!frameDocument) return
    const onClick = (event: MouseEvent) =>
      handlePreviewClick(event, frameDocument, contextRef.current)
    const onAuxClick = (event: MouseEvent) => event.preventDefault()
    // Keyboard shortcuts keep working while the preview has focus.
    const onKeyDown = (event: KeyboardEvent) => handleGlobalKeydown(event)
    frameDocument.addEventListener('click', onClick)
    frameDocument.addEventListener('auxclick', onAuxClick)
    frameDocument.addEventListener('keydown', onKeyDown, true)
    return () => {
      frameDocument.removeEventListener('click', onClick)
      frameDocument.removeEventListener('auxclick', onAuxClick)
      frameDocument.removeEventListener('keydown', onKeyDown, true)
    }
  }, [frameDocument])

  useEffect(() => {
    if (!frameDocument) return
    const timer = setTimeout(() => {
      const main = frameDocument.querySelector('main')
      if (!main) return
      const model = documentModels.get(activeId)
      main.innerHTML = model ? renderDocumentBody(model.getValue(), contextRef.current) : ''
    }, RENDER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [frameDocument, activeId, activePath, revision, root])

  // A different document starts at the top.
  useEffect(() => {
    frameDocument?.scrollingElement?.scrollTo(0, 0)
  }, [frameDocument, activeId])

  return (
    <iframe
      ref={frameRef}
      className="html-preview"
      title="HTML preview"
      data-testid="html-preview"
      sandbox="allow-same-origin"
      srcDoc={shell}
      onLoad={() => setFrameDocument(frameRef.current?.contentDocument ?? null)}
    />
  )
}
