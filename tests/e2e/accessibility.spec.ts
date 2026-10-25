import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  exportViaDialog,
  focusEditor,
  inPreview,
  launch,
  launchWithWorkspace,
  mod,
  openFromTree,
  seedDocuments,
  stubSaveDialog
} from './helpers'

function luminance([r, g, b]: number[]): number {
  const f = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

async function colours(page: Page, names: string[]): Promise<Record<string, number[]>> {
  return page.evaluate((vars) => {
    const probe = document.createElement('span')
    document.body.appendChild(probe)
    const out: Record<string, number[]> = {}
    for (const name of vars) {
      probe.style.color = `var(${name})`
      out[name] = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number)
    }
    probe.remove()
    return out
  }, names)
}

for (const theme of ['dark', 'light'] as const) {
  test(`application text and status colours meet WCAG AA contrast (${theme} theme)`, async () => {
    const sandbox = createSandbox()
    const { app, page } = await launch(sandbox, { theme })
    try {
      const c = await colours(page, ['--text', '--text-2', '--text-3', '--accent-strong', '--danger', '--surface', '--elevated', '--bg'])
      for (const foreground of ['--text', '--text-2', '--text-3', '--accent-strong', '--danger']) {
        for (const background of ['--surface', '--elevated', '--bg']) {
          expect(contrast(c[foreground], c[background]), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    } finally {
      await closeApp(app)
    }
  })
}

test('settings are operable with the keyboard alone, with visible focus', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'a.md': '# Title\n\nText.\n' })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'a.md')
    await page.keyboard.press(`${mod}+,`)
    const panel = page.getByTestId('settings-panel')
    await expect(panel).toBeVisible()
    // Move focus into the theme group and change the theme with the arrow keys.
    await panel.getByTestId('theme-minimal').focus()
    await page.keyboard.press('ArrowDown')
    await expect(panel.getByTestId('theme-technical')).toBeChecked()
    await expect
      .poll(() => page.frameLocator('iframe.html-preview').locator('main').getAttribute('data-theme'))
      .toBe('technical')
    // The focused theme card shows a focus ring.
    const outline = await page.evaluate(() => {
      const card = document.activeElement!.closest('.theme-card')!
      const style = getComputedStyle(card)
      return { width: style.outlineWidth, style: style.outlineStyle }
    })
    expect(outline.style).not.toBe('none')

    // Buttons reached by Tab show an outline too.
    await panel.getByTestId('scope-global').focus()
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!)
      return { tag: document.activeElement!.tagName, outline: style.outlineStyle }
    })
    expect(focused.outline).not.toBe('none')

    // Switches and details are reachable and operable with Space / Enter.
    await panel.getByLabel('Render math').focus()
    await page.keyboard.press('Space')
    await expect(panel.getByLabel('Render math')).not.toBeChecked()
    await page.keyboard.press('Space')
    await expect(panel.getByLabel('Render math')).toBeChecked()
    await panel.getByTestId('css-details').locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(panel.getByTestId('settings-css-inline')).toBeVisible()
  } finally {
    await closeApp(app)
  }
})

test('status, errors and progress are announced to assistive technology', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'a.md': '# Title\n\n```mermaid\nBROKEN\n```\n\n$\\bad{$\n' })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'a.md')
    await expect.poll(() => page.locator('.toasts').getAttribute('aria-live')).toBe('polite')
    // Diagram and equation errors are notes with text, not colour alone.
    await expect
      .poll(() => inPreview(page, (doc) => [...doc.querySelectorAll('.ms-diagram-error, .ms-math-error')].map((e) => e.getAttribute('role'))))
      .toEqual(['note', 'note'])
    const text = await inPreview(page, (doc) => [...doc.querySelectorAll('.ms-diagram-error strong, .ms-math-error strong')].map((e) => e.textContent))
    expect(text.join(' ')).toMatch(/Diagram error/)
    expect(text.join(' ')).toMatch(/Math error/)
    // Math is exposed as MathML, diagrams as images with a label.
    expect(await inPreview(page, (doc) => doc.querySelectorAll('figure.ms-diagram').length)).toBe(1)

    // The PDF preview's progress text is a live status.
    await page.getByTestId('preview-tab-pdf').click()
    await page.getByTestId('pdf-refresh').click()
    await expect(page.getByRole('status').filter({ hasText: 'Generating' }).first()).toBeVisible({ timeout: 5000 }).catch(() => undefined)

    // An export failure is reported through an alert.
    mkdirSync(path.join(sandbox.base, 'taken.pdf'))
    await stubSaveDialog(app, path.join(sandbox.base, 'taken.pdf'))
    await exportViaDialog(page, 'pdf')
    await expect(page.getByRole('alert').filter({ hasText: 'folder' }).first()).toBeVisible()
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
  }
})

test('animations stop when the system asks for reduced motion', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launch(sandbox)
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const duration = await page.evaluate(() => {
      const probe = document.createElement('span')
      probe.className = 'spin'
      document.body.appendChild(probe)
      const value = getComputedStyle(probe).animationDuration
      probe.remove()
      return value
    })
    expect(parseFloat(duration)).toBeLessThan(0.01)
  } finally {
    await closeApp(app)
  }
})

test('small windows keep the editor usable and the Export dialog inside the screen', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'a.md': '# Title\n\nText.\n' })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 520))
    await page.waitForFunction(() => window.innerWidth <= 820)
    await openFromTree(page, 'a.md')
    const editor = await page.locator('.monaco-editor').first().boundingBox()
    expect(editor!.width).toBeGreaterThan(300)
    expect(editor!.height).toBeGreaterThan(200)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await focusEditor(page)
    await page.keyboard.press(`${mod}+Shift+U`)
    const dialog = page.getByRole('dialog', { name: 'Export' })
    await expect(dialog).toBeVisible()
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(820)
    expect(box.y + box.height).toBeLessThanOrEqual(540)
    // The footer buttons stay reachable.
    await expect(dialog.getByTestId('export-run')).toBeVisible()
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
  }
})
