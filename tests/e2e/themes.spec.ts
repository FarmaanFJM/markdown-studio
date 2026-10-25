import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  focusEditor,
  inPreview,
  launch,
  launchWithWorkspace,
  MIXED_DOCUMENT,
  mod,
  openFromTree,
  runPaletteCommand,
  seedDocuments,
  stubOpenDialog,
  waitForDiagrams
} from './helpers'

async function openSettings(page: Page) {
  await page.keyboard.press(`${mod}+,`)
  const panel = page.getByTestId('settings-panel')
  await expect(panel).toBeVisible()
  return panel
}

/** Computed style inside the preview frame (the window of the frame, not of the application). */
function css(doc: Document, element: Element): CSSStyleDeclaration {
  return doc.defaultView!.getComputedStyle(element)
}

const themeFacts = (page: Page) =>
  inPreview(page, (doc) => {
    const main = doc.querySelector('main')!
    const h1 = doc.querySelector('h1')
    if (!h1) return null
    const h2 = doc.querySelector('h2')
    const table = doc.querySelector('table')
    const quote = doc.querySelector('blockquote')
    const pre = doc.querySelector('pre')
    return {
      theme: main.getAttribute('data-theme'),
      bodyFont: css(doc, doc.body).fontFamily,
      bodySize: css(doc, doc.body).fontSize,
      lineHeight: css(doc, doc.body).lineHeight,
      h1Size: css(doc, h1).fontSize,
      h1Align: css(doc, h1).textAlign,
      h1Border: css(doc, h1).borderBottomWidth,
      h2Color: h2 ? css(doc, h2).color : '',
      mainWidth: css(doc, main).maxWidth,
      tableBorder: table ? css(doc, table.querySelector('td')!).borderTopWidth + css(doc, table.querySelector('td')!).borderBottomWidth : '',
      quoteStyle: quote ? css(doc, quote).borderLeftWidth + css(doc, quote).fontStyle : '',
      preBackground: pre ? css(doc, pre).backgroundColor : '',
      background: css(doc, doc.body).backgroundColor
    }
  })

const SAMPLE = `# Theme sample

Intro paragraph with **bold** text and a [link](https://example.com).

## Second level

> A quoted remark.

| Name | Value |
| ---- | ----- |
| a    | 1     |
| b    | 2     |

\`\`\`ts
const answer = 42
\`\`\`

### Third level

- one
- two
`

test('the four document themes look genuinely different and apply without disturbing the editor', async () => {
  const sandbox = createSandbox()
  // Long enough for the preview to scroll.
  const filler = Array.from({ length: 40 }, (_, i) => `Filler paragraph ${i + 1} of the theme sample.`).join('\n\n')
  seedDocuments(sandbox, { 'sample.md': `${SAMPLE}\n${filler}\n` })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'sample.md')
    await expect.poll(() => themeFacts(page).then((f) => f?.theme)).toBe('minimal')

    // Unsaved text, a selection, and a scrolled preview must all survive theme changes.
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.type('\n\nUnsaved paragraph.')
    await page.keyboard.press('Shift+Home')
    await expect(page.getByTestId('cursor-position')).toContainText('selected')
    await inPreview(page, (doc) => {
      doc.documentElement.scrollTop = 40
      return true
    })

    const seen: Record<string, NonNullable<Awaited<ReturnType<typeof themeFacts>>>> = {}
    for (const [id, title] of [
      ['minimal', 'Minimal'],
      ['technical', 'Technical'],
      ['editorial', 'Editorial'],
      ['report', 'Professional Report']
    ] as const) {
      await runPaletteCommand(page, `Document Theme: ${title}`)
      await expect.poll(() => themeFacts(page).then((f) => f?.theme)).toBe(id)
      seen[id] = (await themeFacts(page))!
      // Focus, selection, text and scroll are untouched.
      await expect(page.locator('.monaco-editor.focused')).toHaveCount(1)
      await expect(page.getByTestId('cursor-position')).toContainText('selected')
      await expect(page.getByTestId('save-state')).toHaveText(/Unsaved/)
    }
    expect(await inPreview(page, (doc) => doc.documentElement.scrollTop)).toBeGreaterThan(0)
    expect(await inPreview(page, (doc) => doc.body.textContent ?? '')).toContain('Unsaved paragraph.')

    const all = Object.values(seen)
    const distinct = (pick: (f: (typeof all)[number]) => unknown) => new Set(all.map(pick)).size
    expect(distinct((f) => f.bodyFont)).toBeGreaterThanOrEqual(3)
    expect(distinct((f) => f.bodySize)).toBeGreaterThanOrEqual(3)
    expect(distinct((f) => f.h1Size)).toBe(4)
    expect(distinct((f) => f.mainWidth)).toBeGreaterThanOrEqual(3)
    expect(distinct((f) => f.tableBorder)).toBeGreaterThanOrEqual(3)
    expect(distinct((f) => f.quoteStyle)).toBeGreaterThanOrEqual(3)
    expect(distinct((f) => f.preBackground)).toBeGreaterThanOrEqual(2)
    expect(seen.editorial.h1Align).toBe('center')
    expect(seen.technical.h1Border).not.toBe('0px')
    expect(seen.report.h2Color).not.toBe(seen.minimal.h2Color)
  } finally {
    await closeApp(app)
  }
})

test('the chosen document theme and its customisation persist across restarts', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'sample.md': SAMPLE })
  let { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'sample.md')
    const panel = await openSettings(page)
    await panel.getByTestId('theme-card-editorial').click()
    await expect.poll(() => themeFacts(page).then((f) => f?.theme)).toBe('editorial')

    await panel.getByTestId('appearance-details').locator('summary').click()
    await panel.getByLabel('Accent', { exact: true }).fill('#aa3366')
    await panel.getByLabel('Accent', { exact: true }).press('Enter')
    await panel.getByLabel('Body font size').fill('20')
    await panel.getByLabel('Body font size').press('Enter')
    await expect.poll(() => themeFacts(page).then((f) => f?.bodySize)).toBe('20px')
    await closeApp(app)
    ;({ app, page } = await launch(sandbox))
    // The Settings view is restored too; go back to the Explorer.
    await page.getByTestId('activity-explorer').click()
    await openFromTree(page, 'sample.md')
    await expect.poll(() => themeFacts(page).then((f) => f?.theme)).toBe('editorial')
    expect((await themeFacts(page))?.bodySize).toBe('20px')
    const settings = JSON.parse(readFileSync(path.join(sandbox.userData, 'settings.json'), 'utf8'))
    expect(settings.document.theme).toBe('editorial')
    expect(settings.document.customization).toMatchObject({ accentColor: '#aa3366', bodyFontSize: 20 })
    // Nothing about the theme leaks into the Markdown file.
    expect(readFileSync(path.join(sandbox.workspace, 'sample.md'), 'utf8')).toBe(SAMPLE)

    const reopened = await openSettings(page)
    await expect(reopened.getByTestId('theme-editorial')).toBeChecked()
    await reopened.getByTestId('appearance-details').locator('summary').click()
    await reopened.getByTestId('settings-reset-appearance').click()
    await expect.poll(() => themeFacts(page).then((f) => f?.bodySize)).toBe('18px')
  } finally {
    await closeApp(app)
  }
})

test('workspace appearance overrides are shown, persisted, and independent of the global default', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'sample.md': SAMPLE })
  let { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'sample.md')
    const panel = await openSettings(page)
    await expect(panel.getByTestId('workspace-override-banner')).toHaveCount(0)
    await expect(page.getByTestId('workspace-override-badge')).toHaveCount(0)

    await panel.getByTestId('scope-workspace').click()
    await expect(panel.getByTestId('scope-hint')).toContainText('Atlas Project')
    await panel.getByTestId('theme-card-technical').click()
    await expect.poll(() => themeFacts(page).then((f) => f?.theme)).toBe('technical')
    await expect(panel.getByTestId('workspace-override-banner')).toContainText('theme Technical')
    await expect(page.getByTestId('workspace-override-badge')).toBeVisible()

    const file = path.join(sandbox.workspace, '.markdown-studio', 'presentation.json')
    await expect.poll(() => existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 1, theme: 'technical' })

    // The application default can change without affecting this workspace.
    await panel.getByTestId('scope-global').click()
    await panel.getByTestId('theme-card-editorial').click()
    await expect(panel.getByTestId('effective-summary')).toContainText('Technical (from workspace)')
    expect((await themeFacts(page))?.theme).toBe('technical')

    // The override survives a restart; the Markdown is untouched.
    await closeApp(app)
    ;({ app, page } = await launch(sandbox))
    // The Settings view is restored too; go back to the Explorer.
    await page.getByTestId('activity-explorer').click()
    await openFromTree(page, 'sample.md')
    await expect.poll(() => themeFacts(page).then((f) => f?.theme)).toBe('technical')
    expect(readFileSync(path.join(sandbox.workspace, 'sample.md'), 'utf8')).toBe(SAMPLE)

    // Clearing it returns to the application default.
    const again = await openSettings(page)
    await again.getByTestId('clear-workspace-override').click()
    await expect.poll(() => themeFacts(page).then((f) => f?.theme)).toBe('editorial')
    await expect.poll(() => existsSync(file)).toBe(false)
    await expect(page.getByTestId('workspace-override-badge')).toHaveCount(0)
  } finally {
    await closeApp(app)
  }
})

test('custom CSS styles documents only, and unsafe CSS is rejected with explanations and no requests', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'sample.md': SAMPLE })
  const requests: string[] = []
  const server: Server = createServer((request, response) => {
    requests.push(request.url ?? '')
    response.writeHead(200, { 'content-type': 'text/css' }).end('h1{color:red}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'sample.md')
    const panel = await openSettings(page)
    await panel.getByTestId('css-details').locator('summary').click()
    await panel.getByTestId('settings-css-inline').click()
    const editor = panel.getByTestId('settings-css-text')

    const uiColorBefore = await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar-title')!).color)

    // Valid CSS applies to the document, including `*` rules, but never to the application.
    await editor.fill('* { text-decoration-color: rgb(9, 9, 9); }\nh1 { color: rgb(1, 2, 3); letter-spacing: 3px }\nbody { background: rgb(250, 240, 230) }')
    await expect(panel.getByTestId('css-status')).toContainText('valid and applied')
    await expect
      .poll(() => inPreview(page, (doc) => css(doc, doc.querySelector('h1')!).color))
      .toBe('rgb(1, 2, 3)')
    expect(await inPreview(page, (doc) => css(doc, doc.body).backgroundColor)).toBe('rgb(250, 240, 230)')
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar-title')!).color)).toBe(uiColorBefore)
    expect(await page.evaluate(() => getComputedStyle(document.body).letterSpacing)).not.toBe('3px')

    // Unsafe CSS is rejected visibly and is not applied (the previous valid CSS is gone too,
    // because the stylesheet as a whole is now invalid).
    for (const unsafe of [
      `@import url("${base}/remote.css");\nh1 { color: red }`,
      `body { background: url(${base}/pixel.png) }`,
      `h1 { background: image-set("${base}/a.png" 1x) }`,
      'h1 { background: url(file:///etc/passwd) }',
      'h1 { width: expression(alert(1)) }'
    ]) {
      await editor.fill(unsafe)
      await expect(panel.getByTestId('css-status')).toContainText('rejected')
      await expect(panel.getByTestId('css-problems')).toBeVisible()
      await expect
        .poll(() => inPreview(page, (doc) => css(doc, doc.querySelector('h1')!).color))
        .not.toBe('rgb(255, 0, 0)')
      expect(await inPreview(page, (doc) => doc.getElementById('ms-custom-css')!.textContent!.trim())).toBe('')
    }
    expect(requests).toEqual([])

    // The rejected text is kept in the editor so nothing the author typed is lost.
    await expect(editor).toHaveValue(/file:\/\/\/etc\/passwd|expression/)
  } finally {
    await closeApp(app)
    server.close()
  }
})

test('a CSS file is read, reloaded when it changes on disk, and never modified', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'sample.md': SAMPLE, 'styles/doc.css': 'h1 { color: rgb(10, 20, 30) }\n' })
  const cssFile = path.join(sandbox.workspace, 'styles', 'doc.css')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'sample.md')
    const panel = await openSettings(page)
    await panel.getByTestId('css-details').locator('summary').click()
    await panel.getByTestId('settings-css-file').click()
    await stubOpenDialog(app, [cssFile])
    await panel.getByTestId('settings-css-choose').click()
    await expect(panel.getByTestId('settings-css-path')).toHaveText(cssFile)
    await expect
      .poll(() => inPreview(page, (doc) => css(doc, doc.querySelector('h1')!).color))
      .toBe('rgb(10, 20, 30)')

    // Changed in another program: picked up when the window is focused again.
    writeFileSync(cssFile, 'h1 { color: rgb(40, 50, 60) }\n')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect
      .poll(() => inPreview(page, (doc) => css(doc, doc.querySelector('h1')!).color))
      .toBe('rgb(40, 50, 60)')
    await expect(page.getByTestId('toast-info')).toContainText('changed on disk')

    // An unsafe edit is rejected and reported; the file itself is never rewritten by the app.
    const unsafe = 'h1 { background: url(https://evil.example/x.png) }\n'
    writeFileSync(cssFile, unsafe)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(panel.getByTestId('css-status')).toContainText('rejected')
    expect(readFileSync(cssFile, 'utf8')).toBe(unsafe)
    await expect
      .poll(() => inPreview(page, (doc) => css(doc, doc.querySelector('h1')!).color))
      .not.toBe('rgb(40, 50, 60)')
  } finally {
    await closeApp(app)
  }
})

test('diagrams follow the document theme, including dark pages', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'mixed.md': MIXED_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'mixed.md')
    await waitForDiagrams(page, 1)
    const light = await inPreview(page, (doc) => css(doc, doc.querySelector('figure.ms-diagram svg .node rect, figure.ms-diagram svg .node polygon')!).fill)
    const panel = await openSettings(page)
    await panel.getByTestId('appearance-details').locator('summary').click()
    await panel.getByLabel('Page background', { exact: true }).fill('#0d1117')
    await panel.getByLabel('Page background', { exact: true }).press('Enter')
    await expect
      .poll(() => inPreview(page, (doc) => css(doc, doc.body).backgroundColor))
      .toBe('rgb(13, 17, 23)')
    await waitForDiagrams(page, 1)
    await expect
      .poll(() =>
        inPreview(page, (doc) => css(doc, doc.querySelector('figure.ms-diagram svg .node rect, figure.ms-diagram svg .node polygon')!).fill)
      )
      .not.toBe(light)
    // Text on the dark page stays readable.
    const text = await inPreview(page, (doc) => css(doc, doc.querySelector('p')!).color)
    expect(text).not.toBe('rgb(31, 35, 40)')
  } finally {
    await closeApp(app)
  }
})
