import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  exportViaDialog,
  focusEditor,
  goToLine,
  inPreview,
  launchWithWorkspace,
  mod,
  openFromTree,
  openInViewer,
  runPaletteCommand,
  seedDocuments,
  stubSaveDialog,
  treeRow,
  waitForDiagrams
} from './helpers'
import { rasterizePdf } from './support/pdfRaster'

/**
 * Captures the screenshots used in the documentation from the real application.
 * Run with `npm run screenshots`; the spec is skipped in ordinary test runs.
 */
const OUTPUT = path.resolve(__dirname, '../../docs/screenshots')
test.skip(!process.env.CAPTURE_SCREENSHOTS, 'Only runs when capturing documentation screenshots.')

const GUIDE = `# Project Atlas

Project Atlas is a small documentation set used to try out Markdown Studio.

## Contents

<!-- markdown-studio:toc:start -->

- [Overview](#overview)
- [Installation](#installation)
  - [Windows](#windows)
  - [Linux](#linux)
- [Configuration](#configuration)

<!-- markdown-studio:toc:end -->

## Overview

|Service|Language|Port|
|---|:-:|--:|
|Gateway|TypeScript|8080|
|Indexer|Rust|9000|
|Reporting|Python|7000|

See the [user guide](docs/guide.md) and the [roadmap](#configuration).

## Installation

### Windows

1. Download the installer.
2. Run it and follow the prompts.

### Linux

- [x] Install the package
- [ ] Start the service

## Configuration

![Architecture](assets/architecture.png)
`

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(OUTPUT, { recursive: true })
  await page.screenshot({ path: path.join(OUTPUT, name) })
}

test('captures the Phase 2 screenshots', async () => {
  test.setTimeout(240_000)
  const sandbox = createSandbox()
  writeFileSync(path.join(sandbox.workspace, 'Atlas Guide.md'), GUIDE)
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.setViewportSize({ width: 1360, height: 860 })
    await openFromTree(page, 'Atlas Guide.md')
    await page.waitForTimeout(800)
    await shot(page, 'outline-and-toc.png')

    // IntelliSense on an empty line below the table.
    await focusEditor(page)
    await goToLine(page, 25)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Control+Space')
    await page.locator('.suggest-widget.visible').waitFor()
    await page.waitForTimeout(400)
    await shot(page, 'intellisense.png')
    await page.keyboard.press('Escape')
    await page.keyboard.press(`${mod}+Z`)
    await page.keyboard.press(`${mod}+Z`)

    // The table editor.
    await goToLine(page, 21)
    await runPaletteCommand(page, 'Edit Table Visually')
    await page.getByRole('dialog', { name: 'Edit Table' }).waitFor()
    await page.getByLabel('Row 1, column 1').focus()
    await page.waitForTimeout(300)
    await shot(page, 'table-editor.png')
    await page.keyboard.press('Escape')

    // The command palette.
    await page.keyboard.press(`${mod}+Shift+P`)
    await page.getByTestId('palette-input').fill('table')
    await page.waitForTimeout(300)
    await shot(page, 'command-palette.png')
    await page.keyboard.press('Escape')

    // Templates.
    await page.keyboard.press(`${mod}+Shift+N`)
    await page.getByTestId('template-list').waitFor()
    await page
      .getByTestId('template-list')
      .getByRole('option', { name: /^README/ })
      .click()
    await page.waitForTimeout(300)
    await shot(page, 'templates.png')
    await page.keyboard.press('Escape')

    // Problems: a broken link, a missing image and a malformed table.
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.type(
      '\n\nSee [the changelog](CHANGELOG.md) and ![diagram](assets/missing.png).\n\n| a | b | c |\n|---|---|\n| 1 | 2 | 3 |\n'
    )
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="problem-warnings"]')?.textContent) >= 2
    )
    await page.waitForTimeout(500)
    await shot(page, 'problems.png')

    // Reference-aware rename.
    await treeRow(page, 'assets').click()
    await treeRow(page, 'architecture.png').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename…' }).click()
    await page.getByLabel('New name').fill('system-architecture.png')
    await page.keyboard.press('Enter')
    await page.getByRole('dialog', { name: 'Rename and Update References' }).waitFor()
    await page.waitForTimeout(300)
    await shot(page, 'rename-references.png')
    await page.getByRole('button', { name: 'Cancel' }).click()
  } finally {
    await closeApp(app)
  }
})


const SHOWCASE = `# Quarterly Technical Report

*Prepared with Markdown Studio.* This document combines prose, equations, diagrams, tables and
code, and reads the same in the preview, the PDF and a standalone HTML file.

## Overview

The system scores each request with $s = \\sum_{i=1}^{n} w_i x_i$, then routes it through the
pipeline below.

\`\`\`mermaid
flowchart LR
    A[Request] --> B{Valid?}
    B -->|yes| C[Score]
    B -->|no| D[Reject]
    C --> E[Route]
\`\`\`

> **Note.** Diagrams and equations are drawn locally; nothing is fetched from the internet.

## Results

| Service   | Latency (ms) | Errors |
| --------- | -----------: | -----: |
| Gateway   |           12 |   0.01 |
| Indexer   |           48 |   0.20 |
| Reporting |          110 |   0.05 |

The expected latency follows

$$
\\mathbb{E}[T] = \\int_{0}^{\\infty} t\\, f(t)\\,dt = \\frac{1}{\\lambda}
\\tag{1}
$$

## Implementation

\`\`\`ts
export function score(weights: number[], features: number[]): number {
  return weights.reduce((sum, w, i) => sum + w * features[i], 0)
}
\`\`\`

<!-- pagebreak -->

## Appendix

![Architecture](assets/architecture.png)

See the [user guide](docs/guide.md) for details.
`

const MANY_DIAGRAMS = `# Diagrams

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant A as App
    U->>A: Write Markdown
    A-->>U: Live preview
    U->>A: Export PDF
\`\`\`

\`\`\`mermaid
classDiagram
    class Document { +String title +render() }
    class Theme { +String name }
    Document --> Theme
\`\`\`

\`\`\`mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review
    Review --> Published
    Published --> [*]
\`\`\`

\`\`\`mermaid
erDiagram
    DOCUMENT ||--o{ EXPORT : produces
    DOCUMENT { string title }
\`\`\`
`

test('captures the Phase 3 screenshots', async () => {
  test.setTimeout(480_000)
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'Technical Report.md': SHOWCASE, 'Diagrams.md': MANY_DIAGRAMS })
  const { app, page } = await launchWithWorkspace(sandbox, {
    layout: { sidebarWidth: 360, sidebarView: 'explorer' }
  })
  const work = path.join(sandbox.base, 'shots')
  mkdirSync(work, { recursive: true })
  try {
    await page.setViewportSize({ width: 1360, height: 860 })

    // Main window: editor and preview with math and a diagram.
    await openFromTree(page, 'Technical Report.md')
    await waitForDiagrams(page, 1)
    await expect.poll(() => inPreview(page, (doc) => doc.querySelectorAll('.katex').length)).toBeGreaterThan(1)
    await page.waitForTimeout(600)
    await shot(page, 'phase3-editor-preview.png')

    // Several diagram types.
    await openFromTree(page, 'Diagrams.md')
    await waitForDiagrams(page, 4)
    await page.waitForTimeout(600)
    await shot(page, 'diagram-rendering.png')

    // Theme comparison: the same document in each theme, captured from the preview.
    await openFromTree(page, 'Technical Report.md')
    await waitForDiagrams(page, 1)
    const shots: { name: string; png: Buffer }[] = []
    for (const [id, title] of [
      ['minimal', 'Minimal'],
      ['technical', 'Technical'],
      ['editorial', 'Editorial'],
      ['report', 'Professional Report']
    ] as const) {
      await runPaletteCommand(page, `Document Theme: ${title}`)
      await expect
        .poll(() => page.frameLocator('iframe.html-preview').locator('main').getAttribute('data-theme'))
        .toBe(id)
      await waitForDiagrams(page, 1)
      await page.waitForTimeout(500)
      shots.push({ name: title, png: await page.locator('iframe.html-preview').screenshot() })
    }
    const grid = path.join(work, 'themes.html')
    writeFileSync(
      grid,
      `<!doctype html><meta charset="utf-8"><style>
        body{margin:0;padding:20px;background:#e9ecef;font:600 15px system-ui;display:grid;grid-template-columns:1fr 1fr;gap:18px;width:1240px}
        figure{margin:0;background:#fff;border:1px solid #ccd;box-shadow:0 2px 8px rgba(0,0,0,.15)}
        figcaption{padding:8px 12px;background:#14181d;color:#fff}
        img{display:block;width:100%;height:560px;object-fit:cover;object-position:top}
      </style>${shots.map((s) => `<figure><figcaption>${s.name}</figcaption><img src="data:image/png;base64,${s.png.toString('base64')}"></figure>`).join('')}`
    )
    const viewer = await openInViewer(app, grid)
    await viewer.setViewportSize({ width: 1280, height: 1300 })
    await viewer.waitForTimeout(500)
    await viewer.screenshot({ path: path.join(OUTPUT, 'theme-comparison.png'), fullPage: true })
    await viewer.close()
    await runPaletteCommand(page, 'Document Theme: Technical')

    // Export dialog with the Professional Report preset.
    await page.getByRole('button', { name: 'Export as PDF' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export' })
    await dialog.getByTestId('export-preset').selectOption('professional-report')
    await expect(dialog.locator('.pdf-page').first()).toBeVisible()
    await page.waitForTimeout(1800)
    await shot(page, 'export-dialog.png')

    // Export it for the multi-page and finished-document captures.
    const pdf = path.join(sandbox.base, 'out', 'report.pdf')
    mkdirSync(path.dirname(pdf), { recursive: true })
    await stubSaveDialog(app, pdf)
    await dialog.getByTestId('export-run').click()
    await expect(page.getByTestId('toast-success')).toBeVisible()
    await page.getByTestId('preview-tab-pdf').click()
    await expect(page.locator('.pdf-page').first()).toBeVisible()
    await page.waitForTimeout(1200)
    await shot(page, 'pdf-preview-multipage.png')

    const pages = await rasterizePdf(app, pdf, 1.4)
    const montage = path.join(work, 'pages.html')
    writeFileSync(
      montage,
      `<!doctype html><meta charset="utf-8"><style>
        body{margin:0;padding:24px;background:#d9dde2;display:flex;gap:20px;align-items:flex-start;width:max-content}
        img{display:block;box-shadow:0 3px 12px rgba(0,0,0,.3);width:420px}
      </style>${pages.slice(0, 3).map((p) => `<img src="data:image/png;base64,${p.png.toString('base64')}">`).join('')}`
    )
    const pagesViewer = await openInViewer(app, montage)
    await pagesViewer.setViewportSize({ width: 1400, height: 720 })
    await pagesViewer.waitForTimeout(500)
    await pagesViewer.screenshot({ path: path.join(OUTPUT, 'pdf-pages.png'), fullPage: true })
    await pagesViewer.close()
    writeFileSync(path.join(OUTPUT, 'final-document.png'), (await rasterizePdf(app, pdf, 1.6))[0].png)

    // Presets manager.
    await page.getByTestId('preview-tab-html').click()
    await page.keyboard.press(`${mod}+,`)
    const panel = page.getByTestId('settings-panel')
    await panel.getByTestId('manage-presets').scrollIntoViewIfNeeded()
    await panel.getByTestId('manage-presets').click()
    await page.getByTestId('preset-list').waitFor()
    await page.waitForTimeout(400)
    await shot(page, 'export-presets.png')
    await page.keyboard.press('Escape')

    // Document appearance settings: the theme picker, a workspace override and rejected CSS.
    await panel.getByTestId('scope-workspace').click()
    await panel.getByTestId('theme-card-editorial').click()
    await page.locator('#settings-document-appearance').scrollIntoViewIfNeeded()
    await panel.evaluate((el) => el.querySelector('#settings-document-appearance')!.scrollIntoView())
    await page.waitForTimeout(700)
    await shot(page, 'theme-selection.png')
    await panel.getByTestId('css-details').locator('summary').click()
    await panel.getByTestId('settings-css-inline').click()
    await panel.getByTestId('settings-css-text').fill('h1 { color: #0a7d5a }\n@import url("https://example.com/remote.css");\nbody { background: url(file:///etc/passwd) }')
    await expect(panel.getByTestId('css-problems')).toBeVisible()
    await panel.getByTestId('css-details').scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await shot(page, 'custom-css-rejected.png')
  } finally {
    await closeApp(app)
  }
})
