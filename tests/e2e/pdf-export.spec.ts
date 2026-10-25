import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  exportViaDialog,
  focusEditor,
  launchWithWorkspace,
  mod,
  openFromTree,
  openInViewer,
  stubSaveDialog
} from './helpers'

interface PdfSummary {
  pages: number
  text: string
  images: number
}

/** Parses a PDF with PDF.js in Node: page count, extracted text and painted images. */
async function summarisePdf(file: string): Promise<PdfSummary> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(file)),
    isEvalSupported: false
  } as never).promise
  let text = ''
  let images = 0
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
    const ops = await page.getOperatorList()
    images += ops.fnArray.filter((fn) => fn === pdfjs.OPS.paintImageXObject).length
  }
  return { pages: doc.numPages, text, images }
}

async function canvasHasContent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.pdf-page canvas')
    if (!canvas || canvas.width === 0) return false
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let dark = 0
    for (let i = 0; i < data.length; i += 4 * 16) if (data[i] < 128 && data[i + 3] > 0) dark++
    return dark > 50
  })
}

test('the PDF preview shows real paginated output with working controls', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'README.md')
    await page.getByTestId('preview-tab-pdf').click()
    await expect(page.getByTestId('pdf-preview')).toBeVisible()
    await expect(page.locator('.pdf-page')).not.toHaveCount(0)
    const pages = await page.locator('.pdf-page').count()
    await expect(page.getByTestId('pdf-page-count')).toHaveText(`/ ${pages}`)
    await expect.poll(() => canvasHasContent(page)).toBe(true)

    // A4 proportions.
    const box = (await page.locator('.pdf-page').first().boundingBox())!
    expect(box.height / box.width).toBeCloseTo(297 / 210, 2)

    // Zoom and fit controls.
    await page.getByRole('button', { name: 'Fit whole page' }).click()
    const fitPage = await page.getByTestId('pdf-zoom').textContent()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(page.getByTestId('pdf-zoom')).not.toHaveText(fitPage!)
    await page.getByRole('button', { name: 'Fit to width' }).click()
    const pageBox = (await page.locator('.pdf-page').first().boundingBox())!
    const scrollBox = (await page.locator('.pdf-scroll').boundingBox())!
    expect(pageBox.width).toBeGreaterThan(scrollBox.width - 60)

    // Editing the document regenerates the PDF: a long addition adds pages.
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.insertText(
      '\n' +
        Array.from({ length: 120 }, (_, i) => `Paragraph ${i + 1} of the appendix.\n`).join('\n')
    )
    await expect
      .poll(() => page.locator('.pdf-page').count(), { timeout: 20_000 })
      .toBeGreaterThan(pages)

    const total = await page.locator('.pdf-page').count()
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByLabel('Page number')).toHaveValue('2')
    await page.getByLabel('Page number').fill(String(total))
    await page.getByLabel('Page number').press('Enter')
    await expect(page.getByLabel('Page number')).toHaveValue(String(total))
  } finally {
    await closeApp(app)
  }
})

test('PDF export writes the same document as the preview, with local images', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'README.md')
    await page.getByTestId('preview-tab-pdf').click()
    await expect(page.locator('.pdf-page')).not.toHaveCount(0)
    const previewPages = await page.locator('.pdf-page').count()

    const target = path.join(sandbox.base, 'exports', 'README.pdf')
    mkdirSync(path.dirname(target), { recursive: true })
    await stubSaveDialog(app, target)
    await exportViaDialog(page, 'pdf')
    await expect(page.getByTestId('toast-success')).toContainText('README.pdf')

    const bytes = readFileSync(target)
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    const pdf = await summarisePdf(target)
    expect(pdf.pages).toBe(previewPages)
    expect(pdf.text).toContain('Project Atlas')
    expect(pdf.text).toContain('This is HTML inside Markdown.')
    expect(pdf.text).toContain('Gateway')
    expect(pdf.images).toBeGreaterThanOrEqual(1)
  } finally {
    await closeApp(app)
  }
})

test('HTML export produces a valid standalone document with embedded images', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'docs', 'guide.md')
    const target = path.join(sandbox.base, 'exports', 'guide.html')
    mkdirSync(path.dirname(target), { recursive: true })
    await stubSaveDialog(app, target)
    // The toolbar button opens the Export dialog (the File menu command does the same).
    await exportViaDialog(page, 'html')
    await expect(page.getByTestId('toast-success')).toContainText('guide.html')

    const html = readFileSync(target, 'utf8')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<title>User Guide</title>')
    expect(html).toContain('<meta name="generator" content="Markdown Studio">')
    expect(html).toMatch(/<img src="data:image\/jpeg;base64,[A-Za-z0-9+/=]{100,}"/)
    expect(html).not.toContain('msfile:')
    expect(html).not.toContain('data-ms-src')
    expect(html).toContain('href="../README.md"')

    // Open the exported file in a separate browser, from a different folder: images still show.
    const elsewhere = path.join(sandbox.base, 'moved', 'guide.html')
    mkdirSync(path.dirname(elsewhere), { recursive: true })
    copyFileSync(target, elsewhere)
    const viewer = await openInViewer(app, elsewhere)
    expect(await viewer.locator('h1').textContent()).toBe('User Guide')
    expect(
      await viewer
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
    ).toBe(true)
  } finally {
    await closeApp(app)
  }
})

test('HTML export keeps tables, code, task lists and inline HTML', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'README.md')
    const target = path.join(sandbox.base, 'README.html')
    await stubSaveDialog(app, target)
    await exportViaDialog(page, 'html')
    await expect(page.getByTestId('toast-success')).toBeVisible()

    const viewer = await openInViewer(app, target)
    expect(await viewer.locator('table tbody tr').count()).toBe(3)
    expect(await viewer.locator('pre code.language-ts .hljs-keyword').count()).toBeGreaterThan(0)
    expect(await viewer.locator('.task-list-item-checkbox:checked').count()).toBe(1)
    const inline = viewer.locator('#inline-html')
    expect(await inline.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 0, 0)')
    expect(await viewer.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(
      640
    )
  } finally {
    await closeApp(app)
  }
})
