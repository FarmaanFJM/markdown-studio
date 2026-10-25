// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateCustomCss } from '@shared/presentation/css'
import { resolveTheme } from '@shared/presentation/theme'

const fake = vi.hoisted(() => {
  const state = { requests: [] as { id: string; source: string; variant: string; svgId: string }[] }
  const render = async (request: {
    id: string
    source: string
    variant: string
    svgId: string
  }) => {
    state.requests.push(request)
    if (request.source.includes('BROKEN')) {
      return {
        id: request.id,
        ok: false,
        message: 'Parse error on line 2:\n...A -->\nExpecting a node',
        line: 2
      }
    }
    const evil = request.source.includes('EVIL')
      ? '<script>alert(1)</script><rect onclick="alert(2)" width="1" height="1"/><image href="https://evil.example/a.png"/><style>@import "https://evil.example/x.css";.n{fill:red}</style>'
      : ''
    return {
      id: request.id,
      ok: true,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" id="${request.svgId}" viewBox="0 0 10 10" style="max-width:10px"><g id="${request.svgId}_g" class="n">${evil}<text>${request.variant}</text></g></svg>`
    }
  }
  ;(globalThis as unknown as { markdownStudio: unknown }).markdownStudio = {
    platform: 'linux',
    diagram: { render, cancel: async () => undefined }
  }
  return state
})

const { buildStandaloneHtml, buildPdfSourceHtml } =
  await import('../../src/renderer/src/markdown/exporters')
const { renderDocumentBody, DEFAULT_PRESENTATION } =
  await import('../../src/renderer/src/markdown/document')
const { clearDiagramCache, diagramCacheSize, hydrateDiagrams } =
  await import('../../src/renderer/src/markdown/diagrams')
const { diagramStyleFor } = await import('../../src/renderer/src/markdown/diagramStyle')
const { katexStylesheet } = await import('../../src/renderer/src/markdown/katexCss')

const context = { documentDirectory: '/p', workspaceRoot: '/p' }
const exportSource = (source: string) => ({ source, fileName: 'doc.md', context })

const DOC = `# Report

Inline $E = mc^2$ and a price of $5 and $10.

$$
\\int_{0}^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

\`\`\`mermaid
flowchart TD
    A --> B
\`\`\`

| a | b |
|---|---|
| 1 | 2 |
`

beforeEach(() => {
  clearDiagramCache()
  fake.requests.length = 0
})

describe('standalone HTML export', () => {
  it('is complete, themed and self-contained', async () => {
    const result = await buildStandaloneHtml(exportSource(DOC), {
      ...DEFAULT_PRESENTATION,
      theme: resolveTheme('technical')
    })
    const html = result.html
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('data-theme="technical"')
    expect(html).toContain('class="katex"')
    expect(html).toContain('class="katex-display"')
    expect(html).toMatch(/<svg[^>]*id="ms-mmd-/)
    expect(html).toContain('data-ms-state="ready"')
    expect(html).toContain('<td>2</td>')
    // Fonts are embedded; nothing is loaded from anywhere.
    expect(html).toContain('data:font/woff2;base64,')
    expect(html).not.toMatch(/url\((?!data:|#)/)
    expect(html).not.toMatch(/<script|<link |@import|src="https?:|href="https?:\/\/[^"]*\.css/i)
    expect(html).toContain("default-src 'none'")
    expect(result.diagramProblems).toEqual([])
    expect(result.missingImages).toEqual([])
  })

  it('keeps the exact fenced source next to the rendered diagram', async () => {
    const { html } = await buildStandaloneHtml(exportSource(DOC))
    expect(html).toContain(
      '<pre class="ms-diagram-source"><code class="language-mermaid">flowchart TD\n    A --&gt; B</code></pre>'
    )
  })

  it('uses the dark diagram variant on a dark page', async () => {
    const dark = {
      ...DEFAULT_PRESENTATION,
      theme: resolveTheme('minimal', { pageBackground: '#101418' })
    }
    await buildStandaloneHtml(exportSource(DOC), dark)
    expect(fake.requests[0].variant).toBe('dark')
  })

  it('shows an explained error for a broken diagram and still renders the rest', async () => {
    const result = await buildStandaloneHtml(
      exportSource('# Title\n\n```mermaid\nBROKEN\nA -->\n```\n\nAfter the diagram $x^2$.\n')
    )
    expect(result.diagramProblems).toEqual([
      { fenceLine: 3, diagramLine: 2, message: 'Parse error on line 2:' }
    ])
    expect(result.html).toContain('Diagram error (line 2 of the diagram, line 5 of the document)')
    expect(result.html).toContain('data-ms-source-line="5"')
    expect(result.html).toContain('After the diagram')
    expect(result.html).toContain('class="katex"')
  })

  it('removes active content from diagram output', async () => {
    const { html } = await buildStandaloneHtml(exportSource('```mermaid\nEVIL\n```\n'))
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('evil.example')
    expect(html).toContain('.n{fill:red}')
  })

  it('does not render math or diagrams that are switched off, and keeps the source', async () => {
    const { html } = await buildStandaloneHtml(exportSource(DOC), {
      ...DEFAULT_PRESENTATION,
      math: false,
      diagrams: false
    })
    expect(html).not.toContain('class="katex"')
    expect(html).not.toContain('id="ms-math"')
    expect(html).not.toContain('<figure')
    expect(html).toContain('E = mc^2')
    expect(html).toContain('language-mermaid')
    expect(fake.requests).toEqual([])
  })

  it('embeds the validated custom CSS and neutralises style-element escapes', async () => {
    const checked = validateCustomCss(
      'h1{color:#123456} p::after{content:"</style><script>alert(1)</script>"}'
    )
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    const { html } = await buildStandaloneHtml(exportSource('# Hi\n'), {
      ...DEFAULT_PRESENTATION,
      customCss: checked.css
    })
    expect(html).toContain('<style id="ms-custom-css">\nh1{color:#123456}')
    expect(html).not.toContain('<script')
    const style = new DOMParser().parseFromString(html, 'text/html').getElementById('ms-custom-css')
    expect(style?.textContent).toContain('\\3c /style')
  })

  it('reports local links that cannot work once the file moves', async () => {
    const result = await buildStandaloneHtml(
      exportSource('[guide](docs/guide.md) [top](#report) [web](https://example.com)\n\n# Report\n')
    )
    expect(result.unresolvedLinks).toEqual(['docs/guide.md'])
    expect(result.brokenAnchors).toEqual([])
    expect(result.html).toContain('href="docs/guide.md"')
    expect(result.html).toContain('id="report"')
  })
})

describe('PDF source document', () => {
  it('uses the page height for images and the chosen background', async () => {
    const { html } = await buildPdfSourceHtml(exportSource(DOC), DEFAULT_PRESENTATION, {
      pageSize: 'A5',
      orientation: 'landscape',
      customWidthMm: 210,
      customHeightMm: 297,
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      printBackground: true,
      backgroundColor: '#fffbe6',
      scale: 1,
      header: { enabled: false, text: '', align: 'left' },
      footer: { enabled: false, text: '', align: 'left' },
      headerFooterPt: 9
    })
    // A5 landscape: 148 mm of height minus margins = 128 mm.
    expect(html).toMatch(/--ms-page-height: 484px/)
    expect(html).toContain('background: #fffbe6 !important')
  })
})

describe('diagram cache and hydration', () => {
  const style = diagramStyleFor(resolveTheme('minimal'))
  const host = (html: string) => {
    const el = document.createElement('div')
    el.innerHTML = renderDocumentBody(html, context)
    return el
  }

  it('draws an unchanged diagram once, however often the preview refreshes', async () => {
    const source = '```mermaid\nA --> B\n```\n'
    for (let i = 0; i < 3; i++) {
      const el = host(source)
      await hydrateDiagrams(el, style, { immediate: true }).done
      expect(el.querySelector('figure')?.getAttribute('data-ms-state')).toBe('ready')
    }
    expect(fake.requests).toHaveLength(1)
    expect(diagramCacheSize()).toBe(1)
  })

  it('shares one request between equal diagrams and gives each its own element ids', async () => {
    const el = host('```mermaid\nA --> B\n```\n\n```mermaid\nA --> B\n```\n')
    await hydrateDiagrams(el, style, { immediate: true }).done
    expect(fake.requests).toHaveLength(1)
    const ids = [...el.querySelectorAll('svg')].map((svg) => svg.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(ids[1]).toBe(`${ids[0]}-2`)
    expect([...el.querySelectorAll('[id]')].map((n) => n.id).length).toBe(
      new Set([...el.querySelectorAll('[id]')].map((n) => n.id)).size
    )
  })

  it('redraws when the presentation changes, with deterministic ids', async () => {
    const a = host('```mermaid\nA --> B\n```\n')
    await hydrateDiagrams(a, style, { immediate: true }).done
    const b = host('```mermaid\nA --> B\n```\n')
    await hydrateDiagrams(b, { ...style, variant: 'dark' }, { immediate: true }).done
    expect(fake.requests.map((r) => r.variant)).toEqual(['light', 'dark'])
    expect(fake.requests[0].svgId).toBe(fake.requests[1].svgId)
  })

  it('does not touch placeholders that were replaced while a diagram was being drawn', async () => {
    const el = host('```mermaid\nA --> B\n```\n')
    const hydration = hydrateDiagrams(el, style, { immediate: false })
    expect(el.querySelector('figure')?.getAttribute('data-ms-state')).toBe('pending')
    hydration.cancel()
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(fake.requests).toHaveLength(0)
    expect(el.querySelector('figure')?.getAttribute('data-ms-state')).toBe('pending')
  })

  it('caches failures too, so a broken diagram is not redrawn on every keystroke', async () => {
    for (let i = 0; i < 2; i++) {
      const el = host('```mermaid\nBROKEN\n```\n')
      await hydrateDiagrams(el, style, { immediate: true }).done
      expect(el.querySelector('figure')?.getAttribute('data-ms-state')).toBe('error')
    }
    expect(fake.requests).toHaveLength(1)
  })
})

describe('katex stylesheet', () => {
  it('embeds every font as WOFF2 data and references no files', () => {
    const css = katexStylesheet()
    expect(css).toContain('@font-face')
    expect(css).toContain('data:font/woff2;base64,')
    expect(css).not.toMatch(/url\(fonts\//)
    expect(css).not.toContain('.ttf')
  })
})
