import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  editorText,
  focusEditor,
  focusEditorBehindDialog,
  goToLine,
  launchEditing,
  mod,
  newDocumentWith,
  openFromTree,
  runPaletteCommand,
  saveAndRead
} from './helpers'

const SOURCE = [
  '# Tables',
  '',
  '|Name|Age|City|',
  '|---|---|---|',
  '|Alice|24|Amsterdam|',
  '|Bob|30|Rotterdam|',
  '',
  'Between the tables.',
  '',
  '```md',
  '|keep|me|',
  '|-|-|',
  '```',
  '',
  '|x|y|',
  '|:-:|--:|',
  '|1|2|',
  ''
]

const FORMATTED_FIRST = [
  '| Name  | Age | City      |',
  '|-------|-----|-----------|',
  '| Alice | 24  | Amsterdam |',
  '| Bob   | 30  | Rotterdam |'
]

test('formats only the table under the cursor and keeps CRLF line endings', async () => {
  const sandbox = createSandbox()
  const file = path.join(sandbox.workspace, 'tables.md')
  writeFileSync(file, SOURCE.join('\r\n'))
  const { app, page } = await launchEditing(sandbox)
  try {
    await openFromTree(page, 'tables.md')
    await goToLine(page, 5)
    await page.keyboard.press('Alt+Shift+F')
    await expect.poll(() => editorText(page)).toContain('| Alice | 24  | Amsterdam |')
    await page.keyboard.press(`${mod}+S`)
    await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)

    const expected = [...SOURCE.slice(0, 2), ...FORMATTED_FIRST, ...SOURCE.slice(6)].join('\r\n')
    expect(readFileSync(file, 'utf8')).toBe(expected)
    // The second real table and the one inside the code block were not touched.
    expect(readFileSync(file, 'utf8')).toContain('|x|y|\r\n|:-:|--:|')
    expect(readFileSync(file, 'utf8')).not.toMatch(/[^\r]\n/)
  } finally {
    await closeApp(app)
  }
})

test('formats all tables from the palette, skipping code, and undo restores them', async () => {
  const sandbox = createSandbox()
  const file = path.join(sandbox.workspace, 'tables.md')
  writeFileSync(file, SOURCE.join('\n'))
  const { app, page } = await launchEditing(sandbox)
  try {
    await openFromTree(page, 'tables.md')
    await focusEditor(page)
    await runPaletteCommand(page, 'Format All Tables')
    await expect.poll(() => editorText(page)).toContain('| Bob   | 30  | Rotterdam |')
    const formatted = await saveAndRead(app, page, file)
    expect(formatted).toContain('|keep|me|\n|-|-|')
    expect(formatted).toContain(
      '| x   |  y  |\n|:---:|----:|\n| 1   |  2  |'
        .replace('| x   |  y  |', '|  x  |   y |')
        .replace('| 1   |  2  |', '|  1  |   2 |')
    )

    await page.keyboard.press(`${mod}+Z`)
    await expect.poll(() => editorText(page)).toContain('|x|y|')
  } finally {
    await closeApp(app)
  }
})

test('Tab moves between cells, tidies the table and adds a row at the end', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, '|a|b|\n|-|-|\n|1|2|')
    await page.keyboard.press(`${mod}+Home`)
    await page.keyboard.press('Tab') // a -> b; the table is tidied on the way
    await expect.poll(() => editorText(page)).toBe('| a   | b   |\n|-----|-----|\n| 1   | 2   |')
    await page.keyboard.type('B') // typing grows the cell until the next Tab
    await expect.poll(() => editorText(page)).toContain('| a   | bB   |')
    await page.keyboard.press('Tab') // b -> first body cell
    await page.keyboard.type('x')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab') // last cell of the last row: a new row is added
    await page.keyboard.type('new')
    await page.keyboard.press('Shift+Tab') // back up, tidying again
    await expect
      .poll(() => editorText(page))
      .toBe('| a   | bB  |\n|-----|-----|\n| 1x  | 2   |\n| new |     |')
    await page.keyboard.type('!')
    await expect.poll(() => editorText(page)).toContain('| 1x  | 2!   |')
  } finally {
    await closeApp(app)
  }
})

test('inserts and deletes rows and columns and changes alignment', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')
    await goToLine(page, 3)
    await runPaletteCommand(page, 'Table: Insert Row Below')
    await expect
      .poll(() => editorText(page))
      .toBe('| a   | b   |\n|-----|-----|\n| 1   | 2   |\n|     |     |\n| 3   | 4   |')
    await runPaletteCommand(page, 'Table: Delete Row')
    await expect
      .poll(() => editorText(page))
      .toBe('| a   | b   |\n|-----|-----|\n| 1   | 2   |\n| 3   | 4   |')

    await runPaletteCommand(page, 'Table: Align Column Right')
    await expect.poll(() => editorText(page)).toContain('|----:|-----|')
    await runPaletteCommand(page, 'Table: Insert Column Right')
    await expect.poll(() => editorText(page)).toContain('|----:|-----|-----|')
    await runPaletteCommand(page, 'Table: Delete Column')
    await expect
      .poll(() => editorText(page))
      .toBe('|   a | b   |\n|----:|-----|\n|   1 | 2   |\n|   3 | 4   |')

    // The header cannot be deleted as a row.
    await page.keyboard.press(`${mod}+Home`)
    await runPaletteCommand(page, 'Table: Delete Row')
    await expect(page.getByTestId('toast-info')).toContainText('header row cannot be deleted')
  } finally {
    await closeApp(app)
  }
})

test('refuses to format a table that would lose cells', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    const original = '|a|b|\n|-|-|\n|1|2|3|'
    await newDocumentWith(page, original)
    await goToLine(page, 1)
    await page.keyboard.press('Alt+Shift+F')
    await expect(page.getByTestId('toast-error')).toContainText('drop the extra cells')
    await expect.poll(() => editorText(page)).toBe(original)
  } finally {
    await closeApp(app)
  }
})

test.describe('graphical table editor', () => {
  const SOURCE_TABLE = '# T\n\n| Name | Qty |\n|:--|--:|\n| Pen | 2 |\n\nAfter.'

  test('applies edits to the source as one undoable change', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await newDocumentWith(page, SOURCE_TABLE)
      await goToLine(page, 5)
      await runPaletteCommand(page, 'Edit Table Visually')
      const dialog = page.getByRole('dialog', { name: 'Edit Table' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByLabel('Row 1, column 1')).toHaveValue('Pen')

      await dialog.getByLabel('Header, column 1').fill('Item')
      await dialog.getByLabel('Row 1, column 2').fill('3')
      await dialog.getByRole('button', { name: 'Row below' }).click()
      await dialog.getByLabel('Row 2, column 1').fill('Ink | blue')
      await dialog.getByLabel('Row 2, column 2').fill('10')
      await dialog.getByRole('button', { name: 'Center, column 2' }).click()
      await dialog.getByTestId('table-editor-apply').click()
      await expect(dialog).toBeHidden()

      await expect
        .poll(() => editorText(page))
        .toBe(
          '# T\n\n| Item        | Qty |\n|:------------|:---:|\n| Pen         |  3  |\n| Ink \\| blue | 10  |\n\nAfter.'
        )
      await page.keyboard.press(`${mod}+Z`)
      await expect.poll(() => editorText(page)).toBe(SOURCE_TABLE)
    } finally {
      await closeApp(app)
    }
  })

  test('cancel leaves the document untouched', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await newDocumentWith(page, SOURCE_TABLE)
      await goToLine(page, 5)
      await runPaletteCommand(page, 'Edit Table Visually')
      const dialog = page.getByRole('dialog', { name: 'Edit Table' })
      await dialog.getByLabel('Row 1, column 1').fill('CHANGED')
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toBeHidden()
      await expect.poll(() => editorText(page)).toBe(SOURCE_TABLE)

      // Escape cancels too.
      await runPaletteCommand(page, 'Edit Table Visually')
      await dialog.getByLabel('Row 1, column 1').fill('CHANGED')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect.poll(() => editorText(page)).toBe(SOURCE_TABLE)
    } finally {
      await closeApp(app)
    }
  })

  test('does not silently overwrite a table that changed while it was open', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await newDocumentWith(page, SOURCE_TABLE)
      await goToLine(page, 5)
      await runPaletteCommand(page, 'Edit Table Visually')
      const dialog = page.getByRole('dialog', { name: 'Edit Table' })
      await dialog.getByLabel('Row 1, column 1').fill('Stale edit')

      // Something edits the table in the document behind the dialog.
      await focusEditorBehindDialog(page)
      await page.keyboard.press(`${mod}+Home`)
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Home')
      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
      await page.keyboard.type('X')
      await expect(dialog.getByTestId('table-editor-stale')).toBeVisible()
      await expect(dialog.getByTestId('table-editor-apply')).toBeDisabled()

      await dialog.getByRole('button', { name: 'Reload from document' }).click()
      await expect(dialog.getByTestId('table-editor-stale')).toBeHidden()
      await expect(dialog.getByLabel('Row 1, column 1')).toHaveValue('PenX')
      await dialog.getByLabel('Row 1, column 1').fill('Pencil')
      await dialog.getByTestId('table-editor-apply').click()
      await expect.poll(() => editorText(page)).toContain('| Pencil |   2 |')
    } finally {
      await closeApp(app)
    }
  })

  test('inserts a new table designed in the grid', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await newDocumentWith(page, 'Intro')
      await page.keyboard.press(`${mod}+Shift+T`)
      const dialog = page.getByRole('dialog', { name: 'Insert Table' })
      await expect(dialog).toBeVisible()
      await dialog.getByLabel('Header, column 1').fill('Key')
      await dialog.getByLabel('Header, column 2').fill('Value')
      await dialog.getByRole('button', { name: 'Delete column' }).click()
      await dialog.getByLabel('Row 1, column 1').fill('a')
      await dialog.getByTestId('table-editor-apply').click()
      await expect(dialog).toBeHidden()
      const saved = await saveAndRead(app, page, path.join(sandbox.workspace, 'new-table.md'))
      expect(saved).toBe(
        'Intro\n\n| Key | Column 3 |\n|-----|----------|\n| a   |          |\n|     |          |'
      )
    } finally {
      await closeApp(app)
    }
  })
})
