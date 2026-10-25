import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Locator } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  exportViaDialog,
  focusEditor,
  launch,
  launchWithWorkspace,
  MIXED_DOCUMENT,
  mod,
  openFromTree,
  openInViewer,
  seedDocuments,
  stubSaveDialog,
  waitForDiagrams,
  type Sandbox
} from './helpers'
import { readPdf } from './support/pdfText'
import { rasterizePdf, savePages } from './support/pdfRaster'

const LONG_DOCUMENT = `# Quarterly Report

${Array.from({ length: 8 }, (_, i) => `## Section ${i + 1}\n\n${'The quick brown fox jumps over the lazy dog. '.repeat(14)}\n\n| Item | Value |\n| ---- | ----- |\n| a | ${i} |\n`).join('\n')}

<!-- pagebreak -->

# Appendix

The last page.
`

function exportTo(sandbox: Sandbox, name: string): string {
  const target = path.join(sandbox.base, 'out', name)
  mkdirSync(path.dirname(target), { recursive: true })
  return target
}

async function setSelect(dialog: Locator, testId: string, value: string) {
  await dialog.getByTestId(testId).selectOption(value)
}

async function setNumber(dialog: Locator, testId: string, value: string) {
  const input = dialog.getByTestId(testId)
  await input.fill(value)
  await input.press('Enter')
}

test('PDF export supports the standard page sizes, orientations and custom sizes', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': LONG_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'report.md')
    const cases: {
      size: string
      orientation: string
      width: number
      height: number
      custom?: [string, string]
    }[] = [
      { size: 'A4', orientation: 'portrait', width: 210, height: 297 },
      { size: 'A4', orientation: 'landscape', width: 297, height: 210 },
      { size: 'A5', orientation: 'portrait', width: 148, height: 210 },
      { size: 'Letter', orientation: 'portrait', width: 215.9, height: 279.4 },
      { size: 'Legal', orientation: 'landscape', width: 355.6, height: 215.9 },
      { size: 'Custom', orientation: 'portrait', width: 120, height: 200, custom: ['120', '200'] }
    ]
    for (const [index, c] of cases.entries()) {
      const target = exportTo(sandbox, `size-${index}.pdf`)
      await stubSaveDialog(app, target)
      await exportViaDialog(page, 'pdf', async (dialog) => {
        await setSelect(dialog, 'export-size', c.size)
        await setSelect(dialog, 'export-orientation', c.orientation)
        if (c.custom) {
          await setNumber(dialog, 'export-custom-width', c.custom[0])
          await setNumber(dialog, 'export-custom-height', c.custom[1])
        }
        await expect(dialog.getByTestId('export-page-dimensions')).toContainText(
          `${Math.round(c.width * 10) / 10} × ${Math.round(c.height * 10) / 10} mm`
        )
      })
      await expect(page.getByTestId('toast-success').last()).toContainText(`size-${index}.pdf`)
      await expect(page.getByRole('dialog', { name: 'Export' })).toHaveCount(0)
      const pages = await readPdf(target)
      for (const p of pages) {
        expect(p.widthMm).toBeCloseTo(c.width, 0)
        expect(p.heightMm).toBeCloseTo(c.height, 0)
      }
      expect(pages.length).toBeGreaterThanOrEqual(2)
    }
  } finally {
    await closeApp(app)
  }
})

test('headers, footers and page numbers come from the real pagination and stay clear of the text', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': LONG_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'report.md')
    const target = exportTo(sandbox, 'numbered.pdf')
    await stubSaveDialog(app, target)
    await exportViaDialog(page, 'pdf', async (dialog) => {
      await dialog.getByLabel('Show header').check()
      await dialog.getByTestId('export-header-text').fill('{title} — {file} <draft> {date}')
      await dialog.getByLabel('Show footer').check()
      await dialog.getByTestId('export-footer-text').fill('Page {page} of {pages}')
      // A header needs room: the dialog explains it and refuses to export until fixed.
      await setNumber(dialog, 'export-margin-top', '6')
      await expect(dialog.getByTestId('export-errors')).toContainText('top margin')
      await expect(dialog.getByTestId('export-run')).toBeDisabled()
      await setNumber(dialog, 'export-margin-top', '22')
      await setNumber(dialog, 'export-margin-bottom', '22')
      await expect(dialog.getByTestId('export-run')).toBeEnabled()
    })
    await expect(page.getByTestId('toast-success')).toContainText('numbered.pdf')

    const pages = await readPdf(target)
    expect(pages.length).toBeGreaterThanOrEqual(3)
    const total = pages.length
    pages.forEach((p, index) => {
      const footer = p.items.filter((item) => item.y > p.heightMm - 22)
      const header = p.items.filter((item) => item.y < 22)
      const body = p.items.filter((item) => item.y >= 22 && item.y <= p.heightMm - 22)
      expect(footer.map((i) => i.text).join(' ')).toContain(`Page ${index + 1} of ${total}`)
      expect(header.map((i) => i.text).join(' ')).toContain('Quarterly Report')
      expect(header.map((i) => i.text).join(' ')).toContain('report.md')
      // User text is shown literally, never interpreted.
      expect(header.map((i) => i.text).join(' ')).toContain('<draft>')
      expect(header.map((i) => i.text).join(' ')).toMatch(/\d{4}\D+\d{2}\D+\d{2}/)
      expect(body.length).toBeGreaterThan(0)
      // Nothing from the body intrudes on the header or footer bands.
      for (const item of body) {
        expect(item.y).toBeGreaterThan(22)
        expect(item.y).toBeLessThan(p.heightMm - 22)
      }
    })

    // The page break pushes the appendix onto its own page.
    expect(pages[total - 1].text).toContain('Appendix')
    expect(pages[total - 1].text).toContain('The last page.')
    expect(pages[total - 2].text).not.toContain('Appendix')

    // What a reader sees: ink stays inside the margins, and the headers are drawn.
    const raster = await rasterizePdf(app, target, 1)
    savePages(raster, path.join(sandbox.base, 'visual'), 'numbered')
    for (const p of raster) {
      expect(p.ink).not.toBeNull()
      const mm = (px: number) => (px / p.width) * 210
      expect(mm(p.ink!.left)).toBeGreaterThanOrEqual(18)
      expect(mm(p.ink!.right)).toBeLessThanOrEqual(192)
    }
  } finally {
    await closeApp(app)
  }
})

test('invalid page settings are explained and never produce a clipped or empty page', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': LONG_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'report.md')
    await page.getByRole('button', { name: 'Export as PDF' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export' })
    await expect(dialog).toBeVisible()

    await setSelect(dialog, 'export-size', 'Custom')
    await dialog.getByTestId('export-custom-width').fill('0')
    await dialog.getByTestId('export-custom-width').press('Enter')
    await expect(dialog.getByText('Use a value between 50 and 1200.').first()).toBeVisible()
    await setNumber(dialog, 'export-custom-width', '120')
    await setNumber(dialog, 'export-custom-height', '200')

    // Margins that leave no printable area are refused with a clear reason.
    await setNumber(dialog, 'export-margin-left', '55')
    await setNumber(dialog, 'export-margin-right', '55')
    await expect(dialog.getByTestId('export-errors')).toContainText('at least 30 mm')
    await expect(dialog.getByTestId('export-run')).toBeDisabled()
    await dialog.getByTestId('export-margin-left').fill('-3')
    await dialog.getByTestId('export-margin-left').press('Enter')
    await expect(dialog.getByText(/Use a value between 0 and/).first()).toBeVisible()

    await setNumber(dialog, 'export-margin-left', '15')
    await setNumber(dialog, 'export-margin-right', '15')
    await expect(dialog.getByTestId('export-run')).toBeEnabled()
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
  }
})

test('standalone HTML export works offline with its theme, fonts, math, diagrams and anchors', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, {
    'mixed.md': `${MIXED_DOCUMENT}\n[Jump to the table](#feature-table)\n\n## Feature table\n\nSee the [guide](docs/guide.md) and ![Architecture](assets/architecture.png).\n`
  })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'mixed.md')
    await waitForDiagrams(page, 1)
    const target = exportTo(sandbox, 'mixed.html')
    await stubSaveDialog(app, target)
    await exportViaDialog(page, 'html', async (dialog) => {
      await setSelect(dialog, 'export-theme', 'technical')
      await expect(dialog.getByTestId('export-html-preview')).toBeVisible()
    })
    await expect(page.getByTestId('toast-info')).toContainText('mixed.html')
    // The limitation of a standalone file is reported, not hidden.
    await expect(page.getByTestId('toast-info')).toContainText('link to local files')

    const html = readFileSync(target, 'utf8')
    expect(html).toContain('data-theme="technical"')
    expect(html).toContain('data:font/woff2;base64,')
    expect(html).toContain('class="katex-display"')
    expect(html).toMatch(/<svg[^>]*id="ms-mmd-/)
    expect(html).toMatch(/<img src="data:image\/png;base64,/)
    expect(html).not.toMatch(/<script|<link |@import|msfile:/i)
    expect(html).toContain('href="#feature-table"')
    expect(html).toContain('id="feature-table"')
    expect(html).toContain('href="docs/guide.md"') // kept as written, reported above

    // Open it from another folder in a plain browser window without any application help.
    const elsewhere = path.join(sandbox.base, 'moved', 'mixed.html')
    mkdirSync(path.dirname(elsewhere), { recursive: true })
    writeFileSync(elsewhere, html)
    const viewer = await openInViewer(app, elsewhere)
    const facts = await viewer.evaluate(async () => {
      await document.fonts.ready
      const resources = performance.getEntriesByType('resource').map((r) => r.name)
      const svg = document.querySelector('figure.ms-diagram svg')!.getBoundingClientRect()
      const katex = document.querySelector('.katex-display .katex')!.getBoundingClientRect()
      const target = document.getElementById('feature-table')!
      document.querySelector<HTMLAnchorElement>('a[href="#feature-table"]')!.click()
      await new Promise((resolve) => setTimeout(resolve, 100))
      return {
        resources: resources.filter(
          (name) => !name.startsWith('file:') && !name.startsWith('data:')
        ),
        svgWidth: svg.width,
        katexWidth: katex.width,
        fontLoaded: [...document.fonts].some(
          (f) => f.family.startsWith('KaTeX') && f.status === 'loaded'
        ),
        hash: location.hash,
        scripts: document.scripts.length,
        targetTop: target.getBoundingClientRect().top,
        selectable: getComputedStyle(document.body).userSelect !== 'none',
        h1Border: getComputedStyle(document.querySelector('h1')!).borderBottomWidth
      }
    })
    expect(facts.resources).toEqual([])
    expect(facts.svgWidth).toBeGreaterThan(100)
    expect(facts.katexWidth).toBeGreaterThan(50)
    expect(facts.fontLoaded).toBe(true)
    expect(facts.hash).toBe('#feature-table')
    expect(facts.scripts).toBe(0)
    expect(facts.targetTop).toBeLessThan(80)
    expect(facts.selectable).toBe(true)
    expect(facts.h1Border).not.toBe('0px')
    await viewer.screenshot({ path: path.join(sandbox.base, 'visual', 'mixed-html.png') })
  } finally {
    await closeApp(app)
  }
})

test('canceling or failing an export never damages existing files, and the app stays usable', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': LONG_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'report.md')
    const existing = exportTo(sandbox, 'existing.pdf')
    writeFileSync(existing, 'previous contents')

    // Cancel in the save dialog.
    await stubSaveDialog(app, null)
    await exportViaDialog(page, 'pdf')
    await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible()
    await expect(page.getByTestId('export-run')).toBeEnabled()
    expect(readFileSync(existing, 'utf8')).toBe('previous contents')

    // A destination that cannot be written reports the failure inside the dialog.
    const folder = exportTo(sandbox, 'a-folder.pdf')
    mkdirSync(folder)
    await stubSaveDialog(app, folder)
    await page.getByTestId('export-run').click()
    await expect(page.getByTestId('export-failure')).toContainText('folder')
    expect(readdirSync(path.dirname(existing)).filter((n) => n.endsWith('.tmp'))).toEqual([])

    // Then a normal export still works from the same dialog.
    const good = exportTo(sandbox, 'good.pdf')
    await stubSaveDialog(app, good)
    await page.getByTestId('export-run').click()
    await expect(page.getByTestId('toast-success')).toContainText('good.pdf')
    expect(readFileSync(good).subarray(0, 5).toString()).toBe('%PDF-')
    expect(readFileSync(existing, 'utf8')).toBe('previous contents')

    // Exporting does not change the Markdown or mark it as modified.
    await expect(page.getByTestId('save-state')).not.toHaveText(/Unsaved/)
    expect(readFileSync(path.join(sandbox.workspace, 'report.md'), 'utf8')).toBe(LONG_DOCUMENT)
  } finally {
    await closeApp(app)
  }
})

test('export presets: built-ins, custom presets, editing, deleting, restoring and persistence', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': LONG_DOCUMENT })
  let { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'report.md')
    await page.getByRole('button', { name: 'Export as PDF' }).click()
    let dialog = page.getByRole('dialog', { name: 'Export' })
    const select = dialog.getByTestId('export-preset')
    await expect(select.locator('option')).toHaveText([
      'Settings defaults',
      'Standard PDF',
      'Technical Documentation',
      'Professional Report',
      'Compact Notes',
      'Standalone HTML'
    ])

    // Built-in presets change what the preview shows.
    await select.selectOption('technical-documentation')
    await expect(dialog.getByTestId('export-theme')).toHaveValue('technical')
    await expect(dialog.getByTestId('export-margin-left')).toHaveValue('16')
    await expect(dialog.getByTestId('pdf-setup-label')).toContainText('Technical Documentation')
    await select.selectOption('standalone-html')
    await expect(dialog.getByTestId('export-format-html')).toHaveAttribute('aria-checked', 'true')
    await expect(dialog.getByTestId('export-html-preview')).toBeVisible()

    // Duplicate into a custom preset and edit it.
    await select.selectOption('professional-report')
    await dialog.getByTestId('preset-save-as').click()
    await page.getByLabel('Preset name').fill('Board report')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Global', exact: true }).click()
    await expect(select).toHaveValue('board-report')
    await setNumber(dialog, 'export-margin-top', '30')
    await dialog.getByTestId('preset-save').click()
    await expect(page.getByTestId('toast-success').last()).toContainText('Board report')
    const file = path.join(sandbox.userData, 'export-presets', 'board-report.json')
    // The file already exists from "Save as", so wait for the edited margin to be written.
    await expect
      .poll(() =>
        existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).data.pdf.margins.top : 0
      )
      .toBe(30)
    const stored = JSON.parse(readFileSync(file, 'utf8'))
    expect(stored).toMatchObject({
      id: 'board-report',
      name: 'Board report',
      data: { theme: 'report', format: 'pdf' }
    })
    expect(stored.data.pdf.margins.top).toBe(30)

    // A workspace preset lives in the project.
    await dialog.getByTestId('preset-save-as').click()
    await page.getByLabel('Preset name').fill('Team handout')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'This workspace' }).click()
    await expect
      .poll(() =>
        existsSync(
          path.join(sandbox.workspace, '.markdown-studio', 'export-presets', 'team-handout.json')
        )
      )
      .toBe(true)
    await expect(select.locator('option', { hasText: 'Team handout' })).toHaveCount(1)

    // Rename, then delete with confirmation (cancel first).
    await select.selectOption('board-report')
    await dialog.getByTestId('preset-rename').click()
    await page.getByLabel('Preset name').fill('Board pack')
    await page.keyboard.press('Enter')
    await expect(select.locator('option', { hasText: 'Board pack' })).toHaveCount(1)
    await dialog.getByTestId('preset-delete').click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(existsSync(file)).toBe(true)
    await dialog.getByTestId('preset-delete').click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect.poll(() => existsSync(file)).toBe(false)

    // Editing a built-in preset stores a modified copy; restoring brings back the original.
    await select.selectOption('compact-notes')
    await setNumber(dialog, 'export-margin-left', '30')
    await dialog.getByTestId('preset-save').click()
    await expect(select.locator('option', { hasText: 'Compact Notes · modified' })).toHaveCount(1)
    await dialog.getByTestId('preset-delete').click()
    await page.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(select.locator('option', { hasText: 'Compact Notes · modified' })).toHaveCount(0)
    await expect(dialog.getByTestId('export-margin-left')).toHaveValue('12')
    await page.keyboard.press('Escape')

    // Custom presets survive a restart.
    await closeApp(app)
    ;({ app, page } = await launch(sandbox))
    await openFromTree(page, 'report.md')
    await page.getByRole('button', { name: 'Export as PDF' }).click()
    dialog = page.getByRole('dialog', { name: 'Export' })
    await expect(
      dialog.getByTestId('export-preset').locator('option', { hasText: 'Team handout · workspace' })
    ).toHaveCount(1)
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
  }
})

test('presets export with their own theme and page setup', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': LONG_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'report.md')
    const target = exportTo(sandbox, 'technical.pdf')
    await stubSaveDialog(app, target)
    await exportViaDialog(page, 'pdf', async (dialog) => {
      await dialog.getByTestId('export-preset').selectOption('compact-notes')
    })
    await expect(page.getByTestId('toast-success')).toContainText('technical.pdf')
    const pages = await readPdf(target)
    // Compact Notes: A4, small type and a page number in the bottom right.
    expect(pages[0].widthMm).toBeCloseTo(210, 0)
    expect(
      pages[0].items.some((i) => i.text.trim() === '1' && i.y > pages[0].heightMm - 14 && i.x > 150)
    ).toBe(true)
    // It remains the active setup for the PDF preview afterwards.
    await page.getByTestId('preview-tab-pdf').click()
    await expect(page.getByTestId('pdf-setup-label')).toContainText('Compact Notes')
  } finally {
    await closeApp(app)
  }
})

test('damaged or outdated configuration never prevents startup', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': '# Hello\n' })
  mkdirSync(path.join(sandbox.userData, 'export-presets'), { recursive: true })
  writeFileSync(path.join(sandbox.userData, 'export-presets', 'broken.json'), '{ nope')
  writeFileSync(
    path.join(sandbox.userData, 'export-presets', 'obsolete.json'),
    JSON.stringify({ version: 0, id: 'obsolete', name: 'Old preset', format: 'html', unknown: [1] })
  )
  mkdirSync(path.join(sandbox.workspace, '.markdown-studio'), { recursive: true })
  writeFileSync(path.join(sandbox.workspace, '.markdown-studio', 'presentation.json'), '[1,2,3]')
  const { app, page } = await launch(sandbox, {
    version: 1,
    theme: 'light',
    document: {
      theme: 'nonexistent',
      customization: [1],
      pdf: 'text',
      math: 5,
      exportPreset: '../../../x'
    },
    workspace: { restoreLastWorkspace: true, lastWorkspace: sandbox.workspace, recent: [] }
  })
  try {
    await openFromTree(page, 'report.md')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect
      .poll(() =>
        page.frameLocator('iframe.html-preview').locator('main').getAttribute('data-theme')
      )
      .toBe('minimal')
    await page.getByRole('button', { name: 'Export as PDF' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export' })
    await expect(
      dialog.getByTestId('export-preset').locator('option', { hasText: 'Old preset' })
    ).toHaveCount(1)
    await expect(
      dialog.getByTestId('export-preset').locator('option', { hasText: 'broken' })
    ).toHaveCount(0)
    await expect(dialog.getByTestId('export-run')).toBeEnabled()
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
  }
})

test('the Export dialog is fully keyboard accessible and restores focus', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': LONG_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'report.md')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+Shift+U`)
    const dialog = page.getByRole('dialog', { name: 'Export' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')

    // Focus starts inside and Tab never leaves the dialog, in either direction.
    const insideDialog = (): Promise<boolean> =>
      page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab')
      expect(await insideDialog()).toBe(true)
    }
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await insideDialog()).toBe(true)
    }

    // Every control has an accessible name.
    const unnamed = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea, [role="dialog"] button'
        )
      ]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => {
          const element = el as HTMLInputElement
          const label = element.labels?.[0]?.textContent?.trim()
          return !(
            label ||
            el.getAttribute('aria-label') ||
            el.textContent?.trim() ||
            el.getAttribute('title')
          )
        })
        .map((el) => el.outerHTML.slice(0, 100))
    )
    expect(unnamed).toEqual([])

    // Escape closes it and focus returns to where it was.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(
      page.locator('.monaco-editor.focused, .monaco-editor .inputarea:focus')
    ).not.toHaveCount(0)

    // Same from the command palette.
    await page.keyboard.press(`${mod}+Shift+P`)
    await page.getByTestId('palette-input').fill('Export…')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible()
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
  }
})
