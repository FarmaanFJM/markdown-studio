// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { auditExportedHtml } from '../../src/renderer/src/markdown/audit'

const page = (body: string, head = '') =>
  `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'">${head}</head><body><main>${body}</main></body></html>`

describe('export audit', () => {
  it('accepts a clean, self-contained document', () => {
    const result = auditExportedHtml(
      page(
        '<h1 id="intro">Intro</h1><p><a href="#intro">up</a> <a href="https://example.com">web</a> <img src="data:image/png;base64,AAAA"></p>',
        '<style>p{color:red} @font-face{font-family:X;src:url(data:font/woff2;base64,AAAA)}</style>'
      )
    )
    expect(result.violations).toEqual([])
    expect(result.unresolvedLinks).toEqual([])
    expect(result.brokenAnchors).toEqual([])
  })

  const unsafe: Record<string, string> = {
    script: '<script>alert(1)</script>',
    iframe: '<iframe src="x"></iframe>',
    object: '<object data="x"></object>',
    embed: '<embed src="x">',
    form: '<form action="x"></form>',
    link: '<link rel="stylesheet" href="https://evil.example/a.css">',
    base: '<base href="https://evil.example/">',
    'event handler': '<p onclick="alert(1)">x</p>',
    'javascript url': '<a href="javascript:alert(1)">x</a>',
    'html data url': '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    'meta refresh': '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    'remote style': '<p style="background:url(https://evil.example/x)">x</p>',
    'private protocol': '<img src="msfile://local/C%3A%2Fsecret.png">',
    'svg external use': '<svg><use href="https://evil.example/x.svg#a"></use></svg>'
  }
  for (const [name, html] of Object.entries(unsafe)) {
    it(`flags ${name}`, () => {
      expect(auditExportedHtml(page(html)).violations.length, name).toBeGreaterThan(0)
    })
  }

  it('flags stylesheets that load remote resources', () => {
    const result = auditExportedHtml(
      page('<p>x</p>', '<style>@import url(https://evil.example/a.css);</style>')
    )
    expect(result.violations.join(' ')).toMatch(/stylesheet/i)
  })

  it('reports limits of standalone files without refusing them', () => {
    const result = auditExportedHtml(
      page(
        '<h1 id="a">A</h1><a href="#missing">x</a><a href="docs/guide.md">guide</a><img src="https://example.com/badge.svg"><img src="photo.png">'
      )
    )
    expect(result.violations).toEqual([])
    expect(result.brokenAnchors).toEqual(['#missing'])
    expect([...result.unresolvedLinks].sort()).toEqual(['docs/guide.md', 'photo.png'])
    expect(result.remoteImages).toEqual(['https://example.com/badge.svg'])
  })
})
