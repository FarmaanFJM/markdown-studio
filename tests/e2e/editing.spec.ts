import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  editorText,
  focusEditor,
  inPreview,
  launchWithWorkspace,
  mod,
  openFromTree,
  stubOpenDialog,
  stubSaveDialog,
  treeRow,
  waitForExit
} from './helpers'

test('opens, edits, saves and reopens a document', async () => {
  const sandbox = createSandbox()
  const readmePath = path.join(sandbox.workspace, 'README.md')
  const original = readFileSync(readmePath, 'utf8')
  let { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'README.md')
    await expect(page.locator('.monaco-editor')).toBeVisible()
    expect(await editorText(page)).toContain('# Project Atlas')
    await expect(page).toHaveTitle('README.md — Atlas Project — Markdown Studio')

    await focusEditor(page)
    await page.keyboard.press(`${mod}+Home`)
    await page.keyboard.type('<!-- edited -->\n')
    await expect(page.locator('.tab.active')).toHaveClass(/dirty/)
    await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes')
    await expect(page).toHaveTitle(/^● README\.md/)
    await expect(page.getByTestId('cursor-position')).toHaveText('Ln 2, Col 1')

    await page.keyboard.press(`${mod}+S`)
    await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)
    await expect(page.getByTestId('save-state')).toHaveText('Saved')
    // Saved exactly: only the typed text was added, nothing else was normalised.
    expect(readFileSync(readmePath, 'utf8')).toBe(`<!-- edited -->\n${original}`)
  } finally {
    await closeApp(app)
  }

  ;({ app, page } = await launchWithWorkspace(sandbox))
  try {
    await openFromTree(page, 'README.md')
    expect(await editorText(page)).toMatch(/^<!-- edited -->\n# Project Atlas/)
  } finally {
    await closeApp(app)
  }
})

test('keeps CRLF line endings and independent state per tab', async () => {
  const sandbox = createSandbox()
  const crlfPath = path.join(sandbox.workspace, 'windows-notes.md')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'windows-notes.md')
    await expect(page.getByTestId('status-bar')).toContainText('CRLF')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.type('Appended line.')
    await page.keyboard.press('Enter')

    await openFromTree(page, 'README.md')
    await expect(page.locator('.tab')).toHaveCount(2)
    await expect(page.locator('.tab[data-name="windows-notes.md"]')).toHaveClass(/dirty/)
    await expect(page.locator('.tab[data-name="README.md"]')).not.toHaveClass(/dirty/)
    expect(await editorText(page)).not.toContain('Appended line.')

    // Undo in README does not affect the other document's history.
    await focusEditor(page)
    await page.keyboard.type('X')
    await expect(page.locator('.tab[data-name="README.md"]')).toHaveClass(/dirty/)
    await page.keyboard.press(`${mod}+Z`)
    await expect(page.locator('.tab[data-name="README.md"]')).not.toHaveClass(/dirty/)
    await page.keyboard.press(`${mod}+Y`)
    await expect(page.locator('.tab[data-name="README.md"]')).toHaveClass(/dirty/)
    await page.keyboard.press(`${mod}+Z`)

    await page.locator('.tab[data-name="windows-notes.md"]').click()
    expect(await editorText(page)).toContain('Appended line.')
    await page.keyboard.press(`${mod}+S`)
    await expect(page.locator('.tab[data-name="windows-notes.md"]')).not.toHaveClass(/dirty/)
    expect(readFileSync(crlfPath, 'utf8')).toBe(
      '# Windows Notes\r\n\r\nThis file uses CRLF line endings.\r\nAppended line.\r\n'
    )
  } finally {
    await closeApp(app)
  }
})

test('asks before closing a tab with unsaved changes', async () => {
  const sandbox = createSandbox()
  const guidePath = path.join(sandbox.workspace, 'docs', 'guide.md')
  const original = readFileSync(guidePath, 'utf8')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'docs', 'guide.md')
    await focusEditor(page)
    await page.keyboard.type('Draft ')

    // Cancel keeps the tab and the changes.
    await page.keyboard.press(`${mod}+W`)
    const dialog = page.getByRole('dialog', { name: 'Unsaved Changes' })
    await expect(dialog).toContainText('guide.md')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.tab')).toHaveCount(1)

    // Don't Save closes without writing.
    await page.locator('.tab.active .tab-close').click()
    await dialog.getByRole('button', { name: "Don't Save" }).click()
    await expect(page.locator('.tab')).toHaveCount(0)
    expect(readFileSync(guidePath, 'utf8')).toBe(original)

    // Save writes, then closes.
    await openFromTree(page, 'guide.md')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.type('Saved from the prompt.')
    await page.keyboard.press(`${mod}+W`)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.tab')).toHaveCount(0)
    expect(readFileSync(guidePath, 'utf8')).toBe(`${original}Saved from the prompt.`)
  } finally {
    await closeApp(app)
  }
})

test('creates an untitled document and saves it with Save As', async () => {
  const sandbox = createSandbox()
  const target = path.join(sandbox.workspace, 'notes', '..', 'meeting-notes.md')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.keyboard.press(`${mod}+N`)
    await expect(page.locator('.tab.active .tab-label')).toHaveText('Untitled-1')
    await page.keyboard.press(`${mod}+N`)
    await expect(page.locator('.tab.active .tab-label')).toHaveText('Untitled-2')
    await page.keyboard.type('# Meeting notes\n\n- Decide on export themes\n')

    await stubSaveDialog(app, path.resolve(target))
    await page.keyboard.press(`${mod}+S`)
    await expect(page.locator('.tab.active .tab-label')).toHaveText('meeting-notes.md')
    await expect(treeRow(page, 'meeting-notes.md')).toBeVisible()
    expect(readFileSync(path.resolve(target), 'utf8')).toBe(
      '# Meeting notes\n\n- Decide on export themes\n'
    )

    // Ctrl+Shift+S saves a copy under a new name and switches the tab to it.
    const copy = path.join(sandbox.workspace, 'meeting-notes-copy.md')
    await stubSaveDialog(app, copy)
    await page.keyboard.press(`${mod}+Shift+S`)
    await expect(page.locator('.tab.active .tab-label')).toHaveText('meeting-notes-copy.md')
    expect(readFileSync(copy, 'utf8')).toContain('# Meeting notes')

    // Untitled-1 is still empty and clean, so Ctrl+W closes it without prompting.
    await page.locator('.tab[data-name="Untitled-1"]').click()
    await page.keyboard.press(`${mod}+W`)
    await expect(page.locator('.tab[data-name="Untitled-1"]')).toHaveCount(0)
  } finally {
    await closeApp(app)
  }
})

test('find, replace and layout shortcuts', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'README.md')
    await focusEditor(page)

    await page.keyboard.press(`${mod}+F`)
    const find = page.locator('.find-widget')
    await expect(find).toHaveClass(/visible/)
    await page.keyboard.type('Gateway')
    await expect(find.locator('.matchesCount')).toContainText('of 3')
    await page.keyboard.press('Escape')

    await page.keyboard.press(`${mod}+H`)
    await expect(find).toHaveClass(/replaceToggled/)
    await page.keyboard.press('Escape')

    // Ctrl+B toggles the sidebar.
    await page.keyboard.press(`${mod}+B`)
    await expect(page.getByTestId('sidebar')).toBeHidden()
    await page.keyboard.press(`${mod}+B`)
    await expect(page.getByTestId('sidebar')).toBeVisible()

    // Ctrl+Shift+V toggles the preview; the editor reclaims the space.
    const editorWidth = () =>
      page.getByTestId('editor-column').evaluate((el) => el.getBoundingClientRect().width)
    const withPreview = await editorWidth()
    await page.keyboard.press(`${mod}+Shift+V`)
    await expect(page.getByTestId('preview-panel')).toBeHidden()
    expect(await editorWidth()).toBeGreaterThan(withPreview + 200)
    await page.keyboard.press(`${mod}+Shift+V`)
    await expect(page.getByTestId('preview-panel')).toBeVisible()

    // Ctrl+= changes the editor font size.
    const fontSize = () =>
      page
        .locator('.monaco-editor .view-line')
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize)
    const before = await fontSize()
    await page.keyboard.press(`${mod}+=`)
    await expect.poll(fontSize).not.toBe(before)
    await page.keyboard.press(`${mod}+0`)
    await expect.poll(fontSize).toBe(before)
  } finally {
    await closeApp(app)
  }
})

test('asks about unsaved documents when the window closes', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  await openFromTree(page, 'README.md')
  await focusEditor(page)
  await page.keyboard.type('unsaved ')

  const closeWindow = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await closeWindow()
  const dialog = page.getByRole('dialog', { name: 'Unsaved Changes' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)

  const exited = waitForExit(app)
  await closeWindow()
  await dialog.getByRole('button', { name: "Don't Save" }).click()
  await exited
  expect(readFileSync(path.join(sandbox.workspace, 'README.md'), 'utf8')).not.toContain('unsaved')
})

test('Ctrl+O opens a Markdown file outside the workspace, with its images', async () => {
  const sandbox = createSandbox()
  const notes = path.join(sandbox.external, 'loose-notes.md')
  writeFileSync(notes, '# Loose notes\n\n![Team](<Team Photo (2024).png>)\n')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await stubOpenDialog(app, [notes])
    await page.keyboard.press(`${mod}+O`)
    await expect(page.locator('.tab.active .tab-label')).toHaveText('loose-notes.md')
    await expect
      .poll(() =>
        inPreview(page, (doc) => {
          const img = doc.querySelector('img')
          return img ? img.complete && img.naturalWidth > 0 : false
        })
      )
      .toBe(true)

    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.type('Edited outside the workspace.\n')
    await page.keyboard.press(`${mod}+S`)
    await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)
    expect(readFileSync(notes, 'utf8')).toContain('Edited outside the workspace.')
  } finally {
    await closeApp(app)
  }
})
