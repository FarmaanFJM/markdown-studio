/**
 * Student Edition acceptance scenario, driven through the real application in the order a student
 * works: create a project, organise it into folders, move and rename a document, write, insert and
 * restructure a table, add screenshots and local images, save, close, restart, reopen, export a PDF
 * and check the PDF. Steps depend on each other, so they run in order.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  dropExternalFiles,
  editorText,
  exportViaDialog,
  focusEditor,
  goToLine,
  inPreview,
  launch,
  lineCoordinates,
  mod,
  runPaletteCommand,
  stubOpenDialog,
  stubSaveDialog,
  treeRow,
  type Sandbox
} from './helpers'
import { rasterizePdf } from './support/pdfRaster'
import { readPdf } from './support/pdfText'

test.describe.configure({ mode: 'serial' })

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)
const squash = (text: string): string => text.replace(/[^\p{L}\p{N}]+/gu, '')

let sandbox: Sandbox
let project: string
let app: ElectronApplication
let page: Page

const document = (): string => path.join(project, 'Research', 'Health UI.md')

test.beforeAll(() => {
  sandbox = createSandbox()
  project = path.join(sandbox.base, 'Playful Tech')
  mkdirSync(project, { recursive: true })
})

test.afterAll(async () => {
  if (app) await closeApp(app)
})

async function previewFacts() {
  return inPreview(page, (doc) => ({
    headings: [...doc.querySelectorAll('h1, h2')].map((h) => h.textContent?.trim()),
    listItems: doc.querySelectorAll('li').length,
    rows: [...doc.querySelectorAll('table tr')].map((r) =>
      [...r.querySelectorAll('th, td')].map((c) => c.textContent?.trim())
    ),
    images: [...doc.querySelectorAll('img')].map((i) => i.naturalWidth > 0)
  }))
}

test('1. creates the Playful Tech project with Research, Analysis and Designs folders', async () => {
  ;({ app, page } = await launch(sandbox, {
    workspace: { restoreLastWorkspace: true, lastWorkspace: project, recent: [project] },
    editor: { wordWrap: false }
  }))
  await expect(page.locator('.workspace-name')).toHaveText('Playful Tech')
  for (const name of ['Research', 'Analysis', 'Designs']) {
    const tree = page.locator('.tree')
    const box = (await tree.boundingBox())!
    await tree.click({ button: 'right', position: { x: 10, y: box.height - 10 } })
    await page.getByText('New Folder…', { exact: true }).click()
    await page.getByLabel('Folder name').fill(name)
    await page.keyboard.press('Enter')
    await expect(treeRow(page, name)).toBeVisible()
  }
  for (const name of ['Research', 'Analysis', 'Designs'])
    expect(existsSync(path.join(project, name))).toBe(true)
})

test('2. creates a document, moves it into Research and renames it', async () => {
  await page.getByTestId('sidebar').getByRole('button', { name: 'New Markdown File' }).click()
  await page.getByLabel('File name').fill('Notes.md')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tab.active .tab-label')).toHaveText('Notes.md')
  // New documents are created in the folder selected in the Explorer (Designs, just created).
  expect(existsSync(path.join(project, 'Designs', 'Notes.md'))).toBe(true)

  await treeRow(page, 'Notes.md').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move…' }).click()
  const picker = page.getByRole('dialog')
  // The picker starts in the document's own folder; Research is a sibling.
  await picker.getByRole('button', { name: 'Up one folder' }).click()
  await picker.getByRole('button', { name: 'Research' }).click()
  await picker.getByRole('button', { name: 'Move Here' }).click()
  await expect.poll(() => existsSync(path.join(project, 'Research', 'Notes.md'))).toBe(true)
  expect(existsSync(path.join(project, 'Designs', 'Notes.md'))).toBe(false)

  await treeRow(page, 'Notes.md').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  await page.getByLabel('New name').fill('Health UI.md')
  await page.getByRole('button', { name: 'Rename' }).click()
  await expect.poll(() => existsSync(document())).toBe(true)
  // The open tab follows the file.
  await expect(page.locator('.tab.active .tab-label')).toHaveText('Health UI.md')
})

test('3. writes headings, paragraphs and lists', async () => {
  await focusEditor(page)
  await page.keyboard.insertText(
    '# Health UI research\n\nHow games show the health of the player.\n\n## Findings\n\n- Bars are common\n- Hearts are playful\n\n1. Collect games\n2. Compare them\n\n## Comparison\n\n'
  )
  await page.keyboard.press(`${mod}+S`)
  await expect
    .poll(() => previewFacts().then((f) => f.headings))
    .toEqual(['Health UI research', 'Findings', 'Comparison'])
  expect((await previewFacts()).listItems).toBe(4)
})

test('4. inserts a table and changes its structure without touching Markdown syntax', async () => {
  await page.keyboard.press(`${mod}+Shift+T`)
  const dialog = page.getByRole('dialog', { name: 'Insert Table' })
  await dialog.getByTestId('table-size-rows').fill('2')
  await dialog.getByTestId('table-size-columns').fill('3')
  await dialog.getByTestId('table-size-columns').press('Enter')
  const grid = [
    ['Game', 'Display', 'Feedback'],
    ['Zelda', 'Hearts', 'Pulse'],
    ['Hades', 'Bar', 'Drain']
  ]
  for (const [c, text] of grid[0].entries())
    await dialog.getByLabel(`Header, column ${c + 1}`).fill(text)
  for (const [r, row] of grid.slice(1).entries())
    for (const [c, text] of row.entries())
      await dialog.getByLabel(`Row ${r + 1}, column ${c + 1}`).fill(text)
  await dialog.getByTestId('table-editor-apply').click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => editorText(page)).toContain('Hades')

  const lineOfTable = (await editorText(page)).split('\n').findIndex((l) => l.startsWith('|')) + 1
  await goToLine(page, lineOfTable)
  await runPaletteCommand(page, 'Edit Table Visually')
  const edit = page.getByRole('dialog', { name: 'Edit Table' })
  await edit.getByLabel('Row 2, column 1').click()
  await edit.getByRole('button', { name: 'Row below' }).click()
  await edit.getByLabel('Row 3, column 1').fill('Dead Space')
  await edit.getByLabel('Row 3, column 2').fill('In world')
  await edit.getByLabel('Header, column 3').click()
  await edit.getByRole('button', { name: 'Column right' }).click()
  await edit.getByLabel('Header, column 4').fill('Readability')
  await edit.getByLabel('Header, column 2').click()
  await edit.getByRole('button', { name: 'Delete column' }).click()
  await edit.getByTestId('table-editor-apply').click()
  await expect(edit).toBeHidden()
  await expect.poll(() => editorText(page)).toContain('Dead Space')

  const rows = (await editorText(page)).split('\n').filter((l) => l.startsWith('|'))
  expect(rows).toHaveLength(5) // header, divider, three body rows
  expect(rows.join('\n')).not.toContain('Display')
  expect(new Set(rows.map((r) => r.length)).size).toBe(1) // aligned
  await page.keyboard.press(`${mod}+S`)
})

test('5. adds a pasted screenshot and local images with awkward file names', async () => {
  await focusEditor(page)
  await page.keyboard.press(`${mod}+End`)
  await page.keyboard.insertText('\n\n## Screenshots\n\n')
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
  await expect.poll(() => editorText(page)).toMatch(/!\[Pasted image\]\(.*pasted-image-/)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await stubOpenDialog(app, [])
  for (const file of ['architecture.png', 'Team Photo (2024).png']) {
    const line = (await editorText(page)).split('\n').length
    await dropExternalFiles(
      page,
      [path.join(sandbox.external, file)],
      await lineCoordinates(page, line)
    )
    await expect.poll(() => editorText(page)).toContain(file)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.insertText('\n\n')
  }
  await page.keyboard.press(`${mod}+S`)
  const assets = readdirSync(path.join(project, 'assets'))
  expect(assets.some((f) => f.startsWith('pasted-image-'))).toBe(true)
  expect(assets).toContain('architecture.png')
  expect(assets).toContain('Team Photo (2024).png')
  await expect.poll(() => previewFacts().then((f) => f.images.filter(Boolean).length)).toBe(3)
})

test('6. closes and restarts the application and finds everything intact', async () => {
  await page.keyboard.press(`${mod}+S`)
  const before = readFileSync(document(), 'utf8')
  await closeApp(app)
  ;({ app, page } = await launch(sandbox))
  await expect(page.locator('.workspace-name')).toHaveText('Playful Tech')
  await expect(page.locator('.tab.active .tab-label')).toHaveText('Health UI.md')
  expect(readFileSync(document(), 'utf8')).toBe(before)
  await expect.poll(() => previewFacts().then((f) => f.images)).toEqual([true, true, true])
  const facts = await previewFacts()
  expect(facts.headings).toContain('Comparison')
  expect(facts.rows).toHaveLength(4)
  expect(facts.rows[0]).toEqual(['Game', 'Feedback', 'Readability'])
  expect(facts.rows.flat()).toContain('Dead Space')
  for (const name of ['Research', 'Analysis', 'Designs'])
    expect(existsSync(path.join(project, name))).toBe(true)
})

test('7. exports a PDF that contains the text, the table and every image inside the margins', async () => {
  const target = path.join(sandbox.base, 'exports', 'playful-tech.pdf')
  mkdirSync(path.dirname(target), { recursive: true })
  await stubSaveDialog(app, target)
  await exportViaDialog(page, 'pdf')
  await expect(page.locator('[data-testid^="toast-"]').last()).toContainText('playful-tech.pdf', {
    timeout: 60_000
  })
  const pages = await readPdf(target)
  const text = squash(pages.map((p) => p.text).join(' '))
  for (const expected of [
    'Health UI research',
    'Findings',
    'Bars are common',
    'Collect games',
    'Game',
    'Readability',
    'Dead Space',
    'Screenshots'
  ])
    expect(text).toContain(squash(expected))
  expect(text).not.toContain(squash('Display'))

  const raster = await rasterizePdf(app, target, 1.25)
  const mmPerPixel = 25.4 / (72 * 1.25)
  for (const rendered of raster) {
    expect(rendered.ink).not.toBeNull()
    expect(rendered.ink!.left * mmPerPixel).toBeGreaterThanOrEqual(15)
    expect(rendered.width * mmPerPixel - rendered.ink!.right * mmPerPixel).toBeGreaterThanOrEqual(
      15
    )
  }
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
  expect(images).toBeGreaterThanOrEqual(3)
})
