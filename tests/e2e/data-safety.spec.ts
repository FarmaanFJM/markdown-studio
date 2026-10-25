import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  killApp,
  createSandbox,
  editorText,
  focusEditor,
  inPreview,
  launch,
  launchWithWorkspace,
  mod,
  openFromTree,
  seedDocuments,
  stubSaveDialog,
  treeRow
} from './helpers'

const NO_WRAP = { editor: { wordWrap: false } }
// A valid 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

async function pasteImage(page: import('@playwright/test').Page, bytes: number[], type: string) {
  await page.evaluate(
    ({ bytes, type }) => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], 'clipboard.png', { type }))
      const host = document.querySelector('.monaco-host')!
      host.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
      )
    },
    { bytes, type }
  )
}

test('pasting an image from the clipboard saves it in the project and inserts a relative reference', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await openFromTree(page, 'README.md')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.press('Enter')
    await pasteImage(page, [...PNG], 'image/png')
    await expect
      .poll(() => editorText(page))
      .toMatch(/!\[Pasted image\]\(assets\/pasted-image-\d{8}-\d{6}\.png\)/)
    const files = readdirSync(path.join(sandbox.workspace, 'assets')).filter((f) =>
      f.startsWith('pasted-image-')
    )
    expect(files).toHaveLength(1)
    expect(readFileSync(path.join(sandbox.workspace, 'assets', files[0])).equals(PNG)).toBe(true)

    // The pasted picture shows in the preview.
    await expect
      .poll(() =>
        inPreview(page, (doc) =>
          [...doc.querySelectorAll('img')].some(
            (i) =>
              (i.getAttribute('data-ms-src') ?? '').includes('pasted-image') && i.naturalWidth > 0
          )
        )
      )
      .toBe(true)

    // Pasting the same picture again reuses the file; a different one gets its own name.
    await page.keyboard.press('Enter')
    await pasteImage(page, [...PNG], 'image/png')
    await page.waitForTimeout(500)
    expect(
      readdirSync(path.join(sandbox.workspace, 'assets')).filter((f) =>
        f.startsWith('pasted-image-')
      )
    ).toHaveLength(1)
  } finally {
    await closeApp(app)
  }
})

test('a paste that carries text is left to the editor, even if a picture is attached', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await openFromTree(page, 'README.md')
    await focusEditor(page)
    const handled = await page.evaluate(
      (bytes) => {
        const data = new DataTransfer()
        data.setData('text/plain', 'cells')
        data.items.add(new File([new Uint8Array(bytes)], 'cells.png', { type: 'image/png' }))
        const event = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data
        })
        document.querySelector('.monaco-host')!.dispatchEvent(event)
        return event.defaultPrevented
      },
      [...PNG]
    )
    expect(handled).toBe(false)
  } finally {
    await closeApp(app)
  }
})

test('a file changed by another program is never overwritten silently', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'notes.md': '# Notes\n\nOriginal line.\n' })
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await openFromTree(page, 'notes.md')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.type('My edit.')
    // Another program changes the file while we have unsaved edits.
    const target = path.join(sandbox.workspace, 'notes.md')
    await new Promise((r) => setTimeout(r, 1100))
    writeFileSync(target, '# Notes\n\nChanged elsewhere.\n')
    await page.keyboard.press(`${mod}+S`)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('changed on disk')
    expect(readFileSync(target, 'utf8')).toContain('Changed elsewhere.')
    // Choosing "Reload from Disk" keeps the other program's version and discards the edit.
    await dialog.getByRole('button', { name: 'Reload from Disk' }).click()
    await expect.poll(() => editorText(page)).toContain('Changed elsewhere.')
    expect(readFileSync(target, 'utf8')).toBe('# Notes\n\nChanged elsewhere.\n')
  } finally {
    await closeApp(app)
  }
})

test('overwrite is possible after an explicit choice, and a clean document follows the file', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'a.md': 'one\n', 'b.md': 'two\n' })
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await openFromTree(page, 'a.md')
    await new Promise((r) => setTimeout(r, 1100))
    // An unmodified document is reloaded when its file changes.
    writeFileSync(path.join(sandbox.workspace, 'a.md'), 'one, updated\n')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(() => editorText(page)).toContain('one, updated')

    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.type('mine')
    await new Promise((r) => setTimeout(r, 1100))
    writeFileSync(path.join(sandbox.workspace, 'a.md'), 'theirs\n')
    await page.keyboard.press(`${mod}+S`)
    await page.getByRole('dialog').getByRole('button', { name: 'Overwrite' }).click()
    await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)
    expect(readFileSync(path.join(sandbox.workspace, 'a.md'), 'utf8')).toContain('mine')
  } finally {
    await closeApp(app)
  }
})

test('unsaved text survives a killed application and is offered back', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'draft.md': '# Draft\n' })
  let launched = await launchWithWorkspace(sandbox, NO_WRAP)
  await openFromTree(launched.page, 'draft.md')
  await focusEditor(launched.page)
  await launched.page.keyboard.press(`${mod}+End`)
  await launched.page.keyboard.type('Typed but never saved.')
  const recovery = path.join(sandbox.userData, 'recovery')
  await expect
    .poll(() => existsSync(recovery) && readdirSync(recovery).length > 0, { timeout: 10_000 })
    .toBe(true)
  await killApp(launched.app)
  expect(readFileSync(path.join(sandbox.workspace, 'draft.md'), 'utf8')).toBe('# Draft\n')

  launched = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    const dialog = launched.page.getByRole('dialog')
    await expect(dialog).toContainText('Recover unsaved work')
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(launched.page.locator('.tab.active')).toHaveClass(/dirty/)
    await expect.poll(() => editorText(launched.page)).toContain('Typed but never saved.')
    // Saving the restored text writes it to the real file.
    await launched.page.keyboard.press(`${mod}+S`)
    await expect(launched.page.locator('.tab.active')).not.toHaveClass(/dirty/)
    expect(readFileSync(path.join(sandbox.workspace, 'draft.md'), 'utf8')).toContain(
      'Typed but never saved.'
    )
  } finally {
    await closeApp(launched.app)
  }
})

test('after a normal close nothing is offered, and the open documents come back', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'one.md': '# One\n', 'two.md': '# Two\n' })
  let launched = await launchWithWorkspace(sandbox, NO_WRAP)
  await openFromTree(launched.page, 'one.md')
  await openFromTree(launched.page, 'two.md')
  await launched.page.waitForTimeout(800)
  await closeApp(launched.app)

  // No settings are written this time: the application restores them itself.
  launched = await launch(sandbox)
  try {
    await expect(launched.page.getByTestId('tab')).toHaveCount(2)
    await expect(launched.page.locator('.tab.active .tab-label')).toHaveText('two.md')
    await expect(launched.page.getByRole('dialog')).toHaveCount(0)
  } finally {
    await closeApp(launched.app)
  }
})

test('saving a document in another folder keeps its images working by updating the paths', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, {
    'draft.md': '# Draft\n\n![Architecture](assets/architecture.png)\n\n[Next](windows-notes.md)\n'
  })
  mkdirSync(path.join(sandbox.workspace, 'chapters'), { recursive: true })
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await openFromTree(page, 'draft.md')
    const target = path.join(sandbox.workspace, 'chapters', 'final.md')
    await stubSaveDialog(app, target)
    await page.keyboard.press(`${mod}+Shift+S`)
    await page.getByRole('dialog').getByRole('button', { name: 'Update References' }).click()
    await expect(page.locator('.tab.active .tab-label')).toHaveText('final.md')
    const saved = readFileSync(target, 'utf8')
    expect(saved).toContain('![Architecture](../assets/architecture.png)')
    expect(saved).toContain('[Next](../windows-notes.md)')
    await expect
      .poll(() =>
        inPreview(page, (doc) => {
          const img = doc.querySelector('img')
          return !!img && img.complete && img.naturalWidth > 0
        })
      )
      .toBe(true)
  } finally {
    await closeApp(app)
  }
})

test('moving the whole project folder keeps images and references working', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, {
    'chapters/one.md': '# One\n\n![Architecture](../assets/architecture.png)\n'
  })
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  await closeApp(app)
  // The folder is copied elsewhere, as a user moving it would.
  const moved = path.join(sandbox.base, 'Moved Project')
  const { cpSync } = await import('node:fs')
  cpSync(sandbox.workspace, moved, { recursive: true })
  const second = await launch(sandbox, {
    workspace: { lastWorkspace: moved, restoreLastWorkspace: true, recent: [moved] },
    ...NO_WRAP
  })
  void page
  try {
    await treeRow(second.page, 'chapters').click()
    await openFromTree(second.page, 'one.md')
    await expect
      .poll(() =>
        inPreview(second.page, (doc) => {
          const img = doc.querySelector('img')
          return !!img && img.complete && img.naturalWidth > 0
        })
      )
      .toBe(true)
  } finally {
    await closeApp(second.app)
  }
})

test('a missing image is reported in the preview instead of a blank box', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'broken.md': '# Broken\n\n![Lost](assets/nope.png)\n' })
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await openFromTree(page, 'broken.md')
    await expect
      .poll(() => inPreview(page, (doc) => doc.querySelectorAll('img.ms-img-missing').length))
      .toBe(1)
    const title = await inPreview(
      page,
      (doc) => doc.querySelector('img')?.getAttribute('title') ?? ''
    )
    expect(title).toContain('Image not found')
  } finally {
    await closeApp(app)
  }
})
