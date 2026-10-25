import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  editorText,
  focusEditor,
  launchEditing,
  mod,
  openFromTree,
  treeRow
} from './helpers'

const read = (sandbox: { workspace: string }, ...parts: string[]) =>
  readFileSync(path.join(sandbox.workspace, ...parts), 'utf8')

const dialog = (page: Page, name: RegExp | string) => page.getByRole('dialog', { name })

/** Renames through the Explorer's context menu; `current` lists folders to open, then the item. */
async function renameViaKeyboard(page: Page, current: string[], newName: string): Promise<void> {
  const label = current[current.length - 1]
  for (const segment of current.slice(0, -1)) await treeRow(page, segment).click()
  await treeRow(page, label).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  const prompt = dialog(page, /Rename/)
  await prompt.getByLabel('New name').fill(newName)
  await page.keyboard.press('Enter')
}

test('renaming an image updates the references after confirmation', async () => {
  const sandbox = createSandbox()
  const readme = read(sandbox, 'README.md')
  const { app, page } = await launchEditing(sandbox)
  try {
    await renameViaKeyboard(page, ['assets', 'architecture.png'], 'system-architecture.png')
    const confirm = dialog(page, 'Rename and Update References')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('README.md — 1 reference')

    await confirm.getByRole('button', { name: 'Rename and Update References' }).click()
    await expect(confirm).toBeHidden()
    await expect(page.getByTestId('toast-success')).toContainText(
      'updated 1 reference in 1 document'
    )

    expect(existsSync(path.join(sandbox.workspace, 'assets', 'system-architecture.png'))).toBe(true)
    expect(existsSync(path.join(sandbox.workspace, 'assets', 'architecture.png'))).toBe(false)
    // Only the destination changed; every other byte of the document is as before.
    expect(read(sandbox, 'README.md')).toBe(
      readme.replace('(assets/architecture.png)', '(assets/system-architecture.png)')
    )
  } finally {
    await closeApp(app)
  }
})

test('cancelling changes nothing; renaming without updating leaves the documents alone', async () => {
  const sandbox = createSandbox()
  const readme = read(sandbox, 'README.md')
  const { app, page } = await launchEditing(sandbox)
  try {
    await renameViaKeyboard(page, ['assets', 'architecture.png'], 'renamed.png')
    const confirm = dialog(page, 'Rename and Update References')
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    expect(existsSync(path.join(sandbox.workspace, 'assets', 'architecture.png'))).toBe(true)
    expect(existsSync(path.join(sandbox.workspace, 'assets', 'renamed.png'))).toBe(false)

    await renameViaKeyboard(page, ['architecture.png'], 'renamed.png')
    await confirm.getByRole('button', { name: 'Rename Without Updating' }).click()
    await expect(confirm).toBeHidden()
    await expect
      .poll(() => existsSync(path.join(sandbox.workspace, 'assets', 'renamed.png')))
      .toBe(true)
    expect(read(sandbox, 'README.md')).toBe(readme)
  } finally {
    await closeApp(app)
  }
})

test('a file nothing refers to is renamed without any question', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await renameViaKeyboard(page, ['windows-notes.md'], 'notes.md')
    await expect(treeRow(page, 'notes.md')).toBeVisible()
    await expect(dialog(page, 'Rename and Update References')).toHaveCount(0)
  } finally {
    await closeApp(app)
  }
})

test('moving a document fixes its own relative links and the links to it', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await treeRow(page, 'docs').click()
    await treeRow(page, 'guide.md').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Move…' }).click()
    const picker = dialog(page, /Move "guide.md"/)
    await expect(picker.getByTestId('folder-picker-current')).toHaveText('Atlas Project/docs')
    await picker.getByRole('button', { name: 'Up one folder' }).click()
    await expect(picker.getByTestId('folder-picker-current')).toHaveText('Atlas Project')
    await picker.getByTestId('folder-picker-confirm').click()

    const confirm = dialog(page, 'Move and Update References')
    await expect(confirm).toContainText('README.md — 1 reference')
    await expect(confirm).toContainText('guide.md — 2 references')
    await confirm.getByRole('button', { name: 'Move and Update References' }).click()
    await expect(confirm).toBeHidden()

    // Documents are updated one after another, so wait for each rather than reading mid-write.
    await expect.poll(() => read(sandbox, 'README.md')).toContain('[user guide](guide.md)')
    await expect
      .poll(() => read(sandbox, 'guide.md'))
      .toContain('![Screenshot](assets/screenshot.jpg)')
    expect(existsSync(path.join(sandbox.workspace, 'docs', 'guide.md'))).toBe(false)
    expect(read(sandbox, 'guide.md')).toContain('[project overview](README.md)')
  } finally {
    await closeApp(app)
  }
})

test('renaming a folder updates references to everything inside it', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await renameViaKeyboard(page, ['assets'], 'media')
    const confirm = dialog(page, 'Rename and Update References')
    await expect(confirm).toContainText('README.md')
    await expect(confirm).toContainText('guide.md')
    await confirm.getByRole('button', { name: 'Rename and Update References' }).click()
    await expect(confirm).toBeHidden()
    await expect
      .poll(() => read(sandbox, 'README.md'))
      .toContain('![Architecture](media/architecture.png)')
    await expect
      .poll(() => read(sandbox, 'docs', 'guide.md'))
      .toContain('![Screenshot](../media/screenshot.jpg)')
  } finally {
    await closeApp(app)
  }
})

test('open documents are updated in the editor; unsaved ones stay unsaved', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    // README has unsaved work; guide is open and saved.
    await openFromTree(page, 'README.md')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+Home`)
    await page.keyboard.type('UNSAVED ')
    await openFromTree(page, 'docs', 'guide.md')
    const diskReadme = read(sandbox, 'README.md')

    await renameViaKeyboard(page, ['assets'], 'media')
    const confirm = dialog(page, 'Rename and Update References')
    await expect(confirm).toContainText('README.md — 1 reference (has unsaved changes')
    await confirm.getByRole('button', { name: 'Rename and Update References' }).click()
    await expect(confirm).toBeHidden()

    // The saved document was updated and saved; the unsaved one only in the editor.
    await expect.poll(() => read(sandbox, 'docs', 'guide.md')).toContain('../media/screenshot.jpg')
    expect(read(sandbox, 'README.md')).toBe(diskReadme)
    await page.locator('.tab[data-name="README.md"]').click()
    await expect.poll(() => editorText(page)).toContain('UNSAVED # Project Atlas')
    await expect.poll(() => editorText(page)).toContain('![Architecture](media/architecture.png)')
    await expect(page.locator('.tab[data-name="README.md"]')).toHaveClass(/dirty/)

    // Undo takes the reference change back without losing the typed text.
    await focusEditor(page)
    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toContain('![Architecture](assets/architecture.png)')
    await expect.poll(() => editorText(page)).toContain('UNSAVED # Project Atlas')
  } finally {
    await closeApp(app)
  }
})

test('never overwrites a document that changed on disk meanwhile', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await renameViaKeyboard(page, ['assets'], 'media')
    const confirm = dialog(page, 'Rename and Update References')
    await expect(confirm).toBeVisible()
    // Someone edits README.md after the references were scanned.
    writeFileSync(
      path.join(sandbox.workspace, 'README.md'),
      '# Rewritten elsewhere\n\n![x](assets/architecture.png)\n'
    )
    await confirm.getByRole('button', { name: 'Rename and Update References' }).click()

    const report = dialog(page, /Some References Were Not Updated/)
    await expect(report).toBeVisible()
    await expect(report).toContainText('README.md')
    await report.getByRole('button', { name: 'Close' }).click()
    expect(read(sandbox, 'README.md')).toBe(
      '# Rewritten elsewhere\n\n![x](assets/architecture.png)\n'
    )
    // The other document was updated.
    expect(read(sandbox, 'docs', 'guide.md')).toContain('../media/screenshot.jpg')
  } finally {
    await closeApp(app)
  }
})

test.describe('drag and drop', () => {
  async function dragTo(page: Page, source: string, target: string): Promise<void> {
    const from = treeRow(page, source)
    const to = treeRow(page, target)
    const box = await to.boundingBox()
    await from.evaluate(
      (element, { x, y }) => {
        const data = new DataTransfer()
        element.dispatchEvent(
          new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data })
        )
        const targetElement = document.elementFromPoint(x, y)!
        for (const type of ['dragenter', 'dragover', 'drop']) {
          targetElement.dispatchEvent(
            new DragEvent(type, {
              bubbles: true,
              cancelable: true,
              dataTransfer: data,
              clientX: x,
              clientY: y
            })
          )
        }
        element.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }))
      },
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
    )
  }

  test('dropping a file on a folder moves it and offers to update references', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await dragTo(page, 'windows-notes.md', 'docs')
      // The move finishes asynchronously (the row is visible before and after it).
      await expect
        .poll(() => existsSync(path.join(sandbox.workspace, 'docs', 'windows-notes.md')))
        .toBe(true)
      expect(existsSync(path.join(sandbox.workspace, 'windows-notes.md'))).toBe(false)

      await dragTo(page, 'assets', 'docs')
      const confirm = dialog(page, 'Move and Update References')
      await expect(confirm).toContainText('README.md')
      await confirm.getByRole('button', { name: 'Move and Update References' }).click()
      await expect(confirm).toBeHidden()
      await expect
        .poll(() => read(sandbox, 'README.md'))
        .toContain('![Architecture](docs/assets/architecture.png)')
      await expect
        .poll(() => read(sandbox, 'docs', 'guide.md'))
        .toContain('![Screenshot](assets/screenshot.jpg)')
    } finally {
      await closeApp(app)
    }
  })

  test('a folder cannot be dropped into itself', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await dragTo(page, 'docs', 'docs')
      await expect(page.getByTestId('toast-error')).toContainText('cannot be moved into itself')
      expect(existsSync(path.join(sandbox.workspace, 'docs', 'guide.md'))).toBe(true)
    } finally {
      await closeApp(app)
    }
  })
})
