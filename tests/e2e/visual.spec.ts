import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  exportViaDialog,
  launchWithWorkspace,
  openFromTree,
  seedDocuments,
  stubSaveDialog,
  waitForDiagrams,
  type Sandbox
} from './helpers'
import { makePng } from './support/png'
import { rasterizePdf, savePages } from './support/pdfRaster'
import { readPdf } from './support/pdfText'

function target(sandbox: Sandbox, name: string): string {
  const file = path.join(sandbox.base, 'out', name)
  mkdirSync(path.dirname(file), { recursive: true })
  return file
}

test('printed pages respect margins, repeat table headers and keep headings with their text', async () => {
  test.setTimeout(180_000)
  const sandbox = createSandbox()
  const rows = Array.from(
    { length: 90 },
    (_, i) => `| row ${i + 1} | value ${i * 3} | note ${i} |`
  ).join('\n')
  const body = Array.from(
    { length: 16 },
    (_, i) => `## Section ${i + 1}\n\n${'Body text of the section that fills lines. '.repeat(26)}\n`
  ).join('\n')
  seedDocuments(sandbox, {
    'print.md': `# Print layout\n\n${body}\n## Data\n\n| Item | Value | Note |\n| ---- | ----- | ---- |\n${rows}\n`
  })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'print.md')
    const pdf = target(sandbox, 'print.pdf')
    await stubSaveDialog(app, pdf)
    await exportViaDialog(page, 'pdf', async (dialog) => {
      await dialog.getByTestId('export-margin-left').fill('25')
      await dialog.getByTestId('export-margin-left').press('Enter')
    })
    await expect(page.getByTestId('toast-success')).toBeVisible()

    const pages = await readPdf(pdf)
    expect(pages.length).toBeGreaterThanOrEqual(4)
    // Table header rows repeat on every page the table continues onto.
    const tablePages = pages.filter(
      (p) => p.text.includes('row 1') || p.text.includes('row 60') || p.text.includes('row 90')
    )
    expect(tablePages.length).toBeGreaterThanOrEqual(2)
    for (const p of tablePages) expect(p.text).toContain('Item Value Note')
    // A heading is never the last thing on a page.
    for (const p of pages) {
      const lastBody = [...p.items]
        .filter((i) => i.y < p.heightMm - 20)
        .sort((a, b) => b.y - a.y)[0]
      expect(lastBody.text, `last line of page`).not.toMatch(/^(Section|\d+)$/)
    }
    // What a reader sees: ink stays inside the 25 mm / 20 mm margins.
    const raster = await rasterizePdf(app, pdf, 1)
    savePages(raster, path.join(sandbox.base, 'visual'), 'print')
    for (const p of raster) {
      const scale = 210 / p.width
      expect(p.ink!.left * scale).toBeGreaterThanOrEqual(24)
      expect(p.ink!.right * scale).toBeLessThanOrEqual(190)
      expect(p.ink!.top * scale).toBeGreaterThanOrEqual(19)
      expect(p.ink!.bottom * scale).toBeLessThanOrEqual(278)
    }
  } finally {
    await closeApp(app)
  }
})

test('large images, wide diagrams and equations fit the printable area', async () => {
  test.setTimeout(180_000)
  const sandbox = createSandbox()
  mkdirSync(path.join(sandbox.workspace, 'img'), { recursive: true })
  writeFileSync(path.join(sandbox.workspace, 'img', 'big.png'), makePng(2600))
  seedDocuments(sandbox, {
    'fit.md': `# Fit\n\n![A very large image](img/big.png)\n\n\`\`\`mermaid\nflowchart LR\n${Array.from({ length: 9 }, (_, i) => `  N${i}[Step number ${i + 1} of the process] --> N${i + 1}[Step number ${i + 2}]`).join('\n')}\n\`\`\`\n\n$$\n\\begin{aligned}\n(a+b)^{10} &= \\sum_{k=0}^{10} \\binom{10}{k} a^{10-k} b^{k} \\\\\n&= a^{10} + 10a^9 b + 45a^8 b^2 + 120 a^7 b^3 + 210 a^6 b^4\n\\end{aligned}\n$$\n\nEnd.\n`
  })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'fit.md')
    await waitForDiagrams(page, 1)
    for (const [name, size, orientation] of [
      ['a4', 'A4', 'portrait'],
      ['a5-landscape', 'A5', 'landscape']
    ] as const) {
      const pdf = target(sandbox, `fit-${name}.pdf`)
      await stubSaveDialog(app, pdf)
      await exportViaDialog(page, 'pdf', async (dialog) => {
        await dialog.getByTestId('export-size').selectOption(size)
        await dialog.getByTestId('export-orientation').selectOption(orientation)
      })
      await expect(page.getByTestId('toast-success').last()).toContainText(`fit-${name}.pdf`)
      const info = await readPdf(pdf)
      const raster = await rasterizePdf(app, pdf, 1)
      savePages(raster, path.join(sandbox.base, 'visual'), `fit-${name}`)
      for (const [index, p] of raster.entries()) {
        const widthMm = info[index].widthMm
        const heightMm = info[index].heightMm
        const scale = widthMm / p.width
        // Everything stays inside the 20 mm margins (small tolerance for anti-aliasing).
        expect(p.ink!.left * scale, `${name} page ${index + 1} left`).toBeGreaterThanOrEqual(19)
        expect(p.ink!.right * scale, `${name} page ${index + 1} right`).toBeLessThanOrEqual(
          widthMm - 19
        )
        expect(p.ink!.bottom * scale, `${name} page ${index + 1} bottom`).toBeLessThanOrEqual(
          heightMm - 19
        )
      }
      // The image, the diagram and the equation all made it into the document.
      const text = info.map((p) => p.text).join(' ')
      expect(text).toContain('Step number 1')
      expect(text).toContain('End.')
      expect(raster.some((p) => p.inkRatio > 0.2)).toBe(true)
    }
  } finally {
    await closeApp(app)
  }
})
