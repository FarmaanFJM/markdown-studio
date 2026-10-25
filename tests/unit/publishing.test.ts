import { describe, expect, it } from 'vitest'
import { createApplicationMarkdownIt } from '@shared/markdown/plugins'
import { createCitationProvider } from '@shared/publishing/citations'
import type { PublishingEnv, PublishingOptions, PublishingResult } from '@shared/publishing/types'
import type { Source } from '@shared/publishing/sources'

function render(source: string, ms: PublishingOptions = {}) {
  const md = createApplicationMarkdownIt()
  const env: PublishingEnv = { ms }
  const html = md.render(source, env)
  return { html, result: env.ms!.result as PublishingResult }
}

const SOURCES: Source[] = [
  {
    id: 'smith2020',
    type: 'book',
    title: 'Game interface design',
    author: [{ family: 'Smith', given: 'Jane' }],
    issued: { 'date-parts': [[2020]] },
    publisher: 'Press'
  },
  {
    id: 'lee2021',
    type: 'article-journal',
    title: 'Health bars in action games',
    author: [{ family: 'Lee', given: 'Al' }],
    issued: { 'date-parts': [[2021]] },
    'container-title': 'Journal of Play',
    volume: '4'
  }
]

describe('front matter', () => {
  it('is hidden from the output and does not become a heading', () => {
    const { html } = render('---\ntitle: Report\nauthor: Me\n---\n\n# Hello\n')
    expect(html).not.toContain('title: Report')
    expect(html).not.toContain('<hr')
    expect(html).toContain('<h1 id="hello">Hello</h1>')
  })

  it('leaves an unclosed block alone as ordinary Markdown', () => {
    const { html } = render('---\ntitle: x\n\n# Hello\n')
    expect(html).toContain('<h1')
  })
})

describe('headings with attributes', () => {
  it('uses {#id} as the heading id and removes it from the text', () => {
    const { html, result } = render('# Title\n\n## Intro {#sec-intro}\n')
    expect(html).toContain('<h2 id="sec-intro">Intro</h2>')
    expect(result.labels.map((l) => l.id)).toEqual(['sec-intro'])
  })

  it('numbers sections when asked, treating a single level-1 heading as the title', () => {
    const { html, result } = render('# Title\n\n## A {#sec-a}\n\n### A1\n\n## B\n', {
      numberSections: true
    })
    expect(html).toContain('<span class="ms-secnum">1</span> A')
    expect(html).toContain('<span class="ms-secnum">1.1</span> A1')
    expect(html).toContain('<span class="ms-secnum">2</span> B')
    expect(html).not.toContain('<span class="ms-secnum">1</span> Title')
    expect(result.labels[0].number).toBe('1')
  })

  it('honours {.unnumbered}', () => {
    const { html } = render('# T\n\n## A\n\n## Notes {.unnumbered}\n', { numberSections: true })
    expect(html).toContain('>Notes</h2>')
  })
})

describe('figures and tables', () => {
  const doc = [
    '![First](a.png){#fig-a}',
    '',
    '![Second *shape*](b.png){#fig-b}',
    '',
    '| x | y |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    ': Results {#tbl-r}',
    '',
    'See @fig-b and @tbl-r, then [@fig-a].'
  ].join('\n')

  it('renders numbered captions for labelled figures and tables', () => {
    const { html, result } = render(doc)
    expect(html).toContain('<figure class="ms-figure" id="fig-a">')
    expect(html).toContain('Figure\u00a01:')
    expect(html).toContain('Figure\u00a02:</span> Second <em>shape</em>')
    expect(html).toContain(
      '<caption><span class="ms-caption-label">Table\u00a01:</span> Results</caption>'
    )
    expect(result.labels.map((l) => `${l.id}=${l.number}`)).toEqual([
      'fig-a=1',
      'fig-b=2',
      'tbl-r=1'
    ])
  })

  it('resolves cross-references with links to the targets', () => {
    const { html } = render(doc)
    expect(html).toContain('<a class="ms-xref" href="#fig-b">Figure 2</a>')
    expect(html).toContain('<a class="ms-xref" href="#tbl-r">Table 1</a>')
    expect(html).toContain('<a class="ms-xref" href="#fig-a">Figure 1</a>')
  })

  it('renumbers when figures move', () => {
    const swapped = doc
      .replace('![First](a.png){#fig-a}', 'TEMP')
      .replace('![Second *shape*](b.png){#fig-b}', '![First](a.png){#fig-a}')
      .replace('TEMP', '![Second *shape*](b.png){#fig-b}')
    const { html } = render(swapped)
    expect(html).toContain('<a class="ms-xref" href="#fig-b">Figure 1</a>')
  })

  it('uses the language of the document for names', () => {
    const { html } = render('![Kaart](k.png){#fig-k}\n\nZie @fig-k.', { lang: 'nl' })
    expect(html).toContain('Figuur 1')
  })

  it('numbers per chapter when requested', () => {
    const { result } = render('![A](a.png){#fig-a}', {
      chapterNumbers: true,
      start: {
        chapter: 3,
        headings: [3, 0, 0, 0, 0, 0],
        figures: 0,
        tables: 0,
        chapterTitlePending: true
      }
    })
    expect(result.labels[0].number).toBe('3.1')
  })

  it('keeps ordinary images and tables unchanged', () => {
    const { html } = render('![Plain](p.png)\n\n| a |\n| - |\n| 1 |\n')
    expect(html).not.toContain('<figure')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<caption')
  })
})

describe('diagnostics', () => {
  it('reports missing targets and keeps the reference visible', () => {
    const { html, result } = render('See @fig-nope.')
    expect(html).toContain('ms-xref-missing')
    expect(result.problems.map((p) => p.kind)).toEqual(['missing-target'])
  })

  it('reports duplicate identifiers, pointing references at the first', () => {
    const { html, result } = render('![A](a.png){#fig-x}\n\n![B](b.png){#fig-x}\n\n@fig-x')
    expect(result.problems.some((p) => p.kind === 'duplicate-id' && p.id === 'fig-x')).toBe(true)
    expect(html).toContain('href="#fig-x">Figure 1')
  })

  it('reports a figure id without the fig- prefix', () => {
    const { result } = render('![A](a.png){#picture}')
    expect(result.problems[0].kind).toBe('invalid-id')
  })

  it('reports a labelled image inside running text', () => {
    const { result } = render('Text ![A](a.png){#fig-a} more text')
    expect(result.problems[0].kind).toBe('misplaced')
  })
})

describe('table of contents', () => {
  const doc = '# Title\n\n[TOC]\n\n## One {#sec-one}\n\n### Two\n\n## Three\n'
  it('renders a nested list from the headings at the marker', () => {
    const { html } = render(doc, { toc: { enabled: false, depth: 3 }, numberSections: true })
    expect(html).toContain('class="ms-toc"')
    expect(html).toContain('href="#sec-one"')
    expect(html).toMatch(/<ul><li class="ms-toc-l1">[\s\S]*<ul><li class="ms-toc-l2">/)
    expect(html).not.toContain('href="#title"')
  })

  it('respects the depth', () => {
    const { html } = render(doc, { toc: { enabled: false, depth: 2 } })
    expect(html).not.toContain('href="#two"')
  })

  it('inserts a contents list after the title when enabled without a marker', () => {
    const { html } = render('# Title\n\n## A\n\nText\n', { toc: { enabled: true, depth: 3 } })
    expect(html.indexOf('ms-toc')).toBeGreaterThan(html.indexOf('Title'))
    expect(html.indexOf('ms-toc')).toBeLessThan(html.indexOf('Text'))
  })

  it('refers to sections by number', () => {
    const { html } = render('# T\n\n## A {#sec-a}\n\nSee @sec-a.', { numberSections: true })
    expect(html).toContain('Section 1</a>')
  })
})

describe('citations', () => {
  const cite = createCitationProvider(SOURCES, 'en')
  it('formats in-text citations and the APA bibliography at the end', () => {
    const { html, result } = render(
      'As shown [@smith2020, p. 33; @lee2021], and @smith2020 argues.',
      { cite }
    )
    expect(html).toContain('(Lee, 2021; Smith, 2020, p. 33)')
    expect(html).toContain('Smith (2020)')
    expect(html).toContain('class="ms-bibliography"')
    expect(html).toContain('Game interface design')
    expect(result.clusters).toHaveLength(2)
  })

  it('places the bibliography at ::: {#refs}', () => {
    const { html } = render('Text [@lee2021].\n\n::: {#refs}\n:::\n\nAfter.', { cite })
    expect(html.indexOf('ms-bibliography')).toBeLessThan(html.indexOf('After.'))
    expect(html.match(/ms-bibliography"/g)).toHaveLength(1)
  })

  it('shows unknown keys visibly and reports them', () => {
    const { html, result } = render('Claim [@ghost2099].', { cite })
    expect(html).toContain('ms-cite-missing')
    expect(html).toContain('(ghost2099?)')
    expect(result.problems.map((p) => p.kind)).toContain('missing-source')
    expect(html).not.toContain('ms-bibliography')
  })

  it('suppresses the author with [-@key]', () => {
    const { html } = render('Smith says [-@smith2020].', { cite })
    expect(html).toContain('(2020)')
  })

  it('disambiguates same author and year across the document', () => {
    const two: Source[] = [
      { ...SOURCES[0], id: 'a1' },
      { ...SOURCES[0], id: 'a2', title: 'Another book' }
    ]
    const { html } = render('[@a1] and [@a2]', { cite: createCitationProvider(two, 'en') })
    expect(html).toContain('2020a')
    expect(html).toContain('2020b')
  })

  it('does not treat e-mail addresses or code as citations', () => {
    const { html } = render('Mail me@example.com or `@smith2020`.', { cite })
    expect(html).not.toContain('ms-cite')
    expect(html).not.toContain('ms-bibliography')
  })

  it('never invents data for a source without author or year', () => {
    const bare: Source[] = [
      { id: 'x1', type: 'webpage', title: 'Just a title', URL: 'https://example.org/a' }
    ]
    const { html } = render('[@x1]', { cite: createCitationProvider(bare, 'en') })
    expect(html).toContain('Just a title')
    expect(html).toContain('n.d.')
  })

  it('follows the document language for APA terms', () => {
    const undated: Source[] = [
      { id: 'u1', type: 'webpage', title: 'Zonder datum', author: [{ family: 'Bakker' }] }
    ]
    const { html } = render('[@u1]', { cite: createCitationProvider(undated, 'nl') })
    expect(html).toContain('z.d.')
  })
})

describe('chapter ids', () => {
  it('prefixes generated heading ids and in-chapter links but not labels', () => {
    const { html } = render('# One\n\n[back](#one) and [lab](#sec-x)\n\n## X {#sec-x}\n', {
      idPrefix: 'c2-'
    })
    expect(html).toContain('<h1 id="c2-one">')
    expect(html).toContain('href="#c2-one"')
    expect(html).toContain('href="#sec-x"')
    expect(html).toContain('<h2 id="sec-x">')
  })
})
