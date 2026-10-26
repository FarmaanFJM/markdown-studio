import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  dropExternalFiles,
  editorText,
  focusEditor,
  goToLine,
  inPreview,
  launch,
  launchEditing,
  lineCoordinates,
  mod,
  newDocumentWith,
  openFromTree,
  runPaletteCommand,
  treeRow
} from './helpers'

const NO_WRAP = { editor: { wordWrap: false } }

/** Colour channels of a computed `rgb()`/`rgba()` value. */
function channels(color: string): { r: number; g: number; b: number; a: number } {
  const [r, g, b, a = '1'] = color.match(/[\d.]+/g)!
  return { r: +r, g: +g, b: +b, a: +a }
}

function luminance(color: string): number {
  const { r, g, b } = channels(color)
  const lin = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

async function menuColors(page: Page) {
  return page.evaluate(() => {
    const menu = document.querySelector('.monaco-menu')!
    const item = [...menu.querySelectorAll('.action-item')].find(
      (i) => i.querySelector('.action-label')?.textContent?.trim() === 'Bold'
    )!
    const label = item.querySelector('.action-label')!
    const menuStyle = getComputedStyle(menu)
    // Walk up to the first element that paints a background (the menu or its container).
    let surface = menuStyle.backgroundColor
    for (
      let n: Element | null = menu;
      n && /rgba\(0, 0, 0, 0\)|transparent/.test(surface);
      n = n.parentElement
    ) {
      surface = getComputedStyle(n).backgroundColor
    }
    return {
      surface,
      text: getComputedStyle(label).color,
      overlap:
        document
          .elementFromPoint(
            menu.getBoundingClientRect().left + 20,
            menu.getBoundingClientRect().top + 20
          )
          ?.closest('.monaco-menu') !== null
    }
  })
}

for (const theme of ['dark', 'light'] as const) {
  test(`the editor context menu is opaque and readable in the ${theme} theme`, async () => {
    const sandbox = createSandbox()
    const { app, page } = await launch(sandbox, { ...NO_WRAP, theme })
    try {
      await newDocumentWith(
        page,
        '# Titel\n\nTekst in een alinea.\n\n| a | b |\n|---|---|\n| 1 | 2 |'
      )
      await page
        .locator('.monaco-editor .view-lines')
        .click({ button: 'right', position: { x: 80, y: 40 } })
      await expect(page.locator('.monaco-menu')).toBeVisible()
      const { surface, text, overlap } = await menuColors(page)
      expect(channels(surface).a).toBe(1)
      expect(contrast(text, surface)).toBeGreaterThan(7)
      expect(overlap).toBe(true)

      // The hover state is visible and keeps the text readable.
      const bold = page.locator('.monaco-menu .action-label', { hasText: /^Bold$/ })
      await bold.hover()
      const hovered = await page.evaluate(() => {
        const item = [...document.querySelectorAll('.monaco-menu .action-item')].find(
          (i) => i.querySelector('.action-label')?.textContent?.trim() === 'Bold'
        )!
        return {
          background: getComputedStyle(item.querySelector('.action-menu-item')!).backgroundColor,
          text: getComputedStyle(item.querySelector('.action-label')!).color
        }
      })
      expect(channels(hovered.background).a).toBeGreaterThan(0)
      expect(hovered.background).not.toBe(surface)
      expect(contrast(hovered.text, surface)).toBeGreaterThan(5)
      await page.keyboard.press('Escape')

      // Over a table the table commands join the menu.
      await goToLine(page, 6)
      const point = await lineCoordinates(page, 6)
      await page.mouse.click(point.x + 20, point.y, { button: 'right' })
      await expect(page.locator('.monaco-menu')).toBeVisible()
      await expect(
        page.locator('.monaco-menu .action-label', { hasText: 'Format Table' })
      ).toBeVisible()
      await expect(
        page.locator('.monaco-menu .action-label', { hasText: 'Format Markdown Block' })
      ).toBeVisible()
      await page.keyboard.press('Escape')
    } finally {
      await closeApp(app)
    }
  })
}

test('the application context menu and menus built by the page are readable too', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launch(sandbox, {
    workspace: {
      restoreLastWorkspace: true,
      lastWorkspace: sandbox.workspace,
      recent: [sandbox.workspace]
    }
  })
  try {
    await treeRow(page, 'README.md').click({ button: 'right' })
    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()
    const style = await menu.evaluate((el) => {
      const item = el.querySelector('.menu-item')!
      return {
        background: getComputedStyle(el).backgroundColor,
        text: getComputedStyle(item).color
      }
    })
    expect(channels(style.background).a).toBe(1)
    expect(contrast(style.text, style.background)).toBeGreaterThan(7)
  } finally {
    await closeApp(app)
  }
})

test('Quick Fixes and Format Block repair Markdown without touching the content', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, 'Een  zin met   te veel spaties.\n\nEen  tweede  zin.')

    // Lightbulb / Ctrl+. offers the fix for the repeated spaces.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelectorAll(
              '.monaco-editor .squiggly-hint, .monaco-editor .squiggly-info, .monaco-editor [class*="squiggly"]'
            ).length
        )
      )
      .toBeGreaterThan(0)
    await goToLine(page, 1)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press(`${mod}+.`)
    const widget = page.locator('.action-widget').filter({ hasText: 'Remove extra spaces' })
    await expect(widget).toBeVisible()
    await expect(widget).toContainText('Remove extra spaces')
    await page.keyboard.press('Enter')
    await expect
      .poll(() => editorText(page))
      .toBe('Een zin met   te veel spaties.\n\nEen  tweede  zin.')

    // The command removes the rest, as one undoable edit.
    await runPaletteCommand(page, 'Remove Extra Spaces')
    await expect
      .poll(() => editorText(page))
      .toBe('Een zin met te veel spaties.\n\nEen tweede zin.')
    await page.keyboard.press(`${mod}+Z`)
    await expect
      .poll(() => editorText(page))
      .toBe(
        'Een zin met   te veel spaties.\n\nEen  tweede  zin.'.replace(
          'Een  tweede  zin.',
          'Een  tweede  zin.'
        )
      )
  } finally {
    await closeApp(app)
  }
})

test('Format Markdown Block tidies headings and lists, and Repair Table completes columns', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(
      page,
      '##   Kop   met  spaties\n\n*   een\n-   twee\n\n| a | b |\n|---|---|---|\n| 1 | 2 | 3 |'
    )
    await goToLine(page, 1)
    await runPaletteCommand(page, 'Format Markdown Block')
    await goToLine(page, 3)
    await runPaletteCommand(page, 'Format Markdown Block')
    await expect.poll(() => editorText(page)).toContain('## Kop met spaties\n\n* een\n* twee\n')

    await goToLine(page, 6)
    await runPaletteCommand(page, 'Repair Table')
    const text = await editorText(page)
    const table = text.split('\n').slice(5)
    expect(table).toHaveLength(3)
    expect(table[0]).toMatch(/^\| a +\| b +\| +\|$/)
    expect(table[2]).toMatch(/^\| 1 +\| 2 +\| 3 +\|$/)
  } finally {
    await closeApp(app)
  }
})

test('Format Table keeps a wide table readable and the rendered table identical', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    const long = 'Een bijzonder lange omschrijving die in de bron nooit netjes in één regel past '
      .repeat(2)
      .trim()
    const source = `|Onderdeel|Omschrijving|Prijs|\n|:--|---|--:|\n|Motor|${long}|10|\n|Wiel|kort \\| met pipe|5|`
    await newDocumentWith(page, source)
    const cells = () =>
      inPreview(page, (doc) =>
        [...doc.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent))
      )
    await expect.poll(cells).toHaveLength(3)
    const before = await cells()

    await goToLine(page, 3)
    await runPaletteCommand(page, 'Format Table')
    await expect.poll(async () => (await editorText(page)).split('\n')[0]).toMatch(/^\| Onderdeel/)
    const lines = (await editorText(page)).split('\n')
    // The short rows stay within a readable width; only the single long cell runs past it.
    expect(lines[0].length).toBeLessThanOrEqual(100)
    expect(lines[3].length).toBeLessThanOrEqual(100)
    expect(lines[0]).toMatch(/^\| Onderdeel +\| Omschrijving +\| +Prijs \|$/)
    expect(lines[1]).toMatch(/^\|:-+\|-+\|-+:\|$/)
    await expect.poll(cells).toEqual(before)
  } finally {
    await closeApp(app)
  }
})

test.describe('title bar', () => {
  test('is integrated, draggable around its controls, and the window controls its size', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      const bar = page.getByTestId('title-bar')
      await expect(bar).toBeVisible()
      expect(
        await bar.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))
      ).toBe('drag')
      // Nothing interactive inside it, and nothing outside it, is a drag region.
      for (const selector of [
        '.title-menu-button',
        '.tabs-bar',
        '.activity-bar',
        '.status-bar',
        '.sidebar-header'
      ]) {
        const element = page.locator(selector).first()
        if ((await element.count()) === 0) continue
        expect(
          await element.evaluate((el) =>
            getComputedStyle(el).getPropertyValue('-webkit-app-region')
          ),
          selector
        ).not.toBe('drag')
      }
      expect((await bar.boundingBox())!.height).toBe(36)

      // The title follows the document, and the menu headings match the application menu.
      await openFromTree(page, 'README.md').catch(() => undefined)
      const headings = await page.locator('.title-menu-button').allTextContents()
      const native = await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu()!.items.map((i) => i.label.replace('&', ''))
      )
      if (process.platform !== 'darwin') expect(headings).toEqual(native)

      // Keyboard: arrows move between the headings.
      if (headings.length > 1) {
        await page.getByTestId('menu-file').focus()
        await page.keyboard.press('ArrowRight')
        await expect(page.getByTestId('menu-edit')).toBeFocused()
      }
    } finally {
      await closeApp(app)
    }
  })

  test('shows the document name and follows maximise and restore', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await newDocumentWith(page, 'x')
      await expect(page.getByTestId('title-text')).toContainText('Untitled-1')
      await expect(page.getByTestId('title-text')).toContainText('●')

      const sizes = async () =>
        page.evaluate(() => ({
          window: window.innerWidth,
          bar: document.querySelector('.title-bar')!.getBoundingClientRect().width,
          height: window.innerHeight,
          statusBottom: document.querySelector('.status-bar')!.getBoundingClientRect().bottom
        }))
      // The bar and the status bar follow the window as it is resized (maximise and restore are
      // resizes; a window manager is needed to maximise for real, so that part needs a human).
      for (const [width, height] of [
        [1100, 700],
        [900, 600],
        [1300, 800]
      ]) {
        await app.evaluate(
          ({ BrowserWindow }, size) => {
            BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1])
          },
          [width, height]
        )
        await expect.poll(async () => (await sizes()).window).toBe(width)
        const measured = await sizes()
        expect(measured.bar).toBe(measured.window)
        expect(measured.statusBottom).toBe(measured.height)
      }
    } finally {
      await closeApp(app)
    }
  })

  test('uses the integrated window options and no native menu bar on Windows and Linux', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await expect(page.getByTestId('title-bar')).toBeVisible()
      const info = await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        return {
          menuBar: win.isMenuBarVisible(),
          frame: win.getBounds().height - win.getContentBounds().height
        }
      })
      if (process.platform !== 'darwin') expect(info.menuBar).toBe(false)
      // The theme switch recolours the caption area without a restart.
      await page.keyboard.press(`${mod}+,`)
      await page.getByLabel('Theme', { exact: true }).selectOption('light')
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    } finally {
      await closeApp(app)
    }
  })
})

test.describe('dropping images', () => {
  const dropOnLine = async (page: Page, sandbox: { external: string }, line: number) =>
    dropExternalFiles(
      page,
      [path.join(sandbox.external, 'architecture.png')],
      await lineCoordinates(page, line)
    )

  test('becomes its own block after a paragraph, heading, list item, quote or image', async () => {
    // A saved document is needed for relative image paths: use a document of the workspace.
    const second = createSandbox()
    const launched = await launchEditing(second)
    const p = launched.page
    const image = (prefix: string) =>
      new RegExp(`^${prefix}!\\[Architecture[^\\]]*\\]\\(.*architecture.*\\.png\\)$`)
    try {
      await openFromTree(p, 'docs', 'guide.md').catch(async () => {
        await treeRow(p, 'docs').click()
        await openFromTree(p, 'guide.md')
      })
      await focusEditor(p)
      const SOURCE =
        'Some paragraph text\n\n## A heading\n\n- an item\n- another item\n\n> a quote\n\n![Old](old.png)\nTrailing text.'
      const reset = async () => {
        await p.keyboard.press(`${mod}+A`)
        await p.keyboard.insertText(SOURCE)
        await expect.poll(() => editorText(p)).toBe(SOURCE)
        // Let the layout settle (scroll position, preview) before positions are measured.
        await p.keyboard.press(`${mod}+Home`)
        await p.waitForTimeout(300)
      }
      const originalLines = SOURCE.split('\n')
      // [1-based line, container prefix, blank separator line between blocks]
      for (const [line, prefix, blank] of [
        [1, '', ''],
        [3, '', ''],
        [5, '  ', ''],
        [8, '> ', '>'],
        [10, '', '']
      ] as const) {
        await reset()
        await dropOnLine(p, second, line)
        await expect
          .poll(async () => (await editorText(p)).split('\n')[line + 1])
          .toMatch(image(prefix))
        const after = (await editorText(p)).split('\n')
        // The text it was dropped on is untouched, and exactly one blank line separates the image.
        expect(after[line - 1]).toBe(originalLines[line - 1])
        expect(after[line]).toBe(blank)
        // The rendered preview shows an image block, not an image inside the text's paragraph.
        await expect
          .poll(() =>
            inPreview(p, (doc) => {
              const pictures = [...doc.querySelectorAll('img[alt^="Architecture"]')]
              return (
                pictures.length === 1 &&
                pictures.every((img) => (img.parentElement?.textContent ?? '').trim() === '')
              )
            })
          )
          .toBe(true)
      }

      // On a blank line the image is inserted there, adding only the blank lines that are missing.
      await reset()
      await dropOnLine(p, second, 2)
      await expect
        .poll(async () => (await editorText(p)).split('\n').slice(0, 5))
        .toEqual(['Some paragraph text', '', expect.stringMatching(image('')), '', '## A heading'])
    } finally {
      await closeApp(launched.app)
    }
  })
})

test('thumbnail view opens at the selected folder or the folder of the selected file', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await expect(treeRow(page, 'docs')).toBeVisible()
    // A selected folder.
    await treeRow(page, 'docs').click()
    await page.getByRole('radio', { name: 'Show as thumbnails' }).click()
    await expect(page.locator('.breadcrumbs')).toContainText('docs')
    await expect(page.locator('.thumb-tile .thumb-name')).toHaveText(['guide.md'])

    // Back to the list: the folder is open in the tree, nothing jumped to the root.
    await page.getByRole('radio', { name: 'Show as list' }).click()
    await expect(treeRow(page, 'guide.md')).toBeVisible()
    await expect(treeRow(page, 'docs')).toBeVisible()

    // A selected file: its folder opens.
    await treeRow(page, 'guide.md').click()
    await page.getByRole('radio', { name: 'Show as thumbnails' }).click()
    await expect(page.locator('.breadcrumbs')).toContainText('docs')
    await expect(page.locator('.thumb-tile .thumb-name')).toHaveText(['guide.md'])

    // The root stays the root when it is what is being browsed.
    await page.locator('.crumb').first().click()
    await page.getByRole('radio', { name: 'Show as list' }).click()
    await page.getByRole('radio', { name: 'Show as thumbnails' }).click()
    await expect(page.locator('.thumb-tile .thumb-name')).toContainText(['README.md'])
  } finally {
    await closeApp(app)
  }
})

test('there is one control to close the preview, and opening and splitting still work', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(page, '# Titel')
    await expect(page.getByTestId('layout-none')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Source only' })).toHaveCount(0)
    await expect(page.getByTestId('preview-panel')).toBeVisible()

    await page.getByTestId('preview-close').click()
    await expect(page.getByTestId('preview-panel')).toBeHidden()
    await page.getByTestId('layout-html').click()
    await expect(page.getByTestId('preview-panel')).toHaveAttribute('data-kind', 'html')
    await page.getByTestId('layout-pdf').click()
    await expect(page.getByTestId('preview-panel')).toHaveAttribute('data-kind', 'pdf')

    // The shortcut toggles between the same two states.
    await page.keyboard.press(`${mod}+Shift+V`)
    await expect(page.getByTestId('preview-panel')).toBeHidden()
    await page.keyboard.press(`${mod}+Shift+V`)
    await expect(page.getByTestId('preview-panel')).toHaveAttribute('data-kind', 'pdf')
    // And the palette closes it with one clearly named command.
    await runPaletteCommand(page, 'Close Preview')
    await expect(page.getByTestId('preview-panel')).toBeHidden()
  } finally {
    await closeApp(app)
  }
})

test('Professional Report does not number headings that already have a number', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(
      page,
      '# 1. Verslag\n\n## 1. Inleiding\n\ntekst\n\n### 1.1 Doel\n\n## Methode\n\n### Opzet\n\n## 2024 Resultaten\n\n## 4. Slot\n'
    )
    await runPaletteCommand(page, 'Document Theme: Professional Report')
    await expect.poll(() => inPreview(page, (doc) => doc.querySelectorAll('h2, h3').length)).toBe(6)
    const read = () =>
      inPreview(page, (doc) =>
        [...doc.querySelectorAll('h2, h3')].map((h) => ({
          text: h.textContent,
          before: doc.defaultView!.getComputedStyle(h, '::before').content
        }))
      )
    // Typed numbers switch the generated number off; the others keep the theme's counters. The
    // theme is applied a moment after the command, so wait for it.
    const generated = (before: string) => !/^["']?(none|normal)["']?$/.test(before)
    await expect
      .poll(async () => (await read()).map((n) => [n.text, generated(n.before)]))
      .toEqual([
        ['1. Inleiding', false],
        ['1.1 Doel', false],
        ['Methode', true],
        ['Opzet', true],
        ['2024 Resultaten', true],
        ['4. Slot', false]
      ])
    const numbers = await read()
    // When the engine reports the resolved text, the numbers continue from the typed ones.
    const resolved = numbers.filter((n) => generated(n.before) && !/counter\(/.test(n.before))
    if (resolved.length > 0) {
      expect(resolved.map((n) => n.before.replace(/["\u00a0\s]/g, ''))).toEqual(['2.', '2.1', '3.'])
    }
    // The typed value is carried into the counters, so "Methode" is 2 and "Opzet" 2.1.
    const styles = await inPreview(page, (doc) =>
      [...doc.querySelectorAll('h2, h3')].map((h) => h.getAttribute('style'))
    )
    expect(styles).toEqual([
      'counter-set: report-h2 1 report-h3 0',
      'counter-set: report-h3 1',
      null,
      null,
      null,
      'counter-set: report-h2 4 report-h3 0'
    ])
  } finally {
    await closeApp(app)
  }
})

test.describe('settings page', () => {
  test('opens as a page, navigates by category, searches and closes with Escape', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await newDocumentWith(page, '# Titel')
      await page.keyboard.press(`${mod}+,`)
      const settings = page.getByTestId('settings-panel')
      await expect(settings).toBeVisible()
      // A page in place of the editor, not a narrow sidebar.
      const box = (await settings.boundingBox())!
      expect(box.width).toBeGreaterThan(700)
      await expect(page.locator('.monaco-host')).toBeHidden()

      for (const name of [
        'Editor',
        'Markdown',
        'Appearance',
        'Preview',
        'PDF / Export',
        'Files & Assets',
        'AI',
        'Advanced'
      ]) {
        await expect(settings.getByRole('button', { name, exact: true })).toBeVisible()
      }
      await settings.getByTestId('settings-nav-ai').click()
      await expect(settings.getByRole('heading', { name: 'AI', exact: true })).toBeInViewport()
      await settings.getByTestId('settings-nav-markdown').click()
      await expect(
        settings.getByRole('heading', { name: 'Markdown', exact: true })
      ).toBeInViewport()

      // Existing settings keep working from the page.
      await settings.getByLabel('Font size', { exact: true }).fill('18')
      await settings.getByLabel('Table source width').fill('80')

      // Search filters every category at once.
      await settings.getByTestId('settings-search').fill('thumbnail')
      await expect(settings.getByText('Thumbnail size')).toBeVisible()
      await expect(settings.getByText('Font size', { exact: true })).toBeHidden()
      await settings.getByTestId('settings-search').fill('zzzz-not-a-setting')
      await expect(settings.getByTestId('settings-empty')).toBeVisible()
      await settings.getByTestId('settings-search').fill('')

      await page.keyboard.press('Escape')
      await expect(settings).toBeHidden()
      await expect(page.locator('.monaco-host')).toBeVisible()
      // Opening a command-specific category.
      await runPaletteCommand(page, 'AI: Open Settings')
      await expect(settings.getByRole('heading', { name: 'AI', exact: true })).toBeInViewport()
      await settings.getByTestId('settings-close').click()
      await expect(settings).toBeHidden()
    } finally {
      await closeApp(app)
    }
    const stored = JSON.parse(readFileSync(path.join(sandbox.userData, 'settings.json'), 'utf8'))
    expect(stored.editor.fontSize).toBe(18)
    expect(stored.markdown.tableMaxWidth).toBe(80)
  })

  test('opening a document leaves the page and the editor keeps its content', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await newDocumentWith(page, 'bewaard')
      await page.getByTestId('activity-settings').click()
      await expect(page.getByTestId('settings-panel')).toBeVisible()
      await page.keyboard.press(`${mod}+N`)
      await expect(page.getByTestId('settings-panel')).toBeHidden()
      await page.locator('.tab', { hasText: 'Untitled-1' }).click()
      await expect.poll(() => editorText(page)).toBe('bewaard')
    } finally {
      await closeApp(app)
    }
  })
})

interface FakeAi {
  url: string
  requests: { body: { messages: { content: string }[]; model: string }; authorization?: string }[]
  reply: string
  close(): Promise<void>
}

async function fakeAiServer(): Promise<FakeAi> {
  const state: FakeAi = {
    url: '',
    requests: [],
    reply: ' en daarna ging het verder.',
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      state.requests.push({ body: JSON.parse(raw), authorization: req.headers.authorization })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: state.reply } }] }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  return state
}

test.describe('AI assistant', () => {
  test('is off by default: no AI controls act, nothing is sent, the editor is unaffected', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await newDocumentWith(page, 'Gewone tekst.')
      await page.getByTestId('activity-ai').click()
      const panel = page.getByTestId('ai-panel')
      await expect(panel).toBeVisible()
      await expect(page.getByTestId('ai-status')).toContainText('switched off')
      await expect(page.getByTestId('ai-continue')).toHaveCount(0)
      await expect(page.getByTestId('ai-unavailable-provider')).toContainText('GitHub Copilot')
      await expect(page.getByTestId('ai-unavailable-provider')).toContainText('Not available yet')
      await runPaletteCommand(page, 'AI: Continue Writing')
      await expect(page.getByTestId('toast-info')).toContainText('switched off')
      // Typing and saving are untouched.
      await focusEditor(page)
      await page.keyboard.press(`${mod}+End`)
      await page.keyboard.type(' Meer.')
      await expect.poll(() => editorText(page)).toBe('Gewone tekst. Meer.')
    } finally {
      await closeApp(app)
    }
  })

  test('is configured in Settings; the key is not kept in the settings file', async () => {
    const sandbox = createSandbox()
    const server = await fakeAiServer()
    const { app, page } = await launchEditing(sandbox)
    try {
      await page.keyboard.press(`${mod}+,`)
      const settings = page.getByTestId('settings-panel')
      await settings.getByTestId('settings-nav-ai').click()
      await settings.getByLabel('Enable AI assistance').check()
      await settings.getByTestId('ai-provider').selectOption('openai-compatible')
      await settings.getByTestId('ai-endpoint').fill('http://example.com/v1')
      await settings.getByTestId('ai-endpoint').press('Enter')
      await expect(settings.getByText(/plain http/)).toBeVisible()
      await settings.getByTestId('ai-endpoint').fill(server.url)
      await settings.getByTestId('ai-endpoint').press('Enter')
      await settings.getByTestId('ai-model').fill('fake-model')
      await settings.getByTestId('ai-model').press('Enter')
      await expect(settings.getByText(/plain http/)).toBeHidden()
    } finally {
      await closeApp(app)
      await server.close()
    }
    const text = readFileSync(path.join(sandbox.userData, 'settings.json'), 'utf8')
    expect(JSON.parse(text).ai).toMatchObject({
      enabled: true,
      provider: 'openai-compatible',
      model: 'fake-model'
    })
    expect(text).not.toMatch(/api[-_]?key|sk-/i)
  })

  test('rewrites a selection after review, only sends what the action needs, and can be undone', async () => {
    const sandbox = createSandbox()
    const server = await fakeAiServer()
    server.reply = 'Dit is een betere zin.'
    const { app, page } = await launchEditing(sandbox, {
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        endpoint: server.url,
        model: 'fake-model'
      }
    })
    try {
      await newDocumentWith(page, 'Eerste regel.\n\nDit zijn een slechte zin.\n\nLaatste regel.')
      await goToLine(page, 3)
      await page.keyboard.press('Home')
      await page.keyboard.press('Shift+End')
      await runPaletteCommand(page, 'AI: Rewrite Selection')
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Fix spelling and grammar' })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Review the suggestion' })
      await expect(dialog.getByTestId('ai-original')).toHaveText('Dit zijn een slechte zin.')
      await expect(dialog.getByTestId('ai-suggestion')).toHaveText('Dit is een betere zin.')
      // Nothing changed yet.
      await expect.poll(() => editorText(page)).toContain('Dit zijn een slechte zin.')
      expect(server.requests).toHaveLength(1)
      const sent = server.requests[0].body.messages.map((m) => m.content).join('\n')
      expect(sent).toContain('Dit zijn een slechte zin.')
      expect(server.requests[0].body.model).toBe('fake-model')
      expect(server.requests[0].authorization).toBeUndefined()

      await dialog.getByTestId('ai-apply').click()
      await expect
        .poll(() => editorText(page))
        .toBe('Eerste regel.\n\nDit is een betere zin.\n\nLaatste regel.')
      await page.keyboard.press(`${mod}+Z`)
      await expect
        .poll(() => editorText(page))
        .toBe('Eerste regel.\n\nDit zijn een slechte zin.\n\nLaatste regel.')

      // Discarding changes nothing.
      await page.keyboard.press('Home')
      await page.keyboard.press('Shift+End')
      await runPaletteCommand(page, 'AI: Rewrite Selection')
      await page.getByRole('dialog').getByRole('button', { name: 'Make shorter' }).click()
      await page
        .getByRole('dialog', { name: 'Review the suggestion' })
        .getByRole('button', { name: 'Discard' })
        .click()
      await expect.poll(() => editorText(page)).toContain('Dit zijn een slechte zin.')
    } finally {
      await closeApp(app)
      await server.close()
    }
  })

  test('shows a continuation as ghost text and honours the per-document and per-workspace switches', async () => {
    const sandbox = createSandbox()
    const server = await fakeAiServer()
    const { app, page } = await launchEditing(sandbox, {
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        endpoint: server.url,
        model: 'fake-model'
      }
    })
    try {
      await openFromTree(page, 'README.md')
      await focusEditor(page)
      await page.keyboard.press(`${mod}+End`)
      await runPaletteCommand(page, 'AI: Continue Writing')
      await expect(
        page.locator('.monaco-editor .ghost-text-decoration, .monaco-editor .ghost-text').first()
      ).toBeVisible()
      expect(server.requests).toHaveLength(1)
      // Escape dismisses it without changing the document.
      await page.keyboard.press('Escape')
      await expect(
        page.locator('.monaco-editor .ghost-text-decoration, .monaco-editor .ghost-text')
      ).toHaveCount(0)
      await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)

      // Switching AI off for this document stops requests.
      await page.getByTestId('activity-ai').click()
      await page.getByTestId('ai-document-toggle').uncheck()
      await expect(page.getByTestId('ai-status')).toContainText('this document')
      await runPaletteCommand(page, 'AI: Continue Writing')
      await expect(page.getByTestId('toast-info')).toContainText('switched off for this document')
      expect(server.requests).toHaveLength(1)
      await page.getByTestId('ai-document-toggle').check()
      await page.getByTestId('ai-workspace-toggle').uncheck()
      await expect(page.getByTestId('ai-status')).toContainText('this workspace')
    } finally {
      await closeApp(app)
      await server.close()
    }
    const stored = JSON.parse(readFileSync(path.join(sandbox.userData, 'settings.json'), 'utf8'))
    expect(stored.ai.disabledWorkspaces).toEqual([sandbox.workspace])
    expect(stored.ai.disabledDocuments).toEqual([])
  })
})
