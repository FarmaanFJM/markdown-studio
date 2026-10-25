// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import { checkMath, renderMath } from '../../src/renderer/src/markdown/math'
import { renderDocumentBody } from '../../src/renderer/src/markdown/document'

const context = { documentDirectory: '/p', workspaceRoot: '/p' }
const body = (source: string) => renderDocumentBody(source, context)

describe('KaTeX rendering', () => {
  const samples = {
    fraction: '\\frac{a+b}{c}',
    matrix: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
    greek: '\\alpha + \\beta = \\Gamma',
    sum: '\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}',
    integral: '\\int_{0}^{\\infty} e^{-x^2}\\,dx',
    scripts: 'x_i^2 + y_{j}^{k}',
    cases: 'f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}'
  }
  for (const [name, tex] of Object.entries(samples)) {
    it(`renders ${name}`, () => {
      expect(checkMath(tex, true)).toBeNull()
      const html = renderMath(tex, true)
      expect(html).toContain('class="katex-display"')
      expect(html).not.toContain('ms-math-error')
    })
  }

  it('renders inline math without display styling', () => {
    expect(renderMath('E = mc^2', false)).not.toContain('katex-display')
  })

  it('includes an accessible MathML copy', () => {
    const html = body('$x^2$')
    expect(html).toContain('<math')
    expect(html).toContain('<annotation encoding="application/x-tex">x^2</annotation>')
  })

  it('reports invalid expressions with a message instead of failing', () => {
    expect(checkMath('\\frac{1}{', false)).toMatch(/Expected|group|EOF/i)
    expect(checkMath('\\undefinedmacro', false)).toMatch(/Undefined control sequence/i)
    const html = renderMath('\\undefinedmacro{x}', false)
    expect(html).toContain('class="ms-math-error"')
    expect(html).toContain('Undefined control sequence')
    expect(html).toContain('role="note"')
  })

  it('keeps a broken equation from affecting the rest of the document', () => {
    const html = body('Before $\\bad{$ and after $x^2$.\n\n$$\n\\frac{1}{\n$$\n\nLast paragraph.')
    expect(html).toContain('ms-math-error')
    expect(html).toContain('class="katex"')
    expect(html).toContain('Last paragraph.')
  })

  it('rejects commands that can load resources or inject markup', () => {
    for (const tex of [
      '\\href{javascript:alert(1)}{click}',
      '\\url{https://evil.example}',
      '\\includegraphics{https://evil.example/x.png}',
      '\\htmlClass{x}{y}',
      '\\htmlStyle{color:red}{y}',
      '\\htmlData{a=b}{y}',
      '\\htmlId{x}{y}'
    ]) {
      // With trust off KaTeX shows the command as red text instead of acting on it.
      const html = renderMath(tex, false)
      expect(html, tex).not.toContain('<a ')
      expect(html, tex).not.toContain('href=')
      expect(html, tex).not.toContain('<img')
      expect(html, tex).not.toMatch(/class="[^"]*\bx\b/)
      expect(html, tex).not.toContain('data-a')
    }
  })

  it('stops runaway macro expansion', () => {
    const bomb = '\\def\\a{\\a\\a}\\a'
    expect(checkMath(bomb, false)).toMatch(/expansion|Too many/i)
  })

  it('escapes the TeX shown in an error', () => {
    const html = renderMath('<img src=x onerror=alert(1)> \\bad', false)
    expect(html).not.toContain('<img')
  })
})

describe('math in the document', () => {
  it('does not touch code, escaped dollars or currency', () => {
    const html = body('Costs $5 and $10, `$x$`, \\$y\\$.\n\n```\n$$\nz\n$$\n```')
    expect(html).not.toContain('class="katex"')
    expect(html).toContain('$5 and $10')
    expect(html).toContain('<code>$x$</code>')
  })

  it('supports \\( \\) and \\[ \\] delimiters', () => {
    const html = body('Inline \\(a^2\\) and\n\n\\[\nb^2\n\\]\n')
    expect(html.match(/class="katex"/g)).toHaveLength(2)
    expect(html).toContain('katex-display')
  })

  it('does not corrupt HTML blocks or links that contain dollar signs', () => {
    const html = body('<div data-price="$5">$x$</div>\n\n[$5 link](https://example.com/?a=$1)\n')
    expect(html).toContain('data-price="$5"')
    expect(html).toContain('href="https://example.com/?a=$1"')
  })
})

describe('math positions for diagnostics', () => {
  it('locates inline and display math in the source', () => {
    const source = 'Intro $a+b$ then \\(c\\).\n\n$$\nx^2\n$$\n\nLast $d$'
    const spans = analyzeDocument(source).math
    expect(spans.map((s) => [s.tex, s.display, s.line, s.column, s.endLine, s.endColumn])).toEqual([
      ['a+b', false, 0, 6, 0, 11],
      ['c', false, 0, 17, 0, 22],
      ['\nx^2\n'.replace(/^\n|\n$/g, ''), true, 2, 0, 4, 2],
      ['d', false, 6, 5, 6, 8]
    ])
  })

  it('records the exact text of fences', () => {
    const [fence] = analyzeDocument('```mermaid\nflowchart TD\n  A --> B\n```\n').fences
    expect(fence.content).toBe('flowchart TD\n  A --> B')
  })
})
