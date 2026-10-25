import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  focusEditor,
  goToLine,
  launchWithWorkspace,
  mod,
  openFromTree,
  runPaletteCommand,
  treeRow
} from './helpers'

/**
 * Captures the screenshots used in the documentation from the real application.
 * Run with `npm run screenshots`; the spec is skipped in ordinary test runs.
 */
const OUTPUT = path.resolve(__dirname, '../../docs/screenshots')
test.skip(!process.env.CAPTURE_SCREENSHOTS, 'Only runs when capturing documentation screenshots.')

const GUIDE = `# Project Atlas

Project Atlas is a small documentation set used to try out Markdown Studio.

## Contents

<!-- markdown-studio:toc:start -->

- [Overview](#overview)
- [Installation](#installation)
  - [Windows](#windows)
  - [Linux](#linux)
- [Configuration](#configuration)

<!-- markdown-studio:toc:end -->

## Overview

|Service|Language|Port|
|---|:-:|--:|
|Gateway|TypeScript|8080|
|Indexer|Rust|9000|
|Reporting|Python|7000|

See the [user guide](docs/guide.md) and the [roadmap](#configuration).

## Installation

### Windows

1. Download the installer.
2. Run it and follow the prompts.

### Linux

- [x] Install the package
- [ ] Start the service

## Configuration

![Architecture](assets/architecture.png)
`

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(OUTPUT, { recursive: true })
  await page.screenshot({ path: path.join(OUTPUT, name) })
}

test('captures the Phase 2 screenshots', async () => {
  test.setTimeout(240_000)
  const sandbox = createSandbox()
  writeFileSync(path.join(sandbox.workspace, 'Atlas Guide.md'), GUIDE)
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.setViewportSize({ width: 1360, height: 860 })
    await openFromTree(page, 'Atlas Guide.md')
    await page.waitForTimeout(800)
    await shot(page, 'outline-and-toc.png')

    // IntelliSense on an empty line below the table.
    await focusEditor(page)
    await goToLine(page, 25)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Control+Space')
    await page.locator('.suggest-widget.visible').waitFor()
    await page.waitForTimeout(400)
    await shot(page, 'intellisense.png')
    await page.keyboard.press('Escape')
    await page.keyboard.press(`${mod}+Z`)
    await page.keyboard.press(`${mod}+Z`)

    // The table editor.
    await goToLine(page, 21)
    await runPaletteCommand(page, 'Edit Table Visually')
    await page.getByRole('dialog', { name: 'Edit Table' }).waitFor()
    await page.getByLabel('Row 1, column 1').focus()
    await page.waitForTimeout(300)
    await shot(page, 'table-editor.png')
    await page.keyboard.press('Escape')

    // The command palette.
    await page.keyboard.press(`${mod}+Shift+P`)
    await page.getByTestId('palette-input').fill('table')
    await page.waitForTimeout(300)
    await shot(page, 'command-palette.png')
    await page.keyboard.press('Escape')

    // Templates.
    await page.keyboard.press(`${mod}+Shift+N`)
    await page.getByTestId('template-list').waitFor()
    await page
      .getByTestId('template-list')
      .getByRole('option', { name: /^README/ })
      .click()
    await page.waitForTimeout(300)
    await shot(page, 'templates.png')
    await page.keyboard.press('Escape')

    // Problems: a broken link, a missing image and a malformed table.
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.type(
      '\n\nSee [the changelog](CHANGELOG.md) and ![diagram](assets/missing.png).\n\n| a | b | c |\n|---|---|\n| 1 | 2 | 3 |\n'
    )
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="problem-warnings"]')?.textContent) >= 2
    )
    await page.waitForTimeout(500)
    await shot(page, 'problems.png')

    // Reference-aware rename.
    await treeRow(page, 'assets').click()
    await treeRow(page, 'architecture.png').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename…' }).click()
    await page.getByLabel('New name').fill('system-architecture.png')
    await page.keyboard.press('Enter')
    await page.getByRole('dialog', { name: 'Rename and Update References' }).waitFor()
    await page.waitForTimeout(300)
    await shot(page, 'rename-references.png')
    await page.getByRole('button', { name: 'Cancel' }).click()
  } finally {
    await closeApp(app)
  }
})
