import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  dragFromExplorer,
  dropExternalFiles,
  editorText,
  inPreview,
  launchWithWorkspace,
  lineCoordinates,
  mod,
  openFromTree,
  treeRow
} from './helpers'

// Line numbers below are source lines; word wrap is off so each source line is one visual line.
const NO_WRAP = { editor: { wordWrap: false } }
const README_BLANK_LINE = 7 // The empty line between "## Overview" and the architecture image.

async function previewImages(page: Page) {
  return inPreview(page, (doc) =>
    [...doc.querySelectorAll('img')].map((img) => ({
      alt: img.alt,
      source: img.getAttribute('data-ms-src'),
      loaded: img.complete && img.naturalWidth > 0
    }))
  )
}

function readme(sandbox: { workspace: string }): string {
  return readFileSync(path.join(sandbox.workspace, 'README.md'), 'utf8')
}

test('thumbnail mode shows real image previews and can be toggled', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await expect(treeRow(page, 'README.md')).toBeVisible()
    await page.getByRole('radio', { name: 'Show as thumbnails' }).click()
    await expect(page.locator('.thumb-tile')).toHaveCount(5)
    await page.locator('.thumb-tile', { hasText: 'assets' }).dblclick()
    await expect(page.locator('.breadcrumbs')).toContainText('assets')

    const tiles = page.locator('.thumb-tile')
    await expect(tiles).toHaveCount(5)
    const images = page.locator('.thumb-tile img.thumb-image')
    await expect(images).toHaveCount(5)
    await expect
      .poll(() =>
        images.evaluateAll(
          (imgs: HTMLImageElement[]) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length
        )
      )
      .toBe(5)
    // Every supported format renders: PNG, JPEG, WebP, GIF and SVG.
    const names = await page.locator('.thumb-tile .thumb-name').allTextContents()
    expect(names.sort()).toEqual([
      'anim.gif',
      'architecture.png',
      'diagram.svg',
      'photo.webp',
      'screenshot.jpg'
    ])

    // Aspect ratio is preserved inside the square frame (architecture.png is 16:9).
    const box = await page
      .locator('.thumb-tile', { hasText: 'architecture.png' })
      .locator('img')
      .boundingBox()
    expect(box!.width / box!.height).toBeCloseTo(640 / 360, 1)

    await page.getByRole('button', { name: 'Up one folder' }).click()
    await expect(page.locator('.thumb-tile', { hasText: 'README.md' })).toBeVisible()

    await page.getByRole('radio', { name: 'Show as list' }).click()
    await expect(page.locator('.thumb-tile')).toHaveCount(0)
    await expect(treeRow(page, 'README.md')).toBeVisible()
  } finally {
    await closeApp(app)
  }
})

test('dragging a project image inserts a relative reference at the drop point', async () => {
  const sandbox = createSandbox()
  const original = readme(sandbox)
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await openFromTree(page, 'README.md')
    await treeRow(page, 'assets').click()

    // A real mouse drag from the Explorer row to an empty line in the editor.
    const target = await lineCoordinates(page, README_BLANK_LINE)
    await treeRow(page, 'screenshot.jpg').dragTo(page.locator('.monaco-editor .view-lines'), {
      targetPosition: await page.locator('.monaco-editor .view-lines').evaluate((el, p) => {
        const r = el.getBoundingClientRect()
        return { x: p.x - r.left, y: p.y - r.top }
      }, target)
    })

    await expect(page.locator('.tab.active')).toHaveClass(/dirty/)
    await expect
      .poll(async () => (await editorText(page)).split('\n')[README_BLANK_LINE - 1])
      .toBe('![Screenshot](assets/screenshot.jpg)')

    // The alt text is selected, so typing replaces it.
    await page.keyboard.type('Dashboard')
    await expect
      .poll(async () => (await editorText(page)).split('\n')[README_BLANK_LINE - 1])
      .toBe('![Dashboard](assets/screenshot.jpg)')

    // The image renders in the preview immediately.
    await expect
      .poll(async () =>
        (await previewImages(page)).find((i) => i.source === 'assets/screenshot.jpg')
      )
      .toEqual({ alt: 'Dashboard', source: 'assets/screenshot.jpg', loaded: true })

    // Surrounding content is untouched, and the existing file was not duplicated.
    await page.keyboard.press(`${mod}+S`)
    const expected = original.split('\n')
    expected.splice(README_BLANK_LINE - 1, 0, '![Dashboard](assets/screenshot.jpg)')
    // The drop happened at the start of the empty line, so the line itself now holds the reference.
    expected.splice(README_BLANK_LINE, 1)
    expect(readme(sandbox)).toBe(expected.join('\n'))
    expect(readdirSync(path.join(sandbox.workspace, 'assets'))).toHaveLength(5)

    // One undo removes the whole insertion (the typed alt text is undone first).
    await page.keyboard.press(`${mod}+Z`)
    await page.keyboard.press(`${mod}+Z`)
    await expect
      .poll(async () => (await editorText(page)).split('\n')[README_BLANK_LINE - 1])
      .toBe('')
    await page.keyboard.press(`${mod}+Y`)
    await expect
      .poll(async () => (await editorText(page)).split('\n')[README_BLANK_LINE - 1])
      .toBe('![Screenshot](assets/screenshot.jpg)')
  } finally {
    await closeApp(app)
  }
})

test('references from nested documents use ../ paths, including from thumbnail mode', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox, {
    ...NO_WRAP,
    explorer: { mode: 'thumbnails' }
  })
  try {
    await page.locator('.thumb-tile', { hasText: 'docs' }).dblclick()
    await page.locator('.thumb-tile', { hasText: 'guide.md' }).dblclick()
    await expect(page.locator('.tab.active .tab-label')).toHaveText('guide.md')
    await page.getByRole('button', { name: 'Up one folder' }).click()
    await page.locator('.thumb-tile', { hasText: 'assets' }).dblclick()

    await dragFromExplorer(
      page.locator('.thumb-tile', { hasText: 'photo.webp' }),
      await lineCoordinates(page, 4)
    )
    expect((await editorText(page)).split('\n')[3]).toBe('![Photo](../assets/photo.webp)')
    await expect
      .poll(
        async () =>
          (await previewImages(page)).find((i) => i.source === '../assets/photo.webp')?.loaded
      )
      .toBe(true)
    // The existing nested reference still resolves too.
    expect(
      (await previewImages(page)).find((i) => i.source === '../assets/screenshot.jpg')?.loaded
    ).toBe(true)
  } finally {
    await closeApp(app)
  }
})

test('external images are copied into the asset folder without overwriting', async () => {
  const sandbox = createSandbox()
  const existing = readFileSync(path.join(sandbox.workspace, 'assets', 'architecture.png'))
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await openFromTree(page, 'README.md')

    // A name with spaces and parentheses.
    await dropExternalFiles(
      page,
      [path.join(sandbox.external, 'Team Photo (2024).png')],
      await lineCoordinates(page, README_BLANK_LINE)
    )
    await expect
      .poll(async () => (await editorText(page)).split('\n')[README_BLANK_LINE - 1])
      .toBe('![Team Photo 2024](<assets/Team Photo (2024).png>)')
    expect(
      readFileSync(path.join(sandbox.workspace, 'assets', 'Team Photo (2024).png')).length
    ).toBeGreaterThan(0)
    await expect(page.getByTestId('toast-success')).toContainText('Team Photo (2024).png')

    // A name that collides with a different existing asset.
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    const line = README_BLANK_LINE + 1
    await dropExternalFiles(
      page,
      [path.join(sandbox.external, 'architecture.png')],
      await lineCoordinates(page, line)
    )
    await expect
      .poll(async () => (await editorText(page)).split('\n')[line - 1])
      .toBe('![Architecture](assets/architecture-1.png)')
    expect(
      readFileSync(path.join(sandbox.workspace, 'assets', 'architecture.png')).equals(existing)
    ).toBe(true)

    // Unicode file names.
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await dropExternalFiles(
      page,
      [path.join(sandbox.external, 'naïve-café_überblick.png')],
      await lineCoordinates(page, line + 1)
    )
    await expect
      .poll(async () => (await editorText(page)).split('\n')[line])
      .toBe('![Naïve café überblick](assets/naïve-café_überblick.png)')

    // All three render in the preview from their new location.
    await expect
      .poll(async () =>
        (await previewImages(page))
          .filter((i) => i.loaded)
          .map((i) => decodeURIComponent(i.source ?? ''))
          .sort()
      )
      .toEqual([
        'assets/Team Photo (2024).png',
        'assets/architecture-1.png',
        'assets/architecture.png',
        'assets/naïve-café_überblick.png'
      ])

    // Non-images are refused with an explanation.
    await dropExternalFiles(
      page,
      [path.join(sandbox.external, 'notes.txt')],
      await lineCoordinates(page, 1)
    )
    await expect(page.getByTestId('toast-error')).toContainText('notes.txt')
    await expect(treeRow(page, 'assets')).toBeVisible()
  } finally {
    await closeApp(app)
  }
})

test('an image already inside the workspace is referenced, not copied, when dropped from the OS', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox, NO_WRAP)
  try {
    await openFromTree(page, 'docs', 'guide.md')
    await dropExternalFiles(
      page,
      [path.join(sandbox.workspace, 'assets', 'diagram.svg')],
      await lineCoordinates(page, 2)
    )
    await expect
      .poll(async () => (await editorText(page)).split('\n')[1])
      .toBe('![Diagram](../assets/diagram.svg)')
    expect(readdirSync(path.join(sandbox.workspace, 'assets'))).toHaveLength(5)
  } finally {
    await closeApp(app)
  }
})
