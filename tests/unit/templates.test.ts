// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import { BUILT_IN_TEMPLATES } from '@shared/builtinTemplates'
import {
  expandTemplate,
  fileNameFromTitle,
  makeTemplateId,
  templateToSnippet,
  titleFromName,
  usedVariables,
  validateTemplate
} from '@shared/templates'
import { renderDocumentBody } from '../../src/renderer/src/markdown/document'

const NOW = new Date(2026, 2, 9, 7, 5, 0)

describe('template variables', () => {
  it('expands every documented variable', () => {
    const result = expandTemplate(
      '# {{title}}\n{{date}} | {{datetime}} | {{author}}\n{{cursor}}end',
      { title: 'Plan', author: 'Sam' },
      NOW
    )
    expect(result.text).toBe('# Plan\n2026-03-09 | 2026-03-09 07:05 | Sam\nend')
    expect(result.cursorOffset).toBe('# Plan\n2026-03-09 | 2026-03-09 07:05 | Sam\n'.length)
  })

  it('tolerates spaces, leaves unknown names alone and honours escapes', () => {
    const result = expandTemplate(
      '{{ title }} {{unknown}} \\{{title}}',
      { title: 'T', author: '' },
      NOW
    )
    expect(result.text).toBe('T {{unknown}} {{title}}')
    expect(result.cursorOffset).toBeNull()
  })

  it('never re-expands substituted values', () => {
    const result = expandTemplate('{{title}}', { title: '{{author}}', author: 'Eve' }, NOW)
    expect(result.text).toBe('{{author}}')
  })

  it('does not invent an author: an empty value leaves no trailing space', () => {
    const result = expandTemplate('**Author:** {{author}}\nplain  ', { title: '', author: '' }, NOW)
    expect(result.text).toBe('**Author:**\nplain  ')
  })

  it('uses only the first cursor and removes the others', () => {
    const result = expandTemplate('a{{cursor}}b{{cursor}}c', { title: '', author: '' }, NOW)
    expect(result.text).toBe('abc')
    expect(result.cursorOffset).toBe(1)
  })

  it('reports which variables a template needs to ask for', () => {
    expect([...usedVariables('{{title}} \\{{author}} {{unknown}} {{date}}')].sort()).toEqual([
      'date',
      'title'
    ])
  })

  it('does not execute anything embedded in a template', () => {
    const result = expandTemplate(
      '{{constructor}} ${process.exit()} {{__proto__}}',
      { title: '', author: '' },
      NOW
    )
    expect(result.text).toBe('{{constructor}} ${process.exit()} {{__proto__}}')
  })
})

describe('snippet conversion', () => {
  it('escapes snippet syntax and places the cursor', () => {
    expect(templateToSnippet('cost: $5 {x} \\ {{cursor}}', {}, NOW)).toBe(
      'cost: \\$5 {x\\} \\\\ $0'
    )
  })

  it('fills dates and turns unknown title/author into editable placeholders', () => {
    const snippet = templateToSnippet('{{date}} by {{author}} on {{title}}', { title: 'Doc' }, NOW)
    expect(snippet).toBe('2026-03-09 by ${1:author} on Doc')
  })
})

describe('naming helpers', () => {
  it('derives titles, file names and ids', () => {
    expect(titleFromName('meeting-notes_v2.md')).toBe('Meeting notes v2')
    expect(fileNameFromTitle('Q3 report: draft?')).toBe('Q3 report draft')
    expect(fileNameFromTitle('???')).toBe('Untitled')
    expect(makeTemplateId('My Template!', ['my-template'])).toBe('my-template-2')
    expect(makeTemplateId('日本語', [])).toBe('template')
  })
})

describe('template validation', () => {
  const valid = { id: 'ok-1', name: ' Name ', description: 'd', kind: 'document', body: 'x\r\ny' }

  it('accepts and normalises a template', () => {
    const result = validateTemplate(valid)
    expect(result.ok && result.template).toMatchObject({
      name: 'Name',
      body: 'x\ny',
      kind: 'document'
    })
  })

  it('rejects unusable input', () => {
    expect(validateTemplate(null).ok).toBe(false)
    expect(validateTemplate({ ...valid, name: '  ' }).ok).toBe(false)
    expect(validateTemplate({ ...valid, id: '../evil' }).ok).toBe(false)
    expect(validateTemplate({ ...valid, id: 'A/B' }).ok).toBe(false)
    expect(validateTemplate({ ...valid, body: 5 }).ok).toBe(false)
    expect(validateTemplate({ ...valid, body: 'x'.repeat(600 * 1024) }).ok).toBe(false)
  })
})

describe('built-in templates', () => {
  it('provides the required set', () => {
    expect(BUILT_IN_TEMPLATES.map((t) => t.name)).toEqual([
      'Blank document',
      'README',
      'Technical documentation',
      'Project notes',
      'Meeting notes',
      'Report'
    ])
  })

  it.each(BUILT_IN_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s expands to valid, self-contained Markdown',
    (_name, template) => {
      const { text } = expandTemplate(template.body, { title: 'Sample', author: 'Ana' }, NOW)
      expect(text).not.toMatch(/\{\{/)
      const html = renderDocumentBody(text, { documentDirectory: null, workspaceRoot: null })
      if (template.id !== 'blank') {
        expect(html).toContain('<h1')
        expect(html).toContain('Sample')
      }
      // No images or local links: the templates work anywhere.
      expect(html).not.toContain('<img')
      if (template.id !== 'blank') {
        expect(analyzeDocument(text).headings.length).toBeGreaterThan(2)
      }
    }
  )
})
