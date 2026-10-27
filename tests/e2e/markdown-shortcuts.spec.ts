import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  editorText,
  focusEditor,
  launchEditing,
  mod,
  newDocumentWith
} from './helpers'

const SENTENCE = 'This is important text.'

/** Selects `word` in the first line with the keyboard, as a user would. */
async function selectWord(page: Page, before: string): Promise<void> {
  await page.keyboard.press(`${mod}+Home`)
  for (let i = 0; i < before.length; i++) await page.keyboard.press('ArrowRight')
}

async function selectImportant(page: Page): Promise<void> {
  await selectWord(page, 'This is ')
  for (let i = 0; i < 'important'.length; i++) await page.keyboard.press('Shift+ArrowRight')
}

const redoKey = process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Y'

test('Ctrl/Cmd+B and Ctrl/Cmd+I format the selection, with the preview open beside the editor', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, SENTENCE)
    await expect(page.getByTestId('preview-panel')).toBeVisible()
    await selectImportant(page)

    await page.keyboard.press(`${mod}+B`)
    await expect.poll(() => editorText(page)).toBe('This is **important** text.')
    // The same shortcut takes the formatting off again.
    await page.keyboard.press(`${mod}+B`)
    await expect.poll(() => editorText(page)).toBe(SENTENCE)

    await page.keyboard.press(`${mod}+I`)
    await expect.poll(() => editorText(page)).toBe('This is *important* text.')

    // One undo and one redo per action.
    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toBe(SENTENCE)
    await page.keyboard.press(redoKey)
    await expect.poll(() => editorText(page)).toBe('This is *important* text.')
    await page.keyboard.press(`${mod}+Z`)
    await page.keyboard.press(`${mod}+Shift+Z`)
    await expect.poll(() => editorText(page)).toBe('This is *important* text.')

    // The selection survived, so the text is still selected after formatting.
    await page.keyboard.press(`${mod}+B`)
    await expect.poll(() => editorText(page)).toBe('This is ***important*** text.')

    // No unrelated application action ran: the preview and the sidebar are still there.
    await expect(page.getByTestId('preview-panel')).toBeVisible()
    await expect(page.getByTestId('sidebar')).toBeVisible()
    // And the preview shows the result.
    await expect
      .poll(() =>
        page
          .frameLocator('iframe.html-preview')
          .locator('strong em, em strong')
          .first()
          .textContent()
      )
      .toBe('important')
  } finally {
    await closeApp(app)
  }
})

test('the toolbar button and the shortcut give the same result', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, SENTENCE)
    await selectImportant(page)
    await page.keyboard.press(`${mod}+B`)
    await expect.poll(() => editorText(page)).toBe('This is **important** text.')
    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toBe(SENTENCE)

    await selectImportant(page)
    await page.getByTestId('format-markdown.bold').click()
    await expect.poll(() => editorText(page)).toBe('This is **important** text.')
    await page.getByTestId('format-markdown.italic').click()
    await expect.poll(() => editorText(page)).toBe('This is ***important*** text.')
    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toBe('This is **important** text.')
  } finally {
    await closeApp(app)
  }
})

test('with nothing selected a pair is inserted around the cursor; multi-line selections are formatted per line', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, 'a ')
    await page.keyboard.press(`${mod}+B`)
    await expect.poll(() => editorText(page)).toBe('a ****')
    await page.keyboard.type('x')
    await expect.poll(() => editorText(page)).toBe('a **x**')

    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.insertText('first line\nsecond line')
    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.press(`${mod}+I`)
    await expect.poll(() => editorText(page)).toBe('*first line*\n*second line*')
    await page.keyboard.press(`${mod}+I`)
    await expect.poll(() => editorText(page)).toBe('first line\nsecond line')
    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toBe('*first line*\n*second line*')
  } finally {
    await closeApp(app)
  }
})

test('list, quote and link shortcuts follow the standard Markdown mapping', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, 'item')
    await page.keyboard.press(`${mod}+Shift+7`)
    await expect.poll(() => editorText(page)).toBe('1. item')
    await page.keyboard.press(`${mod}+Shift+7`)
    await expect.poll(() => editorText(page)).toBe('item')
    await page.keyboard.press(`${mod}+Shift+8`)
    await expect.poll(() => editorText(page)).toBe('- item')
    await page.keyboard.press(`${mod}+Shift+8`)
    await page.keyboard.press(`${mod}+Shift+9`)
    await expect.poll(() => editorText(page)).toBe('> item')
    await page.keyboard.press(`${mod}+Shift+9`)
    await expect.poll(() => editorText(page)).toBe('item')
    await page.keyboard.press('Shift+Home')
    await page.keyboard.press(`${mod}+K`)
    await expect.poll(() => editorText(page)).toBe('[item](url)')
  } finally {
    await closeApp(app)
  }
})

test('application commands moved off the Markdown keys still work', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, SENTENCE)
    await page.keyboard.press(`${mod}+\\`)
    await expect(page.getByTestId('sidebar')).toBeHidden()
    await page.keyboard.press(`${mod}+\\`)
    await expect(page.getByTestId('sidebar')).toBeVisible()
    await page.keyboard.press(`${mod}+Shift+V`)
    await expect(page.getByTestId('preview-panel')).toBeHidden()
    // With the preview closed, Bold and Italic still only format.
    await selectImportant(page)
    await page.keyboard.press(`${mod}+B`)
    await expect.poll(() => editorText(page)).toBe('This is **important** text.')
    await expect(page.getByTestId('preview-panel')).toBeHidden()
    await page.keyboard.press(`${mod}+Shift+V`)
    await expect(page.getByTestId('preview-panel')).toBeVisible()
    await page.keyboard.press(`${mod}+I`)
    await expect(page.getByTestId('preview-panel')).toBeVisible()
  } finally {
    await closeApp(app)
  }
})

test('text fields keep their keys: Settings search and dialogs are not affected', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, SENTENCE)
    await page.keyboard.press(`${mod}+,`)
    const search = page.getByTestId('settings-search')
    await search.click()
    await search.fill('table')
    await page.keyboard.press(`${mod}+B`)
    await page.keyboard.press(`${mod}+I`)
    await expect(search).toHaveValue('table')
    // Nothing happened elsewhere: the sidebar and the settings page are still there.
    await expect(page.getByTestId('settings-panel')).toBeVisible()
    await expect(page.getByTestId('sidebar')).toBeVisible()
    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.type('font')
    await expect(search).toHaveValue('font')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('settings-panel')).toBeHidden()

    // Back in the editor the document is unchanged.
    await focusEditor(page)
    await expect.poll(() => editorText(page)).toBe(SENTENCE)
  } finally {
    await closeApp(app)
  }
})

test('the menu and the shortcuts reference show the same keys', async () => {
  const sandbox = createSandbox()
  const { app } = await launchEditing(sandbox)
  try {
    const accelerators = await app.evaluate(({ Menu }) => {
      const found: Record<string, string> = {}
      const walk = (items: Electron.MenuItem[]) => {
        for (const item of items) {
          if (item.label && item.accelerator) found[item.label] = String(item.accelerator)
          if (item.submenu) walk(item.submenu.items)
        }
      }
      walk(Menu.getApplicationMenu()!.items)
      return found
    })
    // Electron keeps the platform-neutral form: CmdOrCtrl shows as Ctrl or Cmd in the menu.
    const ctrl = 'CmdOrCtrl'
    expect(accelerators['Bold']).toBe(`${ctrl}+B`)
    expect(accelerators['Italic']).toBe(`${ctrl}+I`)
    expect(accelerators['Bulleted List']).toBe(`${ctrl}+Shift+8`)
    expect(accelerators['Blockquote']).toBe(`${ctrl}+Shift+9`)
    expect(accelerators['Toggle Sidebar']).toBe(`${ctrl}+\\`)
  } finally {
    await closeApp(app)
  }
})
