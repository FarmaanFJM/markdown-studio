import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  focusEditor,
  inPreview,
  launchWithWorkspace,
  mod,
  openFromTree
} from './helpers'

test('the HTML preview follows edits and renders GitHub Flavored Markdown', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'README.md')
    await expect
      .poll(() => inPreview(page, (doc) => doc.querySelector('h1')?.textContent))
      .toBe('Project Atlas')

    const structure = () =>
      inPreview(page, (doc) => ({
        tableRows: doc.querySelectorAll('table tbody tr').length,
        tasks: [...doc.querySelectorAll<HTMLInputElement>('.task-list-item-checkbox')].map(
          (c) => c.checked
        ),
        highlighted: doc.querySelectorAll('pre code .hljs-keyword').length > 0,
        strike: doc.querySelector('s')?.textContent,
        blockquote: doc.querySelector('blockquote')?.textContent?.trim(),
        image: (() => {
          const img = doc.querySelector('img')
          return img ? img.complete && img.naturalWidth > 0 : false
        })()
      }))
    await expect.poll(structure).toEqual({
      tableRows: 3,
      tasks: [true, false, false],
      highlighted: true,
      strike: 'Legacy exporter',
      blockquote: 'Note: All services read configuration from config/atlas.yaml.',
      image: true
    })

    await focusEditor(page)
    await page.keyboard.press(`${mod}+Home`)
    await page.keyboard.type('## Live heading\n\n')
    await expect
      .poll(() => inPreview(page, (doc) => doc.querySelector('h2')?.textContent))
      .toBe('Live heading')
  } finally {
    await closeApp(app)
  }
})

test('inline HTML keeps its styling', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'README.md')
    await expect
      .poll(() =>
        inPreview(page, (doc) => {
          const div = doc.getElementById('inline-html')
          if (!div) return null
          const style = doc.defaultView!.getComputedStyle(div)
          return { text: div.textContent?.trim(), color: style.color, size: style.fontSize }
        })
      )
      .toEqual({ text: 'This is HTML inside Markdown.', color: 'rgb(255, 0, 0)', size: '24px' })
  } finally {
    await closeApp(app)
  }
})

test('untrusted HTML cannot run code or reach the application', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'unsafe.md')
    await expect
      .poll(() =>
        inPreview(page, (doc) => doc.body.textContent?.includes('Styled paragraph survives.'))
      )
      .toBe(true)
    // Give a missing image's onerror (if it had survived) time to fire.
    await page.waitForTimeout(500)

    const result = await inPreview(page, (doc) => ({
      scripts: doc.querySelectorAll('script').length,
      frames: doc.querySelectorAll('iframe, object, embed, form').length,
      handlers: [...doc.querySelectorAll('*')].filter((el) =>
        [...el.attributes].some((a) => a.name.startsWith('on'))
      ).length,
      javascriptLinks: [...doc.querySelectorAll('a')].filter((a) =>
        /javascript:/i.test(a.getAttribute('href') ?? '')
      ).length,
      title: doc.title,
      styled: doc.defaultView!.getComputedStyle(doc.querySelector('p[style]')!).color
    }))
    expect(result).toEqual({
      scripts: 0,
      frames: 0,
      handlers: 0,
      javascriptLinks: 0,
      title: 'Preview',
      styled: 'rgb(0, 128, 0)'
    })

    const app$ = await page.evaluate(() => ({
      pwned: (window as unknown as { __pwned?: string }).__pwned ?? null,
      sandbox: document.querySelector('iframe.html-preview')?.getAttribute('sandbox')
    }))
    expect(app$).toEqual({ pwned: null, sandbox: 'allow-same-origin' })
    await expect(page).toHaveTitle('unsafe.md — Atlas Project — Markdown Studio')

    // Clicking the neutralised link does nothing harmful and the preview stays put.
    const frame = page.frameLocator('iframe.html-preview')
    await frame.getByText('click me').click()
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned ?? null)
    ).toBeNull()
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  } finally {
    await closeApp(app)
  }
})

test('preview links open documents, scroll to headings and open web pages externally', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await app.evaluate(({ shell }) => {
      const opened: string[] = []
      ;(globalThis as unknown as { opened: string[] }).opened = opened
      shell.openExternal = async (url: string) => void opened.push(url)
    })
    await openFromTree(page, 'README.md')
    const frame = page.frameLocator('iframe.html-preview')

    await frame.getByRole('link', { name: 'https://commonmark.org' }).click()
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened))
      .toEqual(['https://commonmark.org/'])

    await frame.getByRole('link', { name: 'roadmap' }).click()
    await expect
      .poll(() => inPreview(page, (doc) => doc.scrollingElement!.scrollTop))
      .toBeGreaterThan(100)

    await frame.getByRole('link', { name: 'user guide' }).click()
    await expect(page.locator('.tab.active .tab-label')).toHaveText('guide.md')
    await expect
      .poll(() => inPreview(page, (doc) => doc.querySelector('h1')?.textContent))
      .toBe('User Guide')
  } finally {
    await closeApp(app)
  }
})

test('the preview panel can be hidden, restored and resized', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'README.md')
    const panel = page.getByTestId('preview-panel')
    const editor = page.getByTestId('editor-column')
    await expect(panel).toBeVisible()
    const before = (await panel.boundingBox())!.width

    await page.getByTestId('preview-close').click()
    await expect(panel).toBeHidden()
    const full = (await editor.boundingBox())!.width
    expect(full).toBeGreaterThan(before * 1.7)

    await page.getByTestId('layout-html').click()
    await expect(panel).toBeVisible()
    expect(Math.abs((await panel.boundingBox())!.width - before)).toBeLessThan(4)

    // Drag the splitter 150px to the left: the preview grows by the same amount.
    const splitter = page.getByTestId('preview-splitter')
    const box = (await splitter.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 75, box.y + 200, { steps: 4 })
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + 200, { steps: 4 })
    await page.mouse.up()
    expect(Math.abs((await panel.boundingBox())!.width - (before + 150))).toBeLessThan(6)

    // The sidebar splitter works the same way.
    const sidebar = page.getByTestId('sidebar')
    const sidebarWidth = (await sidebar.boundingBox())!.width
    const sideSplit = (await page.getByTestId('sidebar-splitter').boundingBox())!
    await page.mouse.move(sideSplit.x + 2, sideSplit.y + 300)
    await page.mouse.down()
    await page.mouse.move(sideSplit.x + 82, sideSplit.y + 300, { steps: 5 })
    await page.mouse.up()
    expect(Math.abs((await sidebar.boundingBox())!.width - (sidebarWidth + 80))).toBeLessThan(6)
  } finally {
    await closeApp(app)
  }
})
