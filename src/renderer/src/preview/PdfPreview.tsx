import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, MoveHorizontal, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { api, errorMessage } from '../bridge'
import { exportSourceFor } from '../commands/commands'
import { buildPdfSourceHtml } from '../markdown/exporters'
import { activeDocument, useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'
import { useWorkspace } from '../state/workspace'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const AUTO_REFRESH_DELAY_MS = 900
const MIN_SCALE = 0.25
const MAX_SCALE = 4
const PAGE_GAP = 16

type Fit = 'width' | 'page' | null

interface PageSize {
  width: number
  height: number
}

function PdfPage({ pdf, index, size, scale }: { pdf: PDFDocumentProxy; index: number; size: PageSize; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const holderRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '150% 0px'
    })
    observer.observe(holder)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let task: RenderTask | null = null
    let cancelled = false
    void pdf.getPage(index + 1).then((page) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const ratio = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: scale * ratio })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      task = page.render({ canvas, viewport })
      task.promise.catch(() => undefined)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, index, scale, visible])

  return (
    <div
      ref={holderRef}
      className="pdf-page"
      data-page={index + 1}
      style={{ width: size.width * scale, height: size.height * scale }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} aria-label={`Page ${index + 1}`} />
    </div>
  )
}

/**
 * Real PDF preview: the main process prints the document with Chromium (the same call used for
 * PDF export) and the resulting file is displayed with PDF.js.
 */
export function PdfPreview() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const loadingTask = useRef<PDFDocumentLoadingTask | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<PageSize[]>([])
  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [scale, setScale] = useState(1)
  const [fit, setFit] = useState<Fit>('width')
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')

  const activeId = useDocuments((s) => s.activeId)
  const activePath = useDocuments((s) => s.documents.find((d) => d.id === s.activeId)?.path ?? null)
  const revision = useDocuments((s) => s.revision)
  const root = useWorkspace((s) => s.root)
  const autoRefresh = useSettings((s) => s.settings.preview.pdfAutoRefresh)

  const generate = useCallback(async () => {
    const doc = activeDocument()
    const source = doc && exportSourceFor(doc)
    const id = ++generation.current
    if (!source) {
      setPdf(null)
      setSizes([])
      setStatus('idle')
      return
    }
    setStatus('generating')
    try {
      const bytes = await api.render.pdf(buildPdfSourceHtml(source))
      const task = pdfjs.getDocument({ data: bytes, enableXfa: false })
      const loaded = await task.promise
      const pageSizes = await Promise.all(
        Array.from({ length: loaded.numPages }, async (_, i) => {
          const viewport = (await loaded.getPage(i + 1)).getViewport({ scale: 1 })
          return { width: viewport.width, height: viewport.height }
        })
      )
      if (id !== generation.current) {
        void task.destroy()
        return
      }
      const previous = loadingTask.current
      loadingTask.current = task
      setPdf(loaded)
      // Release the previous document's worker resources once the new one is displayed.
      setTimeout(() => void previous?.destroy(), 0)
      setSizes(pageSizes)
      setStatus('ready')
      setStale(false)
      setError(null)
    } catch (err) {
      if (id !== generation.current) return
      setStatus('error')
      setError(errorMessage(err))
    }
  }, [])

  // A different document is rendered at once; edits regenerate after a pause, since printing
  // a PDF is relatively expensive, or only on request when auto refresh is off.
  const shownDocument = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const switched = shownDocument.current !== activeId
    shownDocument.current = activeId
    if (switched) {
      void generate()
      return
    }
    if (!autoRefresh) {
      setStale(true)
      return
    }
    const timer = setTimeout(() => void generate(), AUTO_REFRESH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [activeId, activePath, revision, root, autoRefresh, generate])

  useEffect(
    () => () => {
      generation.current++
      void loadingTask.current?.destroy()
    },
    []
  )

  const applyFit = useCallback(
    (mode: Fit) => {
      const container = scrollRef.current
      const first = sizes[0]
      if (!container || !first || !mode) return
      const width = (container.clientWidth - 2 * PAGE_GAP) / first.width
      const height = (container.clientHeight - 2 * PAGE_GAP) / first.height
      const next = mode === 'width' ? width : Math.min(width, height)
      setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)))
    },
    [sizes]
  )

  useLayoutEffect(() => {
    applyFit(fit)
  }, [fit, applyFit])

  useEffect(() => {
    const container = scrollRef.current
    if (!container || !fit) return
    const observer = new ResizeObserver(() => applyFit(fit))
    observer.observe(container)
    return () => observer.disconnect()
  }, [fit, applyFit])

  const onScroll = () => {
    const container = scrollRef.current
    if (!container) return
    const probe = container.scrollTop + container.clientHeight / 3
    const pages = [...container.querySelectorAll<HTMLElement>('.pdf-page')]
    const current = pages.findLast((element) => element.offsetTop <= probe)
    const number = current ? Number(current.dataset.page) : 1
    if (number !== page) {
      setPage(number)
      setPageInput(String(number))
    }
  }

  const goToPage = (number: number) => {
    const total = sizes.length
    if (!total) return
    const target = Math.min(total, Math.max(1, number))
    const element = scrollRef.current?.querySelector<HTMLElement>(`.pdf-page[data-page="${target}"]`)
    if (element && scrollRef.current) scrollRef.current.scrollTop = element.offsetTop - PAGE_GAP
    setPage(target)
    setPageInput(String(target))
  }

  const zoom = (factor: number) => {
    setFit(null)
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * factor * 100) / 100)))
  }

  const total = sizes.length

  return (
    <div className="pdf-preview" data-testid="pdf-preview">
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF controls">
        <button type="button" className="icon-button" title="Previous page" aria-label="Previous page" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
          <ChevronLeft size={15} />
        </button>
        <input
          className="page-input"
          aria-label="Page number"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') goToPage(Number(pageInput) || 1)
          }}
          onBlur={() => setPageInput(String(page))}
        />
        <span className="page-count" data-testid="pdf-page-count">
          / {total}
        </span>
        <button type="button" className="icon-button" title="Next page" aria-label="Next page" disabled={page >= total} onClick={() => goToPage(page + 1)}>
          <ChevronRight size={15} />
        </button>
        <span className="toolbar-divider" />
        <button type="button" className="icon-button" title="Zoom out" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>
          <ZoomOut size={15} />
        </button>
        <span className="zoom-label" data-testid="pdf-zoom">{Math.round(scale * 100)}%</span>
        <button type="button" className="icon-button" title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.2)}>
          <ZoomIn size={15} />
        </button>
        <button
          type="button"
          className={`icon-button${fit === 'width' ? ' toggled' : ''}`}
          title="Fit to width"
          aria-label="Fit to width"
          aria-pressed={fit === 'width'}
          onClick={() => setFit('width')}
        >
          <MoveHorizontal size={15} />
        </button>
        <button
          type="button"
          className={`icon-button${fit === 'page' ? ' toggled' : ''}`}
          title="Fit whole page"
          aria-label="Fit whole page"
          aria-pressed={fit === 'page'}
          onClick={() => setFit('page')}
        >
          <Maximize size={14} />
        </button>
        <span className="toolbar-spacer" />
        {status === 'generating' && <span className="pdf-status">Generating…</span>}
        {stale && status !== 'generating' && <span className="pdf-status">Out of date</span>}
        <button
          type="button"
          className="icon-button"
          title="Regenerate PDF"
          aria-label="Regenerate PDF"
          data-testid="pdf-refresh"
          onClick={() => void generate()}
        >
          <RefreshCw size={14} className={status === 'generating' ? 'spin' : ''} />
        </button>
      </div>
      <div ref={scrollRef} className="pdf-scroll" onScroll={onScroll}>
        {status === 'error' && <div className="preview-message error">PDF generation failed: {error}</div>}
        {!activeId && <div className="preview-message">Open a Markdown document to preview it as PDF.</div>}
        {pdf &&
          sizes.map((size, index) => (
            <PdfPage key={`${index}-${pdf.fingerprints[0]}`} pdf={pdf} index={index} size={size} scale={scale} />
          ))}
      </div>
    </div>
  )
}
