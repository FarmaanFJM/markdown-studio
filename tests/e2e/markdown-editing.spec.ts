import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  editorText,
  launchEditing,
  mod,
  newDocumentWith,
  saveAndRead
} from './helpers'

test('formats selections with shortcuts and toggles them off again', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, 'some important text here')
    // Select "important text" with the keyboard: Home, then move and extend.
    await page.keyboard.press('Home')
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 14; i++) await page.keyboard.press('Shift+ArrowRight')

    await page.keyboard.press(`${mod}+B`)
    await expect.poll(() => editorText(page)).toBe('some **important text** here')
    // The text stays selected, so the same shortcut removes the formatting again.
    await page.keyboard.press(`${mod}+B`)
    await expect.poll(() => editorText(page)).toBe('some important text here')

    await page.keyboard.press(`${mod}+I`)
    await expect.poll(() => editorText(page)).toBe('some *important text* here')
    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toBe('some important text here')

    const saved = await saveAndRead(app, page, path.join(sandbox.workspace, 'fmt.md'))
    expect(saved).toBe('some important text here')
  } finally {
    await closeApp(app)
  }
})

test('continues lists, numbers them and leaves them on an empty item', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page)
    await page.keyboard.type('- one')
    await page.keyboard.press('Enter')
    await page.keyboard.type('two')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter') // empty item: ends the list
    await page.keyboard.type('after')
    await expect.poll(() => editorText(page)).toBe('- one\n- two\nafter')

    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.type('1. first')
    await page.keyboard.press('Enter')
    await page.keyboard.type('second')
    await page.keyboard.press('Enter')
    await page.keyboard.type('third')
    await expect.poll(() => editorText(page)).toBe('1. first\n2. second\n3. third')

    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.type('- [x] done')
    await page.keyboard.press('Enter')
    await page.keyboard.type('todo')
    await expect.poll(() => editorText(page)).toBe('- [x] done\n- [ ] todo')

    // Tab nests the item under the previous one; Shift+Tab brings it back.
    await page.keyboard.press('Tab')
    await expect.poll(() => editorText(page)).toBe('- [x] done\n  - [ ] todo')
    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => editorText(page)).toBe('- [x] done\n- [ ] todo')
  } finally {
    await closeApp(app)
  }
})

const suggestWidget = (page: import('@playwright/test').Page) =>
  page.locator('.suggest-widget.visible')

test('offers block suggestions on request and inserts snippets with placeholders', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page)
    // Ordinary typing never opens a menu.
    await page.keyboard.type('Intro')
    await expect(suggestWidget(page)).toBeHidden()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')

    await page.keyboard.press('Control+Space')
    await expect(suggestWidget(page)).toBeVisible()
    await expect(suggestWidget(page).getByText('Heading 1', { exact: true })).toBeVisible()
    await page.keyboard.type('table')
    await expect(suggestWidget(page).locator('.monaco-list-row').first()).toContainText('Table')
    await page.keyboard.press('Enter')
    await expect(suggestWidget(page)).toBeHidden()
    await expect
      .poll(() => editorText(page))
      .toContain('| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |')
    // The first placeholder is selected, so typing replaces it; Tab moves to the next one.
    await page.keyboard.type('Name')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Age')
    await expect.poll(() => editorText(page)).toContain('| Name | Age | Column 3 |')
    // Escape dismisses without changing the text.
    await page.keyboard.press('Escape')
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Control+Space')
    await expect(suggestWidget(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(suggestWidget(page)).toBeHidden()
  } finally {
    await closeApp(app)
  }
})

test('slash commands insert blocks, and a fenced code block puts the cursor inside', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page)
    await page.keyboard.type('/')
    await expect(suggestWidget(page)).toBeVisible()
    await page.keyboard.type('code')
    await page.keyboard.press('Enter')
    await page.keyboard.type('npm test')
    await expect.poll(() => editorText(page)).toBe('```\nnpm test\n```')

    // No suggestions inside the fenced block, even on request.
    await page.keyboard.press('Control+Space')
    await expect(suggestWidget(page)).toBeHidden()

    // A slash inside a sentence or path is just text.
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('see /usr/bin')
    await expect(suggestWidget(page)).toBeHidden()
    await expect.poll(() => editorText(page)).toContain('see /usr/bin')
  } finally {
    await closeApp(app)
  }
})

test('link and image insertion wrap the selection and offer placeholders', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, 'read the docs')
    await page.keyboard.press('Shift+Home')
    await page.keyboard.press(`${mod}+K`)
    await expect.poll(() => editorText(page)).toBe('[read the docs](url)')
    await page.keyboard.type('https://example.com')
    await expect.poll(() => editorText(page)).toBe('[read the docs](https://example.com)')

    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press(`${mod}+Shift+G`)
    await page.keyboard.type('Logo')
    await page.keyboard.press('Tab')
    await page.keyboard.type('assets/logo.png')
    await expect
      .poll(() => editorText(page))
      .toBe('[read the docs](https://example.com)\n\n![Logo](assets/logo.png)')
  } finally {
    await closeApp(app)
  }
})
