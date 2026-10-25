/**
 * Performance benchmark for Markdown Studio.
 *
 *   node scripts/benchmark.mjs [--app <folder>] [--out <file.json>] [--quick]
 *
 * Launches the built application (`out/` of the given folder, default: this repository) with the
 * Electron driver and measures typing responsiveness, preview latency, render time, PDF
 * generation time, memory growth, rapid tab switching and repeated exports on representative
 * documents. Works on Phase 2 builds too: features that did not exist are reported as `null`.
 */
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir, platform, cpus, totalmem, release } from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const { _electron: electron } = require('@playwright/test')

const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const appDir = path.resolve(option('--app', process.cwd()))
const outFile = option('--out', null)
const quick = args.includes('--quick')
const only = option('--only', null)

// ------------------------------------------------------------------------------- documents

function section(i) {
  return `## Section ${i}\n\nParagraph ${i} with **bold**, *italic*, \`code\` and a [link](https://example.com/${i}). Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\n- item one\n- item two\n- item three\n\n\`\`\`ts\nexport function f${i}(x: number): number {\n  return x * ${i}\n}\n\`\`\`\n\n`
}
const grow = (head, make, bytes) => {
  let text = head
  for (let i = 1; text.length < bytes; i++) text += make(i)
  return text
}
const table = (i) =>
  `### Table ${i}\n\n| Name | Value | Notes |\n| ---- | ----: | ----- |\n${Array.from({ length: 6 }, (_, r) => `| row ${r} | ${r * i} | note ${r} |`).join('\n')}\n\n`
const diagram = (i) =>
  `\`\`\`mermaid\nflowchart LR\n  A${i}[Start ${i}] --> B${i}{Check}\n  B${i} -->|yes| C${i}[Done]\n  B${i} -->|no| D${i}[Retry]\n\`\`\`\n\n`
const math = (i) =>
  `Equation ${i}: $x_{${i}}^2 + \\frac{${i}}{2}$ and\n\n$$\n\\sum_{k=1}^{${i}} k = \\frac{${i}(${i}+1)}{2}\n$$\n\n`

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const o = row + 1 + x * 3
      raw[o] = (x * 255) / size
      raw[o + 1] = (y * 255) / size
      raw[o + 2] = (x ^ y) & 255
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'latin1')
    data.copy(out, 8)
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 3 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const KB = 1024
const documents = {
  'small notes': {
    file: 'small.md',
    text: '# Small notes\n\nA few lines.\n\n- one\n- two\n\nSome `code` and a [link](https://example.com).\n'
  },
  'medium technical (60 KB)': {
    file: 'medium.md',
    text: grow(
      '# Technical documentation\n\n',
      (i) => section(i) + (i % 4 === 0 ? table(i) : ''),
      60 * KB
    )
  },
  'large (400 KB)': { file: 'large.md', text: grow('# Large document\n\n', section, 400 * KB) },
  'huge (1.1 MB)': { file: 'huge.md', text: grow('# Huge document\n\n', section, 1100 * KB) },
  'tables and headings (300 tables)': {
    file: 'tables.md',
    text: grow('# Tables\n\n', (i) => `## Heading ${i}\n\n${table(i)}`, 300 * 330)
  },
  'diagrams (10 Mermaid)': {
    file: 'diagrams.md',
    text:
      '# Diagrams\n\n' +
      Array.from({ length: 10 }, (_, i) => `Diagram ${i + 1}.\n\n${diagram(i + 1)}`).join(''),
    newFeature: true
  },
  'math (500 expressions)': {
    file: 'math.md',
    text: '# Mathematics\n\n' + Array.from({ length: 250 }, (_, i) => math(i + 1)).join(''),
    newFeature: true
  },
  'large images (4 x 2400 px)': {
    file: 'images.md',
    text: '# Images\n\n' + [1, 2, 3, 4].map((i) => `![photo ${i}](img/photo${i}.png)\n\n`).join('')
  },
  'mixed (diagrams, tables, math, code)': {
    file: 'mixed.md',
    text: grow(
      '# Mixed document\n\n',
      (i) =>
        section(i) +
        (i % 5 === 0 ? table(i) : '') +
        (i % 20 === 0 ? diagram(i) : '') +
        (i % 5 === 1 ? math(i) : ''),
      150 * KB
    ),
    newFeature: true
  }
}

// ------------------------------------------------------------------------------- helpers

const base = mkdtempSync(path.join(tmpdir(), 'ms-bench-'))
const workspace = path.join(base, 'workspace')
const userData = path.join(base, 'user-data')
mkdirSync(path.join(workspace, 'img'), { recursive: true })
mkdirSync(userData, { recursive: true })
for (const doc of Object.values(documents)) writeFileSync(path.join(workspace, doc.file), doc.text)
for (let i = 1; i <= 4; i++)
  writeFileSync(path.join(workspace, 'img', `photo${i}.png`), png(quick ? 800 : 2400))
writeFileSync(
  path.join(userData, 'settings.json'),
  JSON.stringify({
    workspace: { restoreLastWorkspace: true, lastWorkspace: workspace, recent: [workspace] },
    editor: { wordWrap: false }
  })
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const percentile = (values, p) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return (
    Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] * 10) / 10
  )
}
const round = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10)

async function launch() {
  const app = await electron.launch({
    args: [...(platform() === 'linux' ? ['--no-sandbox'] : []), '--js-flags=--expose-gc', appDir],
    env: { ...process.env, MARKDOWN_STUDIO_USER_DATA: userData, NODE_ENV: 'production' }
  })
  const page = await app.firstWindow()
  await page.locator('.app:not(.loading)').waitFor()
  return { app, page }
}

const previewHeading = (page) =>
  page.evaluate(
    () =>
      document.querySelector('iframe.html-preview')?.contentDocument?.querySelector('h1')
        ?.textContent ?? null
  )

async function open(page, file) {
  const start = Date.now()
  await page.locator('.tree-row').filter({ hasText: file }).first().click()
  await page.waitForFunction(
    (title) =>
      document.querySelector('iframe.html-preview')?.contentDocument?.querySelector('h1')
        ?.textContent === title,
    await titleOf(file),
    { timeout: 120000 }
  )
  return Date.now() - start
}
const titleOf = async (file) => {
  const text = Object.values(documents).find((d) => d.file === file).text
  return /^# (.*)$/m.exec(text)[1]
}

async function measureTyping(page, count = 40) {
  await page.evaluate(() => {
    window.__latency = []
    window.__long = []
    window.addEventListener(
      'keydown',
      () => {
        const t = performance.now()
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.__latency.push(performance.now() - t))
        )
      },
      true
    )
    new PerformanceObserver((list) =>
      list.getEntries().forEach((e) => window.__long.push(e.duration))
    ).observe({ entryTypes: ['longtask'] })
  })
  await page
    .locator('.monaco-editor .view-lines')
    .first()
    .click({ position: { x: 5, y: 5 }, force: true })
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Control+End')
  const marker = `zz${Date.now() % 100000}`
  const start = Date.now()
  for (const ch of `\n\nTyped ${marker} text`.slice(0, count)) {
    await page.keyboard.type(ch)
  }
  await page.keyboard.type(` ${marker}`)
  const typed = Date.now() - start
  const previewStart = Date.now()
  await page.waitForFunction(
    (m) =>
      document.querySelector('iframe.html-preview')?.contentDocument?.body.textContent?.includes(m),
    marker,
    { timeout: 60000 }
  )
  const previewLatency = Date.now() - previewStart
  const stats = await page.evaluate(() => ({ latency: window.__latency, long: window.__long }))
  return {
    keyToFrameP50: percentile(stats.latency, 50),
    keyToFrameP95: percentile(stats.latency, 95),
    keyToFrameMax: percentile(stats.latency, 100),
    longTasks: stats.long.length,
    longTaskTotalMs: round(stats.long.reduce((a, b) => a + b, 0)),
    previewLatencyAfterLastKeyMs: previewLatency,
    typedMs: typed
  }
}

const renderTimes = (page) =>
  page.evaluate(() => {
    const entries = performance.getEntriesByName('ms:preview-render')
    if (entries.length === 0) return null
    const last = entries[entries.length - 1].duration
    return {
      count: entries.length,
      lastMs: Math.round(last * 10) / 10,
      maxMs: Math.round(Math.max(...entries.map((e) => e.duration)) * 10) / 10
    }
  })

const heap = async (page) => {
  await page.evaluate(() => window.gc?.())
  return page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null))
}
const mainMemory = (app) =>
  app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0)
  )

async function pdfTime(page) {
  const start = Date.now()
  await page.getByTestId('preview-tab-pdf').click()
  await page.locator('.pdf-page').first().waitFor({ timeout: 180000 })
  const ms = Date.now() - start
  await page
    .getByTestId('preview-tab-html')
    .click()
    .catch(() => page.locator('[data-testid=preview-tab-html]').click())
  return ms
}

// -------------------------------------------------------------------------------- run

const result = {
  environment: {
    date: new Date().toISOString(),
    os: `${platform()} ${release()}`,
    cpu: `${cpus()[0]?.model.trim()} × ${cpus().length}`,
    memoryGb: Math.round(totalmem() / 2 ** 30),
    node: process.version,
    appDir,
    quick
  },
  documents: {}
}

const { app, page } = await launch()
result.environment.electron = await app.evaluate(
  () => `${process.versions.electron} (Chromium ${process.versions.chrome})`
)
await page
  .getByTestId('preview-tab-html')
  .click()
  .catch(() => undefined)
await page.waitForTimeout(500)

try {
  for (const [name, doc] of Object.entries(documents)) {
    if (only && !name.includes(only)) continue
    const entry = {}
    try {
      entry.openMs = await open(page, doc.file)
      await page.waitForTimeout(doc.newFeature ? 1500 : 300)
      entry.renderTime = await renderTimes(page)
      Object.assign(entry, await measureTyping(page, quick ? 12 : 40))
      entry.renderAfterTyping = await renderTimes(page)
      if (!quick || name === 'mixed (diagrams, tables, math, code)')
        entry.pdfPreviewMs = await pdfTime(page)
    } catch (error) {
      entry.error = String(error).split('\n')[0]
    }
    result.documents[name] = entry
    console.error(`${name}:`, JSON.stringify(entry))
    // Discard edits so each document starts clean.
    await page.keyboard.press('Control+Z').catch(() => undefined)
  }

  console.error('step: memory growth')
  // Memory growth across repeated renders of the medium document.
  console.error('open medium')
  await open(page, 'medium.md')
  console.error('opened')
  const heapBefore = await heap(page)
  console.error('heap before', heapBefore)
  const mainBefore = await mainMemory(app)
  console.error('main before', mainBefore)
  await page.screenshot({ path: '/tmp/bench-before-memory.png' })
  await page
    .locator('.monaco-editor .view-lines')
    .first()
    .click({ position: { x: 5, y: 5 }, force: true })
  await page.keyboard.press('Control+End')
  const cycles = quick ? 15 : 60
  for (let i = 0; i < cycles; i++) {
    await page.keyboard.type(i % 2 ? 'a' : 'b')
    await sleep(160)
  }
  await sleep(1000)
  const heapAfter = await heap(page)
  result.memoryGrowth = {
    cycles,
    rendererHeapBeforeMb: heapBefore && round(heapBefore / 2 ** 20),
    rendererHeapAfterMb: heapAfter && round(heapAfter / 2 ** 20),
    rendererHeapGrowthMb: heapBefore && heapAfter && round((heapAfter - heapBefore) / 2 ** 20),
    allProcessesGrowthMb: round(((await mainMemory(app)) - mainBefore) / 2 ** 20)
  }
  console.error('memory:', JSON.stringify(result.memoryGrowth))

  console.error('step: tab switching')
  // Rapid tab switching: open several documents, then switch as fast as possible.
  for (const file of ['small.md', 'medium.md', 'tables.md', 'large.md', 'mixed.md'])
    await open(page, file).catch(() => undefined)
  const switchStart = Date.now()
  const switches = quick ? 20 : 60
  for (let i = 0; i < switches; i++) await page.keyboard.press('Control+PageDown')
  const switchMs = Date.now() - switchStart
  await page.waitForTimeout(500)
  const active = await page.locator('.tab.active .tab-label').textContent()
  const expectedTitle = await titleOf(active.trim())
  let settled = false
  for (let i = 0; i < 100 && !settled; i++) {
    settled = (await previewHeading(page)) === expectedTitle
    if (!settled) await sleep(100)
  }
  result.tabSwitching = {
    switches,
    totalMs: switchMs,
    perSwitchMs: round(switchMs / switches),
    activeDocument: active.trim(),
    previewMatchesActiveDocument: settled
  }
  console.error('tabs:', JSON.stringify(result.tabSwitching))

  console.error('step: exports')
  // Repeated PDF exports.
  await page.locator('.tree-row').filter({ hasText: 'medium.md' }).first().click()
  const exportsDir = path.join(base, 'exports')
  mkdirSync(exportsDir, { recursive: true })
  const exportTimes = []
  const mainExportBefore = await mainMemory(app)
  const runs = quick ? 3 : 10
  for (let i = 0; i < runs; i++) {
    const target = path.join(exportsDir, `run-${i}.pdf`)
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    }, target)
    const start = Date.now()
    await page.getByRole('button', { name: 'Export as PDF' }).click()
    const run = page.getByTestId('export-run')
    if (await run.isVisible({ timeout: 1500 }).catch(() => false)) await run.click()
    await page.getByTestId('toast-success').last().waitFor({ timeout: 120000 })
    exportTimes.push(Date.now() - start)
    await page.waitForTimeout(100)
  }
  result.repeatedExports = {
    runs,
    medianMs: percentile(exportTimes, 50),
    maxMs: percentile(exportTimes, 100),
    allProcessesGrowthMb: round(((await mainMemory(app)) - mainExportBefore) / 2 ** 20)
  }
  console.error('exports:', JSON.stringify(result.repeatedExports))
} finally {
  // Unsaved edits would keep a normal close waiting on a prompt: do not wait for it.
  await Promise.race([app.close(), sleep(5000)]).catch(() => undefined)
  app.process().kill('SIGKILL')
}

if (outFile) writeFileSync(outFile, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
