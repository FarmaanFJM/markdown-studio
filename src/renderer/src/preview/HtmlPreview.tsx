import { useEffect, useMemo, useRef, useState } from 'react'
import { dirname } from '@shared/paths'
import { handleGlobalKeydown } from '../commands/keybindings'
import { documentModels } from '../editor/models'
import { hydrateDiagrams, type Hydration } from '../markdown/diagrams'
import { diagramStyleFor } from '../markdown/diagramStyle'
import {
  buildHtmlDocument,
  mainAttributeMap,
  renderDocumentBody,
  themeStyleText,
  type RenderPresentation
} from '../markdown/document'
import { katexStylesheet } from '../markdown/katexCss'
import type { DocumentContext } from '../markdown/resolve'
import { useDocuments } from '../state/documents'
import { usePresentation } from '../state/presentation'
import { adaptiveDelay } from '../state/timing'
import { useWorkspace } from '../state/workspace'
import { documentPublishing, presentationForDocument } from '../publishing/documentPublishing'
import { loadPublicationBuild, publicationExportSource } from '../publishing/publicationSource'
import { useProject } from '../state/project'
import { usePublicationView } from '../state/publicationView'
import { handlePreviewClick, jumpToPreviewSource } from './links'

const RENDER_DELAY_MS = 120

/** Applies theme, custom CSS and math styles to the open preview without reloading it. */
function applyPresentation(doc: Document, presentation: RenderPresentation): void {
  const set = (id: string, text: string) => {
    const style = doc.getElementById(id)
    if (style && style.textContent !== text) style.textContent = text
  }
  set('ms-theme', themeStyleText(presentation))
  set('ms-custom-css', presentation.customCss)
  const math = doc.getElementById('ms-math')
  if (presentation.math && !math) {
    const style = doc.createElement('style')
    style.id = 'ms-math'
    style.textContent = katexStylesheet()
    doc.head.insertBefore(style, doc.getElementById('ms-custom-css'))
  } else if (!presentation.math && math) {
    math.remove()
  }
  const main = doc.querySelector('main')
  if (main) {
    const wanted = mainAttributeMap(presentation)
    for (const name of main.getAttributeNames()) {
      if (name !== 'class' && !(name in wanted)) main.removeAttribute(name)
    }
    for (const [name, value] of Object.entries(wanted)) main.setAttribute(name, value)
  }
}

/**
 * Live HTML preview.
 *
 * The document is shown in an iframe sandboxed *without* `allow-scripts`, so nothing in it can
 * run, even if sanitisation missed something. `allow-same-origin` lets the application update
 * the body in place (keeping the scroll position) and intercept link clicks. Theme changes
 * update the styles in place too, so neither scroll position nor editor focus is disturbed.
 */
export function HtmlPreview() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [frameDocument, setFrameDocument] = useState<Document | null>(null)
  const activeId = useDocuments((s) => s.activeId)
  const activePath = useDocuments((s) => s.documents.find((d) => d.id === s.activeId)?.path ?? null)
  const revision = useDocuments((s) => s.revision)
  const root = useWorkspace((s) => s.root)
  const presentation = usePresentation((s) => s.render)
  const customization = usePresentation((s) => s.effective.customization)
  const librarySources = useProject((s) => s.sources)
  const publicationConfig = useProject((s) => s.publication)
  const showPublication = usePublicationView((s) => s.previewing)
  const contextRef = useRef<DocumentContext>({ documentDirectory: null, workspaceRoot: null })
  contextRef.current = {
    documentDirectory: activePath ? dirname(activePath) : null,
    workspaceRoot: root
  }
  const hydration = useRef<Hydration | null>(null)

  const shell = useMemo(
    () =>
      buildHtmlDocument({
        title: 'Preview',
        body: '',
        purpose: 'preview',
        presentation,
        forceMathStyles: true
      }),
    // The shell is created once; later presentation changes are applied in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    if (!frameDocument) return
    const onClick = (event: MouseEvent) =>
      handlePreviewClick(event, frameDocument, contextRef.current)
    const onAuxClick = (event: MouseEvent) => event.preventDefault()
    // Keyboard shortcuts keep working while the preview has focus.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && jumpToPreviewSource(event.target as Element)) {
        event.preventDefault()
        return
      }
      handleGlobalKeydown(event)
    }
    // Images that cannot load are marked, so the page says what is wrong instead of showing a
    // blank box. `error` does not bubble, hence the capture phase.
    const onImageError = (event: Event) => {
      const target = event.target
      if (target instanceof (frameDocument.defaultView?.HTMLImageElement ?? HTMLImageElement)) {
        target.classList.add('ms-img-missing')
        target.setAttribute(
          'title',
          `Image not found: ${target.getAttribute('data-ms-src') ?? target.alt}`
        )
      }
    }
    frameDocument.addEventListener('error', onImageError, true)
    frameDocument.addEventListener('click', onClick)
    frameDocument.addEventListener('auxclick', onAuxClick)
    frameDocument.addEventListener('keydown', onKeyDown, true)
    return () => {
      frameDocument.removeEventListener('error', onImageError, true)
      frameDocument.removeEventListener('click', onClick)
      frameDocument.removeEventListener('auxclick', onAuxClick)
      frameDocument.removeEventListener('keydown', onKeyDown, true)
    }
  }, [frameDocument])

  useEffect(() => {
    if (!frameDocument) return
    let cancelled = false
    const timer = setTimeout(
      () => {
        const main = frameDocument.querySelector('main')
        if (!main) return
        hydration.current?.cancel()
        hydration.current = null
        const finish = (html: string, shown: RenderPresentation, hydrate: boolean) => {
          if (cancelled) return
          applyPresentation(frameDocument, shown)
          main.innerHTML = html
          performance.measure('ms:preview-render', 'ms:render-start')
          if (hydrate && shown.diagrams) {
            hydration.current = hydrateDiagrams(main, diagramStyleFor(shown.theme), {
              immediate: false
            })
          }
        }
        // Marks let the benchmark suite measure full-document render time.
        performance.mark('ms:render-start')
        if (showPublication) {
          void loadPublicationBuild().then((loaded) => {
            if (cancelled) return
            if (!loaded) {
              finish(
                '<p class="ms-chapter-missing">This folder has no publication yet. Create one in the Publication panel.</p>',
                presentation,
                false
              )
              return
            }
            const source = publicationExportSource(loaded)
            const shown = presentationForDocument(
              presentation,
              { settings: source.settings ?? {}, columns: source.columns ?? null },
              customization
            )
            finish(loaded.build.body(shown), shown, true)
          })
          return
        }
        const model = documentModels.get(activeId)
        const text = model ? model.getValue() : ''
        const publishing = documentPublishing(text)
        const shown = presentationForDocument(presentation, publishing, customization)
        finish(
          model ? renderDocumentBody(text, contextRef.current, shown, publishing.options) : '',
          shown,
          model !== undefined && model !== null
        )
      },
      adaptiveDelay(RENDER_DELAY_MS, documentModels.get(activeId)?.getValueLength() ?? 0)
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    frameDocument,
    activeId,
    activePath,
    revision,
    root,
    presentation,
    customization,
    librarySources,
    publicationConfig,
    showPublication
  ])

  useEffect(
    () => () => {
      hydration.current?.cancel()
    },
    []
  )

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
