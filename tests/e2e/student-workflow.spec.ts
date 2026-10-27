import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  dropExternalFiles,
  editorText,
  focusEditor,
  exportViaDialog,
  goToLine,
  inPreview,
  launchEditing,
  lineCoordinates,
  mod,
  newDocumentWith,
  openFromTree,
  runPaletteCommand,
  stubSaveDialog,
  treeRow
} from './helpers'
import { readPdf } from './support/pdfText'

/** Letters and digits only: PDF text extraction splits and spaces generated numbers unpredictably. */
const squash = (text: string): string => text.replace(/[^\p{L}\p{N}]+/gu, '')

const REPORT = `# Onderzoek naar Health UI in games

## 1. Inleiding

Dit onderzoek gaat over de weergave van gezondheid in games. Zie [de resultaten](#4-resultaten-en-analyse).

## 2. Onderzoeksvraag

Hoe beïnvloedt de weergave van gezondheid de beleving van de speler in 2024?

## 3. Onderzoeksmethode

We vergelijken vier games.

## 4. Resultaten en analyse

### 4.1 The Legend of Zelda

Hartjes.

### 4.2 Hades

Een balk.

### 4.3 God of War Ragnarök

Alleen bij schade.

### 4.4 Dead Space

In de wereld.

### 4.5 Vergelijkingstabel

Zie hieronder.

## 5. Conclusie

Klaar.
`

const PLAIN = `# Verslag

## Inleiding

Tekst.

## Methode

### Opzet

Tekst.

## 2024 Resultaten

Tekst.

## Conclusie

Klaar.
`

async function exportPdf(
  app: Parameters<typeof stubSaveDialog>[0],
  page: Page,
  target: string
): Promise<string> {
  mkdirSync(path.dirname(target), { recursive: true })
  await stubSaveDialog(app, target)
  await exportViaDialog(page, 'pdf')
  await expect(page.locator('[data-testid^="toast-"]').last()).toContainText(
    path.basename(target),
    { timeout: 60_000 }
  )
  const pages = await readPdf(target)
  return squash(pages.map((p) => p.text).join(' '))
}

test('Professional Report keeps typed heading numbers and does not number them twice', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, REPORT)
    await runPaletteCommand(page, 'Document Theme: Professional Report')
    await expect
      .poll(() => inPreview(page, (doc) => doc.querySelectorAll('h2, h3').length))
      .toBe(10)

    // Every numbered heading is marked as typed; the theme adds no second number.
    const generated = (before: string) => !/^["']?(none|normal)["']?$/.test(before)
    await expect
      .poll(() =>
        inPreview(page, (doc) =>
          [...doc.querySelectorAll('h2, h3')].map(
            (h) => doc.defaultView!.getComputedStyle(h, '::before').content
          )
        ).then((all) => all.map(generated))
      )
      .toEqual(Array(10).fill(false))

    // Links to headings keep working, and the table of contents lists each heading once.
    const link = await inPreview(page, (doc) => {
      const anchor = [...doc.querySelectorAll('a')].find((a) => a.textContent === 'de resultaten')
      return {
        href: anchor?.getAttribute('href'),
        target: anchor ? !!doc.getElementById(anchor.getAttribute('href')!.slice(1)) : false
      }
    })
    expect(link).toEqual({ href: '#4-resultaten-en-analyse', target: true })
    await page
      .locator('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea')
      .first()
      .focus()
    await page.keyboard.press(`${mod}+Home`)
    await page.keyboard.press('ArrowDown')
    await runPaletteCommand(page, 'Insert Table of Contents')
    await expect
      .poll(() => editorText(page))
      .toContain('[4.1 The Legend of Zelda](#41-the-legend-of-zelda)')

    // The exported PDF shows each number once.
    const all = await exportPdf(app, page, path.join(sandbox.base, 'exports', 'report.pdf'))
    for (const wanted of [
      '1Inleiding',
      '2Onderzoeksvraag',
      '3Onderzoeksmethode',
      '4Resultatenenanalyse',
      '41TheLegendofZelda',
      '42Hades',
      '43GodofWarRagnarök',
      '44DeadSpace',
      '45Vergelijkingstabel',
      '5Conclusie'
    ]) {
      expect(all, wanted).toContain(wanted)
    }
    for (const doubled of [
      '11Inleiding',
      '22Onderzoeksvraag',
      '4141TheLegend',
      '4242Hades',
      '55Conclusie'
    ]) {
      expect(all, doubled).not.toContain(doubled)
    }
  } finally {
    await closeApp(app)
  }
})

test('Professional Report numbers headings that have no number, and leaves years alone', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, PLAIN)
    await runPaletteCommand(page, 'Document Theme: Professional Report')
    await expect.poll(() => inPreview(page, (doc) => doc.querySelectorAll('h2, h3').length)).toBe(5)
    const all = await exportPdf(app, page, path.join(sandbox.base, 'exports', 'plain.pdf'))
    for (const wanted of ['1Inleiding', '2Methode', '21Opzet', '32024Resultaten', '4Conclusie']) {
      expect(all, wanted).toContain(wanted)
    }
    // "2024 Resultaten" is a title with a year, not an enumeration: it still gets its own number.
    expect(all).not.toContain('2024Resultaten2024')
  } finally {
    await closeApp(app)
  }
})

const COMPARISON = `Zie de tabel.

|Game|Type health-weergave|Zichtbaarheid tijdens gevechten|Effect op immersie|Toegankelijkheid|
|:--|---|---|:-:|--:|
|The Legend of Zelda|Hartjes in de hoek van het scherm|Altijd zichtbaar, duidelijk bij weinig levens|Laag|Goed|
|Hades|Rode balk onder het personage, aangevuld met een getal|Zichtbaar en direct gekoppeld aan het personage \\\\| geen aparte HUD|Gemiddeld|Zeer goed|
|God of War Ragnarök|Geen vaste balk; gezondheid in de HUD verschijnt bij schade|Alleen wanneer nodig, verdwijnt na enkele seconden zodat het beeld vrij blijft|Hoog|Gemiddeld|
|Dead Space|Balk op de rug van het pak, onderdeel van de wereld|Altijd in beeld, zonder het scherm te vullen met menu-elementen|Zeer hoog|Matig|
`

test('a wide comparison table is formatted on request, stays valid and exports correctly', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, COMPARISON)
    const cells = () =>
      inPreview(page, (doc) =>
        [...doc.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent))
      )
    await expect.poll(cells).toHaveLength(5)
    const before = await cells()
    const lines = () => editorText(page).then((t) => t.split('\n'))

    // Nothing is rewritten by opening or closing the preview.
    const original = await editorText(page)
    await page.getByTestId('preview-close').click()
    await page.getByTestId('layout-html').click()
    await expect(page.getByTestId('preview-panel')).toBeVisible()
    expect(await editorText(page)).toBe(original)

    // Format Table: balanced to the configured width, same rendered table.
    await goToLine(page, 5)
    await runPaletteCommand(page, 'Format Table')
    await expect.poll(async () => (await lines())[2]).toMatch(/^\| Game +\|/)
    const formatted = await editorText(page)
    await expect.poll(cells).toEqual(before)
    // The table is wider than the editor next to the preview: the user is told what to do.
    await expect(page.getByTestId('toast-info').last()).toContainText('wider than the editor')

    // Formatting again changes nothing.
    await runPaletteCommand(page, 'Format Table')
    await expect(page.getByTestId('toast-info').last()).toContainText(/already formatted|wider/)
    expect(await editorText(page)).toBe(formatted)

    // One undo restores the original text exactly.
    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toBe(original)

    // Fitting the editor on request gives a narrower table that renders the same.
    await goToLine(page, 5)
    await runPaletteCommand(page, 'Fit Table to Editor Width')
    await expect.poll(async () => (await lines())[2]).toMatch(/^\| Game +\|/)
    await expect.poll(cells).toEqual(before)
    const fitted = await lines()
    expect(Math.max(...fitted.slice(2).map((l) => l.length))).toBeLessThan(
      Math.max(
        ...formatted
          .split('\n')
          .slice(2)
          .map((l) => l.length)
      ) + 1
    )

    // The PDF has every column and every cell, inside the page.
    const target = path.join(sandbox.base, 'exports', 'table.pdf')
    const all = await exportPdf(app, page, target)
    for (const cell of [
      'Typehealthweergave',
      'Zichtbaarheidtijdensgevechten',
      'GodofWarRagnarök',
      'geenaparteHUD',
      'Zeerhoog',
      'Toegankelijkheid'
    ]) {
      expect(all, cell).toContain(cell)
    }
    for (const pdfPage of await readPdf(target)) {
      for (const item of pdfPage.items) {
        expect(item.x, item.text).toBeGreaterThanOrEqual(8)
        expect(item.x, item.text).toBeLessThanOrEqual(pdfPage.widthMm - 8)
      }
    }
  } finally {
    await closeApp(app)
  }
})

test('a screenshot dropped after a paragraph is a separate block in the preview and in the PDF', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await treeRow(page, 'docs').click()
    await openFromTree(page, 'guide.md')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.insertText(
      'Dit is de eerste alinea over de health UI.\n\nEen tweede alinea.'
    )
    await expect.poll(() => editorText(page)).toContain('Een tweede alinea.')
    await dropExternalFiles(
      page,
      [path.join(sandbox.external, 'architecture.png')],
      await lineCoordinates(page, 1)
    )
    await expect
      .poll(async () => (await editorText(page)).split('\n'))
      .toEqual([
        'Dit is de eerste alinea over de health UI.',
        '',
        expect.stringMatching(/^!\[Architecture[^\]]*\]\(.*architecture.*\.png\)$/),
        '',
        'Een tweede alinea.'
      ])
    // Preview: three blocks, the image alone in its paragraph.
    await expect
      .poll(() =>
        inPreview(page, (doc) =>
          [...doc.querySelectorAll('p')].map(
            (p) => `${p.querySelector('img') ? 'img' : 'text'}:${(p.textContent ?? '').trim()}`
          )
        )
      )
      .toEqual([
        'text:Dit is de eerste alinea over de health UI.',
        'img:',
        'text:Een tweede alinea.'
      ])

    // PDF: the text is there and the picture is painted.
    const target = path.join(sandbox.base, 'exports', 'image.pdf')
    const all = await exportPdf(app, page, target)
    expect(all).toContain(squash('Dit is de eerste alinea over de health UI.'))
    expect(all).toContain(squash('Een tweede alinea.'))
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(readFileSync(target)),
      isEvalSupported: false
    } as never).promise
    let images = 0
    for (let i = 1; i <= doc.numPages; i++) {
      const ops = await (await doc.getPage(i)).getOperatorList()
      images += ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject).length
    }
    expect(images).toBeGreaterThanOrEqual(1)
  } finally {
    await closeApp(app)
  }
})
