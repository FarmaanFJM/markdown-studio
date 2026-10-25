import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Locator,
  type Page
} from '@playwright/test'

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
export async function launch(
  sandbox: Sandbox,
  settings?: Record<string, unknown>
): Promise<Launched> {
  if (settings)
    writeFileSync(path.join(sandbox.userData, 'settings.json'), JSON.stringify(settings))
  // MARKDOWN_STUDIO_EXECUTABLE runs the suite against a packaged build instead of `out/`.
  const executablePath = process.env.MARKDOWN_STUDIO_EXECUTABLE
  const app = await electron.launch({
    executablePath,
    // Chromium's sandbox cannot start as root inside CI containers; it is not disabled elsewhere.
    args: [
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
      ...(executablePath ? [] : [ROOT])
    ],
    env: {
      ...process.env,
      // Chromium on Linux needs a UTF-8 locale to map non-ASCII file names of dropped files.
      LANG: process.env.LANG || 'C.UTF-8',
      MARKDOWN_STUDIO_USER_DATA: sandbox.userData,
      NODE_ENV: 'production'
    }
  })
  const page = await app.firstWindow()
  await page.locator('.app:not(.loading)').waitFor()
  return { app, page }
}

/** Starts the app with the sandbox workspace already open (restored from settings). */
export function launchWithWorkspace(
  sandbox: Sandbox,
  extra: Record<string, unknown> = {}
): Promise<Launched> {
  return launch(sandbox, {
    workspace: {
      restoreLastWorkspace: true,
      lastWorkspace: sandbox.workspace,
      recent: [sandbox.workspace]
    },
    ...extra
  })
}

/**
 * Like `launchWithWorkspace`, with soft word wrap off. Editor text is read from the rendered
 * lines, and a long line that wraps (the Windows CI display is narrow) would otherwise be read
 * as several lines. Wrapping itself is covered by the Phase 1 settings tests.
 */
export function launchEditing(
  sandbox: Sandbox,
  extra: Record<string, unknown> = {}
): Promise<Launched> {
  return launchWithWorkspace(sandbox, { editor: { wordWrap: false }, ...extra })
}

export async function stubOpenDialog(app: ElectronApplication, filePaths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({
      canceled: paths.length === 0,
      filePaths: paths
    })) as typeof dialog.showOpenDialog
  }, filePaths)
}

export async function stubSaveDialog(
  app: ElectronApplication,
  filePath: string | null
): Promise<void> {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({
      canceled: target === null,
      filePath: target ?? ''
    })) as typeof dialog.showSaveDialog
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
      .map((l) => l.text.replace(/\u00a0/g, ' '))
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
  const closed = app.close().then(() => true)
  const wait = (ms: number) => new Promise<false>((resolve) => setTimeout(() => resolve(false), ms))
  if (await Promise.race([closed, wait(2000)])) return
  // Documents left unsaved by the test: discard them, as a user would at the prompt.
  const page = app.windows()[0]
  await page
    ?.getByRole('button', { name: "Don't Save" })
    .click({ timeout: 2000 })
    .catch(() => undefined)
  if (!(await Promise.race([closed, wait(8000)]))) app.process().kill('SIGKILL')
}

/** Waits for the application to exit (after closing the last window). */
export function waitForExit(app: ElectronApplication): Promise<void> {
  return new Promise((resolve) => app.process().once('exit', () => resolve()))
}

/**
 * Drops files from the operating system onto the window at a point. The files are attached
 * through a real file input so they carry their on-disk paths, exactly like files dragged from
 * Windows File Explorer, and the drop is dispatched to whatever element is under the point.
 */
export async function dropExternalFiles(
  page: Page,
  files: string[],
  point: { x: number; y: number }
): Promise<void> {
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.id = 'e2e-file-input'
    input.style.display = 'none'
    document.body.appendChild(input)
  })
  await page.setInputFiles('#e2e-file-input', files)
  await page.evaluate(({ x, y }) => {
    const input = document.getElementById('e2e-file-input') as HTMLInputElement
    const data = new DataTransfer()
    for (const file of input.files ?? []) data.items.add(file)
    input.remove()
    const target = document.elementFromPoint(x, y)!
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          clientX: x,
          clientY: y
        })
      )
    }
  }, point)
}

/** HTML5 drag from an Explorer item (tree row or thumbnail tile) to a point in the window. */
export async function dragFromExplorer(
  source: Locator,
  point: { x: number; y: number }
): Promise<void> {
  await source.scrollIntoViewIfNeeded()
  await source.evaluate((element, { x, y }) => {
    const data = new DataTransfer()
    element.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data })
    )
    const target = document.elementFromPoint(x, y)!
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          clientX: x,
          clientY: y
        })
      )
    }
    element.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }))
  }, point)
}

/**
 * Opens a file in a separate, plain Electron window (no preload, default security) and returns
 * it as a Playwright page. Used to check exported documents in an independent browser context.
 */
export async function openInViewer(app: ElectronApplication, file: string): Promise<Page> {
  const [viewer] = await Promise.all([
    app.waitForEvent('window'),
    app.evaluate(({ BrowserWindow }, target) => {
      const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
      void window.loadFile(target)
    }, file)
  ])
  await viewer.waitForLoadState('load')
  return viewer
}

/** Types text into the focused editor, one key at a time, as a user would. */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text)
}

/** Creates an untitled document with `content` typed in, and leaves the editor focused. */
export async function newDocumentWith(page: Page, content = ''): Promise<void> {
  await page.keyboard.press(`${mod}+N`)
  await expect(page.locator('.tab.active')).toBeVisible()
  await focusEditor(page)
  if (content) await page.keyboard.insertText(content)
}

/**
 * The document's exact text. Saves it with Save As to `target` (the dialog is stubbed) and reads
 * the file back, so line endings and every character are verified, not just what is on screen.
 */
export async function saveAndRead(
  app: ElectronApplication,
  page: Page,
  target: string
): Promise<string> {
  await stubSaveDialog(app, target)
  await page.keyboard.press(`${mod}+Shift+S`)
  await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)
  return readFileSync(target, 'utf8')
}

/** Runs a command from the command palette by (part of) its title, checking the match first. */
export async function runPaletteCommand(
  page: Page,
  title: string,
  expected = title
): Promise<void> {
  await page.keyboard.press(`${mod}+Shift+P`)
  const input = page.getByTestId('palette-input')
  await expect(input).toBeVisible()
  await input.fill(title)
  await expect(page.locator('.palette-item.selected')).toContainText(expected)
  await page.keyboard.press('Enter')
  await expect(input).toBeHidden()
}

/**
 * Gives the source editor keyboard focus while a modal dialog covers it. A real click would hit
 * the dialog backdrop, so the mouse events are dispatched to the editor directly, which is how
 * Monaco takes focus.
 */
export async function focusEditorBehindDialog(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = document.querySelector('.monaco-editor .view-lines')!
    const box = target.getBoundingClientRect()
    for (const type of ['mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === 'mousedown' ? 1 : 0,
          clientX: box.left + 5,
          clientY: box.top + 5
        })
      )
    }
  })
}

/** Clicks a native menu item by its menu and item labels (ampersands in labels are ignored). */
export async function clickMenuItem(
  app: ElectronApplication,
  menu: string,
  ...path: string[]
): Promise<void> {
  await app.evaluate(
    ({ Menu, BrowserWindow }, [menuLabel, ...items]) => {
      const clean = (label: string) => label.replace('&', '')
      let current = Menu.getApplicationMenu()!.items.find((i) => clean(i.label) === menuLabel)
      for (const label of items) {
        current = current?.submenu?.items.find((i) => clean(i.label) === label)
      }
      if (!current) throw new Error(`Menu item not found: ${[menuLabel, ...items].join(' > ')}`)
      current.click(undefined, BrowserWindow.getAllWindows()[0], undefined as never)
    },
    [menu, ...path]
  )
}

/**
 * Exports through the Export dialog: opens it for the format, optionally adjusts it, and starts
 * the export (the save dialog is stubbed by the caller).
 */
export async function exportViaDialog(
  page: Page,
  format: 'pdf' | 'html',
  adjust?: (dialog: Locator) => Promise<void>
): Promise<void> {
  await page.getByRole('button', { name: format === 'pdf' ? 'Export as PDF' : 'Export as HTML' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId(`export-format-${format}`)).toHaveAttribute('aria-checked', 'true')
  if (adjust) await adjust(dialog)
  await dialog.getByTestId('export-run').click()
}
