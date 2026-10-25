import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  editorText,
  focusEditor,
  goToLine,
  inPreview,
  launchEditing,
  mod,
  newDocumentWith,
  openFromTree,
  runPaletteCommand,
  saveAndRead
} from './helpers'

const OUTLINE_DOC = [
  '# Project',
  '',
  '## Introduction',
  '',
  '```bash',
  '# not a heading',
  '## nor this',
  '```',
  '',
  '## Installation',
  '',
  '### Windows',
  '',
  '### Linux',
  '',
  'Setext Title',
  '------------',
  '',
  '## Configuration',
  ''
].join('\n')

const items = (page: import('@playwright/test').Page) => page.getByTestId('outline-item')

test('shows the heading hierarchy, ignores code, and navigates on click', async () => {
  const sandbox = createSandbox()
  writeFileSync(path.join(sandbox.workspace, 'outline.md'), OUTLINE_DOC)
  const { app, page } = await launchEditing(sandbox)
  try {
    await expect(page.getByTestId('outline')).toContainText('Open a Markdown document')
    await openFromTree(page, 'outline.md')

    await expect(items(page)).toHaveText([
      /H1\s*Project/,
      /H2\s*Introduction/,
      /H2\s*Installation/,
      /H3\s*Windows/,
      /H3\s*Linux/,
      /H2\s*Setext Title/,
      /H2\s*Configuration/
    ])
    const levels = await items(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-level'))
    )
    expect(levels).toEqual(['1', '2', '2', '3', '3', '2', '2'])

    await items(page).filter({ hasText: 'Windows' }).click()
    await expect(page.getByTestId('cursor-position')).toHaveText('Ln 12, Col 1')
    await expect(items(page).filter({ hasText: 'Windows' })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    // The heading under the cursor is tracked as the cursor moves.
    await goToLine(page, 19)
    await expect(items(page).filter({ hasText: 'Configuration' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  } finally {
    await closeApp(app)
  }
})

test('groups collapse and expand, with keyboard support', async () => {
  const sandbox = createSandbox()
  writeFileSync(path.join(sandbox.workspace, 'outline.md'), OUTLINE_DOC)
  const { app, page } = await launchEditing(sandbox)
  try {
    await openFromTree(page, 'outline.md')
    const installation = items(page).filter({ hasText: 'Installation' })
    await expect(installation).toHaveAttribute('aria-expanded', 'true')
    await installation.getByRole('button', { name: 'Collapse' }).click()
    await expect(items(page).filter({ hasText: 'Windows' })).toHaveCount(0)
    await expect(installation).toHaveAttribute('aria-expanded', 'false')

    await installation.focus()
    await page.keyboard.press('ArrowRight')
    await expect(items(page).filter({ hasText: 'Windows' })).toHaveCount(1)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('cursor-position')).toHaveText('Ln 12, Col 1')
  } finally {
    await closeApp(app)
  }
})

test('updates while typing and works with the preview hidden', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await page.keyboard.press(`${mod}+Shift+V`)
    await expect(page.getByTestId('preview-panel')).toBeHidden()
    await newDocumentWith(page, '# One')
    await expect(items(page)).toHaveCount(1)
    await page.keyboard.press('Enter')
    await page.keyboard.type('## Two')
    await expect(items(page)).toHaveText([/One/, /Two/])
    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.type('# Replaced')
    await expect(items(page)).toHaveText([/Replaced/])

    await page.getByTestId('outline-toggle').click()
    await expect(page.getByTestId('outline')).toBeHidden()
  } finally {
    await closeApp(app)
  }
})

test('Go to Heading picks a heading from the palette', async () => {
  const sandbox = createSandbox()
  writeFileSync(path.join(sandbox.workspace, 'outline.md'), OUTLINE_DOC)
  const { app, page } = await launchEditing(sandbox)
  try {
    await openFromTree(page, 'outline.md')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+Shift+O`)
    const input = page.getByTestId('palette-input')
    await expect(input).toBeVisible()
    await input.fill('linux')
    await expect(page.locator('.palette-item.selected')).toContainText('Linux')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('cursor-position')).toHaveText('Ln 14, Col 1')
  } finally {
    await closeApp(app)
  }
})

const TOC_DOC = [
  '# Guide',
  '',
  'Intro text that must not change.',
  '',
  '## Contents',
  '',
  '<!-- markdown-studio:toc:start -->',
  '',
  '- [Old entry](#old)',
  '',
  '<!-- markdown-studio:toc:end -->',
  '',
  '## Install',
  '',
  '### Windows',
  '',
  '## Usage',
  '',
  '```md',
  '## Not a heading',
  '```',
  '',
  '## Usage',
  '',
  'Final paragraph.',
  ''
].join('\n')

test('inserts a table of contents whose links match the preview anchors', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchEditing(sandbox)
  try {
    await newDocumentWith(
      page,
      '# Project\n\n## Installation\n\n### Windows\n\n### Linux\n\n## Usage\n\n## Usage\n\n'
    )
    await page.keyboard.press(`${mod}+Home`)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await runPaletteCommand(page, 'Insert Table of Contents')
    const saved = await saveAndRead(app, page, path.join(sandbox.workspace, 'toc.md'))
    expect(saved).toContain(
      [
        '<!-- markdown-studio:toc:start -->',
        '',
        '- [Installation](#installation)',
        '  - [Windows](#windows)',
        '  - [Linux](#linux)',
        '- [Usage](#usage)',
        '- [Usage](#usage-1)',
        '',
        '<!-- markdown-studio:toc:end -->'
      ].join('\n')
    )
    // Every generated link points at a heading the preview renders with that id. The preview
    // refreshes shortly after edits, so wait for it instead of reading it once.
    await expect
      .poll(() =>
        inPreview(page, (doc) =>
          [...doc.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href'))
        )
      )
      .toEqual(['#installation', '#windows', '#linux', '#usage', '#usage-1'])
    const rendered = await inPreview(page, (doc) =>
      ['installation', 'windows', 'linux', 'usage', 'usage-1'].map(
        (id) => doc.getElementById(id) !== null
      )
    )
    expect(rendered).toEqual([true, true, true, true, true])
  } finally {
    await closeApp(app)
  }
})

test('updating changes only the managed region', async () => {
  const sandbox = createSandbox()
  const file = path.join(sandbox.workspace, 'guide.md')
  writeFileSync(file, TOC_DOC.replace(/\n/g, '\r\n'))
  const { app, page } = await launchEditing(sandbox)
  try {
    await openFromTree(page, 'guide.md')
    await focusEditor(page)
    await runPaletteCommand(page, 'Update Table of Contents')
    await expect.poll(() => editorText(page)).toContain('- [Install](#install)')
    await page.keyboard.press(`${mod}+S`)
    await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)

    const expected = TOC_DOC.replace(
      '- [Old entry](#old)',
      [
        '- [Contents](#contents)',
        '- [Install](#install)',
        '  - [Windows](#windows)',
        '- [Usage](#usage)',
        '- [Usage](#usage-1)'
      ].join('\n')
    ).replace(/\n/g, '\r\n')
    // "Contents" lists itself only when it is not the title directly above the markers.
    const actual = readFileSync(file, 'utf8')
    const withoutOwnTitle = expected.replace('- [Contents](#contents)\r\n', '')
    expect(actual).toBe(withoutOwnTitle)

    // Running it again changes nothing.
    await runPaletteCommand(page, 'Update Table of Contents')
    await expect(page.getByTestId('toast-info')).toContainText('already up to date')
  } finally {
    await closeApp(app)
  }
})
