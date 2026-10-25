import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  editorText,
  focusEditor,
  launch,
  launchWithWorkspace,
  mod,
  newDocumentWith,
  openFromTree,
  runPaletteCommand,
  treeRow
} from './helpers'

const today = () => {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const templateItem = (page: Page, name: string) =>
  page.getByTestId('template-list').getByRole('option', { name: new RegExp(`^${name}`) })

async function openTemplates(page: Page, via = 'New File from Template'): Promise<void> {
  await runPaletteCommand(page, via, via)
  await expect(page.getByTestId('template-list')).toBeVisible()
}

test('lists the built-in templates and creates a document with expanded variables', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.keyboard.press(`${mod}+Shift+N`)
    const list = page.getByTestId('template-list')
    await expect(list).toBeVisible()
    for (const name of [
      'Blank document',
      'README',
      'Technical documentation',
      'Project notes',
      'Meeting notes',
      'Report'
    ]) {
      await expect(templateItem(page, name)).toBeVisible()
    }
    await templateItem(page, 'Meeting notes').click()
    await expect(page.getByTestId('template-preview')).toContainText('## Action items')
    await page.getByTestId('template-use').click()

    const form = dialog(page, 'New Document: Meeting notes')
    await expect(form).toBeVisible()
    // A title is required because the template uses it; the author is optional.
    await form.getByTestId('new-document-create').click()
    await expect(form.getByRole('alert')).toContainText('Enter a title')
    await form.getByLabel('Title').fill('Weekly sync')
    await expect(form.getByLabel(/File name/)).toHaveValue('Weekly sync.md')
    await form.getByLabel('Author').fill('Ana Silva')
    await form.getByTestId('new-document-create').click()
    await expect(form).toBeHidden()

    await expect(page.locator('.tab.active .tab-label')).toHaveText('Weekly sync.md')
    const file = path.join(sandbox.workspace, 'Weekly sync.md')
    const content = readFileSync(file, 'utf8')
    expect(content).toContain('# Weekly sync')
    expect(content).toMatch(new RegExp(`- \\*\\*Date:\\*\\* ${today()} \\d\\d:\\d\\d`))
    expect(content).toContain('- **Facilitator:** Ana Silva')
    expect(content).not.toContain('{{')
    // {{cursor}} became the caret position on the first agenda item, not literal text.
    await expect(page.getByTestId('cursor-position')).toHaveText('Ln 9, Col 4')
    await page.keyboard.type('Budget')
    await expect.poll(() => editorText(page)).toContain('1. BudgetFirst topic')

    // The name typed once is offered again next time (never filled in on its own before that).
    await page.keyboard.press(`${mod}+Shift+N`)
    await templateItem(page, 'Report').click()
    await page.getByTestId('template-use').click()
    await expect(dialog(page, 'New Document: Report').getByLabel('Author')).toHaveValue('Ana Silva')
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
  }
})

test('the author is remembered but never invented, and can be left empty', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.keyboard.press(`${mod}+Shift+N`)
    await templateItem(page, 'Report').click()
    await page.getByTestId('template-use').click()
    const form = dialog(page, 'New Document: Report')
    await expect(form.getByLabel('Author')).toHaveValue('')
    await form.getByLabel('Title').fill('Q3 results')
    await form.getByTestId('new-document-create').click()
    await expect(form).toBeHidden()
    const content = readFileSync(path.join(sandbox.workspace, 'Q3 results.md'), 'utf8')
    expect(content).toContain('**Prepared by:**\n')
    expect(content).not.toMatch(/Prepared by:\*\* \S/)
  } finally {
    await closeApp(app)
  }
})

test('cancelling creates nothing, and an existing document is never overwritten', async () => {
  const sandbox = createSandbox()
  const existing = path.join(sandbox.workspace, 'README.md')
  const original = readFileSync(existing, 'utf8')
  const before = readdirSync(sandbox.workspace).sort()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.keyboard.press(`${mod}+Shift+N`)
    await templateItem(page, 'Project notes').click()
    await page.getByTestId('template-use').click()
    const form = dialog(page, 'New Document: Project notes')
    await form.getByLabel('Title').fill('Draft')
    await form.getByRole('button', { name: 'Cancel' }).click()
    await expect(form).toBeHidden()
    expect(readdirSync(sandbox.workspace).sort()).toEqual(before)
    await expect(page.locator('.tab')).toHaveCount(0)

    await page.keyboard.press(`${mod}+Shift+N`)
    await templateItem(page, 'Blank document').click()
    await page.getByTestId('template-use').click()
    const blank = dialog(page, 'New Document: Blank document')
    await blank.getByLabel(/File name/).fill('README.md')
    await blank.getByTestId('new-document-create').click()
    await expect(blank.getByRole('alert')).toContainText('already exists')
    expect(readFileSync(existing, 'utf8')).toBe(original)
    await blank.getByLabel(/File name/).fill('Fresh.md')
    await blank.getByTestId('new-document-create').click()
    await expect(blank).toBeHidden()
    expect(existsSync(path.join(sandbox.workspace, 'Fresh.md'))).toBe(true)
  } finally {
    await closeApp(app)
  }
})

test('creates the document in the folder selected in the Explorer', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await treeRow(page, 'docs').click()
    await page.keyboard.press(`${mod}+Shift+N`)
    await templateItem(page, 'README').click()
    await page.getByTestId('template-use').click()
    const form = dialog(page, 'New Document: README')
    await expect(form.getByLabel(/File name in docs/)).toBeVisible()
    await form.getByLabel('Title').fill('Docs readme')
    await form.getByTestId('new-document-create').click()
    await expect(form).toBeHidden()
    expect(existsSync(path.join(sandbox.workspace, 'docs', 'Docs readme.md'))).toBe(true)
  } finally {
    await closeApp(app)
  }
})

test('saves the active document as a workspace template that survives a restart', async () => {
  const sandbox = createSandbox()
  let { app, page } = await launchWithWorkspace(sandbox)
  try {
    await newDocumentWith(page, '# {{title}}\n\nOwner: {{author}}\nCreated {{date}}\n\n{{cursor}}')
    await runPaletteCommand(page, 'Save Document as Template')
    const form = dialog(page, 'Save as Template')
    await form.getByLabel('Name').fill('Team page')
    await form.getByLabel('Description').fill('Owner and date header')
    await expect(form.getByLabel('Available in')).toHaveValue('workspace')
    await form.getByTestId('template-save').click()
    await expect(form).toBeHidden()
    await expect(page.getByTestId('toast-success')).toContainText('Saved "Team page"')

    const stored = path.join(sandbox.workspace, '.markdown-studio', 'templates', 'team-page.json')
    expect(JSON.parse(readFileSync(stored, 'utf8'))).toMatchObject({
      name: 'Team page',
      description: 'Owner and date header',
      kind: 'document'
    })
    // The metadata folder is not shown as ordinary files.
    await expect(treeRow(page, '.markdown-studio')).toHaveCount(0)
  } finally {
    await closeApp(app)
  }

  ;({ app, page } = await launchWithWorkspace(sandbox))
  try {
    await page.keyboard.press(`${mod}+Shift+N`)
    await expect(
      page.getByTestId('template-list').getByRole('group', { name: 'This folder' })
    ).toBeVisible()
    await templateItem(page, 'Team page').click()
    await page.getByTestId('template-use').click()
    const form = dialog(page, 'New Document: Team page')
    await form.getByLabel('Title').fill('Platform team')
    await form.getByLabel('Author').fill('Lee')
    await form.getByTestId('new-document-create').click()
    await expect(form).toBeHidden()
    expect(readFileSync(path.join(sandbox.workspace, 'Platform team.md'), 'utf8')).toBe(
      `# Platform team\n\nOwner: Lee\nCreated ${today()}\n\n`
    )
  } finally {
    await closeApp(app)
  }
})

test('global templates are available in every folder, workspace ones only in theirs', async () => {
  const sandbox = createSandbox()
  let { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openTemplates(page, 'Manage Templates and Snippets')
    await page.getByRole('button', { name: 'New Template…' }).click()
    const form = dialog(page, 'New Template')
    await form.getByLabel('Name').fill('Everywhere')
    await form.getByLabel('Available in').selectOption('global')
    await form.getByLabel('Content').fill('# Global {{title}}')
    await form.getByTestId('template-save').click()
    await expect(templateItem(page, 'Everywhere')).toBeVisible()

    await page.getByRole('button', { name: 'New Template…' }).click()
    await form.getByLabel('Name').fill('Only here')
    await form.getByLabel('Available in').selectOption('workspace')
    await form.getByLabel('Content').fill('# Local')
    await form.getByTestId('template-save').click()
    await expect(
      page.getByTestId('template-list').getByRole('group', { name: 'This folder' })
    ).toContainText('Only here')
    await expect(
      page.getByTestId('template-list').getByRole('group', { name: 'Global' })
    ).toContainText('Everywhere')
    expect(existsSync(path.join(sandbox.userData, 'templates', 'everywhere.json'))).toBe(true)
  } finally {
    await closeApp(app)
  }

  // No folder open: only global and built-in templates.
  ;({ app, page } = await launch(sandbox, { workspace: { restoreLastWorkspace: false } }))
  try {
    await page.keyboard.press(`${mod}+Shift+N`)
    await expect(templateItem(page, 'Everywhere')).toBeVisible()
    await expect(templateItem(page, 'Only here')).toHaveCount(0)
    await templateItem(page, 'Everywhere').click()
    await page.getByTestId('template-use').click()
    const creation = dialog(page, 'New Document: Everywhere')
    await expect(creation).toContainText('No folder is open')
    await creation.getByLabel('Title').fill('Loose')
    await creation.getByTestId('new-document-create').click()
    await expect(creation).toBeHidden()
    // An unsaved document with the expanded text; nothing was written to disk.
    await expect.poll(() => editorText(page)).toBe('# Global Loose')
    await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes')
  } finally {
    await closeApp(app)
  }
})

test('edits, duplicates and deletes templates, asking before deleting', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openTemplates(page, 'Manage Templates and Snippets')
    await page.getByRole('button', { name: 'New Template…' }).click()
    const form = dialog(page, 'New Template')
    await form.getByLabel('Name').fill('Weekly')
    await form.getByLabel('Content').fill('# Weekly')
    await form.getByTestId('template-save').click()
    await expect(templateItem(page, 'Weekly')).toBeVisible()

    // Rename by editing; the stored file keeps its id.
    await page.getByRole('button', { name: 'Edit…' }).click()
    await dialog(page, 'Edit Template').getByLabel('Name').fill('Weekly review')
    await dialog(page, 'Edit Template').getByTestId('template-save').click()
    await expect(templateItem(page, 'Weekly review')).toBeVisible()
    expect(
      JSON.parse(
        readFileSync(path.join(sandbox.workspace, '.markdown-studio/templates/weekly.json'), 'utf8')
      ).name
    ).toBe('Weekly review')

    await page.getByRole('button', { name: 'Duplicate' }).click()
    await expect(templateItem(page, 'Weekly review copy')).toBeVisible()

    // Built-in templates can be copied but not edited or deleted.
    await templateItem(page, 'README').click()
    await expect(page.getByRole('button', { name: 'Edit…' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Delete…' })).toBeDisabled()

    await templateItem(page, 'Weekly review copy').click()
    await page.getByRole('button', { name: 'Delete…' }).click()
    const confirm = dialog(page, 'Delete Template')
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(templateItem(page, 'Weekly review copy')).toBeVisible()
    await page.getByRole('button', { name: 'Delete…' }).click()
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(templateItem(page, 'Weekly review copy')).toHaveCount(0)
    await expect(templateItem(page, 'Weekly review')).toBeVisible()
  } finally {
    await closeApp(app)
  }
})

test('saved snippets are inserted from the palette, slash menu and completion list', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await newDocumentWith(page, 'Release checklist: ship it')
    await page.keyboard.press('Home')
    for (let i = 0; i < 17; i++) await page.keyboard.press('Shift+ArrowRight')
    await runPaletteCommand(page, 'Save Selection as Snippet or Template')
    const form = dialog(page, 'Save as Template')
    await expect(form.getByLabel('Type')).toHaveValue('snippet')
    await form.getByLabel('Name').fill('Sign-off')
    await form.getByTestId('template-save').click()
    await expect(form).toBeHidden()

    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await runPaletteCommand(page, 'Insert Saved Snippet')
    await templateItem(page, 'Sign-off').click()
    await page.getByTestId('template-use').click()
    await expect
      .poll(() => editorText(page))
      .toBe('Release checklist: ship it\n\nRelease checklist')

    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/sign')
    await expect(page.locator('.suggest-widget.visible')).toContainText('Sign-off')
    await page.keyboard.press('Enter')
    await expect.poll(() => editorText(page)).toMatch(/\n\nRelease checklist$/)
  } finally {
    await closeApp(app)
  }
})

test('local images are made portable on save and re-pointed for each new document', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'README.md')
    await runPaletteCommand(page, 'Save Document as Template')
    const form = dialog(page, 'Save as Template')
    await form.getByLabel('Name').fill('With image')
    await form.getByTestId('template-save').click()
    const choice = dialog(page, 'Local Files in This Template')
    await expect(choice).toContainText('assets/architecture.png')
    await choice.getByRole('button', { name: 'Make paths workspace-relative' }).click()
    await expect(choice).toBeHidden()

    const stored = JSON.parse(
      readFileSync(
        path.join(sandbox.workspace, '.markdown-studio/templates/with-image.json'),
        'utf8'
      )
    )
    expect(stored.body).toContain('![Architecture](/assets/architecture.png)')
    expect(stored.body).toContain('[user guide](/docs/guide.md)')

    // A new document two levels away still finds the image, and nothing is reported missing.
    await treeRow(page, 'docs').click()
    await page.keyboard.press(`${mod}+Shift+N`)
    await templateItem(page, 'With image').click()
    await page.getByTestId('template-use').click()
    const creation = dialog(page, 'New Document: With image')
    await expect(creation.getByTestId('new-document-missing')).toHaveCount(0)
    await creation.getByLabel('File name in docs').fill('copy.md')
    await creation.getByTestId('new-document-create').click()
    await expect(creation).toBeHidden()
    const copy = readFileSync(path.join(sandbox.workspace, 'docs', 'copy.md'), 'utf8')
    expect(copy).toContain('![Architecture](../assets/architecture.png)')
    expect(copy).toContain('[user guide](guide.md)')
  } finally {
    await closeApp(app)
  }
})

test('references that cannot be resolved are reported before the document is created', async () => {
  const sandbox = createSandbox()
  mkTemplate(sandbox, 'broken-refs', '# {{title}}\n\n![Missing](images/nowhere.png)\n')
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.keyboard.press(`${mod}+Shift+N`)
    await templateItem(page, 'Broken refs').click()
    await page.getByTestId('template-use').click()
    const creation = dialog(page, 'New Document: Broken refs')
    await expect(creation.getByTestId('new-document-missing')).toContainText('images/nowhere.png')
    await creation.getByLabel('Title').fill('Kept')
    await creation.getByTestId('new-document-create').click()
    await expect(creation).toBeHidden()
    expect(readFileSync(path.join(sandbox.workspace, 'Kept.md'), 'utf8')).toContain(
      '![Missing](images/nowhere.png)'
    )
  } finally {
    await closeApp(app)
  }
})

function mkTemplate(
  sandbox: { workspace: string },
  id: string,
  body: string,
  extra: Record<string, unknown> = {}
): void {
  const dir = path.join(sandbox.workspace, '.markdown-studio', 'templates')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
      description: '',
      kind: 'document',
      body,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...extra
    })
  )
}
