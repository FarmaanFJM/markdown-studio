import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'

export const ROOT = path.resolve(__dirname, '../..')
const FIXTURES = path.join(ROOT, 'tests', 'fixtures')

export const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

export interface Sandbox {
  base: string
  workspace: string
  external: string
  userData: string
}

/** Copies the fixtures to a fresh temporary directory so tests never modify the repository. */
export function createSandbox(): Sandbox {
  const base = mkdtempSync(path.join(tmpdir(), 'markdown-studio-e2e-'))
  const sandbox = {
    base,
    workspace: path.join(base, 'Atlas Project'),
    external: path.join(base, 'Downloads'),
    userData: path.join(base, 'user-data')
  }
  cpSync(path.join(FIXTURES, 'workspace'), sandbox.workspace, { recursive: true })
  cpSync(path.join(FIXTURES, 'external'), sandbox.external, { recursive: true })
  mkdirSync(sandbox.userData, { recursive: true })
  return sandbox
}

export interface Launched {
  app: ElectronApplication
  page: Page
}

/** Starts Markdown Studio; optionally pre-seeds settings (for example a workspace to restore). */
export async function launch(sandbox: Sandbox, settings?: Record<string, unknown>): Promise<Launched> {
  if (settings) writeFileSync(path.join(sandbox.userData, 'settings.json'), JSON.stringify(settings))
  const app = await electron.launch({
    // Chromium's sandbox cannot start as root inside CI containers; it is not disabled elsewhere.
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), ROOT],
    env: { ...process.env, MARKDOWN_STUDIO_USER_DATA: sandbox.userData, NODE_ENV: 'production' }
  })
  const page = await app.firstWindow()
  await page.locator('.app:not(.loading)').waitFor()
  return { app, page }
}

/** Starts the app with the sandbox workspace already open (restored from settings). */
export function launchWithWorkspace(sandbox: Sandbox, extra: Record<string, unknown> = {}): Promise<Launched> {
  return launch(sandbox, {
    workspace: { restoreLastWorkspace: true, lastWorkspace: sandbox.workspace, recent: [sandbox.workspace] },
    ...extra
  })
}

export async function stubOpenDialog(app: ElectronApplication, filePaths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: paths.length === 0, filePaths: paths })) as typeof dialog.showOpenDialog
  }, filePaths)
}

export async function stubSaveDialog(app: ElectronApplication, filePath: string | null): Promise<void> {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: target === null, filePath: target ?? '' })) as typeof dialog.showSaveDialog
  }, filePath)
}

export function treeRow(page: Page, name: string): Locator {
  return page.locator('.tree-row').filter({ has: page.getByText(name, { exact: true }) })
}

export async function openFromTree(page: Page, ...segments: string[]): Promise<void> {
  for (const segment of segments) await treeRow(page, segment).click()
  await expect(page.locator('.tab.active .tab-label')).toHaveText(segments[segments.length - 1])
}

/** Visible editor text (Monaco renders lines lazily; fine for the short fixtures used here). */
export async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>('.monaco-editor .view-line')]
    return lines
      .map((line) => ({ top: parseFloat(line.style.top), text: line.textContent ?? '' }))
      .sort((a, b) => a.top - b.top)
      .map((l) => l.text.replace(/ /g, ' '))
      .join('\n')
  })
}

export async function focusEditor(page: Page): Promise<void> {
  await page.locator('.monaco-editor .view-lines').click({ position: { x: 5, y: 5 } })
}

/** Moves the cursor to the start of a 1-based line using Monaco's own "go to line" navigation. */
export async function goToLine(page: Page, line: number): Promise<void> {
  await focusEditor(page)
  await page.keyboard.press(`${mod}+Home`)
  for (let i = 1; i < line; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Home')
  await page.keyboard.press('Home')
}

/** Client coordinates of the start of a rendered editor line (1-based, must be visible). */
export async function lineCoordinates(page: Page, line: number): Promise<{ x: number; y: number }> {
  return page.evaluate((n) => {
    const lines = [...document.querySelectorAll<HTMLElement>('.monaco-editor .view-line')].sort(
      (a, b) => parseFloat(a.style.top) - parseFloat(b.style.top)
    )
    const rect = lines[n - 1].getBoundingClientRect()
    return { x: rect.left + 2, y: rect.top + rect.height / 2 }
  }, line)
}

export function previewFrame(page: Page) {
  return page.locator('iframe.html-preview')
}

/**
 * Runs a function against the preview iframe's document from the (trusted) parent page.
 * The function is sent as an expression, because the application's CSP forbids `new Function`.
 */
export function inPreview<T>(page: Page, fn: (doc: Document) => T): Promise<T> {
  return page.evaluate(
    `(() => {
      const doc = document.querySelector('iframe.html-preview')?.contentDocument
      if (!doc) throw new Error('Preview is not available')
      return (${fn.toString()})(doc)
    })()`
  ) as Promise<T>
}

/**
 * Closes the application normally. If a failing test left a prompt open, the process is
 * killed after a grace period so one failure cannot hang the whole run.
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10_000))
  const result = await Promise.race([app.close().then(() => 'closed' as const), timeout])
  if (result === 'timeout') app.process().kill('SIGKILL')
}

/** Waits for the application to exit (after closing the last window). */
export function waitForExit(app: ElectronApplication): Promise<void> {
  return new Promise((resolve) => app.process().once('exit', () => resolve()))
}
