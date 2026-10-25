import { describe, expect, it } from 'vitest'
import { lint } from 'markdownlint/sync'
import {
  applyIssueFixes,
  buildLintConfig,
  fixAllText,
  fixToEdit,
  lintSeverity,
  type LintIssue
} from '@shared/lint'
import { BUILT_IN_TEMPLATES } from '@shared/builtinTemplates'
import { expandTemplate } from '@shared/templates'

function run(text: string, disabled: string[] = []): LintIssue[] {
  return lint({ strings: { document: text }, config: buildLintConfig(disabled) }).document.map(
    (result) => ({
      rule: result.ruleNames[0],
      alias: result.ruleNames[1] ?? result.ruleNames[0],
      description: result.ruleDescription,
      detail: result.errorDetail,
      line: result.lineNumber,
      range: result.errorRange ? [result.errorRange[0], result.errorRange[1]] : null,
      fix: result.fixInfo ?? null
    })
  )
}

describe('lint configuration', () => {
  it('stays quiet about styles this application supports', () => {
    const text = [
      '# Title',
      '',
      'A very long line that would trigger a line-length rule in many setups because it keeps going and going well past eighty characters.',
      '',
      '<div align="center">Inline HTML is fine</div>',
      '',
      'Visit https://example.com for more.',
      '',
      '[link](#missing-fragment-is-checked-elsewhere)',
      '',
      '```',
      'code without a language',
      '```',
      ''
    ].join('\n')
    expect(run(text)).toEqual([])
  })

  it('reports common spacing and structure problems', () => {
    const text = '# One\n\n\nText with trailing   \n## Two\n- a\n- b\n\n\n[x]()\n'
    const rules = run(text).map((issue) => issue.rule)
    expect(rules).toEqual(expect.arrayContaining(['MD012', 'MD009', 'MD022', 'MD032', 'MD042']))
  })

  it('can switch rules off', () => {
    const text = '# One\n\n\nText\n'
    expect(run(text).map((i) => i.rule)).toContain('MD012')
    expect(run(text, ['md012']).map((i) => i.rule)).not.toContain('MD012')
  })

  it('does not flag valid GFM tables, tasks and the managed contents block', () => {
    const text = [
      '# Doc',
      '',
      '<!-- markdown-studio:toc:start -->',
      '',
      '- [A](#a)',
      '  - [B](#b)',
      '',
      '<!-- markdown-studio:toc:end -->',
      '',
      '## A',
      '',
      '| a   | b   |',
      '|:----|----:|',
      '| 1   |   2 |',
      '',
      '- [x] done',
      '- [ ] todo',
      '',
      '## B',
      ''
    ].join('\n')
    expect(run(text)).toEqual([])
  })

  it.each(BUILT_IN_TEMPLATES.filter((t) => t.id !== 'blank').map((t) => [t.name, t] as const))(
    'the %s template produces no style warnings',
    (_name, template) => {
      const { text } = expandTemplate(template.body, { title: 'Sample', author: 'Ana' })
      expect(run(text)).toEqual([])
    }
  )

  it('rates broken content as a warning and style notes as information', () => {
    expect(lintSeverity('MD042')).toBe('warning')
    expect(lintSeverity('MD012')).toBe('info')
  })
})

describe('applying fixes', () => {
  it('fixes spacing problems without touching other text', async () => {
    const text = '# One\n\n\nText   \n\n- a\n- b\n\n\n'
    const fixed = await fixAllText(text, run)
    expect(run(fixed)).toEqual([])
    expect(fixed).toBe('# One\n\nText\n\n- a\n- b\n')
  })

  it('keeps CRLF line endings', async () => {
    const text = '# One\r\n\r\n\r\nBody\r\n'
    const fixed = await fixAllText(text, run)
    expect(fixed).toBe('# One\r\n\r\nBody\r\n')
  })

  it('skips fixes that overlap instead of corrupting text', () => {
    const issues: LintIssue[] = [
      {
        rule: 'MD001',
        alias: 'a',
        description: '',
        detail: null,
        line: 1,
        range: null,
        fix: { editColumn: 1, deleteCount: 3, insertText: 'X' }
      },
      {
        rule: 'MD002',
        alias: 'b',
        description: '',
        detail: null,
        line: 1,
        range: null,
        fix: { editColumn: 2, deleteCount: 3, insertText: 'Y' }
      }
    ]
    // The later edit wins; the overlapping earlier one is dropped rather than merged.
    expect(applyIssueFixes('abcdef', issues)).toBe('aYef')
  })

  it('converts fix info to editor edits', () => {
    const lines = ['a', '', '', 'b']
    const deleteBlank = {
      rule: 'MD012',
      alias: '',
      description: '',
      detail: null,
      line: 3,
      range: null,
      fix: { deleteCount: -1 }
    }
    expect(fixToEdit(deleteBlank, lines)).toEqual({
      startLine: 3,
      startColumn: 1,
      endLine: 4,
      endColumn: 1,
      text: ''
    })
    const insert = { ...deleteBlank, fix: { lineNumber: 4, editColumn: 2, insertText: '\n' } }
    expect(fixToEdit(insert, lines)).toEqual({
      startLine: 4,
      startColumn: 2,
      endLine: 4,
      endColumn: 2,
      text: '\n'
    })
    expect(fixToEdit({ ...deleteBlank, fix: null }, lines)).toBeNull()
  })
})
