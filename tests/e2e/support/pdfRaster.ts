import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'

export interface RasterPage {
  index: number
  width: number
  height: number
  png: Buffer
  /** Bounding box of non-white pixels, in pixels; null for a blank page. */
  ink: { left: number; top: number; right: number; bottom: number } | null
  /** Fraction of pixels that are not white. */
  inkRatio: number
}

/**
 * Renders the pages of a PDF to images with PDF.js in a hidden window of the application under
 * test (the same Chromium the PDF preview uses), so tests can judge what a reader would actually
 * see, not only the file's metadata.
 */
export async function rasterizePdf(
  app: ElectronApplication,
  file: string,
  scale = 1.25
): Promise<RasterPage[]> {
  const dist = path.dirname(require.resolve('pdfjs-dist/package.json'))
  const work = mkdtempSync(path.join(tmpdir(), 'ms-raster-'))
  copyFileSync(path.join(dist, 'build', 'pdf.min.mjs'), path.join(work, 'pdf.min.mjs'))
  copyFileSync(
    path.join(dist, 'build', 'pdf.worker.min.mjs'),
    path.join(work, 'pdf.worker.min.mjs')
  )
  writeFileSync(path.join(work, 'doc.pdf'), readFileSync(file))
  writeFileSync(
    path.join(work, 'index.html'),
    `<!doctype html><meta charset="utf-8"><body><script type="module">
      import * as pdfjs from './pdf.min.mjs'
      pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
      window.render = async (scale) => {
        const data = new Uint8Array(await (await fetch('./doc.pdf')).arrayBuffer())
        const doc = await pdfjs.getDocument({ data }).promise
        const pages = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvasContext: ctx, canvas, viewport }).promise
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          let left = canvas.width, top = canvas.height, right = -1, bottom = -1, ink = 0
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            const o = (y * canvas.width + x) * 4
            if (pixels[o] < 245 || pixels[o+1] < 245 || pixels[o+2] < 245) {
              ink++; if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y
            }
          }
          pages.push({ width: canvas.width, height: canvas.height, url: canvas.toDataURL('image/png'),
            ink: right < 0 ? null : { left, top, right, bottom }, inkRatio: ink / (canvas.width * canvas.height) })
        }
        return pages
      }
      window.ready = true
    </script>`
  )
  const index = path.join(work, 'index.html')
  await app.evaluate(({ BrowserWindow }, target) => {
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    void window.loadFile(target)
  }, index)
  // The application may still be closing the window of an earlier export, so the viewer is the
  // window that loaded this page, not simply the next one to open.
  const marker = path.basename(work)
  const deadline = Date.now() + 30_000
  let viewer: Page | undefined
  while (!viewer) {
    viewer = app.windows().find((candidate) => candidate.url().includes(marker))
    if (!viewer) {
      if (Date.now() > deadline) throw new Error('The PDF viewer window did not open.')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  try {
    await viewer.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true)
    const rendered = await viewer.evaluate(
      (s) => (window as unknown as { render(s: number): Promise<unknown[]> }).render(s),
      scale
    )
    return (
      rendered as {
        width: number
        height: number
        url: string
        ink: RasterPage['ink']
        inkRatio: number
      }[]
    ).map((p, index) => ({
      index,
      width: p.width,
      height: p.height,
      ink: p.ink,
      inkRatio: p.inkRatio,
      png: Buffer.from(p.url.replace(/^data:image\/png;base64,/, ''), 'base64')
    }))
  } finally {
    await viewer.close()
  }
}

export function savePages(pages: RasterPage[], directory: string, prefix: string): string[] {
  mkdirSync(directory, { recursive: true })
  return pages.map((page) => {
    const file = path.join(directory, `${prefix}-${String(page.index + 1).padStart(2, '0')}.png`)
    writeFileSync(file, page.png)
    return file
  })
}
