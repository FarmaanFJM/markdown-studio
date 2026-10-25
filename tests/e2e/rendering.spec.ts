import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  focusEditor,
  inPreview,
  ipcCalls,
  launchWithWorkspace,
  MIXED_DOCUMENT,
  mod,
  openFromTree,
  seedDocuments,
  tapIpc,
  waitForDiagrams
} from './helpers'

test('math and Mermaid render in the HTML preview, and the source stays exactly as written', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'mixed.md': MIXED_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'mixed.md')
    await waitForDiagrams(page, 1)

    const facts = await inPreview(page, (doc) => {
      const svg = doc.querySelector('figure.ms-diagram svg')
      const box = svg?.getBoundingClientRect()
      return {
        state: doc.querySelector('figure.ms-diagram')?.getAttribute('data-ms-state'),
        nodes: doc.querySelectorAll('figure.ms-diagram svg .node').length,
        labels: [...doc.querySelectorAll('figure.ms-diagram svg .nodeLabel, figure.ms-diagram svg text')]
          .map((n) => n.textContent)
          .join('|'),
        svgWidth: box?.width ?? 0,
        viewport: doc.documentElement.clientWidth,
        scrollWidth: doc.documentElement.scrollWidth,
        inlineMath: doc.querySelectorAll('p .katex').length,
        displayMath: doc.querySelectorAll('.katex-display').length,
        fractions: doc.querySelectorAll('.katex-display .mfrac').length,
        price: doc.querySelector('p')?.textContent ?? '',
        script: doc.querySelectorAll('script').length,
        sourceKept: doc.querySelector('.ms-diagram-source code')?.textContent ?? '',
        fontLoaded: [...doc.fonts].some((f) => f.family.startsWith('KaTeX') && f.status === 'loaded')
      }
    })
    expect(facts.state).toBe('ready')
    expect(facts.nodes).toBe(4)
    expect(facts.labels).toContain('Write')
    expect(facts.labels).toContain('Markdown')
    expect(facts.svgWidth).toBeGreaterThan(100)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.viewport)
    expect(facts.inlineMath).toBe(1)
    expect(facts.displayMath).toBe(1)
    expect(facts.fractions).toBe(1)
    expect(facts.price).toContain('$5 or $10')
    expect(facts.script).toBe(0)
    expect(facts.sourceKept).toContain('flowchart TD\n    A[Write Markdown] --> B[Live Preview]')
    expect(facts.fontLoaded).toBe(true)

    // Rendering never edits the Markdown.
    await focusEditor(page)
    await page.keyboard.press(`${mod}+End`)
    await expect(page.locator('.tab.active .tab-dirty, .tab.active .dirty')).toHaveCount(0)
  } finally {
    await closeApp(app)
  }
})

test('diagrams of every mainstream type render', async () => {
  const sandbox = createSandbox()
  const diagrams = {
    flowchart: 'flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[Done]\n  B -->|no| A',
    sequence: 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi',
    class: 'classDiagram\n  class Animal {\n    +String name\n    +speak() void\n  }\n  Animal <|-- Dog',
    state: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> [*]',
    er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : contains',
    gantt: 'gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Build\n  Task :a1, 2026-01-01, 5d',
    pie: 'pie title Share\n  "A" : 40\n  "B" : 60'
  }
  seedDocuments(sandbox, {
    'types.md': Object.values(diagrams)
      .map((d) => `\`\`\`mermaid\n${d}\n\`\`\`\n`)
      .join('\n')
  })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'types.md')
    await waitForDiagrams(page, Object.keys(diagrams).length)
    const states = await inPreview(page, (doc) =>
      [...doc.querySelectorAll('figure.ms-diagram')].map((f) => ({
        state: f.getAttribute('data-ms-state'),
        label: f.querySelector('svg')?.getAttribute('aria-roledescription') ?? '',
        width: f.querySelector('svg')?.getBoundingClientRect().width ?? 0
      }))
    )
    expect(states.map((s) => s.state)).toEqual(Object.keys(diagrams).map(() => 'ready'))
    for (const s of states) expect(s.width).toBeGreaterThan(50)
    expect(states.map((s) => s.label)).toEqual(
      expect.arrayContaining(['flowchart-v2', 'sequence', 'classDiagram', 'stateDiagram', 'er', 'gantt', 'pie'])
    )
  } finally {
    await closeApp(app)
  }
})

test('a malformed diagram or equation shows an explained error and never breaks the rest', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, {
    'broken.md': `# Broken

Before the diagram.

\`\`\`mermaid
flowchart TD
    A -->
\`\`\`

Equation $\\frac{1}{$ in the middle, then $x^2$.

$$
\\undefinedcommand{x}
$$

\`\`\`mermaid
flowchart TD
    OK --> FINE
\`\`\`

After everything.
`
  })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'broken.md')
    await waitForDiagrams(page, 2)
    const facts = await inPreview(page, (doc) => ({
      states: [...doc.querySelectorAll('figure.ms-diagram')].map((f) => f.getAttribute('data-ms-state')),
      error: doc.querySelector('.ms-diagram-error')?.textContent ?? '',
      sourceLine: doc.querySelector('.ms-diagram-error')?.getAttribute('data-ms-source-line'),
      mathErrors: doc.querySelectorAll('.ms-math-error').length,
      mathOk: doc.querySelectorAll('.katex').length,
      text: doc.body.textContent ?? ''
    }))
    expect(facts.states).toEqual(['error', 'ready'])
    expect(facts.error).toContain('Diagram error')
    expect(facts.error).toMatch(/line \d+ of the document/)
    // The fence opens on line 5; mermaid reports the end of text after line 2 of the diagram.
    expect(facts.sourceLine).toBe('7')
    expect(facts.mathErrors).toBe(2)
    expect(facts.mathOk).toBeGreaterThanOrEqual(1)
    expect(facts.text).toContain('Before the diagram.')
    expect(facts.text).toContain('After everything.')

    // The problems are also listed in the editor and reachable with the keyboard.
    await expect
      .poll(() => page.evaluate(() => Number(document.querySelector('[data-testid="problem-warnings"]')?.textContent)))
      .toBeGreaterThanOrEqual(3)
    await focusEditor(page)
    await page.keyboard.press(`${mod}+Home`)
    await page.keyboard.press('F8')
    await expect(page.locator('.marker-widget, .zone-widget').first()).toBeVisible()

    // Clicking the error in the preview moves the editor to the diagram.
    await page.frameLocator('iframe.html-preview').locator('.ms-diagram-error').click()
    await expect(page.getByTestId('cursor-position')).toContainText('Ln 7')
  } finally {
    await closeApp(app)
  }
})

test('editing text does not redraw unchanged diagrams, and diagram edits are debounced', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'mixed.md': MIXED_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'mixed.md')
    await waitForDiagrams(page, 1)
    // Count the drawings requested from the isolated renderer from now on.
    await tapIpc(app, 'diagram:render')
    const svgBefore = await inPreview(page, (doc) => doc.querySelector('figure.ms-diagram svg')?.id ?? '')
    await focusEditor(page)
    await page.keyboard.press(`${mod}+Home`)
    await page.keyboard.type('Typing in prose, character by character. ', { delay: 15 })
    await expect
      .poll(() => inPreview(page, (doc) => doc.body.textContent?.includes('character by character') ?? false))
      .toBe(true)
    expect(await ipcCalls(app, 'diagram:render')).toBe(0)
    expect(await inPreview(page, (doc) => doc.querySelector('figure.ms-diagram svg')?.id ?? '')).toBe(svgBefore)

    // Edit the diagram: one quick burst of typing makes one drawing, not one per key.
    await page.getByText('Export HTML]').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('\n    D --> E[Archive]', { delay: 20 })
    await expect
      .poll(() => inPreview(page, (doc) => doc.querySelectorAll('figure.ms-diagram svg .node').length))
      .toBe(5)
    const drawn = await ipcCalls(app, 'diagram:render')
    expect(drawn).toBeGreaterThanOrEqual(1)
    expect(drawn).toBeLessThanOrEqual(2)
  } finally {
    await closeApp(app)
  }
})

test('math and diagram rendering can be switched off without changing the document', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'mixed.md': MIXED_DOCUMENT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'mixed.md')
    await waitForDiagrams(page, 1)
    await page.keyboard.press(`${mod}+,`)
    const panel = page.getByTestId('settings-panel')
    await panel.getByLabel('Render math').uncheck()
    await panel.getByLabel('Render Mermaid diagrams').uncheck()
    await expect
      .poll(() =>
        inPreview(page, (doc) => ({
          katex: doc.querySelectorAll('.katex').length,
          svg: doc.querySelectorAll('figure.ms-diagram svg').length,
          text: doc.body.textContent ?? ''
        }))
      )
      .toMatchObject({ katex: 0, svg: 0 })
    expect(await inPreview(page, (doc) => doc.body.textContent ?? '')).toContain('$e^{i\\pi} + 1 = 0$')
    expect(await inPreview(page, (doc) => doc.querySelector('pre code')?.textContent ?? '')).toContain('flowchart TD')
    await panel.getByLabel('Render math').check()
    await panel.getByLabel('Render Mermaid diagrams').check()
    await waitForDiagrams(page, 1)
    expect(await inPreview(page, (doc) => doc.querySelectorAll('.katex').length)).toBeGreaterThan(0)
  } finally {
    await closeApp(app)
  }
})

test('completion and commands support math, diagrams and page breaks', async () => {
  const sandbox = createSandbox()
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await page.keyboard.press(`${mod}+N`)
    await focusEditor(page)
    // Fenced block language list offers mermaid.
    await page.keyboard.type('```')
    await page.keyboard.press('Control+Space')
    await page.locator('.suggest-widget.visible').waitFor()
    await page.keyboard.type('merm')
    await expect(page.locator('.suggest-widget .monaco-list-row.focused')).toContainText('mermaid')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('```')
    await page.keyboard.press('Escape')
    await page.keyboard.press('ArrowUp')
    // Inside an empty mermaid block, starters are offered on request.
    await page.keyboard.press('Control+Space')
    await page.locator('.suggest-widget.visible').waitFor()
    await expect(page.locator('.suggest-widget')).toContainText('flowchart TD')
    await expect(page.locator('.suggest-widget')).toContainText('sequenceDiagram')
    await page.keyboard.press('Escape')
    // Ordinary code blocks stay quiet.
    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.type('```js\nlet x\n')
    await page.keyboard.press('Control+Space')
    await expect(page.locator('.suggest-widget.visible')).toHaveCount(0)

    // Commands are in the registry and the palette.
    await page.keyboard.press(`${mod}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.press(`${mod}+Shift+P`)
    await page.getByTestId('palette-input').fill('display equation')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.locator('.monaco-editor .view-lines').textContent()).toContain('$$')
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
  }
})
