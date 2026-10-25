import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  editorText,
  launchWithWorkspace,
  mod,
  newDocumentWith,
  saveAndRead
} from './helpers'

test('formats selections with shortcuts and toggles them off again', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await newDocumentWith(page, 'some important text here')
    // Select "important text" with the keyboard: Home, then move and extend.
    await page.keyboard.press('Home')
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 14; i++) await page.keyboard.press('Shift+ArrowRight')

    await page.keyboard.press(`${mod}+Shift+B`)
    await expect.poll(() => editorText(page)).toBe('some **important text** here')
    // The text stays selected, so the same shortcut removes the formatting again.
    await page.keyboard.press(`${mod}+Shift+B`)
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
  const { app, page } = await launchWithWorkspace(sandbox)
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
