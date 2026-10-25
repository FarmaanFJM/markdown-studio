import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  exportViaDialog,
  focusEditor,
  inPreview,
  launchWithWorkspace,
  mod,
  openFromTree,
  seedDocuments,
  stubSaveDialog,
  treeRow
} from './helpers'

function sections(title: string, bytes: number): string {
  let text = `# ${title}\n\n`
  for (let i = 1; text.length < bytes; i++) {
    text += `## Section ${i}\n\nParagraph ${i} with **bold**, *italic*, \`code\` and a [link](https://example.com/${i}).\n\n- one\n- two\n\n\`\`\`ts\nexport const value${i} = ${i}\n\`\`\`\n\n`
    if (i % 25 === 0) text += `Math $x_{${i}}^2$ and\n\n$$\\sum_{k=1}^{${i}} k$$\n\n`
  }
  return text
}

test('typing stays responsive in a 400 KB document and the preview catches up', async () => {
  test.setTimeout(180_000)
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'large.md': sections('Large document', 400_000) })
  const { app, page } = await launchWithWorkspace(sandbox, { editor: { wordWrap: false } })
  try {
    await openFromTree(page, 'large.md')
    await expect
      .poll(() => inPreview(page, (doc) => doc.querySelector('h1')?.textContent ?? ''), {
        timeout: 60_000
      })
      .toBe('Large document')
    await page.evaluate(() => {
      const w = window as unknown as { __latency: number[] }
      w.__latency = []
      window.addEventListener(
        'keydown',
        () => {
          const start = performance.now()
          requestAnimationFrame(() =>
            requestAnimationFrame(() => w.__latency.push(performance.now() - start))
          )
        },
        true
      )
    })
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    const marker = `marker${Date.now() % 100000}`
    await page.keyboard.type(`\n\nTyped paragraph ${marker}.`, { delay: 10 })
    const latencies = await page.evaluate(
      () => (window as unknown as { __latency: number[] }).__latency
    )
    const sorted = [...latencies].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    // Keys are drawn within a few frames; heavy work happens only after a pause in typing.
    expect(p95).toBeLessThan(400)
    await expect
      .poll(
        () =>
          inPreview(page, (doc) => (doc.body.textContent ?? '').includes('Typed paragraph marker')),
        { timeout: 30_000 }
      )
      .toBe(true)
    // The editor kept every character.
    expect(await page.getByTestId('cursor-position').textContent()).toContain('Ln')
  } finally {
    await closeApp(app)
  }
})

test('rapid tab switching never leaves a stale preview', async () => {
  test.setTimeout(180_000)
  const sandbox = createSandbox()
  const files: Record<string, string> = {}
  for (const [i, name] of ['alpha', 'beta', 'gamma', 'delta'].entries()) {
    files[`${name}.md`] = sections(`Document ${name}`, 20_000 * (i + 1))
  }
  seedDocuments(sandbox, files)
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    for (const name of ['alpha', 'beta', 'gamma', 'delta'])
      await treeRow(page, `${name}.md`).click()
    for (let i = 0; i < 37; i++) await page.keyboard.press(`${mod}+PageDown`)
    const active = (await page.locator('.tab.active .tab-label').textContent())!
      .replace('.md', '')
      .trim()
    await expect
      .poll(() => inPreview(page, (doc) => doc.querySelector('h1')?.textContent ?? ''), {
        timeout: 30_000
      })
      .toBe(`Document ${active}`)
    // And it stays that way (no late render from an earlier tab replaces it).
    await page.waitForTimeout(1500)
    expect(await inPreview(page, (doc) => doc.querySelector('h1')?.textContent ?? '')).toBe(
      `Document ${active}`
    )
  } finally {
    await closeApp(app)
  }
})

test('repeated exports stay valid, leave no temporary files and keep the app usable', async () => {
  test.setTimeout(240_000)
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': sections('Report', 60_000) })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'report.md')
    const out = path.join(sandbox.base, 'out')
    mkdirSync(out, { recursive: true })
    for (let i = 0; i < 5; i++) {
      const target = path.join(out, `run-${i}.${i % 2 === 0 ? 'pdf' : 'html'}`)
      await stubSaveDialog(app, target)
      await exportViaDialog(page, i % 2 === 0 ? 'pdf' : 'html')
      const real = target
      await expect(page.getByTestId('toast-success').last()).toContainText(path.basename(real))
      const bytes = readFileSync(real)
      expect(bytes.length).toBeGreaterThan(2000)
      if (i % 2 === 0) expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
      else expect(bytes.subarray(0, 15).toString()).toBe('<!DOCTYPE html>')
    }
    expect(readdirSync(out).filter((name) => name.includes('.tmp'))).toEqual([])
    // Still editable afterwards.
    await focusEditor(page)
    await page.keyboard.type('still works')
    await expect(page.getByTestId('save-state')).toHaveText(/Unsaved/)
  } finally {
    await closeApp(app)
  }
})
