import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  exportViaDialog,
  inPreview,
  launchWithWorkspace,
  MIXED_DOCUMENT,
  openFromTree,
  seedDocuments,
  stubSaveDialog,
  waitForDiagrams
} from './helpers'
import { readPdf } from './support/pdfText'

/**
 * Smoke test for a real build. Run against the packaged application with
 * MARKDOWN_STUDIO_EXECUTABLE (the unpacked or installed executable); without it, the development
 * build is exercised. It proves that bundled assets (Mermaid, KaTeX fonts, themes, the PDF
 * engine) are loaded from the package and not from development paths.
 */
test('the application starts and publishes with only its own bundled assets', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'mixed.md': MIXED_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    const info = await app.evaluate(({ app: electronApp }) => ({
      name: electronApp.getName(),
      version: electronApp.getVersion(),
      packaged: electronApp.isPackaged,
      resources: process.resourcesPath,
      appPath: electronApp.getAppPath()
    }))
    expect(info.name).toBe('Markdown Studio')
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/)
    if (process.env.MARKDOWN_STUDIO_EXECUTABLE) {
      expect(info.packaged).toBe(true)
      // The packaged resources carry the licence and the notices (fonts, Mermaid, KaTeX...).
      expect(readFileSync(path.join(info.resources, 'THIRD_PARTY_NOTICES.md'), 'utf8')).toContain('KaTeX fonts')
      expect(readFileSync(path.join(info.resources, 'LICENSE.MarkdownStudio.txt'), 'utf8')).toContain('MIT')
    }

    await openFromTree(page, 'mixed.md')
    await waitForDiagrams(page, 1)
    const facts = await inPreview(page, (doc) => ({
      katex: doc.querySelectorAll('.katex').length,
      svg: doc.querySelectorAll('figure.ms-diagram svg .node').length,
      fonts: [...doc.fonts].filter((f) => f.family.startsWith('KaTeX') && f.status === 'loaded').length,
      theme: doc.querySelector('main')?.getAttribute('data-theme')
    }))
    expect(facts).toMatchObject({ theme: 'minimal' })
    expect(facts.katex).toBeGreaterThan(1)
    expect(facts.svg).toBe(4)
    expect(facts.fonts).toBeGreaterThan(0)

    // The diagram window is created from the packaged host page.
    const hostUrl = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()).find((u) => u.includes('diagram-host'))
    )
    expect(hostUrl).toBeTruthy()

    // PDF export works from the packaged build, with real text.
    const pdf = path.join(sandbox.base, 'out', 'packaged.pdf')
    mkdirSync(path.dirname(pdf), { recursive: true })
    await stubSaveDialog(app, pdf)
    await exportViaDialog(page, 'pdf')
    await expect(page.getByTestId('toast-success')).toContainText('packaged.pdf')
    const pages = await readPdf(pdf)
    expect(pages.map((p) => p.text).join(' ')).toContain('Release Notes')
    expect(pages.map((p) => p.text).join(' ')).toContain('Write')
  } finally {
    await closeApp(app)
  }
})
