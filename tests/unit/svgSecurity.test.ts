// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from '../../src/renderer/src/markdown/svg'

function clean(svg: string): string {
  return sanitizeSvg(svg) ?? ''
}

const wrap = (inner: string, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`

describe('diagram SVG sanitising', () => {
  it('keeps ordinary diagram markup', () => {
    const svg = clean(
      wrap(
        '<style>#d1 .node rect{fill:#e7f6f0;stroke:#10b981}</style><defs><marker id="m"><path d="M0 0L10 5L0 10z"/></marker></defs><g class="node"><rect width="40" height="20" rx="3"/><text x="4" y="12">Hello</text></g><path d="M1 1L9 9" marker-end="url(#m)" style="stroke:#333;stroke-width:2px"/>',
        'id="d1" viewBox="0 0 100 50" width="100%" style="max-width:300px"'
      )
    )
    expect(svg).toContain('<text')
    expect(svg).toContain('Hello')
    expect(svg).toContain('marker-end="url(#m)"')
    expect(svg).toContain('fill:#e7f6f0')
    expect(svg).toContain('viewBox="0 0 100 50"')
  })

  it('removes scripts and event handlers', () => {
    const svg = clean(
      wrap(
        '<script>alert(1)</script><rect width="1" height="1" onclick="alert(2)" onload="alert(3)"/><a xlink:href="javascript:alert(4)"><text>x</text></a>',
        'onload="alert(5)"'
      )
    )
    expect(svg.toLowerCase()).not.toContain('script')
    expect(svg).not.toMatch(/\son\w+=/i)
    expect(svg).not.toContain('javascript:')
  })

  it('removes frames, objects, forms and embedded documents', () => {
    const svg = clean(
      wrap(
        '<foreignObject width="100" height="100"><iframe src="https://evil.example"></iframe><object data="x"></object><form action="https://evil.example"><input></form><div>label</div></foreignObject>'
      )
    )
    for (const tag of ['iframe', 'object', 'form', 'input', 'embed'])
      expect(svg).not.toContain(`<${tag}`)
    expect(svg).not.toContain('evil.example')
  })

  it('removes external images, uses and other outside references', () => {
    const svg = clean(
      wrap(
        '<image href="https://evil.example/a.png"/><image xlink:href="file:///etc/passwd"/><use href="https://evil.example/x.svg#a"/><use href="#local"/><feImage href="https://evil.example/f"/><g id="local"/>'
      )
    )
    expect(svg).not.toContain('evil.example')
    expect(svg).not.toContain('file:')
    expect(svg).not.toContain('<image')
    // `use` can pull in other documents and is not needed by diagrams at all.
    expect(svg).not.toContain('<use')
  })

  it('removes remote references in presentation attributes and styles', () => {
    const svg = clean(
      wrap(
        '<rect fill="url(https://evil.example/p.svg#a)" filter="url(//evil.example/f.svg#f)" width="1" height="1"/><rect style="fill:url(http://evil.example/p);stroke:red" width="1" height="1"/><rect fill="url(#ok)" width="1" height="1"/>'
      )
    )
    expect(svg).not.toContain('evil.example')
    expect(svg).toContain('fill="url(#ok)"')
  })

  it('applies the CSS policy to embedded style elements', () => {
    const svg = clean(
      wrap(
        '<style>@import url("https://evil.example/a.css"); .a{fill:red} .b{background:url(file:///etc/passwd)}</style><rect class="a" width="1" height="1"/>'
      )
    )
    expect(svg).not.toContain('evil.example')
    expect(svg).not.toContain('passwd')
    expect(svg).not.toContain('@import')
    expect(svg).toContain('.a{fill:red}')
  })

  it('removes animation elements that can set attributes on other nodes', () => {
    const svg = clean(
      wrap(
        '<a><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="onmouseover" to="alert(1)"/><text>x</text></a>'
      )
    )
    expect(svg).not.toContain('<animate')
    expect(svg).not.toContain('<set')
    expect(svg).not.toContain('javascript')
  })

  it('returns nothing when no SVG remains', () => {
    expect(sanitizeSvg('<div>not svg</div>')).toBeNull()
    expect(sanitizeSvg('<script>alert(1)</script>')).toBeNull()
  })

  it('survives mutation-XSS style payloads', () => {
    const payloads = [
      '<svg><style><img src=x onerror=alert(1)></style></svg>',
      '<svg><p><style><a title="</style><img src=x onerror=alert(1)>"></style></p></svg>',
      '<svg><foreignObject><math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=alert(1)&gt;">',
      '<svg><desc><![CDATA[</desc><script>alert(1)</script>]]></desc></svg>'
    ]
    for (const payload of payloads) {
      const out = sanitizeSvg(payload) ?? ''
      expect(out.toLowerCase()).not.toContain('<script')
      expect(out).not.toMatch(/<img[^>]+onerror/i)
    }
  })
})
