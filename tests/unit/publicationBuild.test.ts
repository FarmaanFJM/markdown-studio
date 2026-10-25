// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildPublication, type ChapterInput } from '../../src/renderer/src/publishing/build'
import { sanitizePublication } from '@shared/publishing/project'
import type { Source } from '@shared/publishing/sources'

const SOURCES: Source[] = [
  {
    id: 'smith2020',
    type: 'book',
    title: 'Game interface design',
    author: [{ family: 'Smith', given: 'Jane' }],
    issued: { 'date-parts': [[2020]] },
    publisher: 'Press'
  }
]

const config = sanitizePublication({
  title: 'Health UI research',
  author: 'A. Student',
  lang: 'en',
  chapters: ['01-intro/intro.md', '02-games/games.md']
})

function chapters(overrides: Partial<Record<string, string | null>> = {}): ChapterInput[] {
  return [
    {
      path: '01-intro/intro.md',
      directory: '/p/01-intro',
      text:
        overrides.intro ??
        '# Introduction {#sec-intro}\n\nSee @fig-bars in @sec-games and [@smith2020].\n\n![Intro art](art/intro.png){#fig-art}\n'
    },
    {
      path: '02-games/games.md',
      directory: '/p/02-games',
      text:
        overrides.games === null
          ? null
          : (overrides.games ??
            '# Games {#sec-games}\n\n## Bars\n\n![Health bars](images/bars.png){#fig-bars}\n\nBack to @fig-art and [@smith2020, p. 4].\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n: Comparison {#tbl-cmp}\n')
    }
  ]
}

const features = { math: true, diagrams: true }
const ctx = (list = chapters()) => buildPublication(config, list, SOURCES, '/p')
/** DOMPurify serialises no-break spaces as entities and adds rel attributes. */
const norm = (html: string) =>
  html.replace(/&nbsp;/g, '\u00a0').replace(/ rel="noopener noreferrer"/g, '')

describe('buildPublication', () => {
  it('numbers chapters, figures and tables across chapters', () => {
    const build = ctx()
    expect(build.labels.map((l) => `${l.id}=${l.number}`)).toEqual([
      'sec-intro=1',
      'fig-art=1.1',
      'sec-games=2',
      'fig-bars=2.1',
      'tbl-cmp=2.1'
    ])
    const html = norm(build.body(features))
    expect(html).toContain('Figure 1.1:')
    expect(html).toContain('Figure 2.1:')
    expect(html).toContain('<span class="ms-secnum">2.1</span> Bars')
  })

  it('resolves references between chapters', () => {
    const html = norm(ctx().body(features))
    expect(html).toContain('<a class="ms-xref" href="#fig-bars">Figure 2.1</a>')
    expect(html).toContain('<a class="ms-xref" href="#fig-art">Figure 1.1</a>')
    expect(html).toContain('href="#sec-games">Section 2</a>')
  })

  it('continues numbering when chapter numbers are off', () => {
    const flat = sanitizePublication({ ...config, chapterNumbers: false })
    const build = buildPublication(flat, chapters(), SOURCES, '/p')
    expect(build.labels.find((l) => l.id === 'fig-bars')?.number).toBe('2')
  })

  it('builds one combined contents list with unique anchors', () => {
    const html = norm(ctx().body(features))
    expect(html.match(/class="ms-toc"/g)).toHaveLength(1)
    expect(html).toContain('href="#sec-games"')
    expect(html).toContain('href="#c2-bars"')
    expect(html).toContain('id="c2-bars"')
  })

  it('resolves images from the chapter that contains them', () => {
    const html = norm(ctx().body(features))
    expect(html).toContain(encodeURIComponent('/p/01-intro/art/intro.png'))
    expect(html).toContain(encodeURIComponent('/p/02-games/images/bars.png'))
  })

  it('formats citations once for the whole publication', () => {
    const html = norm(ctx().body(features))
    expect(html.match(/ms-bibliography"/g)).toHaveLength(1)
    expect(html).toContain('(Smith, 2020)')
    expect(html).toContain('(Smith, 2020, p. 4)')
  })

  it('reports duplicate identifiers across chapters and keeps the first', () => {
    const build = ctx(chapters({ games: '# Games\n\n![Dup](x.png){#fig-art}\n' }))
    const dup = build.problems.find((p) => p.kind === 'duplicate-id')
    expect(dup?.file).toBe('02-games/games.md')
    expect(dup?.message).toContain('01-intro/intro.md')
  })

  it('shows a visible placeholder and a problem for an unreadable chapter', () => {
    const build = ctx(chapters({ games: null }))
    expect(build.body(features)).toContain('could not be read')
    expect(build.problems.some((p) => p.file === '02-games/games.md')).toBe(true)
    expect(build.chapters[1].missing).toBe(true)
  })

  it('reports references to missing targets', () => {
    const build = ctx(chapters({ intro: '# Intro\n\nSee @fig-nowhere.\n' }))
    expect(build.problems.some((p) => p.kind === 'missing-target' && p.id === 'fig-nowhere')).toBe(
      true
    )
  })

  it('renumbers after the chapter order changes', () => {
    const swapped = sanitizePublication({
      ...config,
      chapters: ['02-games/games.md', '01-intro/intro.md']
    })
    const [intro, games] = chapters()
    const build = buildPublication(swapped, [games, intro], SOURCES, '/p')
    expect(build.labels.find((l) => l.id === 'fig-bars')?.number).toBe('1.1')
    expect(build.labels.find((l) => l.id === 'fig-art')?.number).toBe('2.1')
  })

  it('puts the title block first and honours page breaks', () => {
    const html = norm(ctx().body(features))
    expect(html.indexOf('Health UI research')).toBeLessThan(html.indexOf('ms-toc'))
    expect(html).toContain('data-newpage="true"')
  })
})

describe('export of a publication', () => {
  it('produces a standalone HTML document that passes the safety audit and keeps the structure', async () => {
    ;(globalThis as unknown as { markdownStudio: unknown }).markdownStudio = {
      platform: 'linux',
      diagram: {
        render: async () => ({ ok: false, message: 'none' }),
        cancel: async () => undefined
      }
    }
    const { buildStandaloneHtml } = await import('../../src/renderer/src/markdown/exporters')
    const { DEFAULT_PRESENTATION } = await import('../../src/renderer/src/markdown/document')
    const build = ctx()
    const built = await buildStandaloneHtml(
      {
        source: '',
        fileName: 'publication.md',
        context: { documentDirectory: '/p', workspaceRoot: '/p' },
        body: (presentation) => build.body(presentation),
        title: build.title
      },
      { ...DEFAULT_PRESENTATION, columns: { count: 2, gapMm: 6 }, numberedSections: true },
      { embedImages: false }
    )
    const html = norm(built.html)
    expect(html).toContain('<title>Health UI research</title>')
    expect(html).toContain('data-columns="2"')
    expect(html).toContain('data-numbered="true"')
    expect(html).toContain('<figure class="ms-figure" id="fig-bars">')
    expect(html).toContain('Figure 2.1:')
    expect(html).not.toContain('msfile:')
    expect(built.brokenAnchors).toEqual([])
  })
})
