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

export interface ExportSource {
  source: string
  /** File name used for the title fallback, e.g. `README.md`. */
  fileName: string
  context: DocumentContext
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function titleFor({ source, fileName }: ExportSource): string {
  return documentTitle(source, stripExtension(basename(fileName)))
}

/** Renders the body and waits for every diagram, so the result is complete and static. */
async function renderCompleteBody(
  { source, context }: ExportSource,
  presentation: RenderPresentation
): Promise<{ container: HTMLTemplateElement; diagramProblems: DiagramProblem[] }> {
  const container = document.createElement('template')
  container.innerHTML = renderDocumentBody(source, context, presentation)
  let diagramProblems: DiagramProblem[] = []
  if (presentation.diagrams) {
    const hydration = hydrateDiagrams(container.content, diagramStyleFor(presentation.theme), {
      immediate: true
    })
    diagramProblems = (await hydration.done).problems
  }
  return { container, diagramProblems }
}

export interface PdfSourceHtml {
  html: string
  diagramProblems: DiagramProblem[]
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
  const { container, diagramProblems } = await renderCompleteBody(exportSource, adjusted)
  const html = buildHtmlDocument({
    title: titleFor(exportSource),
    body: container.innerHTML,
    purpose: 'preview',
    presentation: adjusted
  })
  return { html, diagramProblems }
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
  const { container, diagramProblems } = await renderCompleteBody(exportSource, presentation)
  const missingImages: string[] = []

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
        missingImages.push(original)
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
