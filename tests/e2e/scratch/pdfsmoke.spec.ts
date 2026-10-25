import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { closeApp, createSandbox, exportViaDialog, launchWithWorkspace, openFromTree, stubSaveDialog } from '../helpers'
import { rasterizePdf, savePages } from '../support/pdfRaster'

test('smoke: report preset', async () => {
  const sandbox = createSandbox()
  writeFileSync(path.join(sandbox.workspace, 'long.md'), `# Quarterly Report

${Array.from({ length: 6 }, (_, i) => `## Section ${i + 1}\n\n${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(12)}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n\`\`\`mermaid\nflowchart LR\n  A --> B --> C\n\`\`\`\n\nInline $x^2$.\n`).join('\n')}
`)
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'long.md')
    const target = path.join(sandbox.base, 'out', 'long.pdf')
    mkdirSync(path.dirname(target), { recursive: true })
    await stubSaveDialog(app, target)
    await exportViaDialog(page, 'pdf', async (dialog) => {
      await dialog.getByTestId('export-preset').selectOption('professional-report')
      await page.waitForTimeout(1500)
      await page.screenshot({ path: path.join(sandbox.base, 'dialog.png') })
    })
    await expect(page.getByTestId('toast-success')).toBeVisible()
    const pages = await rasterizePdf(app, target)
    console.log('pages', pages.length, pages.map((p) => JSON.stringify(p.ink)))
    savePages(pages, '/tmp/claude-0/-home-user-markdown-studio/3bb4ef63-7c8b-5da0-839a-6595d2af2d04/scratchpad/pdf', 'long')
    writeFileSync('/tmp/claude-0/-home-user-markdown-studio/3bb4ef63-7c8b-5da0-839a-6595d2af2d04/scratchpad/dialog.png', readFileSync(path.join(sandbox.base, 'dialog.png')))
  } finally {
    await closeApp(app)
  }
})
