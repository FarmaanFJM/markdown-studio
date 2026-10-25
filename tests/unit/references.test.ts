import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import { classifyReference, extractReferences } from '@shared/markdown/references'

function refs(source: string) {
  return extractReferences(analyzeDocument(source)).map((r) => ({
    kind: r.kind,
    value: r.value,
    at: `${r.line}:${r.column}-${r.endLine}:${r.endColumn}`
  }))
}

describe('reference extraction', () => {
  it('finds links, images and their exact destination ranges', () => {
    const source = 'See [guide](docs/guide.md) and ![logo](assets/logo.png "Logo").'
    const found = refs(source)
    expect(found).toEqual([
      { kind: 'link', value: 'docs/guide.md', at: '0:12-0:25' },
      { kind: 'image', value: 'assets/logo.png', at: '0:39-0:54' }
    ])
    expect(source.slice(12, 25)).toBe('docs/guide.md')
  })

  it('handles angle-bracket destinations with spaces and escapes', () => {
    const [ref] = extractReferences(analyzeDocument('![x](<my images/a (1).png>)'))
    expect(ref.wrapped).toBe(true)
    expect(ref.value).toBe('my images/a (1).png')
    expect(ref.raw).toBe('<my images/a (1).png>')
  })

  it('handles balanced parentheses in raw destinations', () => {
    expect(refs('[w](https://en.wikipedia.org/wiki/Foo_(bar))')[0].value).toBe(
      'https://en.wikipedia.org/wiki/Foo_(bar)'
    )
  })

  it('finds an image inside a link, and links inside tables, lists and quotes', () => {
    const found = refs(
      '[![badge](b.svg)](https://x.dev)\n\n| a |\n|---|\n| [t](t.md) |\n\n> - [q](q.md)\n'
    )
    expect(found.map((r) => r.value)).toEqual(['b.svg', 'https://x.dev', 't.md', 'q.md'])
  })

  it('ignores code blocks, code spans and indented code', () => {
    const source = [
      '`[a](ignored.md)` and [kept](kept.md)',
      '',
      '```',
      '[b](ignored2.md)',
      '```',
      '',
      '    [c](ignored3.md)',
      ''
    ].join('\n')
    expect(refs(source).map((r) => r.value)).toEqual(['kept.md'])
  })

  it('finds reference definitions but not footnote-like labels', () => {
    const source = '[docs]: docs/index.md "Docs"\n[^1]: A footnote.\n\nUse [docs][].\n'
    expect(refs(source)).toEqual([{ kind: 'definition', value: 'docs/index.md', at: '0:8-0:21' }])
  })

  it('finds HTML image sources and anchors in blocks and inline', () => {
    const source =
      '<img src="assets/a.png" alt="a">\n\nText <a href="x.md">x</a> and <img src=\'b.png\'>.\n'
    expect(refs(source).map((r) => [r.kind, r.value])).toEqual([
      ['html-img', 'assets/a.png'],
      ['html-link', 'x.md'],
      ['html-img', 'b.png']
    ])
  })

  it('skips autolinks and handles escaped brackets', () => {
    expect(refs('<https://example.com/a> \\[not](a.md)').map((r) => r.value)).toEqual([])
  })

  it('reports positions across lines in multi-line paragraphs', () => {
    const found = refs('first line\nsecond [two](two.md) line\n')
    expect(found[0].at).toBe('1:13-1:19')
  })
})

describe('reference classification', () => {
  it('separates web, anchor and local references', () => {
    expect(classifyReference('https://example.com')).toEqual({ type: 'external' })
    expect(classifyReference('mailto:a@b.c')).toEqual({ type: 'external' })
    expect(classifyReference('//cdn.example.com/x.js')).toEqual({ type: 'external' })
    expect(classifyReference('#install')).toEqual({ type: 'anchor', fragment: 'install' })
    expect(classifyReference('')).toEqual({ type: 'empty' })
    expect(classifyReference('docs/guide.md#setup')).toEqual({
      type: 'local',
      path: 'docs/guide.md',
      suffix: '#setup',
      fragment: 'setup'
    })
    expect(classifyReference('img/a%20b.png?raw=1')).toMatchObject({
      type: 'local',
      path: 'img/a%20b.png',
      fragment: null
    })
  })

  it('keeps Windows drive paths local', () => {
    expect(classifyReference('C:\\docs\\a.md')).toMatchObject({ type: 'local' })
  })
})
