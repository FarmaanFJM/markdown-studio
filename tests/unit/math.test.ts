import { describe, expect, it } from 'vitest'
import { createApplicationMarkdownIt } from '@shared/markdown/plugins'

const md = createApplicationMarkdownIt({
  math: { render: (tex, display) => `<m d="${display}">${tex}</m>` }
})
const render = (s: string) => md.render(s).trim()

describe('math: inline', () => {
  it('renders $…$ and \\(…\\)', () => {
    expect(render('Inline $E = mc^2$ here')).toBe('<p>Inline <m d="false">E = mc^2</m> here</p>')
    expect(render('Inline \\(a+b\\) here')).toBe('<p>Inline <m d="false">a+b</m> here</p>')
  })

  it('treats $$…$$ inside a paragraph as display math', () => {
    expect(render('so $$x^2$$ done')).toBe('<p>so <m d="true">x^2</m> done</p>')
  })

  it('does not treat currency as math', () => {
    expect(render('It costs $5 and then $10 more.')).toBe('<p>It costs $5 and then $10 more.</p>')
    expect(render('Between $5-$10 per day')).toBe('<p>Between $5-$10 per day</p>')
    expect(render('A lone $ sign and $ another')).toBe('<p>A lone $ sign and $ another</p>')
    expect(render('price $5.00, tax $0.50')).toBe('<p>price $5.00, tax $0.50</p>')
  })

  it('honours escaped dollars', () => {
    expect(render('Escaped \\$x\\$ is text')).toBe('<p>Escaped $x$ is text</p>')
    expect(render('math $a \\$ b$ ok')).toBe('<p>math <m d="false">a \\$ b</m> ok</p>')
  })

  it('ignores math inside code', () => {
    expect(render('use `$x$` here')).toBe('<p>use <code>$x$</code> here</p>')
    expect(render('```\n$x$\n$$\ny\n$$\n```')).toContain('$x$')
    expect(render('```\n$x$\n```')).not.toContain('<m')
    expect(render('    $$\n    x\n    $$')).not.toContain('<m')
  })

  it('does not swallow code spans that contain a dollar', () => {
    expect(render('price $5 and `a$b` end')).toBe('<p>price $5 and <code>a$b</code> end</p>')
  })

  it('leaves unclosed delimiters alone', () => {
    expect(render('open $x never closed')).toBe('<p>open $x never closed</p>')
    expect(render('open \\(x never closed')).toBe('<p>open (x never closed</p>')
  })

  it('works inside links, emphasis and tables', () => {
    expect(render('[the $x$ link](a.md)')).toContain(
      '<a href="a.md">the <m d="false">x</m> link</a>'
    )
    expect(render('**bold $y$**')).toContain('<strong>bold <m d="false">y</m></strong>')
    expect(render('| a |\n|---|\n| $z$ |')).toContain('<td><m d="false">z</m></td>')
  })
})

describe('math: blocks', () => {
  it('renders multi-line $$ blocks', () => {
    const html = render('$$\n\\int_0^1 x\\,dx\n= \\frac12\n$$')
    expect(html).toContain('class="ms-math-block"')
    expect(html).toContain('<m d="true">\\int_0^1 x\\,dx\n= \\frac12</m>')
  })

  it('renders single-line $$ x $$ and \\[ … \\] blocks', () => {
    expect(render('$$ a + b $$')).toContain('<m d="true"> a + b </m>')
    expect(render('\\[\nx\n\\]')).toContain('<m d="true">x</m>')
  })

  it('interrupts a paragraph and works in lists and quotes', () => {
    expect(render('text\n$$\nx\n$$\nmore')).toContain('ms-math-block')
    expect(render('> $$\n> x\n> $$')).toContain('<blockquote>')
    expect(render('- item\n\n  $$\n  y\n  $$')).toContain('ms-math-block')
  })

  it('leaves an unclosed block as text', () => {
    expect(render('$$\nnever closed')).not.toContain('ms-math-block')
  })

  it('records the source line for diagnostics', () => {
    expect(render('a\n\n$$\nx\n$$')).toContain('data-ms-line="3"')
  })
})

describe('math: switching rendering off', () => {
  it('leaves the source untouched', () => {
    const plain = createApplicationMarkdownIt({ math: false })
    expect(plain.render('$x$ and\n\n$$\ny\n$$').trim()).toBe('<p>$x$ and</p>\n<p>$$\ny\n$$</p>')
  })
})

describe('mermaid fences and page breaks', () => {
  it('emits a placeholder that preserves the exact source', () => {
    const source = 'flowchart TD\n    A[Start] --> B{<ok & "x">}'
    const html = md.render('```mermaid\n' + source + '\n```\n')
    expect(html).toContain('class="ms-diagram"')
    expect(html).toContain('data-ms-line="1"')
    expect(html).toContain('flowchart TD\n    A[Start] --&#62; B{&#60;ok &#38; &#34;x&#34;&#62;}')
    expect(html).not.toContain('<ok')
  })

  it('is case-insensitive and ignores other languages', () => {
    expect(md.render('```Mermaid\nA-->B\n```')).toContain('ms-diagram')
    expect(md.render('```js\nA-->B\n```')).not.toContain('ms-diagram')
    expect(md.render('~~~ mermaid\nA-->B\n~~~')).toContain('ms-diagram')
  })

  it('renders plain code when diagrams are switched off', () => {
    const plain = createApplicationMarkdownIt({ diagrams: false })
    expect(plain.render('```mermaid\nA-->B\n```')).not.toContain('ms-diagram')
  })

  it('turns <!-- pagebreak --> into a separator', () => {
    expect(md.render('a\n\n<!-- pagebreak -->\n\nb')).toContain('class="ms-page-break"')
    expect(md.render('a\n\n<!-- page-break -->\n\nb')).toContain('ms-page-break')
    expect(md.render('a\n\n<!-- other -->\n\nb')).not.toContain('ms-page-break')
  })
})
