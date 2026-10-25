// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderDocumentBody } from '../../src/renderer/src/markdown/document'

/**
 * Every example in docs/MATHEMATICS.md is rendered by the real pipeline: the guide documents only
 * what works, and examples marked `<!-- expect-error -->` must fail in the way the guide says.
 */
const guide = readFileSync(path.resolve(__dirname, '../../docs/MATHEMATICS.md'), 'utf8')
const context = { documentDirectory: '/p', workspaceRoot: '/p' }

interface Example {
  source: string
  expectError: boolean
  heading: string
}

function examples(): Example[] {
  const found: Example[] = []
  const lines = guide.split('\n')
  let heading = ''
  for (let i = 0; i < lines.length; i++) {
    const h = /^#{2,3}\s+(.*)$/.exec(lines[i])
    if (h && !lines[i].startsWith('```')) heading = h[1]
    if (lines[i].startsWith('```markdown')) {
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !lines[j].startsWith('```')) body.push(lines[j++])
      const text = body.join('\n')
      const expectError = /^<!--\s*expect-error\s*-->/m.test(text)
      found.push({ source: text.replace(/^<!--\s*expect-error\s*-->\n/m, ''), expectError, heading })
      i = j
    }
  }
  return found
}

function render(source: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderDocumentBody(source, context)
  return host
}

describe('docs/MATHEMATICS.md', () => {
  const all = examples()

  it('has a substantial set of examples', () => {
    expect(all.length).toBeGreaterThanOrEqual(15)
  })

  for (const [index, example] of all.entries()) {
    it(`example ${index + 1} (${example.heading}) ${example.expectError ? 'fails as documented' : 'renders'}`, () => {
      const html = render(example.source)
      const errors = html.querySelectorAll('.ms-math-error').length
      if (example.expectError) {
        expect(errors).toBeGreaterThan(0)
      } else {
        expect(errors).toBe(0)
        expect(html.querySelectorAll('.katex').length + html.querySelectorAll('code').length).toBeGreaterThan(0)
      }
    })
  }

  it('keeps currency and escaped dollars as text, as documented', () => {
    const html = render('Prices: $5 and $10 stay text. An escaped \\$x\\$ is text too.\nCode is untouched: `$x$`. Math with a dollar inside: $a \\$ b$.')
    expect(html.querySelectorAll('.katex')).toHaveLength(1)
    expect(html.textContent).toContain('$5 and $10 stay text')
    expect(html.textContent).toContain('An escaped $x$ is text too')
  })

  it('renders every documented environment as display math', () => {
    for (const env of ['pmatrix', 'bmatrix', 'vmatrix', 'cases', 'aligned']) {
      const html = render(`$$\n\\begin{${env}} a & b \\\\ c & d \\end{${env}}\n$$`)
      expect(html.querySelectorAll('.ms-math-error').length, env).toBe(0)
      expect(html.querySelectorAll('.katex-display').length, env).toBe(1)
    }
  })

  describe('equation tags', () => {
    it('shows manual tags, with and without parentheses', () => {
      const html = render('$$\nE = mc^2 \\tag{1}\n$$\n\n$$\na = b \\tag*{Pythagoras}\n$$')
      const tags = [...html.querySelectorAll('.katex-display .katex-tag')].map((t) => t.textContent)
      expect(tags).toEqual(['(1)', 'Pythagoras'])
    })

    it('supports one tag per line of an align environment', () => {
      const html = render('$$\n\\begin{align}\na &= b \\tag{2} \\\\\nd &= e \\tag{3}\n\\end{align}\n$$')
      expect([...html.querySelectorAll('.katex-tag')].map((t) => t.textContent).join('')).toContain('(2)(3)')
    })

    it('rejects tags in inline math, as documented', () => {
      expect(render('$x \\tag{1}$').querySelectorAll('.ms-math-error')).toHaveLength(1)
    })
  })

  describe('documented limitations', () => {
    it('labels and references are not supported', () => {
      for (const tex of ['$$a=b \\label{eq:1}$$', '$\\ref{eq:1}$', '$\\eqref{eq:1}$']) {
        expect(render(tex).querySelectorAll('.ms-math-error'), tex).toHaveLength(1)
      }
    })

    it('macros do not persist from one equation to the next', () => {
      const html = render('$\\def\\RR{\\mathbb{R}} x \\in \\RR$ then $y \\in \\RR$')
      const results = [...html.querySelectorAll('.katex, .ms-math-error')]
      expect(results[0].classList.contains('katex')).toBe(true)
      expect(results[1].classList.contains('ms-math-error')).toBe(true)
    })

    it('\\newcommand cannot redefine a command KaTeX already has', () => {
      expect(render('$\\newcommand{\\R}{x} \\R$').querySelectorAll('.ms-math-error')).toHaveLength(1)
    })

    it('numbers lines inside one equation, restarting in every equation', () => {
      const one = (env: string, rows: number) =>
        render(`$$\n\\begin{${env}} ${Array.from({ length: rows }, (_, i) => `r${i} &= x`).join(' \\\\ ')} \\end{${env}}\n$$`)
      expect(one('align', 2).querySelectorAll('.eqn-num')).toHaveLength(2)
      expect(one('gather', 2).querySelectorAll('.eqn-num')).toHaveLength(2)
      expect(one('align*', 2).querySelectorAll('.eqn-num')).toHaveLength(0)
      expect(one('aligned', 2).querySelectorAll('.eqn-num')).toHaveLength(0)
      // Each equation has its own counter: there is no document-wide sequence.
      const two = render('$$\\begin{equation} a = b \\end{equation}$$\n\n$$\\begin{equation} c = d \\end{equation}$$')
      expect(two.querySelectorAll('.katex')).toHaveLength(2)
      for (const katex of two.querySelectorAll('.katex')) expect(katex.querySelectorAll('.eqn-num')).toHaveLength(1)
    })

    it('\\nonumber skips one line', () => {
      const html = render('$$\n\\begin{align} a &= b \\\\ c &= d \\nonumber \\\\ e &= f \\end{align}\n$$')
      expect(html.querySelectorAll('.eqn-num')).toHaveLength(2)
    })

    it('packages and unsupported environments are reported', () => {
      for (const tex of ['$\\usepackage{amsmath}$', '$$\\begin{theorem} x \\end{theorem}$$']) {
        expect(render(tex).querySelectorAll('.ms-math-error'), tex).toHaveLength(1)
      }
    })
  })
})
