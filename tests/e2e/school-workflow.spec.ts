/**
 * The complete school workflow, driven through the real application: a Playful Tech Health UI
 * research project with folders and documents, formatted writing, pasted and dragged images,
 * tables, captions, cross-references, citations and a bibliography, an automatic table of
 * contents, saving, restarting, a multi-page PDF, a two-column document and a publication that
 * combines chapters.
 *
 * The steps depend on each other (as the work of a student does), so they run in order.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  dropExternalFiles,
  editorText,
  exportViaDialog,
  inPreview,
  launch,
  lineCoordinates,
  mod,
  openFromTree,
  runPaletteCommand,
  stubOpenDialog,
  stubSaveDialog,
  treeRow,
  type Sandbox
} from './helpers'
import { rasterizePdf } from './support/pdfRaster'
import { readPdf } from './support/pdfText'

test.describe.configure({ mode: 'serial' })

const SHOTS = process.env.MS_SCREENSHOTS ? path.resolve(__dirname, '../../docs/screenshots') : null
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

let sandbox: Sandbox
let project: string
let app: ElectronApplication
let page: Page

async function shot(name: string): Promise<void> {
  if (SHOTS) {
    await page.waitForTimeout(500)
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
  }
}

async function start(first = false): Promise<void> {
  const settings = first
    ? {
        workspace: { restoreLastWorkspace: true, lastWorkspace: project, recent: [project] },
        editor: { wordWrap: false }
      }
    : undefined
  ;({ app, page } = await launch(sandbox, settings))
}

/** Clicks into the editor area (below the text, so an empty document works too). */
async function focusEditor(page: Page): Promise<void> {
  await page.locator('.editor-stack').click({ position: { x: 300, y: 200 } })
  await expect(page.locator('.monaco-editor.focused')).toBeVisible()
}

/** Moves the caret to the start of a 1-based line with the keyboard. */
async function goToLine(page: Page, line: number): Promise<void> {
  await focusEditor(page)
  await page.keyboard.press(`${mod}+Home`)
  for (let i = 1; i < line; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Home')
  await page.keyboard.press('Home')
}

/** PDF text is split into positioned items: compare without colons and spacing differences. */
const squash = (text: string): string => text.replace(/[^\p{L}\p{N}]+/gu, '')

async function newFolder(name: string): Promise<void> {
  // Right-click on the empty part of the Explorer: the folder is created at the project root.
  const tree = page.locator('.tree')
  const box = (await tree.boundingBox())!
  await tree.click({ button: 'right', position: { x: 10, y: box.height - 10 } })
  await page.getByText('New Folder…', { exact: true }).click()
  await page.getByLabel('Folder name').fill(name)
  await page.keyboard.press('Enter')
  await expect(treeRow(page, name)).toBeVisible()
}

async function newFile(folder: string | null, name: string): Promise<void> {
  if (folder) await treeRow(page, folder).click()
  await page.getByTestId('sidebar').getByRole('button', { name: 'New Markdown File' }).click()
  await page.getByLabel('File name').fill(name)
  await page.keyboard.press('Enter')
  await expect(page.locator('.tab.active .tab-label')).toHaveText(name)
}

async function insertImageFiles(from: string, files: string[], line: number): Promise<void> {
  await stubOpenDialog(app, [])
  const point = await lineCoordinates(page, line)
  await dropExternalFiles(
    page,
    files.map((f) => path.join(from, f)),
    point
  )
}

test.beforeAll(() => {
  sandbox = createSandbox()
  project = path.join(sandbox.base, 'Playful Tech')
  mkdirSync(project, { recursive: true })
})

test.afterAll(async () => {
  if (app) await closeApp(app)
})

test('1. creates a Playful Tech project with folders and several research documents', async () => {
  await start(true)
  await newFolder('01-Research')
  await newFolder('02-Design')
  await newFolder('assets')
  await newFile('01-Research', 'Game-Analyses.md')
  await newFile('02-Design', 'Design-Ideas.md')

  // The Health UI template, created inside the selected folder.
  await treeRow(page, '01-Research').click()
  await page.keyboard.press(`${mod}+Shift+N`)
  await page
    .getByTestId('template-list')
    .getByRole('option', { name: /^Health UI research/ })
    .click()
  await page.getByTestId('template-use').click()
  const form = page.getByRole('dialog', { name: /New Document: Health UI research/ })
  await form.getByLabel('Title').fill('Health UI in games')
  await form.getByLabel('Author').fill('Student Name')
  await form.getByTestId('new-document-create').click()
  await expect(page.locator('.tab.active .tab-label')).toHaveText('Health UI in games.md')

  expect(existsSync(path.join(project, '01-Research', 'Game-Analyses.md'))).toBe(true)
  expect(existsSync(path.join(project, '02-Design', 'Design-Ideas.md'))).toBe(true)
  const template = readFileSync(path.join(project, '01-Research', 'Health UI in games.md'), 'utf8')
  expect(template).toContain('# Health UI in games')
  expect(template).toContain('**Author:** Student Name')
  expect(template).toContain('Figma link')
  await shot('workflow-project-template')
})

test('2. writes a game analysis with headings, lists, links and text formatting from the controls', async () => {
  await openFromTree(page, 'Game-Analyses.md')
  await focusEditor(page)
  // Heading through the toolbar's heading menu.
  await page.getByLabel('Heading level').selectOption('1')
  await page.keyboard.type('Game A health UI')
  await page.keyboard.press('Enter')
  await page.keyboard.type('The health bar sits in the ')
  await page.getByTestId('format-markdown.bold').click()
  await page.keyboard.type('top-left corner')
  await page.keyboard.press('End')
  await page.keyboard.type(' and uses an ')
  await page.getByTestId('format-markdown.italic').click()
  await page.keyboard.type('animated')
  await page.keyboard.press('End')
  await page.keyboard.type(' fill.')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.getByTestId('format-markdown.bulletList').click()
  await page.keyboard.type('Always visible')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Drains smoothly after damage')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press(`${mod}+K`)
  await page.keyboard.type('Reference page')
  await page.keyboard.press('Tab')
  await page.keyboard.type('https://example.org/game-a')
  // End, not Tab: a path suggestion may still be open after the slash and Tab would accept it.
  await page.keyboard.press('End')
  const text = await editorText(page)
  expect(text).toContain('# Game A health UI')
  expect(text).toContain('**top-left corner**')
  expect(text).toContain('*animated*')
  expect(text).toMatch(/- Always visible\n- Drains smoothly after damage/)
  expect(text).toContain('[Reference page](https://example.org/game-a)')
  await expect
    .poll(() => inPreview(page, (doc) => doc.querySelectorAll('h1, strong, em, ul li, a').length))
    .toBeGreaterThanOrEqual(6)
  await page.keyboard.press(`${mod}+S`)
  await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)
})

test('3. adds images by pasting from the clipboard and by dragging from the file explorer', async () => {
  await focusEditor(page)
  await page.keyboard.press(`${mod}+End`)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.evaluate(
    (bytes) => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], 'screenshot.png', { type: 'image/png' }))
      document
        .querySelector('.monaco-host')!
        .dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
        )
    },
    [...PNG]
  )
  await expect
    .poll(() => editorText(page))
    .toMatch(/!\[Pasted image\]\(\.\.\/assets\/pasted-image-/)
  expect(readdirSync(path.join(project, 'assets')).some((f) => f.startsWith('pasted-image-'))).toBe(
    true
  )

  await page.keyboard.press('End') // the alt text is selected for typing; keep it
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  const lines = (await editorText(page)).split('\n').length
  await insertImageFiles(sandbox.external, ['architecture.png'], lines)
  await expect.poll(() => editorText(page)).toContain('](../assets/architecture.png)')
  expect(existsSync(path.join(project, 'assets', 'architecture.png'))).toBe(true)
  await expect
    .poll(() =>
      inPreview(
        page,
        (doc) => [...doc.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length
      )
    )
    .toBe(2)
  await shot('workflow-images')
  await page.keyboard.press(`${mod}+S`)
})

test('4. builds a comparison table: size, cells, rows, columns and alignment', async () => {
  await openFromTree(page, 'Design-Ideas.md')
  await focusEditor(page)
  await page.keyboard.insertText('# Design ideas\n\n')
  await page.keyboard.press(`${mod}+Shift+T`)
  const dialog = page.getByRole('dialog', { name: 'Insert Table' })
  await expect(dialog).toBeVisible()
  // The size is chosen before the grid is filled: 3 body rows and 4 columns.
  await dialog.getByTestId('table-size-rows').fill('3')
  await dialog.getByTestId('table-size-columns').fill('4')
  await dialog.getByTestId('table-size-columns').press('Enter')
  await expect(dialog.getByLabel('Header, column 4')).toBeVisible()
  await expect(dialog.getByLabel('Row 3, column 1')).toBeVisible()
  const header = ['Game', 'Display type', 'Placement', 'Feedback']
  for (const [i, text] of header.entries())
    await dialog.getByLabel(`Header, column ${i + 1}`).fill(text)
  const cells = [
    ['Game A', 'Bar', 'Top left', 'Smooth drain'],
    ['Game B', 'Hearts', 'Top right', 'Pulse when low'],
    ['Game C', 'Numeric', 'Bottom', 'Colour change']
  ]
  for (const [r, row] of cells.entries()) {
    for (const [c, text] of row.entries())
      await dialog.getByLabel(`Row ${r + 1}, column ${c + 1}`).fill(text)
  }
  await dialog.getByRole('button', { name: 'Center, column 2' }).click()
  await dialog.getByTestId('table-editor-apply').click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => editorText(page)).toMatch(/\| Game A \|\s+Bar\s+\|/)
  expect(await editorText(page)).toMatch(/\|:-+:\|/)

  // Edit it again: change a cell, add a row and a column, delete a column, right-align one.
  await goToLine(page, 3)
  await runPaletteCommand(page, 'Edit Table Visually')
  const edit = page.getByRole('dialog', { name: 'Edit Table' })
  await edit.getByLabel('Row 2, column 2').fill('Hearts (3 containers)')
  await edit.getByLabel('Row 3, column 1').click()
  await edit.getByRole('button', { name: 'Row below' }).click()
  await edit.getByLabel('Row 4, column 1').fill('Game D')
  await edit.getByLabel('Header, column 4').click()
  await edit.getByRole('button', { name: 'Column right' }).click()
  await edit.getByLabel('Header, column 5').fill('Readability')
  await edit.getByLabel('Header, column 3').click()
  await edit.getByRole('button', { name: 'Delete column' }).click()
  await edit.getByRole('button', { name: 'Align right, column 3' }).click()
  await edit.getByTestId('table-editor-apply').click()
  await expect(edit).toBeHidden()
  const table = await editorText(page)
  expect(table).toContain('Hearts (3 containers)')
  expect(table).toContain('Game D')
  expect(table).toContain('Readability')
  expect(table).not.toContain('Placement')
  const lines = table.split('\n').filter((l) => l.startsWith('|'))
  expect(lines).toHaveLength(6)
  expect(new Set(lines.map((l) => l.length)).size).toBe(1) // columns aligned
  await shot('workflow-table')

  // Undo and redo restore the table exactly.
  await page.keyboard.press(`${mod}+Z`)
  await expect.poll(() => editorText(page)).toContain('Placement')
  await page.keyboard.press(`${mod}+Shift+Z`)
  await expect.poll(() => editorText(page)).toContain('Readability')
  await page.keyboard.press(`${mod}+S`)
})

test('5. reformats an existing messy table without losing content', async () => {
  await focusEditor(page)
  await page.keyboard.press(`${mod}+End`)
  const messy = [
    '',
    '',
    '| Name|Link   |Note |',
    '|---|:-:|--:|',
    '|[Wiki](https://example.org/a)|**bold** and `code`|Unicode: é – 日本 |',
    '|  |a \\| b||'
  ].join('\n')
  await page.keyboard.insertText(messy)
  const before = await editorText(page)
  const row = before.split('\n').findIndex((l) => l.startsWith('| Name|'))
  await goToLine(page, row + 1)
  await page.keyboard.press('Alt+Shift+F')
  await expect.poll(() => editorText(page)).not.toContain('| Name|')
  const after = await editorText(page)
  for (const keep of [
    '[Wiki](https://example.org/a)',
    '**bold** and `code`',
    'Unicode: é – 日本',
    'a \\| b'
  ]) {
    expect(after).toContain(keep)
  }
  const tableLines = after
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .slice(-4)
  expect(new Set(tableLines.map((l) => [...l].length)).size).toBeLessThanOrEqual(2)
  // The preview shows the same cells as the source.
  await expect.poll(() => inPreview(page, (doc) => doc.querySelectorAll('table').length)).toBe(2)
  const cells = await inPreview(page, (doc) =>
    [...doc.querySelectorAll('table')[1].querySelectorAll('td')].map((td) => td.textContent)
  )
  expect(cells).toEqual(['Wiki', 'bold and code', 'Unicode: é – 日本', '', 'a | b', ''])
  await page.keyboard.press(`${mod}+S`)
})

test('6. adds captions, cross-references, sources, citations and a bibliography', async () => {
  await openFromTree(page, 'Health UI in games.md')
  await focusEditor(page)
  await page.keyboard.press(`${mod}+End`)
  await page.keyboard.insertText('\n\n## Analysis of Game A\n\n')

  // A figure: choose an image, give it a caption; the number is automatic.
  await stubOpenDialog(app, [path.join(sandbox.external, 'Team Photo (2024).png')])
  await page.keyboard.press(`${mod}+Shift+F`)
  const figure = page.getByRole('dialog', { name: 'Insert Figure' })
  await figure.getByTestId('caption-text').fill('Health bar of Game A')
  await expect(figure.getByTestId('caption-id')).toHaveValue('fig-health-bar-of-game-a')
  await figure.getByTestId('caption-confirm').click()
  await expect(figure).toBeHidden()
  await expect.poll(() => editorText(page)).toContain('{#fig-health-bar-of-game-a}')
  expect(await editorText(page)).toContain(
    '![Health bar of Game A](<../assets/Team Photo (2024).png>)'
  )

  // Sources: two entries added through the form.
  await runPaletteCommand(page, 'Manage Sources')
  const sources = page.getByRole('dialog', { name: 'Sources' })
  await sources.getByTestId('source-new').click()
  await sources.getByTestId('source-type').selectOption('book')
  await sources.getByTestId('source-authors').fill('Smith, Jane; Lee, Al')
  await sources.getByTestId('source-year').fill('2020')
  await sources.getByTestId('source-title').fill('Game interface design')
  await sources.getByTestId('source-publisher').fill('Interface Press')
  await expect(sources.getByTestId('source-key')).toHaveValue('smith2020')
  await expect(sources.getByTestId('source-preview')).toContainText(
    'Smith, J., & Lee, A. (2020). Game interface design. Interface Press.'
  )
  await sources.getByTestId('source-save').click()
  await expect(sources.getByTestId('sources-message')).toContainText('Saved')
  await sources.getByTestId('source-new').click()
  await sources.getByTestId('source-type').selectOption('webpage')
  await sources.getByTestId('source-title').fill('Health bars explained')
  await sources.getByTestId('source-key').fill('healthbars')
  // No author, year or URL were typed: the form says what is missing and invents nothing.
  await expect(sources.getByTestId('source-missing')).toContainText('no author')
  await shot('workflow-sources')
  await sources.getByTestId('source-save').click()
  await expect(sources.getByTestId('sources-message')).toContainText('Saved')
  await sources.getByTestId('sources-close').click()
  const library = JSON.parse(
    readFileSync(path.join(project, '.markdown-studio', 'sources.json'), 'utf8')
  )
  expect(library.map((s: { id: string }) => s.id)).toEqual(['smith2020', 'healthbars'])
  expect(library[1].author).toBeUndefined()
  expect(library[1].issued).toBeUndefined()

  // A citation chosen from the list, with a page.
  await focusEditor(page)
  await page.keyboard.press(`${mod}+End`)
  await page.keyboard.insertText('\n\nThe bar is described by ')
  await page.keyboard.press(`${mod}+Shift+C`)
  const picker = page.getByRole('dialog', { name: 'Insert Citation' })
  await picker.getByTestId('picker-item-smith2020').click()
  await picker.getByTestId('citation-locator').fill('p. 33')
  await shot('workflow-citation-picker')
  await picker.getByTestId('picker-confirm').click()
  await expect(picker).toBeHidden()
  await expect.poll(() => editorText(page)).toContain('[@smith2020, p. 33]')

  // A table caption and a cross-reference to the figure and the table.
  await page.keyboard.insertText('. See ')
  await page.keyboard.press(`${mod}+Shift+R`)
  const xref = page.getByRole('dialog', { name: 'Insert Cross-reference' })
  await xref.getByTestId('picker-item-fig-health-bar-of-game-a').click()
  await expect.poll(() => editorText(page)).toContain('@fig-health-bar-of-game-a')
  await page.keyboard.insertText(' and ')
  await page.keyboard.press(`${mod}+Shift+R`)
  await page
    .getByRole('dialog', { name: 'Insert Cross-reference' })
    .getByTestId('picker-item-tbl-health-ui-comparison')
    .click()
  await page.keyboard.insertText(', and a second source [@healthbars].')
  await page.keyboard.press(`${mod}+S`)

  await expect
    .poll(() => inPreview(page, (doc) => doc.querySelectorAll('.ms-cite').length))
    .toBeGreaterThanOrEqual(2)
  const facts = await inPreview(page, (doc) => ({
    refs: [...doc.querySelectorAll('a.ms-xref')].map((a) => a.textContent),
    cites: [...doc.querySelectorAll('.ms-cite')].map((c) => c.textContent),
    bibliography: [...doc.querySelectorAll('.csl-entry')].map((e) => e.textContent),
    captions: [...doc.querySelectorAll('figcaption, caption')].map((c) => c.textContent)
  }))
  expect(facts.refs.some((r) => /^Figure\u00a0\d+$/.test(r ?? ''))).toBe(true)
  expect(facts.refs.some((r) => /^Table\u00a0\d+$/.test(r ?? ''))).toBe(true)
  expect(facts.cites.join(' ')).toContain('(Smith & Lee, 2020, p. 33)')
  expect(facts.bibliography.some((e) => e?.startsWith('Smith, J., & Lee, A. (2020)'))).toBe(true)
  // The source without author or year appears as written: title first, "n.d." for the date.
  expect(
    facts.bibliography.some((e) => e?.includes('Health bars explained') && e.includes('n.d.'))
  ).toBe(true)
  await page.keyboard.press(`${mod}+Home`)
  await shot('workflow-citations')
})

test('7. generates a table of contents and keeps numbers and references current when the structure changes', async () => {
  await focusEditor(page)
  await page.keyboard.press(`${mod}+Shift+D`)
  const settings = page.getByRole('dialog', { name: 'Document Settings' })
  await expect(settings).toBeVisible()
  await settings.getByLabel('Automatic table of contents').check()
  await settings.getByLabel('Number sections').check()
  await shot('workflow-document-settings')
  await settings.getByTestId('document-settings-apply').click()
  await expect(settings).toBeHidden()
  await page.keyboard.press(`${mod}+S`)
  await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)
  const head = readFileSync(
    path.join(project, '01-Research', 'Health UI in games.md'),
    'utf8'
  ).split('---')[1]
  expect(head).toContain('toc: true')
  expect(head).toContain('number-sections: true')
  expect(head).toContain('lang: en')

  await expect
    .poll(() => inPreview(page, (doc) => doc.querySelectorAll('nav.ms-toc a').length))
    .toBeGreaterThan(8)
  const readToc = () =>
    inPreview(page, (doc) =>
      [...doc.querySelectorAll('nav.ms-toc a')].map((a) =>
        (a.textContent ?? '').replace(/\s+/g, ' ').trim()
      )
    )
  const before = await readToc()
  expect(before.find((t) => t.includes('Scope and method'))).toMatch(/^2 /)
  await page.keyboard.press(`${mod}+Home`)
  await shot('workflow-toc')

  // Change the structure: a new section before "Scope and method" pushes everything down.
  const onDisk = readFileSync(path.join(project, '01-Research', 'Health UI in games.md'), 'utf8')
  const line = onDisk.split('\n').findIndex((l) => l.startsWith('## Scope and method'))
  expect(line).toBeGreaterThan(0)
  await goToLine(page, line + 1)
  await page.keyboard.insertText('## Background reading\n\nWhy these games were chosen.\n\n')
  await expect.poll(readToc).toContainEqual(expect.stringMatching(/^2 Background reading/))
  const after = await readToc()
  expect(after.find((t) => t.includes('Scope and method'))).toMatch(/^3 /)
  const numbers = await inPreview(page, (doc) =>
    [...doc.querySelectorAll('h2 .ms-secnum')].map((n) => n.textContent)
  )
  expect(numbers.slice(0, 4)).toEqual(['1', '2', '3', '4'])
  // Every table caption keeps counting in document order.
  const tables = await inPreview(page, (doc) =>
    [...doc.querySelectorAll('caption .ms-caption-label')].map((n) => n.textContent)
  )
  expect(tables.map((t) => t?.replace(/\u00a0/g, ' '))).toEqual(
    tables.map((_, i) => `Table ${i + 1}:`)
  )
  await page.keyboard.press(`${mod}+S`)
})

test('8. saves everything, closes the application and finds it all again after reopening', async () => {
  await page.keyboard.press(`${mod}+S`)
  await closeApp(app)
  await start()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.tab.active .tab-label')).toHaveText('Health UI in games.md')

  // The file on disk is what matters; the editor only renders the lines in view.
  const source = readFileSync(path.join(project, '01-Research', 'Health UI in games.md'), 'utf8')
  expect(source).toContain('toc: true')
  expect(source).toContain('{#fig-health-bar-of-game-a}')
  expect(source).toContain('[@smith2020, p. 33]')
  await expect
    .poll(() => inPreview(page, (doc) => doc.querySelectorAll('nav.ms-toc a').length))
    .toBeGreaterThan(8)
  const facts = await inPreview(page, (doc) => ({
    cite: doc.querySelector('.ms-cite')?.textContent,
    entries: doc.querySelectorAll('.csl-entry').length,
    figure: doc.querySelector('figcaption')?.textContent?.replace(/\u00a0/g, ' '),
    imageLoaded: [...doc.querySelectorAll('figure img')].every(
      (i) => (i as HTMLImageElement).naturalWidth > 0
    ),
    missing: doc.querySelectorAll('.ms-xref-missing, .ms-cite-missing, .ms-img-missing').length
  }))
  expect(facts.cite).toBe('(Smith & Lee, 2020, p. 33)')
  expect(facts.entries).toBe(2)
  expect(facts.figure).toBe('Figure 1: Health bar of Game A')
  await expect
    .poll(() =>
      inPreview(page, (doc) =>
        [...doc.querySelectorAll('figure img')].every(
          (i) => (i as HTMLImageElement).naturalWidth > 0
        )
      )
    )
    .toBe(true)
  expect(facts.missing).toBe(0)

  // Documents, images and sources are on disk, in ordinary files.
  expect(existsSync(path.join(project, '.markdown-studio', 'sources.json'))).toBe(true)
  const analyses = readFileSync(path.join(project, '01-Research', 'Game-Analyses.md'), 'utf8')
  expect(analyses).toContain('![Pasted image](../assets/pasted-image-')
  expect(analyses).toContain('](../assets/architecture.png)')
  expect(existsSync(path.join(project, 'assets', 'architecture.png'))).toBe(true)
})

test('9. exports a multi-page report and the rendered PDF is complete and inside the margins', async () => {
  const target = path.join(sandbox.base, 'exports', 'report.pdf')
  mkdirSync(path.dirname(target), { recursive: true })
  await stubSaveDialog(app, target)
  await exportViaDialog(page, 'pdf')
  await expect(page.locator('[data-testid^="toast-"]').last()).toContainText('report.pdf', {
    timeout: 60_000
  })
  const pages = await readPdf(target)
  expect(pages.length).toBeGreaterThanOrEqual(2)
  const all = pages.map((p) => p.text).join(' ')
  for (const expected of [
    'Health UI in games',
    'Contents',
    'Research question',
    'Figure 1: Health bar of Game A',
    '(Smith & Lee, 2020, p. 33)',
    'References',
    'Game interface design',
    'Table 1:'
  ]) {
    expect(squash(all)).toContain(squash(expected))
  }
  const raster = await rasterizePdf(app, target, 1.25)
  const mmPerPixel = 25.4 / (72 * 1.25)
  for (const rendered of raster) {
    expect(rendered.ink).not.toBeNull()
    expect(rendered.ink!.left * mmPerPixel).toBeGreaterThanOrEqual(15)
    expect(rendered.width * mmPerPixel - rendered.ink!.right * mmPerPixel).toBeGreaterThanOrEqual(
      15
    )
  }
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    raster
      .slice(0, 3)
      .forEach((r, i) =>
        writeFileSync(path.join(SHOTS, `workflow-report-page-${i + 1}.png`), r.png)
      )
  }
  // The image really is in the PDF.
  const imageCount = await (async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(readFileSync(target)),
      isEvalSupported: false
    } as never).promise
    let n = 0
    for (let i = 1; i <= doc.numPages; i++) {
      const ops = await (await doc.getPage(i)).getOperatorList()
      n += ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject).length
    }
    return n
  })()
  expect(imageCount).toBeGreaterThanOrEqual(1)
})

test('10. lays out a two-column document with real columns', async () => {
  await treeRow(page, '01-Research').click()
  await page.keyboard.press(`${mod}+Shift+N`)
  await page
    .getByTestId('template-list')
    .getByRole('option', { name: /^Two-column article/ })
    .click()
  await page.getByTestId('template-use').click()
  const form = page.getByRole('dialog', { name: /New Document: Two-column article/ })
  await form.getByLabel('Title').fill('Columns article')
  await form.getByLabel('Author').fill('Student Name')
  await form.getByTestId('new-document-create').click()
  await expect(page.locator('.tab.active .tab-label')).toHaveText('Columns article.md')
  await focusEditor(page)
  await page.keyboard.press(`${mod}+End`)
  const paragraph =
    'Health bars communicate the state of the player at a glance, so their shape and colour matter a great deal. '
  await page.keyboard.insertText(`\n\n${paragraph.repeat(60)}\n\n${paragraph.repeat(40)}\n`)
  await page.keyboard.press(`${mod}+S`)

  // The settings dialog shows what the front matter says.
  await page.keyboard.press(`${mod}+Shift+D`)
  const settings = page.getByRole('dialog', { name: 'Document Settings' })
  await expect(settings.getByTestId('layout-columns')).toHaveValue('2')
  await expect(settings.getByTestId('layout-page-size')).toHaveValue('A4')
  await settings.getByRole('button', { name: 'Cancel' }).click()
  await expect
    .poll(() => inPreview(page, (doc) => doc.querySelector('main')?.getAttribute('data-columns')))
    .toBe('2')

  const target = path.join(sandbox.base, 'exports', 'columns.pdf')
  await stubSaveDialog(app, target)
  await exportViaDialog(page, 'pdf')
  await expect(page.locator('[data-testid^="toast-"]').last()).toContainText('columns.pdf', {
    timeout: 60_000
  })
  const pages = await readPdf(target)
  expect(pages.length).toBeGreaterThanOrEqual(2)
  const body = pages[0].items.filter((item) => item.y > 70)
  const left = body.filter((i) => i.x < 60)
  const right = body.filter((i) => i.x > 100)
  expect(left.length).toBeGreaterThan(10)
  expect(right.length).toBeGreaterThan(10)
  expect(Math.max(...body.map((i) => i.x))).toBeLessThan(pages[0].widthMm - 10)
  // The footer comes from the document's own front matter.
  expect(pages[0].text).toContain('Page 1 of')
  const raster = await rasterizePdf(app, target, 1.25)
  if (SHOTS) writeFileSync(path.join(SHOTS, 'workflow-two-columns.png'), raster[0].png)
})

test('11. combines several chapters into one publication with shared contents, numbering, references and assets', async () => {
  await page.keyboard.press(`${mod}+Shift+J`)
  await expect(page.getByTestId('publication-empty')).toBeVisible()
  await page.getByTestId('publication-create').click()
  await expect(page.getByTestId('publication-panel')).toBeVisible()
  await page.getByTestId('publication-title').fill('Health UI research')
  await page.getByTestId('publication-title').press('Enter')
  await page.getByTestId('publication-author').fill('Student Name')
  await page.getByTestId('publication-author').press('Enter')

  await page.getByTestId('chapter-add').click()
  const picker = page.getByRole('dialog', { name: 'Add Chapters' })
  for (const file of [
    '01-Research/Game-Analyses.md',
    '01-Research/Health UI in games.md',
    '02-Design/Design-Ideas.md'
  ]) {
    await picker.getByTestId(`picker-item-${file}`).click()
  }
  await picker.getByTestId('picker-confirm').click()
  await expect(page.getByTestId('chapter-3')).toBeVisible()
  await shot('workflow-publication-panel')
  // Reorder: the Health UI chapter goes first.
  await page.getByTestId('chapter-up-2').click()
  await expect(page.getByTestId('chapter-1')).toContainText('Health UI in games')

  const storedPublication = () =>
    JSON.parse(readFileSync(path.join(project, '.markdown-studio', 'publication.json'), 'utf8'))
  // The panel saves in the background, so the file is polled rather than read once.
  await expect.poll(() => storedPublication().chapters[0]).toBe('01-Research/Health UI in games.md')
  expect(storedPublication().title).toBe('Health UI research')

  await page.getByTestId('publication-preview').click()
  await expect
    .poll(() => inPreview(page, (doc) => doc.querySelectorAll('section.ms-chapter').length))
    .toBe(3)
  const facts = await inPreview(page, (doc) => ({
    title: doc.querySelector('.ms-publication-title')?.textContent,
    toc: doc.querySelectorAll('nav.ms-toc a').length,
    tocs: doc.querySelectorAll('nav.ms-toc').length,
    figure: doc
      .querySelector('#fig-health-bar-of-game-a figcaption')
      ?.textContent?.replace(/\u00a0/g, ' '),
    ref: [...doc.querySelectorAll('a.ms-xref')].map((a) => a.textContent?.replace(/\u00a0/g, ' ')),
    images: [...doc.querySelectorAll('img')].map((i) => [
      (i as HTMLImageElement).naturalWidth > 0,
      i.getAttribute('data-ms-src')
    ]),
    bibliography: doc.querySelectorAll('section.ms-bibliography').length,
    ids: [...doc.querySelectorAll('[id]')].map((e) => e.id)
  }))
  expect(facts.title).toBe('Health UI research')
  expect(facts.tocs).toBe(1)
  expect(facts.toc).toBeGreaterThan(8)
  expect(facts.figure).toBe('Figure 1.1: Health bar of Game A')
  expect(facts.ref).toContain('Figure 1.1')
  expect(facts.images.every(([loaded]) => loaded)).toBe(true)
  expect(facts.images.length).toBeGreaterThanOrEqual(3)
  expect(facts.bibliography).toBe(1)
  expect(new Set(facts.ids).size).toBe(facts.ids.length)
  await shot('workflow-publication-preview')

  // Chapter files stay ordinary documents: open one from the panel and edit it.
  await page.getByTestId('chapter-3').locator('.chapter-open').click()
  await expect(page.locator('.tab.active .tab-label')).toHaveText('Design-Ideas.md')

  const target = path.join(sandbox.base, 'exports', 'publication.pdf')
  await stubSaveDialog(app, target)
  await page.getByTestId('publication-export').click()
  const dialog = page.getByRole('dialog', { name: 'Export' })
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('export-run').click()
  await expect(page.locator('[data-testid^="toast-"]').last()).toContainText('publication.pdf', {
    timeout: 90_000
  })
  const pages = await readPdf(target)
  const all = squash(pages.map((p) => p.text).join(' '))
  for (const expected of [
    'Health UI research',
    'Student Name',
    'Contents',
    'Figure 1.1',
    'Game A health UI',
    'Design ideas',
    'References'
  ]) {
    expect(all).toContain(squash(expected))
  }
  expect(pages.length).toBeGreaterThanOrEqual(4)
  const raster = await rasterizePdf(app, target, 1.0)
  if (SHOTS)
    raster
      .slice(0, 3)
      .forEach((r, i) =>
        writeFileSync(path.join(SHOTS, `workflow-publication-page-${i + 1}.png`), r.png)
      )
})
