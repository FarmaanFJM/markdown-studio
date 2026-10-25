import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  editorText,
  focusEditor,
  goToLine,
  launchWithWorkspace,
  mod,
  newDocumentWith,
  openFromTree,
  runPaletteCommand
} from './helpers'

const suggestions = (page: Page) =>
  page.locator('.suggest-widget.visible .monaco-list-row .label-name')

/**
 * Types the start of a link such as `[text](docs/` and leaves the cursor inside the parentheses.
 * Monaco closes brackets only sometimes (it depends on how far tokenization has got), so the
 * closing parenthesis is typed explicitly and the cursor stepped back in front of it.
 */
async function typeLink(page: Page, opening: string, typed = ''): Promise<void> {
  await page.keyboard.type(`${opening}()`)
  await page.keyboard.press('ArrowLeft')
  if (typed) await page.keyboard.type(typed)
}

async function endOfDocument(page: Page): Promise<void> {
  await focusEditor(page)
  await page.keyboard.press(`${mod}+End`)
}

test.describe('path and anchor completion', () => {
  test('suggests files and folders relative to the document', async () => {
    const sandbox = createSandbox()
    mkdirSync(path.join(sandbox.workspace, 'docs', 'api'))
    writeFileSync(path.join(sandbox.workspace, 'docs', 'api', 'rest.md'), '# REST\n')
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await newDocumentWith(page)
      await typeLink(page, '[Documentation]', 'docs/')
      await expect(suggestions(page).filter({ hasText: 'guide.md' })).toBeVisible()
      await expect(suggestions(page).filter({ hasText: 'api/' })).toBeVisible()
      await page.keyboard.type('gu')
      await expect(suggestions(page)).toHaveCount(1)
      await page.keyboard.press('Enter')
      await expect.poll(() => editorText(page)).toBe('[Documentation](docs/guide.md)')

      // A folder is completed with a slash and the list continues inside it.
      await page.keyboard.press(`${mod}+A`)
      await page.keyboard.press('Delete')
      await typeLink(page, '[API]', 'docs/a')
      await page.keyboard.press('Control+Space')
      await expect(suggestions(page).filter({ hasText: 'api/' })).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(suggestions(page).filter({ hasText: 'rest.md' })).toBeVisible()
      await page.keyboard.press('Enter')
      await expect.poll(() => editorText(page)).toBe('[API](docs/api/rest.md)')
    } finally {
      await closeApp(app)
    }
  })

  test('is relative to the folder of the document that is being edited', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await openFromTree(page, 'docs', 'guide.md')
      await endOfDocument(page)
      await page.keyboard.press('Enter')
      await typeLink(page, '![Diagram]')
      await page.keyboard.press('Control+Space')
      // Images anywhere in the workspace are offered with the right relative path.
      await expect(
        suggestions(page).filter({ hasText: '../assets/architecture.png' })
      ).toBeVisible()
      await page.keyboard.type('../assets/arch')
      await expect(suggestions(page)).toHaveCount(1)
      await page.keyboard.press('Enter')
      await expect.poll(() => editorText(page)).toContain('![Diagram](../assets/architecture.png)')
    } finally {
      await closeApp(app)
    }
  })

  test('image suggestions list only images, with spaces and Unicode names handled', async () => {
    const sandbox = createSandbox()
    for (const name of ['Team Photo (2024).png', 'naïve-café_überblick.png']) {
      copyFileSync(path.join(sandbox.external, name), path.join(sandbox.workspace, 'assets', name))
    }
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await newDocumentWith(page)
      await typeLink(page, '![Photo]', 'assets/')
      await expect(suggestions(page).filter({ hasText: 'Team Photo (2024).png' })).toBeVisible()
      await expect(suggestions(page).filter({ hasText: 'notes.txt' })).toHaveCount(0)
      await page.keyboard.type('Team')
      await page.keyboard.press('Enter')
      await expect.poll(() => editorText(page)).toBe('![Photo](<assets/Team Photo (2024).png>)')

      await page.keyboard.press(`${mod}+A`)
      await page.keyboard.press('Delete')
      await typeLink(page, '![Unicode]', 'assets/na')
      await page.keyboard.press('Control+Space')
      await expect(suggestions(page)).toHaveCount(1)
      await page.keyboard.press('Enter')
      await expect.poll(() => editorText(page)).toBe('![Unicode](assets/naïve-café_überblick.png)')
    } finally {
      await closeApp(app)
    }
  })

  test('suggests heading anchors for this document and for another file', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await newDocumentWith(page, '# Intro\n\n## Setup Steps\n\nSee [steps](#')
      await expect(suggestions(page).filter({ hasText: 'Setup Steps' })).toBeVisible()
      await page.keyboard.type('setup')
      await page.keyboard.press('Enter')
      await expect.poll(() => editorText(page)).toContain('See [steps](#setup-steps')

      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await typeLink(page, '[guide]', 'docs/guide.md#')
      await expect(suggestions(page).filter({ hasText: 'Installation' })).toBeVisible()
      await page.keyboard.type('inst')
      await expect(suggestions(page)).toHaveCount(1)
      await page.keyboard.press('Enter')
      await expect.poll(() => editorText(page)).toContain('[guide](docs/guide.md#installation)')
    } finally {
      await closeApp(app)
    }
  })

  test('does not suggest paths outside links, or inside code', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await newDocumentWith(page)
      await page.keyboard.type('plain text (docs/')
      await expect(page.locator('.suggest-widget.visible')).toBeHidden()
      await page.keyboard.press('Enter')
      await page.keyboard.type('```')
      await page.keyboard.press('Enter')
      await typeLink(page, '[x]', 'docs/')
      await expect(page.locator('.suggest-widget.visible')).toBeHidden()
    } finally {
      await closeApp(app)
    }
  })
})

test.describe('reference validation', () => {
  const warnings = (page: Page) => page.getByTestId('problem-warnings')

  test('flags missing files, images and anchors but not valid references', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await openFromTree(page, 'README.md')
      // The fixture README only has valid links, images and anchors.
      await expect(warnings(page)).toHaveText('0')

      await newDocumentWith(
        page,
        [
          '# Doc',
          '',
          '[missing](nowhere.md) ![gone](assets/gone.png) [bad anchor](#nope)',
          '[ok file](docs/guide.md) [ok anchor](#doc) ![ok](assets/architecture.png)',
          '[web](https://example.com/does-not-exist) [mail](mailto:a@b.c) [folder](docs/)',
          '[guide anchor](docs/guide.md#nonsense)'
        ].join('\n')
      )
      await expect(warnings(page)).toHaveText('4')

      await page.getByTestId('problems').click()
      await expect(page.locator('.marker-widget, .zone-widget').first()).toBeVisible()
      await expect(page.locator('.marker-widget, .zone-widget').first()).toContainText(
        /of \d+ problems/
      )
    } finally {
      await closeApp(app)
    }
  })

  test('uses the same path rules as the preview, including spaces and encoded names', async () => {
    const sandbox = createSandbox()
    copyFileSync(
      path.join(sandbox.external, 'Team Photo (2024).png'),
      path.join(sandbox.workspace, 'assets', 'Team Photo (2024).png')
    )
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await newDocumentWith(
        page,
        '![a](<assets/Team Photo (2024).png>) ![b](assets/Team%20Photo%20(2024).png) ![c](/assets/architecture.png)'
      )
      await expect(warnings(page)).toHaveText('0')
      await page.keyboard.press(`${mod}+A`)
      await page.keyboard.insertText('![d](assets/Team Photo 2024.png)')
      await expect(warnings(page)).toHaveText('0') // not a link: the space ends the destination
      await page.keyboard.press(`${mod}+A`)
      await page.keyboard.insertText('![d](<assets/Team Photo 2024.png>)')
      await expect(warnings(page)).toHaveText('1')
    } finally {
      await closeApp(app)
    }
  })

  test('offers a safe fix for a moved file and applies it as one undoable edit', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await newDocumentWith(page, 'Read [the guide](old/guide.md#installation).')
      await expect(warnings(page)).toHaveText('1')
      await page.keyboard.press(`${mod}+Home`)
      for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight')
      await page.keyboard.press(`${mod}+.`)
      const action = page.locator('.action-widget .action').first()
      await expect(action).toContainText('Change to "docs/guide.md"')
      await page.keyboard.press('Enter')
      await expect
        .poll(() => editorText(page))
        .toBe('Read [the guide](docs/guide.md#installation).')
      await expect(warnings(page)).toHaveText('0')
      await page.keyboard.press(`${mod}+Z`)
      await expect.poll(() => editorText(page)).toBe('Read [the guide](old/guide.md#installation).')
    } finally {
      await closeApp(app)
    }
  })

  test('revalidates when files appear or disappear on disk', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await newDocumentWith(page, '[later](later.md)')
      await expect(warnings(page)).toHaveText('1')
      writeFileSync(path.join(sandbox.workspace, 'later.md'), '# Later\n')
      await expect(warnings(page)).toHaveText('0')
    } finally {
      await closeApp(app)
    }
  })

  test('reports tables the renderer would not display as written', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await newDocumentWith(page, '| a | b | c |\n|---|---|\n| 1 | 2 | 3 |\n')
      await expect(warnings(page)).toHaveText('1')
      await goToLine(page, 1)
      await page.getByTestId('problems').click()
      await expect(page.locator('.marker-widget, .zone-widget').first()).toContainText(
        'not rendered as a table'
      )
    } finally {
      await closeApp(app)
    }
  })
})

test.describe('style checks', () => {
  const notes = (page: Page) => page.getByTestId('problem-notes')

  test('reports spacing problems as notes and fixes them on request', async () => {
    const sandbox = createSandbox()
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await newDocumentWith(page, '# Title\n\n\nText   \n## Next\n')
      await expect(notes(page)).not.toHaveText('0 notes')
      await runPaletteCommand(page, 'Fix All Automatic Style Problems')
      await expect.poll(() => editorText(page)).toBe('# Title\n\nText\n\n## Next\n')
      await expect(notes(page)).toHaveText('0 notes')
      await page.keyboard.press(`${mod}+Z`)
      await expect.poll(() => editorText(page)).toBe('# Title\n\n\nText   \n## Next\n')
    } finally {
      await closeApp(app)
    }
  })

  test('does not rewrite the document just because a warning is shown', async () => {
    const sandbox = createSandbox()
    const file = path.join(sandbox.workspace, 'untidy.md')
    const text = '# Title\n\n\nText   \n'
    writeFileSync(file, text)
    const { app, page } = await launchWithWorkspace(sandbox)
    try {
      await openFromTree(page, 'untidy.md')
      await expect(notes(page)).not.toHaveText('0 notes')
      await expect(page.locator('.tab.active')).not.toHaveClass(/dirty/)
      expect(readFileSync(file, 'utf8')).toBe(text)
    } finally {
      await closeApp(app)
    }
  })
})
