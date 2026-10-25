import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  exportViaDialog,
  inPreview,
  launchWithWorkspace,
  openFromTree,
  openInViewer,
  seedDocuments,
  stubSaveDialog,
  waitForDiagrams
} from './helpers'

const HOSTILE = `# Hostile document

<script>window.parent.__pwned = 'script'</script>
<img src="x" onerror="window.parent.__pwned = 'img'">
<svg onload="window.parent.__pwned = 'svg'"><script>window.parent.__pwned = 'svg-script'</script></svg>
<iframe src="https://127.0.0.1:9/frame"></iframe>
<form action="https://127.0.0.1:9/post"><input name="a"><button>go</button></form>
<link rel="stylesheet" href="https://127.0.0.1:9/a.css">
<meta http-equiv="refresh" content="0;url=https://127.0.0.1:9/">
<style>@import url("https://127.0.0.1:9/b.css"); body { background: url(https://127.0.0.1:9/c.png) }</style>
<div style="background:url(https://127.0.0.1:9/d.png)">styled</div>
<details open ontoggle="window.parent.__pwned = 'toggle'"><summary>More</summary>x</details>

[click me](javascript:window.parent.__pwned='link')

$\\href{javascript:window.parent.__pwned=1}{x}$ and $<img src=x onerror=window.parent.__pwned=1>$

\`\`\`mermaid
flowchart TD
    A["<img src=x onerror='window.parent.__pwned=1'>"] --> B["<script>window.parent.__pwned=2</script>"]
    click A call alert("pwned")
    click B href "javascript:window.parent.__pwned=3"
\`\`\`

\`\`\`mermaid
%%{init: {"securityLevel": "loose", "flowchart": {"htmlLabels": true}}}%%
flowchart TD
    A[<b onclick="window.parent.__pwned=4">label</b>] --> B
\`\`\`
`

test('hostile Markdown cannot run code, load resources or reach the application', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'hostile.md': HOSTILE })
  const requests: string[] = []
  const server: Server = createServer((request, response) => {
    requests.push(request.url ?? '')
    response.writeHead(200).end('')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  writeFileSync(
    path.join(sandbox.workspace, 'hostile.md'),
    HOSTILE.replace(/127\.0\.0\.1:9/g, `127.0.0.1:${port}`)
  )
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'hostile.md')
    await waitForDiagrams(page, 2)
    await page.waitForTimeout(500)

    const facts = await inPreview(page, (doc) => ({
      scripts: doc.querySelectorAll('script').length,
      handlers: [...doc.querySelectorAll('*')].filter((el) =>
        [...el.attributes].some((a) => a.name.startsWith('on'))
      ).length,
      frames: doc.querySelectorAll(
        'iframe, form, link, meta[http-equiv]:not([http-equiv="Content-Security-Policy" i]), object, embed'
      ).length,
      jsLinks: [...doc.querySelectorAll('[href], [src], [xlink\\:href]')].filter((el) =>
        [...el.attributes].some((a) => /^\s*javascript:/i.test(a.value))
      ).length,
      remoteStyle: [...doc.querySelectorAll('style')].some((s) =>
        /127\.0\.0\.1|@import/.test(s.textContent ?? '')
      ),
      inlineRemote: [...doc.querySelectorAll('[style]')].some((el) =>
        /127\.0\.0\.1/.test(el.getAttribute('style') ?? '')
      ),
      svgHandlers: [...doc.querySelectorAll('figure.ms-diagram *')].filter((el) =>
        [...el.attributes].some((a) => a.name.startsWith('on'))
      ).length,
      svgScripts: doc.querySelectorAll('figure.ms-diagram script').length,
      svgJsLinks: [
        ...doc.querySelectorAll('figure.ms-diagram [href], figure.ms-diagram [xlink\\:href]')
      ].filter((el) => [...el.attributes].some((a) => /javascript:/i.test(a.value))).length,
      bridge: typeof (doc.defaultView as unknown as { markdownStudio?: unknown }).markdownStudio,
      text: doc.body.textContent ?? ''
    }))
    expect(facts).toMatchObject({
      scripts: 0,
      handlers: 0,
      frames: 0,
      jsLinks: 0,
      remoteStyle: false,
      inlineRemote: false,
      svgHandlers: 0,
      svgScripts: 0,
      svgJsLinks: 0,
      bridge: 'undefined'
    })
    expect(facts.text).toContain('Hostile document')

    // Nothing ran anywhere, and nothing was requested from the network.
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned)
    ).toBeUndefined()
    expect(requests).toEqual([])

    // The preview frame cannot run scripts at all.
    expect(await page.locator('iframe.html-preview').getAttribute('sandbox')).toBe(
      'allow-same-origin'
    )

    // Clicking the hostile link does nothing dangerous.
    const link = page.frameLocator('iframe.html-preview').locator('text=click me')
    if (await link.count()) await link.click()
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned)
    ).toBeUndefined()

    // HTML and PDF exports of the same document are clean too.
    const html = path.join(sandbox.base, 'out', 'hostile.html')
    mkdirSync(path.dirname(html), { recursive: true })
    await stubSaveDialog(app, html)
    await exportViaDialog(page, 'html')
    await expect(
      page.getByTestId('toast-info').or(page.getByTestId('toast-success')).first()
    ).toContainText('hostile.html')
    const exported = readFileSync(html, 'utf8')
    expect(exported).not.toMatch(/<script|<iframe|<form|<link |@import/i)
    expect(exported).not.toContain(`127.0.0.1:${port}`)
    const viewer = await openInViewer(app, html)
    await viewer.waitForTimeout(300)
    expect(
      await viewer.evaluate(() => ({
        scripts: document.scripts.length,
        handlers: [...document.querySelectorAll('*')].filter((el) =>
          [...el.attributes].some((a) => a.name.startsWith('on'))
        ).length,
        jsLinks: [...document.querySelectorAll('[href], [src]')].filter((el) =>
          [...el.attributes].some((a) => /^\s*javascript:/i.test(a.value))
        ).length
      }))
    ).toEqual({ scripts: 0, handlers: 0, jsLinks: 0 })

    const pdf = path.join(sandbox.base, 'out', 'hostile.pdf')
    await stubSaveDialog(app, pdf)
    await exportViaDialog(page, 'pdf')
    // The document refers to files that do not exist, so the export reports them (an info toast).
    await expect(page.locator('[data-testid^="toast-"]').last()).toContainText('hostile.pdf')
    expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-')
    expect(requests).toEqual([])
  } finally {
    await closeApp(app)
    server.close()
  }
})

test('the diagram renderer is isolated: no preload, no Node.js, no network, own session', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'd.md': '```mermaid\nflowchart TD\n  A --> B\n```\n' })
  const requests: string[] = []
  const server: Server = createServer((request, response) => {
    requests.push(request.url ?? '')
    response.writeHead(200, { 'access-control-allow-origin': '*' }).end('x')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'd.md')
    await waitForDiagrams(page, 1)

    const windows = await app.evaluate(({ BrowserWindow, session }) =>
      BrowserWindow.getAllWindows().map((window) => {
        const preferences = window.webContents.getLastWebPreferences() ?? {}
        return {
          url: window.webContents.getURL(),
          visible: window.isVisible(),
          sandbox: preferences.sandbox,
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration,
          nodeIntegrationInSubFrames: preferences.nodeIntegrationInSubFrames,
          webviewTag: preferences.webviewTag,
          webSecurity: preferences.webSecurity,
          hasPreload: Boolean(preferences.preload),
          ownSession: window.webContents.session !== session.defaultSession
        }
      })
    )
    const main = windows.find((w) => !w.url.includes('diagram-host'))!
    expect(main).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    })
    const host = windows.find((w) => w.url.includes('diagram-host'))!
    expect(host).toMatchObject({
      visible: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      hasPreload: false,
      ownSession: true
    })

    // From inside that window: no Node.js, no application bridge, and no way out to the network.
    const inside = await app.evaluate(async ({ BrowserWindow }, base) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('diagram-host')
      )!
      return window.webContents.executeJavaScript(
        `(async () => {
          const result = { require: typeof require, process: typeof process, bridge: typeof markdownStudio }
          try { await fetch(${JSON.stringify(base)}, { mode: 'no-cors' }); result.fetch = 'allowed' } catch { result.fetch = 'blocked' }
          try { const image = new Image(); image.src = ${JSON.stringify(base)} + '/pixel.png'; await new Promise((r) => setTimeout(r, 300)) } catch {}
          return result
        })()`,
        true
      )
    }, `http://127.0.0.1:${port}`)
    expect(inside).toEqual({
      require: 'undefined',
      process: 'undefined',
      bridge: 'undefined',
      fetch: 'blocked'
    })
    expect(requests).toEqual([])
  } finally {
    await closeApp(app)
    server.close()
  }
})

test('the privileged bridge validates every call, whatever the document says', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'a.md': '# A\n' })
  writeFileSync(path.join(sandbox.base, 'secret.css'), 'body { color: red }')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'a.md')
    const outside = path.join(sandbox.base, 'secret.css')
    const results = await page.evaluate(async (secret) => {
      const api = window.markdownStudio
      const attempt = async (fn: () => Promise<unknown>) => {
        try {
          return { ok: true, value: await fn() }
        } catch (error) {
          return { ok: false, message: String(error) }
        }
      }
      return {
        openFile: await attempt(() => api.shell.openExternal('file:///etc/passwd')),
        openScript: await attempt(() => api.shell.openExternal('javascript:alert(1)')),
        readOutside: await attempt(() => api.fs.readText('/etc/passwd')),
        readCssOutside: await attempt(() => api.presentation.readCss(secret)),
        readCssTraversal: await attempt(() => api.presentation.readCss('../../etc/passwd.css')),
        readNonCss: await attempt(() => api.presentation.readCss('a.md')),
        diagramGarbage: await attempt(() =>
          api.diagram.render({
            id: 'x',
            source: 'x',
            variant: 'rainbow',
            fontFamily: 'a;b',
            accent: 'no',
            text: '#000000',
            background: '#ffffff',
            svgId: 'bad id'
          } as never)
        ),
        exportGarbage: await attempt(() =>
          api.export.run({ jobId: '', format: 'exe', html: 1 } as never)
        ),
        presetTraversal: await attempt(() => api.presets.delete('global', '../../settings')),
        presetScope: await attempt(() => api.presets.save('everywhere' as never, { name: 'x' })),
        pdfGarbage: await attempt(() =>
          api.render.pdf('<p>x</p>', { pageSize: 'Huge' } as never, { title: '', file: '' })
        )
      }
    }, outside)
    for (const key of [
      'openFile',
      'openScript',
      'readOutside',
      'readCssOutside',
      'readCssTraversal',
      'readNonCss',
      'presetTraversal',
      'presetScope',
      'pdfGarbage'
    ] as const) {
      expect(results[key].ok, key).toBe(false)
    }
    expect(results.diagramGarbage).toMatchObject({ ok: true, value: { ok: false } })
    expect(results.exportGarbage).toMatchObject({ ok: true, value: { status: 'failed' } })
    // The refused CSS read says what to do instead of leaking anything.
    expect(JSON.stringify(results.readCssOutside)).toContain('Choose this stylesheet again')
  } finally {
    await closeApp(app)
  }
})

test('local images stay subject to the access rules', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, {
    'images.md':
      '![inside](assets/architecture.png)\n\n![outside](../Downloads/architecture.png)\n\n![escape](../../../../../etc/passwd)\n'
  })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'images.md')
    await expect
      .poll(() =>
        inPreview(page, (doc) =>
          [...doc.querySelectorAll('img')].map((img) => (img.complete ? img.naturalWidth : -1))
        )
      )
      .toEqual([640, 0, 0].map((n, i) => (i === 0 ? n : 0)))
  } finally {
    await closeApp(app)
  }
})
