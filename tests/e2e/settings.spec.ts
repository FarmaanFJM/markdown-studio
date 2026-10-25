import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  dropExternalFiles,
  editorText,
  launch,
  lineCoordinates,
  mod,
  openFromTree,
  stubOpenDialog,
  treeRow
} from './helpers'

test('settings, layout and the last workspace persist across restarts', async () => {
  const sandbox = createSandbox()
  let { app, page } = await launch(sandbox)
  let sidebarWidth!: number
  let previewWidth!: number
  try {
    await stubOpenDialog(app, [sandbox.workspace])
    await page.getByRole('button', { name: 'Open Folder' }).first().click()
    await expect(treeRow(page, 'README.md')).toBeVisible()

    await page.keyboard.press(`${mod}+,`)
    const panel = page.getByTestId('settings-panel')
    await expect(panel).toBeVisible()
    await panel.getByLabel('Theme').selectOption('light')
    await panel.getByLabel('Font size').fill('18')
    await panel.getByLabel('Word wrap').uncheck()
    await panel.getByLabel('Presentation').selectOption('thumbnails')
    await panel.getByLabel('Asset folder').fill('media/images')
    await panel.getByLabel('Asset folder').press('Enter')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.getByTestId('activity-explorer').click()
    await expect(page.locator('.thumb-tile').first()).toBeVisible()
    await page.getByTestId('preview-tab-pdf').click()
    await expect(page.getByTestId('preview-panel')).toHaveAttribute('data-kind', 'pdf')

    // Resize the sidebar and the preview.
    const side = (await page.getByTestId('sidebar-splitter').boundingBox())!
    await page.mouse.move(side.x + 2, side.y + 300)
    await page.mouse.down()
    await page.mouse.move(side.x + 62, side.y + 300, { steps: 4 })
    await page.mouse.up()
    const split = (await page.getByTestId('preview-splitter').boundingBox())!
    await page.mouse.move(split.x + 2, split.y + 300)
    await page.mouse.down()
    await page.mouse.move(split.x - 98, split.y + 300, { steps: 4 })
    await page.mouse.up()
    sidebarWidth = (await page.getByTestId('sidebar').boundingBox())!.width
    previewWidth = (await page.getByTestId('preview-panel').boundingBox())!.width
  } finally {
    await closeApp(app)
  }

  const stored = JSON.parse(readFileSync(path.join(sandbox.userData, 'settings.json'), 'utf8'))
  expect(stored).toMatchObject({
    theme: 'light',
    editor: { fontSize: 18, wordWrap: false },
    explorer: { mode: 'thumbnails' },
    assets: { directory: 'media/images' },
    layout: { previewMode: 'pdf' },
    workspace: { lastWorkspace: sandbox.workspace }
  })
  // No document content is stored in settings.
  expect(JSON.stringify(stored)).not.toContain('Project Atlas')

  // Second run: nothing is seeded; everything comes from the saved settings.
  ;({ app, page } = await launch(sandbox))
  try {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('.workspace-name')).toHaveText('Atlas Project')
    await expect(page.locator('.thumb-tile').first()).toBeVisible()
    await expect(page.getByTestId('preview-panel')).toHaveAttribute('data-kind', 'pdf')
    expect(
      Math.abs((await page.getByTestId('sidebar').boundingBox())!.width - sidebarWidth)
    ).toBeLessThan(3)
    expect(
      Math.abs((await page.getByTestId('preview-panel').boundingBox())!.width - previewWidth)
    ).toBeLessThan(4)

    await page.getByTestId('activity-settings').click()
    const panel = page.getByTestId('settings-panel')
    await expect(panel.getByLabel('Font size')).toHaveValue('18')
    await expect(panel.getByLabel('Word wrap')).not.toBeChecked()
    await expect(panel.getByLabel('Asset folder')).toHaveValue('media/images')

    // The configured asset folder receives imported images.
    await page.getByTestId('activity-explorer').click()
    await page.getByRole('radio', { name: 'Show as list' }).click()
    await openFromTree(page, 'docs', 'guide.md')
    await dropExternalFiles(
      page,
      [path.join(sandbox.external, 'Team Photo (2024).png')],
      await lineCoordinates(page, 2)
    )
    await expect
      .poll(async () => (await editorText(page)).split('\n')[1])
      .toBe('![Team Photo 2024](<../media/images/Team Photo (2024).png>)')
    expect(
      existsSync(path.join(sandbox.workspace, 'media', 'images', 'Team Photo (2024).png'))
    ).toBe(true)
  } finally {
    await closeApp(app)
  }
})

test('the File menu drives the same commands as the shortcuts', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launch(sandbox)
  try {
    const labels = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.items.map((item) => ({
        label: item.label,
        items: item.submenu?.items.filter((i) => i.type !== 'separator').map((i) => i.label) ?? []
      }))
    )
    const file = labels.find((m) => m.label.replace('&', '') === 'File')!
    expect(file.items).toEqual(
      expect.arrayContaining([
        'New Markdown File',
        'Open File…',
        'Open Folder…',
        'Save',
        'Save As…',
        'Export as HTML…',
        'Export as PDF…',
        'Close Editor'
      ])
    )

    // Clicking "New Markdown File" in the native menu opens an untitled tab.
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const item = Menu.getApplicationMenu()!.items[0].submenu!.items.find(
        (i) => i.label === 'New Markdown File'
      )!
      item.click(undefined, BrowserWindow.getAllWindows()[0], undefined as never)
    })
    await expect(page.locator('.tab.active .tab-label')).toHaveText('Untitled-1')

    await app.evaluate(({ Menu, BrowserWindow }) => {
      const help = Menu.getApplicationMenu()!.items.find(
        (i) => i.label.replace('&', '') === 'Help'
      )!
      help
        .submenu!.items.find((i) => i.label === 'Keyboard Shortcuts')!
        .click(undefined, BrowserWindow.getAllWindows()[0], undefined as never)
    })
    const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' })
    await expect(dialog).toContainText('Save as')
    await expect(dialog).toContainText(
      process.platform === 'darwin' ? 'Cmd+Shift+S' : 'Ctrl+Shift+S'
    )
  } finally {
    await closeApp(app)
  }
})
