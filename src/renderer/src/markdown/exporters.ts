import { basename, stripExtension } from '@shared/paths'
import { buildHtmlDocument, documentTitle, renderDocumentBody } from './document'
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

/** HTML used for both the PDF preview and PDF export, so the two are always identical. */
export function buildPdfSourceHtml({ source, fileName, context }: ExportSource): string {
  return buildHtmlDocument({
    title: documentTitle(source, stripExtension(basename(fileName))),
    body: renderDocumentBody(source, context),
    purpose: 'preview'
  })
}

export interface StandaloneHtml {
  html: string
  /** References whose image files could not be read and were left as written. */
  missingImages: string[]
}

/**
 * Builds a self-contained HTML document: local images are embedded as data URIs so the
 * file can be opened anywhere without depending on paths on this computer.
 */
export async function buildStandaloneHtml({
  source,
  fileName,
  context
}: ExportSource): Promise<StandaloneHtml> {
  const body = renderDocumentBody(source, context)
  const container = document.createElement('template')
  container.innerHTML = body
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
    title: documentTitle(source, stripExtension(basename(fileName))),
    body: container.innerHTML,
    purpose: 'export'
  })
  return { html, missingImages }
}
