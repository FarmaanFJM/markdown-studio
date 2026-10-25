import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import { formatTable, parseTableBlock } from '@shared/markdown/tables'
import {
  applyDocumentPage,
  documentPageFields,
  readDocumentSettings,
  settingsFromText,
  writeDocumentSettings
} from '@shared/publishing/documentSettings'
import { bodyOf, splitFrontMatter, updateFrontMatter } from '@shared/publishing/frontMatter'
import { importSourcesText } from '@shared/publishing/importSources'
import {
  moveChapter,
  normalizeChapterPath,
  renameInChapters,
  sanitizePublication
} from '@shared/publishing/project'
import {
  describeSource,
  missingFields,
  parseNameList,
  sanitizeSources,
  suggestKey,
  formatNameList
} from '@shared/publishing/sources'
import { DEFAULT_PDF_OPTIONS } from '@shared/export/pdf'
import { createApplicationMarkdownIt } from '@shared/markdown/plugins'

describe('front matter', () => {
  it('splits a block from the body and reads its data', () => {
    const fm = splitFrontMatter('---\ntitle: Report\ntoc: true\n---\n\n# Body\n')
    expect(fm.present).toBe(true)
    expect(fm.data).toEqual({ title: 'Report', toc: true })
    expect(bodyOf('---\ntitle: x\n---\n# Body\n')).toBe('# Body\n')
    expect(splitFrontMatter('# Just text\n').present).toBe(false)
  })

  it('reports damaged YAML and refuses to rewrite it', () => {
    const text = '---\ntitle: [unclosed\n---\n# Body\n'
    expect(splitFrontMatter(text).error).toBeTruthy()
    expect(() => updateFrontMatter(text, { toc: true })).toThrow(/cannot be edited/)
  })

  it('adds, changes and removes keys while keeping the rest, comments and CRLF', () => {
    const text = '---\r\ntitle: Report\r\n# keep me\r\nauthor: Ana\r\n---\r\n\r\n# Body\r\n'
    const next = updateFrontMatter(text, { toc: true, title: undefined })
    expect(next).toContain('# keep me')
    expect(next).toContain('author: Ana')
    expect(next).toContain('toc: true')
    expect(next).not.toContain('title:')
    expect(next).toContain('\r\n# Body\r\n')
    expect(next.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('creates a block when there is none and drops it when nothing is left', () => {
    const created = updateFrontMatter('# Body\n', { toc: true })
    expect(created).toBe('---\ntoc: true\n---\n\n# Body\n')
    expect(updateFrontMatter(created, { toc: undefined })).toBe('# Body\n')
  })

  it('keeps the byte order mark', () => {
    const next = updateFrontMatter('\uFEFF---\ntitle: a\n---\nBody\n', { toc: true })
    expect(next.startsWith('\uFEFF---')).toBe(true)
  })

  it('is hidden from the rendering and keeps the line numbers of the tooling', () => {
    const text = '---\ntitle: x\n---\n\n# Heading\n'
    const analysis = analyzeDocument(text)
    expect(analysis.headings).toHaveLength(1)
    expect(analysis.headings[0].text).toBe('Heading')
    expect(analysis.headings[0].line).toBe(4)
  })
})

describe('document settings', () => {
  const text = `---
title: Health UI
author: Ana
lang: nl
toc: true
toc-depth: 2
number-sections: true
studio:
  theme: report
  columns: { count: 2, gap: 6 }
  page: { size: A5, orientation: landscape, margins: { top: 15, left: 12 } }
  header: false
  footer: { text: 'Page {page}', align: right }
---
Body`

  it('reads standard keys and the studio section', () => {
    const { settings, problems } = settingsFromText(text)
    expect(problems).toEqual([])
    expect(settings).toMatchObject({
      title: 'Health UI',
      author: 'Ana',
      lang: 'nl',
      toc: { enabled: true, depth: 2 },
      numberSections: true,
      theme: 'report',
      columns: { count: 2, gapMm: 6 },
      page: { pageSize: 'A5', orientation: 'landscape', margins: { top: 15, left: 12 } },
      header: { enabled: false },
      footer: { text: 'Page {page}', align: 'right' }
    })
  })

  it('reports values it cannot use instead of ignoring them silently', () => {
    const read = readDocumentSettings({
      toc: 'yes',
      'toc-depth': 9,
      studio: { theme: 'neon', columns: 3, page: { size: 'B9', margins: { top: -4 } } }
    })
    expect(read.problems.length).toBeGreaterThanOrEqual(5)
    expect(read.settings.columns).toBeUndefined()
    expect(read.settings.theme).toBeUndefined()
  })

  it('layers the document page choices on the export setup', () => {
    const { settings } = settingsFromText(text)
    const pdf = applyDocumentPage(DEFAULT_PDF_OPTIONS, settings)
    expect(pdf.pageSize).toBe('A5')
    expect(pdf.orientation).toBe('landscape')
    expect(pdf.margins).toMatchObject({ top: 15, left: 12, right: 20, bottom: 20 })
    expect(pdf.header.enabled).toBe(false)
    expect(pdf.footer).toMatchObject({ enabled: true, text: 'Page {page}', align: 'right' })
    expect(documentPageFields(settings)).toEqual(['page size', 'margins', 'header', 'footer'])
    expect(applyDocumentPage(DEFAULT_PDF_OPTIONS, {})).toBe(DEFAULT_PDF_OPTIONS)
  })

  it('writes settings back and reads the same settings again', () => {
    const { settings } = settingsFromText(text)
    const rewritten = writeDocumentSettings(text, settings)
    expect(settingsFromText(rewritten).settings).toEqual(settings)
    expect(rewritten.endsWith('Body')).toBe(true)
  })

  it('keeps keys of other tools when the settings change', () => {
    const next = writeDocumentSettings('---\nbibliography: a.bib\ncsl: apa.csl\n---\nText\n', {
      toc: { enabled: true, depth: 3 }
    })
    expect(next).toContain('csl: apa.csl')
  })
})

describe('sources', () => {
  it('validates CSL JSON and reports what was skipped', () => {
    const { sources, problems } = sanitizeSources([
      {
        id: 'ok2020',
        type: 'book',
        title: 'T',
        author: [{ family: 'A', given: 'B' }],
        issued: { 'date-parts': [[2020]] }
      },
      { id: 'ok2020', type: 'book' },
      { id: 'bad key', type: 'book' },
      { type: 'book' },
      'nonsense',
      { id: 'weird', type: 'unknown-type', evil: '<script>', title: 'x'.repeat(10_000) }
    ])
    expect(sources.map((s) => s.id)).toEqual(['ok2020', 'weird'])
    expect(sources[1].type).toBe('document')
    expect(sources[1]).not.toHaveProperty('evil')
    expect(sources[1].title).toHaveLength(4000)
    expect(problems.length).toBe(5)
  })

  it('imports BibTeX without inventing anything', () => {
    const result = importSourcesText(
      `@book{smith2020,
  author = {Smith, Jane and Lee, Al},
  title = {Game {UI} design},
  year = {2020},
  publisher = {Press}
}
@misc{nodata, title = {Only a title}}`,
      'refs.bib'
    )
    expect(result.sources.map((s) => s.id)).toEqual(['smith2020', 'nodata'])
    const smith = result.sources[0]
    expect(smith.author).toEqual([
      { family: 'Smith', given: 'Jane' },
      { family: 'Lee', given: 'Al' }
    ])
    expect(smith.issued).toEqual({ 'date-parts': [[2020]] })
    const bare = result.sources[1]
    expect(bare.author).toBeUndefined()
    expect(bare.issued).toBeUndefined()
    expect(missingFields(bare).map((m) => m.field)).toEqual(
      expect.arrayContaining(['author', 'issued'])
    )
  })

  it('imports CSL JSON and rejects garbage with a message', () => {
    expect(
      importSourcesText('[{"id":"a1","type":"book","title":"T"}]', 'x.json').sources
    ).toHaveLength(1)
    expect(importSourcesText('not json {', 'x.json').problems[0]).toMatch(/not valid JSON/)
    expect(importSourcesText('', 'x.bib').problems[0]).toMatch(/empty/)
  })

  it('suggests unique keys and parses people', () => {
    const taken = new Set(['smith2020'])
    expect(
      suggestKey({ author: [{ family: 'Smith' }], issued: { 'date-parts': [[2020]] } }, taken)
    ).toBe('smith2020a')
    expect(suggestKey({ author: [{ family: 'Müller-Ünal' }] }, new Set())).toBe(
      'mulleruenal'.replace('ue', 'u')
    )
    const people = parseNameList('Smith, Jane; World Health Organization')
    expect(people).toEqual([
      { family: 'Smith', given: 'Jane' },
      { literal: 'World Health Organization' }
    ])
    expect(formatNameList(people)).toBe('Smith, Jane; World Health Organization')
    expect(describeSource({ id: 'x', type: 'book', author: [{ literal: 'WHO' }] })).toBe(
      'WHO (n.d.)'
    )
  })
})

describe('publication configuration', () => {
  it('accepts only safe workspace-relative Markdown chapter paths', () => {
    expect(normalizeChapterPath('01-intro/intro.md')).toBe('01-intro/intro.md')
    expect(normalizeChapterPath('.\\ch\\one.MD')).toBe('ch/one.MD')
    for (const bad of [
      '../x.md',
      '/etc/a.md',
      'C:/a.md',
      'a/../../b.md',
      'a.txt',
      '',
      'a//b.md',
      5
    ]) {
      expect(normalizeChapterPath(bad)).toBeNull()
    }
  })

  it('sanitises options, deduplicates chapters and keeps their order', () => {
    const config = sanitizePublication({
      title: '  My book  ',
      lang: 'xx!!',
      chapters: ['b.md', 'a.md', 'b.md', '../evil.md', 7],
      toc: { enabled: true, depth: 99 },
      layout: { columns: { count: 2, gapMm: 6 }, theme: 'report', page: { pageSize: 'A5' } }
    })
    expect(config.title).toBe('My book')
    expect(config.lang).toBe('en')
    expect(config.chapters).toEqual(['b.md', 'a.md'])
    expect(config.toc.depth).toBe(3)
    expect(config.layout).toMatchObject({
      theme: 'report',
      columns: { count: 2, gapMm: 6 },
      page: { pageSize: 'A5' }
    })
    expect(
      sanitizePublication({ layout: { columns: { count: 5 }, theme: 'nope' } }).layout
    ).toEqual({})
    expect(sanitizePublication(sanitizePublication(config))).toEqual(config)
  })

  it('reorders chapters and follows renames of files and folders', () => {
    expect(moveChapter(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveChapter(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(renameInChapters(['x/a.md', 'x/b.md', 'y/c.md'], 'x', 'z')).toEqual([
      'z/a.md',
      'z/b.md',
      'y/c.md'
    ])
    expect(renameInChapters(['x/a.md'], 'x/a.md', 'x/renamed.md')).toEqual(['x/renamed.md'])
  })
})

describe('tables with captions', () => {
  const doc = '| a | b |\n| - | - |\n| 1 | 2 |\n\n: Caption {#tbl-x}\n\nAfter.\n'

  it('formatting a table leaves its caption alone', () => {
    const analysis = analyzeDocument(doc)
    const block = analysis.tables[0]
    const parsed = parseTableBlock(analysis, block)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.end).toBe(3)
      expect(formatTable(parsed.table)).toHaveLength(3)
    }
  })

  it('renders the same cells with and without the caption line', () => {
    const md = createApplicationMarkdownIt()
    const withCaption = md.render(doc, { ms: {} })
    const without = md.render(doc.replace(/: Caption \{#tbl-x\}\n\n/, ''), { ms: {} })
    expect(
      withCaption
        .replace(/<caption>.*?<\/caption>\n/s, '')
        .replace(/ class="ms-table ms-table-short" id="tbl-x"/, '')
    ).toBe(without)
  })
})
