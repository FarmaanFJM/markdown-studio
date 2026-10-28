import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  centreOf,
  closeApp,
  createSandbox,
  dragFromDisk,
  editorText,
  launchWithWorkspace,
  treeRow
} from './helpers'

const SCREENSHOTS = [
  'A - God of War Critical Health.png',
  'A - God of War Damage.png',
  'A - God of War Full Health.png',
  'B - Hades + God of War Critical Health.png',
  'B - Hades + God of War Damage.png',
  'B - Hades + God of War Full Health.png'
]

function pngBytes(seed: number): Buffer {
  const body = Buffer.alloc(4096)
  for (let i = 0; i < body.length; i++) body[i] = (i * 31 + seed * 7) & 0xff
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), body])
}

function makeArcanox(external: string): string {
  const folder = path.join(external, 'Arcanox Health UI System')
  mkdirSync(folder, { recursive: true })
  SCREENSHOTS.forEach((name, i) => writeFileSync(path.join(folder, name), pngBytes(i)))
  return folder
}

async function recordDragover(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __drag?: DragEvent }
    document.addEventListener('dragover', (e) => (w.__drag = e), true)
  })
}

async function lastDragover(page: Page): Promise<{ prevented: boolean; effect: string }> {
  return page.evaluate(
    () =>
      new Promise((resolve) =>
        setTimeout(() => {
          const e = (window as unknown as { __drag: DragEvent }).__drag
          resolve({ prevented: e.defaultPrevented, effect: e.dataTransfer!.dropEffect })
        }, 50)
      )
  )
}

test('dragging a folder from disk onto the Explorer imports it recursively at the project root', async () => {
  const sandbox = createSandbox()
  const source = makeArcanox(sandbox.external)
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await recordDragover(page)
    const tree = page.getByRole('tree', { name: 'Files' })
    const empty = await centreOf(tree)
    // Below the last row: the project root is the destination.
    await dragFromDisk(page, [source], { x: empty.x, y: empty.y + 150 }, 'hover')
    await expect(tree).toHaveClass(/drop-root/)
    // Accepted, not the "prohibited" state: cancelled with a copy effect (read once the event
    // has finished dispatching, after the application's handlers ran).
    expect(await lastDragover(page)).toEqual({ prevented: true, effect: 'copy' })

    await dragFromDisk(page, [source], { x: empty.x, y: empty.y + 150 }, 'drop')

    const folderRow = treeRow(page, 'Arcanox Health UI System')
    await expect(folderRow).toBeVisible()
    await expect(folderRow).toHaveAttribute('aria-selected', 'true')
    await expect(folderRow).toHaveAttribute('aria-expanded', 'true')
    for (const name of SCREENSHOTS) await expect(treeRow(page, name)).toBeVisible()
    await expect(page.getByTestId('toast-success')).toContainText('Arcanox Health UI System')

    const copy = path.join(sandbox.workspace, 'Arcanox Health UI System')
    expect(readdirSync(copy).sort()).toEqual([...SCREENSHOTS].sort())
    SCREENSHOTS.forEach((name, i) =>
      expect(readFileSync(path.join(copy, name)).equals(pngBytes(i))).toBe(true)
    )
    expect(existsSync(source)).toBe(true)
  } finally {
    await closeApp(app)
  }

  // Reopen the project: the imported folder is part of it.
  const again = await launchWithWorkspace(sandbox)
  try {
    await expect(treeRow(again.page, 'Arcanox Health UI System')).toBeVisible()
  } finally {
    await closeApp(again.app)
  }
})

test('hovering a folder highlights it and a drop lands inside that folder', async () => {
  const sandbox = createSandbox()
  const source = makeArcanox(sandbox.external)
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    const target = treeRow(page, 'assets')
    await dragFromDisk(page, [source], await centreOf(target), 'hover')
    await expect(target).toHaveClass(/drop-target/)
    await expect(page.getByRole('tree', { name: 'Files' })).not.toHaveClass(/drop-root/)

    await dragFromDisk(page, [source], await centreOf(target), 'drop')
    await expect(treeRow(page, 'Arcanox Health UI System')).toBeVisible()
    expect(existsSync(path.join(sandbox.workspace, 'assets', 'Arcanox Health UI System'))).toBe(
      true
    )
    expect(existsSync(path.join(sandbox.workspace, 'Arcanox Health UI System'))).toBe(false)
    await expect(target).not.toHaveClass(/drop-target/)
  } finally {
    await closeApp(app)
  }
})

test('dropping several files, one with a clashing name, copies them without overwriting', async () => {
  const sandbox = createSandbox()
  const files = ['Team Photo (2024).png', 'architecture.png'].map((n) =>
    path.join(sandbox.external, n)
  )
  const before = readFileSync(path.join(sandbox.workspace, 'assets', 'architecture.png'))
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    const target = treeRow(page, 'assets')
    await dragFromDisk(page, files, await centreOf(target), 'drop')
    await expect(page.getByTestId('toast-info')).toContainText('architecture-1.png')
    const dir = path.join(sandbox.workspace, 'assets')
    expect(existsSync(path.join(dir, 'Team Photo (2024).png'))).toBe(true)
    expect(existsSync(path.join(dir, 'architecture-1.png'))).toBe(true)
    expect(readFileSync(path.join(dir, 'architecture.png')).equals(before)).toBe(true)
  } finally {
    await closeApp(app)
  }
})

test('a Markdown file dropped on the tab area is imported and opened, not pasted as text', async () => {
  const sandbox = createSandbox()
  const md = path.join(sandbox.external, 'Onderzoek Health UI.md')
  writeFileSync(md, '# Onderzoek\n\nHallo\n')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    // The tab strip only exists once a document is open.
    await treeRow(page, 'README.md').click()
    await dragFromDisk(page, [md], await centreOf(page.locator('.tabs-bar')), 'drop')
    await expect(
      page.getByTestId('tab').filter({ hasText: 'Onderzoek Health UI.md' })
    ).toBeVisible()
    expect(readFileSync(path.join(sandbox.workspace, 'Onderzoek Health UI.md'), 'utf8')).toBe(
      '# Onderzoek\n\nHallo\n'
    )
    await expect(treeRow(page, 'Onderzoek Health UI.md')).toBeVisible()
  } finally {
    await closeApp(app)
  }
})

test('areas that cannot take a drop are rejected instead of accepted', async () => {
  const sandbox = createSandbox()
  const source = makeArcanox(sandbox.external)
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    // The status bar accepts nothing: the window-level guard must refuse it.
    const bar = await centreOf(page.getByTestId('status-bar'))
    await recordDragover(page)
    await dragFromDisk(page, [source], bar, 'drop')
    expect(await lastDragover(page)).toEqual({ prevented: true, effect: 'none' })
    expect(existsSync(path.join(sandbox.workspace, 'Arcanox Health UI System'))).toBe(false)
  } finally {
    await closeApp(app)
  }
})

test('a Markdown file dropped into the editor opens as a document instead of inserting its text', async () => {
  const sandbox = createSandbox()
  const md = path.join(sandbox.external, 'Leerdoel 1.md')
  writeFileSync(md, '# Leerdoel 1\n')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await treeRow(page, 'README.md').click()
    const before = await editorText(page)
    await dragFromDisk(page, [md], await centreOf(page.locator('.monaco-editor').first()), 'drop')
    await expect(page.getByTestId('tab').filter({ hasText: 'Leerdoel 1.md' })).toBeVisible()
    await treeRow(page, 'README.md').click()
    // The switch back to README is asynchronous; wait for it instead of reading mid-switch.
    await expect.poll(() => editorText(page)).toBe(before)
  } finally {
    await closeApp(app)
  }
})

test('an image dropped into a document is stored in the project and still resolves after reopening', async () => {
  const sandbox = createSandbox()
  const image = path.join(sandbox.external, 'architecture.png')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await treeRow(page, 'README.md').click()
    await dragFromDisk(
      page,
      [image],
      await centreOf(page.locator('.monaco-editor').first()),
      'drop'
    )
    await expect.poll(async () => editorText(page)).toContain('assets/architecture')
    await page.keyboard.press('Control+S')
    await expect(page.getByTestId('toast-success')).toContainText('into the project')
  } finally {
    await closeApp(app)
  }
  const saved = readFileSync(path.join(sandbox.workspace, 'README.md'), 'utf8')
  const reference = /!\[[^\]]*\]\(<?([^)>]+)>?\)/.exec(saved)![1]
  expect(existsSync(path.join(sandbox.workspace, reference))).toBe(true)
})
