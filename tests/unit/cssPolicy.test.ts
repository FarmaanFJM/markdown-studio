import { describe, expect, it } from 'vitest'
import {
  analyzeCss,
  sanitizeStyleAttribute,
  sanitizeStylesheet,
  validateCustomCss
} from '@shared/presentation/css'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('custom CSS policy: accepted CSS', () => {
  it('accepts ordinary rules, media queries, variables and embedded images', () => {
    const result = validateCustomCss(`
      /* comments are fine */
      h1 { color: #0a7d5a; letter-spacing: .02em }
      @media print { p { orphans: 3 } }
      :root { --brand: #123456 }
      blockquote { background: var(--brand) url("${PNG}") no-repeat }
      @font-face { font-family: X; src: local("Arial") }
    `)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.css).toContain('h1{color:#0a7d5a')
  })
})

describe('custom CSS policy: rejected CSS', () => {
  const rejected: Record<string, string> = {
    'remote @import': '@import url("https://evil.example/a.css"); p{color:red}',
    'local @import': '@import "other.css";',
    'remote url()': 'p { background: url(https://evil.example/pixel.png) }',
    'local file url()': 'p { background: url(file:///etc/passwd) }',
    'msfile url()': 'p { background: url("msfile://local/C%3A%2Fsecret.png") }',
    'relative url()': 'p { background: url(secret.png) }',
    'html data url': 'p { background: url("data:text/html,<script>alert(1)</script>") }',
    'escaped url function': 'p { background: u\\72l(https://evil.example/x) }',
    'escaped url function, longer escape': 'p { background: \\75 rl(https://evil.example/x) }',
    'url hidden in a custom property':
      ':root { --x: url(https://evil.example/x) } p{background:var(--x)}',
    'image-set with a remote string':
      'p { background: image-set("https://evil.example/a.png" 1x) }',
    'cursor url': 'p { cursor: url(https://evil.example/c.cur), auto }',
    'font-face remote src': '@font-face { font-family: Y; src: url(https://evil.example/f.woff2) }',
    'expression()': 'p { width: expression(alert(1)) }',
    'behavior property': 'p { behavior: url(evil.htc) }',
    '-moz-binding': 'p { -moz-binding: url(evil.xml#x) }',
    '@namespace': '@namespace svg url(http://www.w3.org/2000/svg);',
    'unknown at-rule': '@evil { p { color: red } }',
    'stray junk at rule level': 'p { color: red } }}} nonsense;'
  }
  for (const [name, css] of Object.entries(rejected)) {
    it(`rejects ${name}`, () => {
      const result = validateCustomCss(css)
      expect(result.ok, `${name} should be rejected`).toBe(false)
      if (!result.ok) {
        expect(result.problems.length).toBeGreaterThan(0)
        expect(result.problems[0].message.length).toBeGreaterThan(5)
      }
    })
  }

  it('reports the line of a problem', () => {
    const result = validateCustomCss('p { color: red }\n\nh1 { background: url(http://x/y.png) }')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0].line).toBe(3)
  })

  it('rejects oversized stylesheets', () => {
    const result = validateCustomCss(`p{color:red}${'/* x */'.repeat(60_000)}`)
    expect(result.ok).toBe(false)
  })
})

describe('custom CSS output', () => {
  it('closes constructs the author left open (as browsers do) so nothing leaks outward', () => {
    const result = validateCustomCss('p { color: red')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.css).toBe('p{color:red}')
  })

  it('can never close the surrounding <style> element', () => {
    const result = validateCustomCss('p::after { content: "</style><script>alert(1)</script>" }')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.css).not.toContain('<')
      expect(result.css.toLowerCase()).not.toContain('</style')
    }
  })
})

describe('lenient sanitising of Markdown HTML styles', () => {
  it('drops forbidden declarations from a style attribute and keeps the rest', () => {
    const css = sanitizeStyleAttribute(
      'color: red; background: url(https://evil.example/x.png); margin: 4px'
    )
    expect(css).toContain('color:red')
    expect(css).toContain('margin:4px')
    expect(css).not.toContain('evil')
  })

  it('drops forbidden rules from a style block and keeps the rest', () => {
    const css = sanitizeStylesheet(
      '@import "x.css"; p{color:blue} i{background:url(file:///etc/passwd)} b{font-weight:700}'
    )
    expect(css).toContain('p{color:blue}')
    expect(css).toContain('b{font-weight:700}')
    expect(css).not.toContain('import')
    expect(css).not.toContain('passwd')
  })

  it('reports problems without throwing on garbage', () => {
    const result = analyzeCss('}}}{{{ !!! url(')
    expect(result.css).not.toContain('url(')
    expect(typeof result.css).toBe('string')
  })
})
