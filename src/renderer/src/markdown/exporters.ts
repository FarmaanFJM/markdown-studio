import { basename, stripExtension } from '@shared/paths'
import { contentHeightPx, type PdfOptions } from '@shared/export/pdf'
import type { HtmlOptions } from '@shared/presentation/settings'
import { auditExportedHtml } from './audit'
import { hydrateDiagrams, type DiagramProblem } from './diagrams'
import { diagramStyleFor } from './diagramStyle'
import {
  buildHtmlDocument,
  DEFAULT_PRESENTATION,
  documentTitle,
  renderDocumentBody,
  type RenderPresentation
} from './document'
import type { DocumentContext } from './resolve'
import type { DocumentColumns, DocumentSettingsData } from '@shared/publishing/documentSettings'
import type { PublishingOptions } from '@shared/publishing/types'
import { pathFromLocalFileUrl } from '@shared/ipc'
import { api } from '../bridge'

export interface ExportSource {
  source: string
  /** File name used for the title fallback, e.g. `README.md`. */
  fileName: string
  context: DocumentContext
  /** Options of the publishing layer (numbering, citations, contents) for this document. */
  publishing?: PublishingOptions
  /**
   * Supplies the finished body HTML instead of rendering `source` (a publication combines
   * several chapters, each resolving its images from its own folder).
   */
  body?: (presentation: RenderPresentation) => string | Promise<string>
  /** Title shown in the document and PDF header; defaults to the first heading. */
  title?: string
  /** The document's own settings (front matter): page, columns, theme, numbering. */
  settings?: DocumentSettingsData
  columns?: DocumentColumns | null
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function titleFor({ source, fileName, title }: ExportSource): string {
  return title ?? documentTitle(source, stripExtension(basename(fileName)))
}

/** Renders the body and waits for every diagram, so the result is complete and static. */
async function renderCompleteBody(
  { source, context, publishing, body }: ExportSource,
  presentation: RenderPresentation
): Promise<{
  container: HTMLTemplateElement
  diagramProblems: DiagramProblem[]
  missingImages: string[]
}> {
  const container = document.createElement('template')
  container.innerHTML = body
    ? await body(presentation)
    : renderDocumentBody(source, context, presentation, publishing)
  const missingImages = await markMissingImages(container.content)
  let diagramProblems: DiagramProblem[] = []
  if (presentation.diagrams) {
    const hydration = hydrateDiagrams(container.content, diagramStyleFor(presentation.theme), {
      immediate: true
    })
    diagramProblems = (await hydration.done).problems
  }
  return { container, diagramProblems, missingImages }
}

/**
 * Marks images whose file does not exist, so the page says "image not found" where the picture
 * should be (and the PDF and HTML do not silently show an empty box). Returns the references.
 */
async function markMissingImages(root: ParentNode): Promise<string[]> {
  const images = [...root.querySelectorAll('img')].flatMap((img) => {
    const path = pathFromLocalFileUrl(img.getAttribute('src') ?? '')
    return path ? [{ img, path }] : []
  })
  if (images.length === 0) return []
  let states: string[]
  try {
    states = await api.fs.statMany([...new Set(images.map((i) => i.path))])
  } catch {
    return []
  }
  const unique = [...new Set(images.map((i) => i.path))]
  const missing = new Set(unique.filter((_, index) => states[index] === 'missing'))
  const references: string[] = []
  for (const { img, path } of images) {
    if (!missing.has(path)) continue
    img.classList.add('ms-img-missing')
    const original = img.getAttribute('data-ms-src') ?? path
    img.setAttribute('title', `Image not found: ${original}`)
    references.push(original)
  }
  return [...new Set(references)]
}

export interface PdfSourceHtml {
  html: string
  diagramProblems: DiagramProblem[]
  /** References whose image file does not exist. */
  missingImages: string[]
}

/** HTML used for both the PDF preview and PDF export, so the two are always identical. */
export async function buildPdfSourceHtml(
  exportSource: ExportSource,
  presentation: RenderPresentation = DEFAULT_PRESENTATION,
  pdf?: PdfOptions
): Promise<PdfSourceHtml> {
  const adjusted: RenderPresentation = pdf
    ? {
        ...presentation,
        pageContentHeightPx: contentHeightPx(pdf),
        pageBackground: pdf.printBackground ? pdf.backgroundColor : null
      }
    : presentation
  const { container, diagramProblems, missingImages } = await renderCompleteBody(
    exportSource,
    adjusted
  )
  const html = buildHtmlDocument({
    title: titleFor(exportSource),
    body: container.innerHTML,
    purpose: 'preview',
    presentation: adjusted
  })
  return { html, diagramProblems, missingImages }
}

export interface StandaloneHtml {
  html: string
  /** References whose image files could not be read and were left as written. */
  missingImages: string[]
  /** `http(s)` images that remain remote. */
  remoteImages: string[]
  /** Links to local files that will not work once the file is moved. */
  unresolvedLinks: string[]
  brokenAnchors: string[]
  diagramProblems: DiagramProblem[]
}

export class UnsafeExportError extends Error {
  constructor(readonly reasons: string[]) {
    super(`The export was stopped because the document is not safe: ${reasons.join(' ')}`)
    this.name = 'UnsafeExportError'
  }
}

/**
 * Builds a self-contained HTML document: local images are embedded as data URIs so the
 * file can be opened anywhere without depending on paths on this computer. The finished
 * document is audited before it is returned.
 */
export async function buildStandaloneHtml(
  exportSource: ExportSource,
  presentation: RenderPresentation = DEFAULT_PRESENTATION,
  options: HtmlOptions = { embedImages: true }
): Promise<StandaloneHtml> {
  const rendered = await renderCompleteBody(exportSource, presentation)
  const { container, diagramProblems } = rendered
  const missingImages: string[] = [...rendered.missingImages]

  await Promise.all(
    [...container.content.querySelectorAll('img')].map(async (img) => {
      const src = img.getAttribute('src') ?? ''
      const original = img.getAttribute('data-ms-src') ?? ''
      img.removeAttribute('data-ms-src')
      if (!src.startsWith('msfile:')) {
        if (!src && original) img.setAttribute('src', original)
        return
      }
      if (!options.embedImages) {
        // Without embedding, a file path is the only honest reference left.
        img.setAttribute('src', original)
        return
      }
      try {
        const response = await fetch(src)
        if (!response.ok) throw new Error(String(response.status))
        img.setAttribute('src', await blobToDataUrl(await response.blob()))
      } catch {
        if (!missingImages.includes(original)) missingImages.push(original)
        img.setAttribute('src', original)
      }
    })
  )

  const html = buildHtmlDocument({
    title: titleFor(exportSource),
    body: container.innerHTML,
    purpose: 'export',
    presentation
  })
  const audit = auditExportedHtml(html)
  if (audit.violations.length > 0) throw new UnsafeExportError(audit.violations)
  return {
    html,
    missingImages,
    remoteImages: audit.remoteImages,
    unresolvedLinks: audit.unresolvedLinks,
    brokenAnchors: audit.brokenAnchors,
    diagramProblems
  }
}
