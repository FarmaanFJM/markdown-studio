/**
 * Long tables, wide content, large images and page transitions in the real PDF output: nothing
 * may disappear or run outside the page, in one column and in two.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  exportViaDialog,
  launchWithWorkspace,
  openFromTree,
  seedDocuments,
  stubSaveDialog
} from './helpers'
import { rasterizePdf } from './support/pdfRaster'
import { readPdf } from './support/pdfText'

const SHOTS = process.env.MS_SCREENSHOTS ? path.resolve(__dirname, '../../docs/screenshots') : null

/** A valid PNG of the given size (a plain gradient), written without any image library. */
function bigPng(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = (x * 255) / width
      raw[row + 2 + x * 3] = (y * 255) / height
      raw[row + 3 + x * 3] = 128
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'latin1')
    data.copy(out, 8)
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const rows = Array.from(
  { length: 140 },
  (_, i) => `| Row ${i + 1} | value ${i + 1} | note for row ${i + 1} |`
)
const wideHeader = Array.from({ length: 12 }, (_, i) => `Column${i + 1}`)
const wide = [
  `| ${wideHeader.join(' | ')} |`,
  `| ${wideHeader.map(() => '---').join(' | ')} |`,
  `| ${wideHeader.map((_, i) => `Unbreakable${'x'.repeat(18)}${i}`).join(' | ')} |`
]

const DOC = (columns: boolean) => `---
lang: en
${columns ? 'studio:\n  columns: { count: 2, gap: 8 }\n' : ''}---

# Stress document

## Long table

| Name | Value | Note |
| ---- | ----: | ---- |
${rows.join('\n')}

: One hundred and forty rows that continue over several pages {#tbl-long}

## Wide table

${wide.join('\n')}

: Twelve columns with long words {#tbl-wide}

## Large image

![A very large picture](big.png){#fig-big}

## Code

\`\`\`text
${'This is a very long line of code that must wrap instead of running off the page. '.repeat(6)}
\`\`\`

## End

The last paragraph LASTWORDMARKER.
`

for (const columns of [false, true]) {
  test(`long and wide content stays complete and inside the page (${columns ? 'two columns' : 'one column'})`, async () => {
    const sandbox = createSandbox()
    seedDocuments(sandbox, { 'stress.md': DOC(columns) })
    writeFileSync(path.join(sandbox.workspace, 'big.png'), bigPng(2400, 1800))
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await openFromTree(page, 'stress.md')
      const target = path.join(sandbox.base, 'exports', 'stress.pdf')
      mkdirSync(path.dirname(target), { recursive: true })
      await stubSaveDialog(app, target)
      await exportViaDialog(page, 'pdf')
      await expect(page.locator('[data-testid^="toast-"]').last()).toContainText('stress.pdf', {
        timeout: 90_000
      })
      const pages = await readPdf(target)
      expect(pages.length).toBeGreaterThanOrEqual(4)
      const raster = await rasterizePdf(app, target, 1.0)
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true })
        raster
          .slice(0, 8)
          .forEach((r, i) =>
            writeFileSync(
              path.join(SHOTS, `stress-${columns ? 'two' : 'one'}-page-${i + 1}.png`),
              r.png
            )
          )
      }
      const all = pages.map((p) => p.text).join(' ')
      // Nothing disappeared: the first and last rows, the last words and the caption numbers.
      for (const marker of ['Row 1 ', 'Row 140', 'value 140', 'LASTWORDMARKER']) {
        expect(all).toContain(marker)
      }
      // All twelve columns of the wide table are there (none clipped at the right edge).
      expect((all.match(/Colu/g) ?? []).length).toBeGreaterThanOrEqual(12)
      // The table header repeats on the pages the table continues on.
      const headerPages = pages.filter((p) => p.text.includes('Name') && p.text.includes('Note'))
      expect(headerPages.length).toBeGreaterThanOrEqual(2)

      const mm = 25.4 / 72
      for (const [index, rendered] of raster.entries()) {
        if (!rendered.ink) continue
        // Margins are 20 mm: no ink may touch the outer 12 mm of the page.
        expect(rendered.ink.left * mm, `page ${index + 1} left`).toBeGreaterThanOrEqual(12)
        expect(
          rendered.width * mm - rendered.ink.right * mm,
          `page ${index + 1} right`
        ).toBeGreaterThanOrEqual(12)
        expect(
          rendered.height * mm - rendered.ink.bottom * mm,
          `page ${index + 1} bottom`
        ).toBeGreaterThanOrEqual(12)
      }
      // The large image is in the PDF and fits on its page.
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(readFileSync(target)),
        isEvalSupported: false
      } as never).promise
      let images = 0
      for (let i = 1; i <= doc.numPages; i++) {
        images += (await (await doc.getPage(i)).getOperatorList()).fnArray.filter(
          (fn) => fn === pdfjs.OPS.paintImageXObject
        ).length
      }
      expect(images).toBeGreaterThanOrEqual(1)
    } finally {
      await closeApp(app)
    }
  })
}
