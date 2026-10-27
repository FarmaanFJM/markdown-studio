import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  launch,
  launchEditing,
  mod,
  newDocumentWith,
  type Sandbox
} from './helpers'

/**
 * GitHub Copilot integration, end to end, against a deterministic mock of the Copilot language
 * server (tests/support/mock-copilot-server.mjs). The mock proves the application's behaviour:
 * sign-in states, document synchronisation, Monaco ghost text, Tab / Escape / undo, switching
 * documents, disabling AI and signing out. It does not prove that GitHub's real service works;
 * that needs a real account (docs/AI.md, "Acceptance with a real Copilot account").
 */
const MOCK_SERVER = path.resolve(__dirname, '../support/mock-copilot-server.mjs')

const GHOST = '.monaco-editor .ghost-text-decoration, .monaco-editor .ghost-text'
const SUGGESTION = ' it keeps the player immersed in the story.'
const START = '## Conclusion\n\nThe health interface in Dead Space is effective becaus'

const logPath = (sandbox: Sandbox) => path.join(sandbox.userData, 'copilot', 'mock-log.jsonl')
function readLog(sandbox: Sandbox): Record<string, unknown>[] {
  if (!existsSync(logPath(sandbox))) return []
  return readFileSync(logPath(sandbox), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}
const documentEvents = (sandbox: Sandbox) =>
  readLog(sandbox).filter(
    (e) =>
      typeof e.method === 'string' &&
      e.method.startsWith('textDocument/') &&
      e.method !== 'textDocument/didFocus'
  )
const completions = (sandbox: Sandbox) => readLog(sandbox).filter((e) => e.method === 'completion')

/** The document text as rendered, without ghost text, which Monaco draws inside the line. */
function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>('.monaco-editor .view-line')]
    return lines
      .map((line) => {
        const copy = line.cloneNode(true) as HTMLElement
        copy.querySelectorAll('[class*="ghost-text"]').forEach((el) => el.remove())
        return { top: parseFloat(line.style.top), text: copy.textContent ?? '' }
      })
      .sort((a, b) => a.top - b.top)
      .map((l) => l.text.replace(/\u00a0/g, ' '))
      .join('\n')
  })
}

/**
 * Focuses the editor with a click near the right edge of the first line. The shared helper clicks
 * 5 px from the left edge of the text, which can land on the line-number margin once a long line
 * has scrolled the view horizontally (seen on the narrow Windows display).
 */
async function focusEditor(page: Page): Promise<void> {
  const scroller = page.locator('.monaco-editor .monaco-scrollable-element.editor-scrollable')
  const box = await scroller.boundingBox()
  await scroller.click({ position: { x: Math.max(10, (box?.width ?? 400) - 40), y: 8 } })
}

async function openAiSettings(page: Page) {
  await page.keyboard.press(`${mod}+,`)
  const settings = page.getByTestId('settings-panel')
  await expect(settings).toBeVisible()
  await settings.getByTestId('settings-nav-ai').click()
  return settings
}

test.describe('GitHub Copilot', () => {
  // The mock replaces the real language server only in an unpackaged build, and only here.
  test.beforeAll(() => {
    process.env.MARKDOWN_STUDIO_COPILOT_SERVER_SCRIPT = MOCK_SERVER
  })
  test.afterAll(() => {
    delete process.env.MARKDOWN_STUDIO_COPILOT_SERVER_SCRIPT
  })

  // A packaged application ignores the mock override on purpose, so this test needs the
  // development build. Packaged builds are covered by packaged.spec.ts (real server).
  test.skip(
    !!process.env.MARKDOWN_STUDIO_EXECUTABLE,
    'needs the mock language server, which packaged builds never load'
  )
  test('sign in, inline suggestions in Monaco, accept, undo, dismiss, switch, disable and sign out', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      // The browser is never opened for real during tests.
      await app.evaluate(({ shell }) => {
        ;(globalThis as unknown as { opened: string[] }).opened = []
        shell.openExternal = async (url: string) => {
          ;(globalThis as unknown as { opened: string[] }).opened.push(url)
        }
      })

      // 1-3. Enable AI, choose GitHub Copilot, sign in.
      const settings = await openAiSettings(page)
      await expect(settings.getByTestId('copilot-account')).toHaveCount(0)
      await settings.getByLabel('Enable AI assistance').check()
      await settings.getByTestId('ai-provider').selectOption('github-copilot')
      await expect(settings.getByTestId('ai-provider-limits')).toContainText('Rewrite selection')
      await expect(settings.getByTestId('copilot-state')).toHaveText('Not signed in')
      await expect(settings.getByTestId('copilot-privacy')).toContainText(
        'sends the context it chooses'
      )
      // No API key field for Copilot.
      await expect(settings.getByTestId('ai-key')).toHaveCount(0)
      await settings.getByTestId('copilot-sign-in').click()
      await expect(settings.getByTestId('copilot-pending')).toBeVisible()
      await expect(settings.getByTestId('copilot-code')).toHaveText('MOCK-1234')
      await expect(settings.getByTestId('copilot-state')).toHaveText('Connected')
      await expect(settings.getByTestId('copilot-user')).toContainText('mock-user')
      const opened = await app.evaluate(
        () => (globalThis as unknown as { opened: string[] }).opened
      )
      expect(opened.every((url) => url.startsWith('https://github.com/'))).toBe(true)
      await settings.getByLabel('Automatic inline suggestions').check()
      await settings.getByTestId('copilot-delay').selectOption('0')
      await page.getByTestId('settings-close').click()

      // Settings (not credentials) are what is persisted.
      const settingsFile = path.join(sandbox.userData, 'settings.json')
      await expect
        .poll(() => JSON.parse(readFileSync(settingsFile, 'utf8')).ai)
        .toMatchObject({ enabled: true, provider: 'github-copilot', inlineSuggestions: true })
      expect(readFileSync(settingsFile, 'utf8')).not.toMatch(/token|mock-user|MOCK-1234/i)

      // 4-6. Open a Markdown document, type, receive an inline completion.
      await newDocumentWith(page, START)
      await expect.poll(() => documentEvents(sandbox).length).toBeGreaterThan(0)
      await page.keyboard.type('e')
      await expect(page.locator(GHOST).first()).toBeVisible()
      await expect(page.locator(GHOST).first()).toContainText('keeps the player')
      // Suggestions do not change the document until accepted.
      const typed = `${START}e`
      expect(await editorText(page)).toBe(typed)
      // The server saw exactly what the editor holds, as a Markdown document with a version.
      const open = readLog(sandbox).find((e) => e.method === 'textDocument/didOpen')!
      expect(open).toMatchObject({ languageId: 'markdown', version: expect.any(Number) })
      expect(String(open.uri)).toMatch(/^untitled:markdown-studio-.*\.md$/)
      expect(String(open.uri)).not.toContain(sandbox.base)
      const request = completions(sandbox).at(-1)!
      expect(request.docText).toBe(typed)
      expect(request.position).toEqual({ line: 2, character: typed.split('\n')[2].length })

      // 7. Tab accepts; 8. undo restores.
      await page.keyboard.press('Tab')
      await expect.poll(() => editorText(page)).toBe(typed + SUGGESTION)
      await expect.poll(() => readLog(sandbox).some((e) => e.method === 'accepted')).toBe(true)
      await page.keyboard.press(`${mod}+Z`)
      await expect.poll(() => editorText(page)).toBe(typed)
      // Copilot may offer the same continuation again for the restored text; it is only ghost text.
      await page.keyboard.press('Escape')
      await expect(page.locator(GHOST)).toHaveCount(0)
      expect(await editorText(page)).toBe(typed)

      // 9. Escape dismisses without changing the document.
      await page.keyboard.press('Backspace')
      await page.keyboard.type('e')
      await expect(page.locator(GHOST).first()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator(GHOST)).toHaveCount(0)
      expect(await editorText(page)).toBe(typed)

      // Without a visible suggestion Tab keeps its Markdown behaviour (list indentation).
      await page.keyboard.press(`${mod}+End`)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await page.keyboard.type('- een')
      await page.keyboard.press('Enter')
      await page.keyboard.type('punt')
      await page.keyboard.press('Escape')
      await expect(page.locator(GHOST)).toHaveCount(0)
      await page.keyboard.press('Tab')
      await expect.poll(() => editorText(page)).toMatch(/- een\s*\n {2}- punt/)

      // 10. Switching documents never shows the other document's suggestion.
      await page.keyboard.type('x')
      await expect(page.locator(GHOST).first()).toBeVisible()
      const lifecycle = () =>
        documentEvents(sandbox)
          .map((e) => e.method)
          .filter((m) => m === 'textDocument/didOpen' || m === 'textDocument/didClose')
      const before = lifecycle().length
      await newDocumentWith(page, 'Tweede document zonder suggestie')
      await expect(page.locator(GHOST)).toHaveCount(0)
      // The first document is closed in the server before the second one is opened.
      await expect
        .poll(() => lifecycle().slice(before))
        .toEqual(['textDocument/didClose', 'textDocument/didOpen'])
      const opens = readLog(sandbox).filter((e) => e.method === 'textDocument/didOpen')
      expect(new Set(opens.map((e) => e.uri)).size).toBeGreaterThan(1)

      // Manual trigger works with automatic suggestions off.
      await page.getByTestId('activity-ai').click()
      await page.getByTestId('ai-inline-toggle').uncheck()
      await focusEditor(page)
      await page.keyboard.press(`${mod}+End`)
      await page.keyboard.type(' meer')
      await expect.poll(() => editorText(page)).toBe('Tweede document zonder suggestie meer')
      const requestsBefore = completions(sandbox).length
      await page.waitForTimeout(600)
      expect(completions(sandbox).length).toBe(requestsBefore)
      await page.getByTestId('ai-continue').click()
      await expect(page.locator(GHOST).first()).toBeVisible()
      await page.keyboard.press('Escape')

      // 11-12. Disabling AI stops every request and document transfer.
      // Switching AI off for the folder closes the document in the server and stops requests.
      const openCount = () => lifecycle().filter((m) => m === 'textDocument/didOpen').length
      const opensBefore = openCount()
      await page.getByTestId('ai-workspace-toggle').uncheck()
      await expect.poll(() => lifecycle().at(-1)).toBe('textDocument/didClose')
      const folderOff = readLog(sandbox).length
      await focusEditor(page)
      await page.keyboard.type(' x')
      await page.waitForTimeout(600)
      expect(readLog(sandbox).length).toBe(folderOff)
      await page.getByTestId('ai-workspace-toggle').check()
      await expect.poll(openCount).toBe(opensBefore + 1)
      const disabledSettings = await openAiSettings(page)
      await disabledSettings.getByLabel('Enable AI assistance').uncheck()
      await page.getByTestId('settings-close').click()
      await expect.poll(() => readLog(sandbox).some((e) => e.received === 'exit')).toBe(true)
      const frozen = readLog(sandbox).length
      await focusEditor(page)
      await page.keyboard.type(' stil')
      await page.waitForTimeout(800)
      expect(readLog(sandbox).length).toBe(frozen)
      await expect(page.locator(GHOST)).toHaveCount(0)

      // 13-14. Sign out: no further suggestions.
      const again = await openAiSettings(page)
      await again.getByLabel('Enable AI assistance').check()
      await expect(again.getByTestId('copilot-state')).toHaveText('Connected')
      await again.getByTestId('copilot-sign-out').click()
      await expect(again.getByTestId('copilot-state')).toHaveText('Not signed in')
      await page.getByTestId('settings-close').click()
      const afterSignOut = completions(sandbox).length
      await focusEditor(page)
      await page.keyboard.type(' en nog iets meer')
      await page.waitForTimeout(800)
      await expect(page.locator(GHOST)).toHaveCount(0)
      expect(completions(sandbox).length).toBe(afterSignOut)
      if (!(await page.getByTestId('ai-panel').isVisible())) {
        await page.getByTestId('activity-ai').click()
      }
      await expect(page.getByTestId('ai-status')).toContainText('Sign in to GitHub Copilot')
    } finally {
      await closeApp(app)
    }
  })

  test('is invisible when AI is off: no process starts and no document is sent', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox)
    try {
      await newDocumentWith(page, 'Gewone tekst.')
      await page.keyboard.type(' Meer tekst.')
      await expect.poll(() => editorText(page)).toBe('Gewone tekst. Meer tekst.')
      await page.waitForTimeout(500)
      expect(existsSync(logPath(sandbox))).toBe(false)
    } finally {
      await closeApp(app)
    }
  })

  test('keeps the OpenAI-compatible settings when switching providers and explains unsupported actions', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchEditing(sandbox, {
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        endpoint: 'http://127.0.0.1:9/v1',
        model: 'my-model'
      }
    })
    try {
      const settings = await openAiSettings(page)
      await settings.getByTestId('ai-provider').selectOption('github-copilot')
      await expect(settings.getByTestId('ai-endpoint')).toHaveCount(0)
      await settings.getByTestId('ai-provider').selectOption('openai-compatible')
      await expect(settings.getByTestId('ai-model')).toHaveValue('my-model')
      await expect(settings.getByTestId('ai-endpoint')).toHaveValue('http://127.0.0.1:9/v1')
      await settings.getByTestId('ai-provider').selectOption('github-copilot')
      await page.getByTestId('settings-close').click()
      await newDocumentWith(page, 'Tekst om te herschrijven')
      await page.keyboard.press(`${mod}+A`)
      await page.keyboard.press(`${mod}+Shift+P`)
      await page.getByTestId('palette-input').fill('AI: Rewrite Selection')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('toast-info')).toContainText(
        'not available with GitHub Copilot'
      )
      // Settings are written shortly after a change (renderer and main both debounce), so wait for
      // the file itself to show the choice instead of reading it at once.
      const file = path.join(sandbox.userData, 'settings.json')
      await expect
        .poll(() => JSON.parse(readFileSync(file, 'utf8')).ai)
        .toMatchObject({
          provider: 'github-copilot',
          model: 'my-model',
          endpoint: 'http://127.0.0.1:9/v1'
        })
    } finally {
      await closeApp(app)
    }
  })

  test('the chosen provider survives closing at once and restarting, with both providers configured', async () => {
    const sandbox = createSandbox()
    const first = await launchEditing(sandbox, {
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        endpoint: 'http://127.0.0.1:9/v1',
        model: 'my-model'
      }
    })
    try {
      const settings = await openAiSettings(first.page)
      // Several quick changes: the last choice must win and nothing older may overwrite it.
      await settings.getByTestId('ai-provider').selectOption('github-copilot')
      await settings.getByTestId('ai-provider').selectOption('openai-compatible')
      await settings.getByTestId('ai-provider').selectOption('github-copilot')
      await first.page.getByTestId('settings-close').click()
    } finally {
      // Closed immediately: the pending change must be flushed by the shutdown, not lost.
      await closeApp(first.app)
    }
    const file = path.join(sandbox.userData, 'settings.json')
    expect(JSON.parse(readFileSync(file, 'utf8')).ai).toMatchObject({
      enabled: true,
      provider: 'github-copilot',
      model: 'my-model',
      endpoint: 'http://127.0.0.1:9/v1'
    })

    // Restart without seeding any settings: what was saved is what comes back.
    const second = await launch(sandbox)
    try {
      const settings = await openAiSettings(second.page)
      await expect(settings.getByTestId('ai-provider')).toHaveValue('github-copilot')
      await settings.getByTestId('ai-provider').selectOption('openai-compatible')
      await expect(settings.getByTestId('ai-model')).toHaveValue('my-model')
      await expect(settings.getByTestId('ai-endpoint')).toHaveValue('http://127.0.0.1:9/v1')
    } finally {
      await closeApp(second.app)
    }
  })
})
