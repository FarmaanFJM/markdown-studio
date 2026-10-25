import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  clickMenuItem,
  closeApp,
  createSandbox,
  editorText,
  focusEditor,
  launch,
  launchWithWorkspace,
  mod,
  newDocumentWith,
  openFromTree,
  runPaletteCommand,
  saveAndRead
} from './helpers'

test('the formatting toolbar runs the same commands and can be hidden', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    const toolbar = page.getByTestId('format-toolbar')
    await expect(toolbar).toBeHidden() // no document yet
    await newDocumentWith(page, 'first\nsecond')
    await expect(toolbar).toBeVisible()
    await expect(toolbar).toHaveAttribute('aria-label', 'Markdown formatting')

    await page.keyboard.press(`${mod}+A`)
    await page.getByTestId('format-markdown.bulletList').click()
    await expect.poll(() => editorText(page)).toBe('- first\n- second')
    await page.getByTestId('format-markdown.taskList').click()
    await expect.poll(() => editorText(page)).toBe('- [ ] first\n- [ ] second')
    await page.keyboard.press(`${mod}+Z`)
    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toBe('first\nsecond')

    // The heading selector reflects the line under the cursor and changes it.
    await page.keyboard.press(`${mod}+Home`)
    const heading = toolbar.getByLabel('Heading level')
    await expect(heading).toHaveValue('0')
    await heading.selectOption('2')
    await expect.poll(() => editorText(page)).toBe('## first\nsecond')
    await expect(heading).toHaveValue('2')

    // Buttons carry their shortcut in the tooltip and an accessible name.
    await expect(page.getByTestId('format-markdown.bold')).toHaveAttribute('aria-label', 'Bold')
    await expect(page.getByTestId('format-markdown.bold')).toHaveAttribute('title', /Shift\+B/)

    // Hide it from the View menu.
    await clickMenuItem(app, 'View', 'Toggle Formatting Toolbar')
    await expect(toolbar).toBeHidden()
    await clickMenuItem(app, 'View', 'Toggle Formatting Toolbar')
    await expect(toolbar).toBeVisible()
  } finally {
    await closeApp(app)
  }
})

test('the Format, Insert and Table menus run editor commands', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await newDocumentWith(page, 'word')
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await clickMenuItem(app, 'Format', 'Bold')
    await expect.poll(() => editorText(page)).toBe('**word**')
    await clickMenuItem(app, 'Format', 'Heading', 'Heading 3')
    await expect.poll(() => editorText(page)).toBe('### **word**')

    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await clickMenuItem(app, 'Insert', 'Horizontal Rule')
    await expect.poll(() => editorText(page)).toContain('\n---\n')

    await page.getByTestId('palette-input').count()
    await clickMenuItem(app, 'View', 'Command Palette…')
    await expect(page.getByTestId('palette-input')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('palette-input')).toBeHidden()
  } finally {
    await closeApp(app)
  }
})

test('the command palette lists commands, explains unavailable ones and restores focus', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.keyboard.press(`${mod}+Shift+P`)
    const list = page.getByTestId('palette-list')
    await expect(list.getByRole('option', { name: /Format Table(?!s)/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await expect(list.getByRole('option', { name: /New Markdown File/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    // Names are readable, and the shortcut is shown next to the command.
    await expect(list.getByRole('option', { name: /Bold/ })).toContainText(/Shift\+B/)

    await page.getByTestId('palette-input').fill('toggle prev')
    await expect(page.locator('.palette-item.selected')).toContainText('Toggle Preview')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('palette-input')).toBeHidden()

    // Arrow keys move through results; Enter runs the highlighted command.
    await page.keyboard.press(`${mod}+Shift+P`)
    await page.getByTestId('palette-input').fill('new markdown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(page.locator('.tab.active .tab-label')).toHaveText('Untitled-1')

    // After a command the editor has the keyboard again.
    await page.keyboard.type('typing works')
    await expect.poll(() => editorText(page)).toBe('typing works')
  } finally {
    await closeApp(app)
  }
})

test('multiple cursors are formatted together as one undoable step', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await newDocumentWith(page, 'cat and cat and cat')
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press(`${mod}+D`)
    await page.keyboard.press(`${mod}+D`)
    await page.keyboard.press(`${mod}+Shift+B`)
    await expect.poll(() => editorText(page)).toBe('**cat** and **cat** and **cat**')
    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toBe('cat and cat and cat')
  } finally {
    await closeApp(app)
  }
})

test('edits keep CRLF line endings and the UTF-8 byte-order mark', async () => {
  const sandbox = createSandbox()
  const crlf = path.join(sandbox.workspace, 'crlf.md')
  const bom = path.join(sandbox.workspace, 'bom.md')
  writeFileSync(crlf, 'Title\r\n\r\ntext\r\n')
  writeFileSync(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('plain words\n')]))
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'crlf.md')
    await expect(page.getByTestId('status-bar')).toContainText('CRLF')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.press('Enter')
    await runPaletteCommand(page, 'Insert Code Block')
    await page.keyboard.type('npm test')
    await page.keyboard.press(`${mod}+Home`)
    await runPaletteCommand(page, 'Heading 1')
    await runPaletteCommand(page, 'Insert Table of Contents')
    await page.keyboard.press(`${mod}+S`)
    await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)
    const bytes = readFileSync(crlf, 'utf8')
    expect(bytes).toContain('```\r\nnpm test\r\n```')
    expect(bytes).toContain('<!-- markdown-studio:toc:start -->\r\n')
    expect(bytes.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/) // no bare LF or CR anywhere

    await openFromTree(page, 'bom.md')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+Home`)
    await page.keyboard.press('Shift+End')
    await page.keyboard.press(`${mod}+Shift+B`)
    await page.keyboard.press(`${mod}+S`)
    await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)
    const raw = readFileSync(bom)
    expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(raw.subarray(3).toString('utf8')).toBe('**plain words**\n')
  } finally {
    await closeApp(app)
  }
})

test('the context menu offers table commands only inside tables', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await newDocumentWith(page, 'Intro text\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    await page.keyboard.press(`${mod}+Home`)
    await page
      .locator('.monaco-editor .view-lines')
      .click({ button: 'right', position: { x: 20, y: 8 } })
    const menu = page.locator('.monaco-menu')
    await expect(menu.getByText('Bold', { exact: true })).toBeVisible()
    await expect(menu.getByText('Format Table', { exact: true })).toBeHidden()
    await page.keyboard.press('Escape')

    await page.keyboard.press(`${mod}+End`)
    await page
      .locator('.monaco-editor .view-line')
      .nth(4)
      .click({ button: 'right', position: { x: 10, y: 5 } })
    await expect(menu.getByText('Format Table', { exact: true })).toBeVisible()
    await expect(menu.getByText('Edit Table Visually…', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
  }
})

test('Markdown settings change the editor immediately and persist', async () => {
  const sandbox = createSandbox()
  let { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.getByTestId('activity-settings').click()
    const panel = page.getByTestId('settings-panel')

    // Smart lists off: Enter no longer continues a list.
    await panel.getByLabel('Smart lists and quotes').uncheck()
    await newDocumentWith(page, '- one')
    await page.keyboard.press('Enter')
    await page.keyboard.type('plain')
    await expect.poll(() => editorText(page)).toBe('- one\nplain')

    // Link checking off: a broken link raises no warning.
    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.insertText('[x](missing.md)')
    await expect(page.getByTestId('problem-warnings')).toHaveText('1')
    await panel.getByLabel('Check links and images').uncheck()
    await expect(page.getByTestId('problem-warnings')).toHaveText('0')

    // A single style rule can be switched off.
    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.insertText('# T\n\n\ntext\n')
    await expect(page.getByTestId('problem-notes')).not.toHaveText('0 notes')
    await panel.getByText(/Style rules/).click()
    await panel.getByLabel(/MD012/).uncheck()
    await panel.getByLabel(/MD047/).uncheck()
    await expect(page.getByTestId('problem-notes')).toHaveText('0 notes')

    await panel.getByLabel('Author name').fill('Ana Silva')
    await panel.getByLabel('Author name').press('Enter')
    await panel.getByLabel('Include the document title').check()
    await panel.getByLabel('Formatting toolbar').uncheck()
    await expect(page.getByTestId('format-toolbar')).toBeHidden()
    await page.keyboard.press(`${mod}+B`) // flushes nothing; settings are saved shortly after changes
    await page.keyboard.press(`${mod}+B`)
  } finally {
    await closeApp(app)
  }

  const saved = JSON.parse(readFileSync(path.join(sandbox.userData, 'settings.json'), 'utf8'))
  expect(saved.markdown).toMatchObject({
    smartLists: false,
    toolbar: false,
    diagnostics: { links: false, disabledRules: expect.arrayContaining(['MD012', 'MD047']) },
    toc: { includeTopLevel: true }
  })
  expect(saved.templates.author).toBe('Ana Silva')

  // Relaunch without seeding settings: the saved file (which also remembers the folder) is used.
  ;({ app, page } = await launch(sandbox))
  try {
    // The Settings view was left open, so the layout restores it.
    await expect(page.getByTestId('settings-panel')).toBeVisible()
    await expect(page.getByLabel('Smart lists and quotes')).not.toBeChecked()
    await expect(page.getByLabel('Author name')).toHaveValue('Ana Silva')
    // The saved preference for the title is used when generating a table of contents.
    await newDocumentWith(page, '# Title\n\n## Part\n')
    await runPaletteCommand(page, 'Insert Table of Contents')
    const text = await saveAndRead(app, page, path.join(sandbox.workspace, 'toc-title.md'))
    expect(text).toContain('- [Title](#title)')
    expect(text).toContain('  - [Part](#part)')
  } finally {
    await closeApp(app)
  }
})
