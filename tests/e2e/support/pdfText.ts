import { readFileSync } from 'node:fs'

export interface PdfTextItem {
  text: string
  /** Millimetres from the left edge of the page. */
  x: number
  /** Millimetres from the TOP edge of the page (baseline). */
  y: number
}

export interface PdfPageInfo {
  widthMm: number
  heightMm: number
  text: string
  items: PdfTextItem[]
}

const MM_PER_POINT = 25.4 / 72

/** Page sizes and positioned text of every page, read with PDF.js. */
export async function readPdf(file: string): Promise<PdfPageInfo[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(file)),
    isEvalSupported: false
  } as never).promise
  const pages: PdfPageInfo[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: PdfTextItem[] = []
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      const [, , , , x, y] = item.transform as number[]
      items.push({
        text: item.str,
        x: x * MM_PER_POINT,
        y: (viewport.height - y) * MM_PER_POINT
      })
    }
    pages.push({
      widthMm: viewport.width * MM_PER_POINT,
      heightMm: viewport.height * MM_PER_POINT,
      text: items.map((item) => item.text).join(' '),
      items
    })
  }
  return pages
}
