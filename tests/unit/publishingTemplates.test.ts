import { describe, expect, it } from 'vitest'
import { BUILT_IN_TEMPLATES, findBuiltInTemplate } from '@shared/builtinTemplates'
import { createApplicationMarkdownIt } from '@shared/markdown/plugins'
import { analyzePublishing } from '@shared/publishing/analyze'
import { settingsFromText } from '@shared/publishing/documentSettings'
import { expandTemplate } from '@shared/templates'
import type { PublishingEnv } from '@shared/publishing/types'

const NOW = new Date('2026-10-26T09:00:00')
const IDS = ['research-report', 'research-report-nl', 'health-ui-research', 'two-column-article']

function expanded(id: string): string {
  const template = findBuiltInTemplate(id)!
  return expandTemplate(template.body, { title: 'Sample', author: 'Ana' }, NOW).text
}

describe('publishing templates', () => {
  it.each(IDS)('%s has readable settings in its front matter and nothing ignored', (id) => {
    const read = settingsFromText(expanded(id))
    expect(read.frontMatterError).toBeNull()
    expect(read.problems).toEqual([])
    expect(read.settings.lang).toBeDefined()
  })

  it.each(IDS)('%s analyses without problems and invents no sources or findings', (id) => {
    const text = expanded(id)
    const result = analyzePublishing(text, { numberSections: true })
    expect(result.problems).toEqual([])
    expect(result.clusters).toEqual([])
    const html = createApplicationMarkdownIt().render(text, { ms: { numberSections: true } })
    expect(html).not.toContain('ms-cite')
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('the research report and the Health UI template carry the required sections', () => {
    const report = expanded('research-report')
    for (const heading of [
      'Summary',
      'Introduction',
      'Method',
      'Findings',
      'Discussion',
      'Conclusion',
      'References'
    ]) {
      expect(report).toContain(`## ${heading}`)
    }
    expect(report).toContain('::: {#refs}')
    const health = expanded('health-ui-research')
    for (const heading of [
      'Research question',
      'Game analyses',
      'Comparison',
      'Conclusions',
      'Design ideas',
      'Sources'
    ]) {
      expect(health).toContain(`## ${heading}`)
    }
    expect(health).toMatch(/Figma link/)
    expect(health).toMatch(/Screenshots/)
    expect(health).toContain('{#tbl-health-ui-comparison}')
  })

  it('the Dutch report sets the language so captions and APA terms follow it', () => {
    expect(settingsFromText(expanded('research-report-nl')).settings.lang).toBe('nl')
  })

  it('the two-column article defines a two-column layout and page margins', () => {
    const { settings } = settingsFromText(expanded('two-column-article'))
    expect(settings.columns).toEqual({ count: 2, gapMm: 8 })
    expect(settings.page?.margins).toEqual({ top: 20, right: 18, bottom: 20, left: 18 })
    expect(settings.footer?.text).toBe('Page {page} of {pages}')
  })

  it('numbers the tables of the Health UI template in document order', () => {
    const env: PublishingEnv = { ms: { numberSections: true } }
    createApplicationMarkdownIt().render(expanded('health-ui-research'), env as never)
    const tables = env.ms!.result!.labels.filter((l) => l.kind === 'tbl')
    expect(tables.map((t) => t.number)).toEqual(['1', '2', '3', '4'])
  })

  it('is part of the built-in set', () => {
    expect(BUILT_IN_TEMPLATES.filter((t) => IDS.includes(t.id))).toHaveLength(IDS.length)
  })
})
