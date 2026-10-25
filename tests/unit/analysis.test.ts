import { describe, expect, it } from 'vitest'
import {
  analyzeDocument,
  documentAnchors,
  fenceOpeningAt,
  headingAtLine,
  isInsideFenceContent,
  tableAtLine
} from '@shared/markdown/analysis'
import { renderMarkdown } from '../../src/renderer/src/markdown/render'

const DOC = `# Project

Intro.

## Installation

### Windows

\`\`\`bash
# not a heading
## nor this
\`\`\`

### Linux

Setext Title
============

Another
-------

## Installation

<h2 id="html-heading">Raw HTML heading</h2>
<a name="legacy-anchor"></a>

| a | b |
|---|---|
| 1 | 2 |
`

describe('document analysis', () => {
  const analysis = analyzeDocument(DOC)

  it('lists real headings only, in order, with levels', () => {
    expect(analysis.headings.map((h) => [h.level, h.text])).toEqual([
      [1, 'Project'],
      [2, 'Installation'],
      [3, 'Windows'],
      [3, 'Linux'],
      [1, 'Setext Title'],
      [2, 'Another'],
      [2, 'Installation']
    ])
  })

  it('flags Setext headings and gives them the underline in their range', () => {
    const setext = analysis.headings.find((h) => h.text === 'Setext Title')!
    expect(setext.setext).toBe(true)
    expect(setext.endLine - setext.line).toBe(2)
    expect(analysis.headings[0].setext).toBe(false)
  })

  it('assigns the exact ids the preview renders, including duplicates', () => {
    const html = renderMarkdown(DOC)
    for (const heading of analysis.headings) {
      expect(html).toContain(`id="${heading.id}"`)
    }
    expect(analysis.headings.map((h) => h.id)).toEqual([
      'project',
      'installation',
      'windows',
      'linux',
      'setext-title',
      'another',
      'installation-1'
    ])
  })

  it('knows about fenced code and keeps its lines out of the outline', () => {
    const fenceLine = DOC.split('\n').findIndex((l) => l.startsWith('```bash'))
    expect(isInsideFenceContent(analysis, fenceLine + 1)).toBe(true)
    expect(isInsideFenceContent(analysis, fenceLine)).toBe(false)
    expect(fenceOpeningAt(analysis, fenceLine)?.info).toBe('bash')
    expect(analysis.headings.some((h) => h.text.includes('not a heading'))).toBe(false)
  })

  it('finds tables and heading context for a line', () => {
    const tableLine = DOC.split('\n').findIndex((l) => l.startsWith('| a'))
    expect(tableAtLine(analysis, tableLine)).not.toBeNull()
    expect(tableAtLine(analysis, 0)).toBeNull()
    expect(headingAtLine(analysis, tableLine)?.text).toBe('Installation')
    expect(headingAtLine(analysis, 0)?.text).toBe('Project')
  })

  it('collects heading ids and HTML anchors as link targets', () => {
    const anchors = documentAnchors(analysis)
    expect(anchors.has('installation-1')).toBe(true)
    expect(anchors.has('html-heading')).toBe(true)
    expect(anchors.has('legacy-anchor')).toBe(true)
  })

  it('marks headings omitted from the table of contents', () => {
    const doc = analyzeDocument('# A\n\n## Hidden <!-- omit in toc -->\n\n## Shown\n')
    expect(doc.headings.map((h) => [h.text, h.omitFromToc])).toEqual([
      ['A', false],
      ['Hidden', true],
      ['Shown', false]
    ])
  })

  it('handles CRLF line endings', () => {
    const crlf = analyzeDocument('# One\r\n\r\n## Two\r\n')
    expect(crlf.headings.map((h) => h.line)).toEqual([0, 2])
  })
})
