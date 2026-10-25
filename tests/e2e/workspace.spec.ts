import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  launch,
  launchWithWorkspace,
  mod,
  stubOpenDialog,
  treeRow
} from './helpers'

test('starts with the branded shell and an About dialog', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launch(sandbox)
  try {
    await expect(page).toHaveTitle('Markdown Studio')
    await expect(page.getByTestId('welcome')).toBeVisible()
    const logo = page.getByAltText('Markdown Studio logo')
    await expect(logo).toBeVisible()
    expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

    const window = await app.browserWindow(page)
    expect(await window.evaluate((w) => w.isVisible())).toBe(true)

    await page.getByRole('button', { name: 'About Markdown Studio' }).click()
    const dialog = page.getByRole('dialog', { name: 'About Markdown Studio' })
    await expect(dialog).toContainText(/Version \d+\.\d+\.\d+/)
    await expect(dialog).toContainText('Electron')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  } finally {
    await closeApp(app)
  }
})

test('opens a folder and browses nested files', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launch(sandbox)
  try {
    await stubOpenDialog(app, [sandbox.workspace])
    await page.getByRole('button', { name: 'Open Folder' }).first().click()

    await expect(page.locator('.workspace-name')).toHaveText('Atlas Project')
    await expect(page).toHaveTitle('Atlas Project — Markdown Studio')
    const labels = page.locator('.tree-row .tree-label')
    await expect(labels).toHaveText([
      'assets',
      'docs',
      'README.md',
      'unsafe.md',
      'windows-notes.md'
    ])

    await treeRow(page, 'docs').click()
    await expect(treeRow(page, 'guide.md')).toBeVisible()
    await expect(treeRow(page, 'docs')).toHaveAttribute('aria-expanded', 'true')
    await treeRow(page, 'docs').click()
    await expect(treeRow(page, 'guide.md')).toBeHidden()

    await treeRow(page, 'assets').click()
    await expect(treeRow(page, 'architecture.png')).toBeVisible()
    await expect(treeRow(page, 'diagram.svg')).toBeVisible()
  } finally {
    await closeApp(app)
  }
})

test('creates, renames and deletes files and folders', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await expect(treeRow(page, 'README.md')).toBeVisible()

    // New Markdown file: created on disk and opened in a tab.
    await page.getByTestId('sidebar').getByRole('button', { name: 'New Markdown File' }).click()
    const nameInput = page.getByLabel('File name')
    await expect(nameInput).toHaveValue('Untitled.md')
    await nameInput.fill('chapter-1')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.locator('.tab.active .tab-label')).toHaveText('chapter-1.md')
    expect(existsSync(path.join(sandbox.workspace, 'chapter-1.md'))).toBe(true)

    // New folder.
    await treeRow(page, 'README.md').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'New Folder…' }).click()
    await page.getByLabel('Folder name').fill('chapters')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(treeRow(page, 'chapters')).toBeVisible()
    expect(existsSync(path.join(sandbox.workspace, 'chapters'))).toBe(true)

    // Rename keeps the open tab pointing at the renamed file.
    await treeRow(page, 'chapter-1.md').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename…' }).click()
    await page.getByLabel('New name').fill('introduction.md')
    await page.getByRole('button', { name: 'Rename' }).click()
    await expect(treeRow(page, 'introduction.md')).toBeVisible()
    await expect(page.locator('.tab.active .tab-label')).toHaveText('introduction.md')
    expect(existsSync(path.join(sandbox.workspace, 'introduction.md'))).toBe(true)
    expect(existsSync(path.join(sandbox.workspace, 'chapter-1.md'))).toBe(false)

    // Invalid names are rejected with feedback.
    await treeRow(page, 'introduction.md').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename…' }).click()
    await page.getByLabel('New name').fill('bad/name.md')
    await page.getByRole('button', { name: 'Rename' }).click()
    await expect(page.locator('.field-error')).toContainText('cannot contain')
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Delete asks for confirmation; cancelling keeps the file.
    await treeRow(page, 'unsafe.md').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByRole('dialog', { name: 'Delete File' })).toContainText('unsafe.md')
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(existsSync(path.join(sandbox.workspace, 'unsafe.md'))).toBe(true)

    await treeRow(page, 'unsafe.md').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Move to/ })
      .click()
    // CI machines may have no trash; then the app offers a permanent delete instead.
    const permanent = page.getByRole('button', { name: 'Delete Permanently' })
    if (await permanent.isVisible({ timeout: 2000 }).catch(() => false)) await permanent.click()
    await expect(treeRow(page, 'unsafe.md')).toBeHidden()
    expect(existsSync(path.join(sandbox.workspace, 'unsafe.md'))).toBe(false)
    expect(readFileSync(path.join(sandbox.workspace, 'README.md'), 'utf8')).toContain(
      '# Project Atlas'
    )
  } finally {
    await closeApp(app)
  }
})

test('reflects changes made outside the application', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await expect(treeRow(page, 'README.md')).toBeVisible()
    writeFileSync(path.join(sandbox.workspace, 'added-externally.md'), '# Hello\n')
    await expect(treeRow(page, 'added-externally.md')).toBeVisible()
  } finally {
    await closeApp(app)
  }
})

test('closing or switching the folder resolves its open documents first', async () => {
  const sandbox = createSandbox()
  const other = path.join(sandbox.base, 'Other Project')
  mkdirSync(other)
  writeFileSync(path.join(other, 'notes.md'), '# Other\n')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await treeRow(page, 'README.md').click()
    await page.keyboard.press(`${mod}+N`)
    await page.locator('.monaco-editor .view-lines').click()
    await page.keyboard.type('Untitled text survives')
    await page.locator('.tab[data-name="README.md"]').click()
    await page.locator('.monaco-editor .view-lines').click()
    await page.keyboard.type('Changed ')

    // Cancelling keeps the current folder and its tabs.
    await stubOpenDialog(app, [other])
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('menu:command', {
        command: 'file.openFolder'
      })
    })
    const dialog = page.getByRole('dialog', { name: 'Unsaved Changes' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.workspace-name')).toHaveText('Atlas Project')
    await expect(page.locator('.tab')).toHaveCount(2)

    // Saving switches folders and closes only the old folder's tabs.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('menu:command', {
        command: 'file.openFolder'
      })
    })
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.workspace-name')).toHaveText('Other Project')
    await expect(page.locator('.tab')).toHaveCount(1)
    await expect(page.locator('.tab .tab-label')).toHaveText('Untitled-1')
    expect(readFileSync(path.join(sandbox.workspace, 'README.md'), 'utf8')).toContain('Changed ')

    // Close Folder leaves untitled documents alone.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('menu:command', {
        command: 'file.closeFolder'
      })
    })
    await expect(page.getByText('No folder is open.')).toBeVisible()
    await expect(page.locator('.tab')).toHaveCount(1)
  } finally {
    await closeApp(app)
  }
})
