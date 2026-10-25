// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { auditExportedHtml } from '../../src/renderer/src/markdown/audit'
import { buildHtmlDocument, renderDocumentBody } from '../../src/renderer/src/markdown/document'

const context = { documentDirectory: '/home/ana/atlas', workspaceRoot: '/home/ana/atlas' }

function render(source: string): string {
  return renderDocumentBody(source, context)
}

/** Everything a hostile document might try, rendered through the real pipeline. */
const HOSTILE: Record<string, string> = {
  script: '<script>alert(1)</script>',
  'img onerror': '<img src=x onerror="alert(1)">',
  'svg onload': '<svg onload="alert(1)"><script>alert(2)</script></svg>',
  'svg foreignObject iframe':
    '<svg><foreignObject><iframe src="https://evil.example"></iframe></foreignObject></svg>',
  iframe: '<iframe src="https://evil.example"></iframe>',
  object: '<object data="https://evil.example/x.swf"></object>',
  embed: '<embed src="https://evil.example/x.swf">',
  form: '<form action="https://evil.example"><input name=a><button>go</button></form>',
  'meta refresh': '<meta http-equiv="refresh" content="0;url=https://evil.example">',
  base: '<base href="https://evil.example/">',
  'stylesheet link': '<link rel="stylesheet" href="https://evil.example/a.css">',
  'javascript link': '<a href="javascript:alert(1)">x</a>',
  'javascript markdown link': '[x](javascript:alert(1))',
  'vbscript link': '<a href="vbscript:msgbox(1)">x</a>',
  'data html link': '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  'style import': '<style>@import url("https://evil.example/a.css");</style>',
  'style url': '<style>body{background:url(https://evil.example/pixel.gif)}</style>',
  'style file url': '<style>body{background:url(file:///etc/passwd)}</style>',
  'inline style url': '<div style="background:url(https://evil.example/pixel.gif)">x</div>',
  'inline style expression': '<div style="width:expression(alert(1))">x</div>',
  'details ontoggle': '<details open ontoggle="alert(1)"><summary>x</summary></details>',
  'mermaid fence breakout': '```mermaid\n</code></pre><script>alert(1)</script>\n```',
  'math breakout': '$<img src=x onerror=alert(1)>$',
  'math html': '$$\n\\text{</span><script>alert(1)</script>}\n$$',
  'link title': '[x](https://example.com "\\" onmouseover=\\"alert(1)")',
  'mutation xss':
    '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=alert(1)&gt;">',
  noscript: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  template: '<template><script>alert(1)</script></template>'
}

/** Active content is judged on the parsed document, not on text that merely looks like it. */
function activeContent(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const problems: string[] = []
  doc
    .querySelectorAll(
      'script, iframe, frame, object, embed, applet, form, link, base, meta, noscript'
    )
    .forEach((el) => problems.push(`<${el.localName}>`))
  doc.querySelectorAll('*').forEach((el) => {
    for (const attribute of [...el.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on')) problems.push(`${el.localName}[${name}]`)
      if (
        ['href', 'src', 'xlink:href', 'action', 'formaction'].includes(name) &&
        /^(?:javascript|vbscript|data:text\/html)/.test(value)
      ) {
        problems.push(`${el.localName}[${name}=${value.slice(0, 20)}]`)
      }
      if (/url\(\s*['"]?(?:https?:|file:|\/\/)/.test(value))
        problems.push(`${el.localName}[${name}] remote url`)
    }
  })
  doc.querySelectorAll('style').forEach((el) => {
    if (/@import|url\(\s*['"]?(?:https?:|file:|\/\/)/i.test(el.textContent ?? ''))
      problems.push('style rule loads a resource')
  })
  return problems
}

describe('hostile documents', () => {
  for (const [name, source] of Object.entries(HOSTILE)) {
    it(`cannot smuggle active content: ${name}`, () => {
      const html = render(source)
      expect(activeContent(html), `${name}: ${html}`).toEqual([])
      // The audit used before every export agrees (images are embedded as data URIs by then).
      const full = buildHtmlDocument({
        title: 'x',
        body: html.replace(/msfile:[^"]*/g, 'data:image/png;base64,AA'),
        purpose: 'export'
      })
      expect(auditExportedHtml(full).violations, name).toEqual([])
    })
  }

  it('still shows the harmless parts of hostile documents', () => {
    const html = render('# Title\n\n<script>alert(1)</script>\n\nVisible **text**.')
    expect(html).toContain('<h1 id="title">Title</h1>')
    expect(html).toContain('<strong>text</strong>')
  })

  it('keeps ordinary formatting HTML', () => {
    const html = render(
      '<div style="text-align:center"><b>bold</b> <kbd>Ctrl</kbd></div>\n\n<details><summary>More</summary>\n\nBody\n\n</details>'
    )
    expect(html).toContain('style="text-align:center"')
    expect(html).toContain('<kbd>Ctrl</kbd>')
    expect(html).toContain('<details>')
  })

  it('never lets an image reach files through the private protocol', () => {
    const html = render('![x](msfile://local/%2Fetc%2Fpasswd) ![y](file:///etc/passwd)')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const img of doc.querySelectorAll('img')) {
      expect(img.getAttribute('src') ?? '').not.toMatch(/passwd|file:/)
    }
  })

  it('escapes the document title in the page head', () => {
    const html = buildHtmlDocument({
      title: '</title><script>alert(1)</script>',
      body: '',
      purpose: 'export'
    })
    expect(auditExportedHtml(html).violations).toEqual([])
    expect(html).not.toContain('</title><script>')
  })

  it('declares a content policy without scripts', () => {
    const html = buildHtmlDocument({ title: 'x', body: '', purpose: 'export' })
    expect(html).toContain("default-src 'none'")
    expect(html).not.toMatch(/script-src/)
    expect(html).toContain("form-action 'none'")
  })
})
