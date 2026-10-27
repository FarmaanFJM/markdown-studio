// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import {
  collapseSpaceRuns,
  findSpaceRuns,
  formatBlockAt,
  repairTableAt
} from '@shared/markdown/quickFixes'
import { findTableProblems } from '@shared/markdown/tables'
import { fixToEdit, type LintIssue } from '@shared/lint'
import { renderDocumentBody } from '../../src/renderer/src/markdown/document'

const analyze = analyzeDocument

function apply(source: string, edit: { startLine: number; endLine: number; lines: string[] }) {
  const lines = source.split('\n')
  lines.splice(edit.startLine, edit.endLine - edit.startLine, ...edit.lines)
  return lines.join('\n')
}

describe('repeated spaces', () => {
  it('finds runs between words and collapses them', () => {
    const source = 'Een  zin met   extra spaties.'
    const runs = findSpaceRuns(analyze(source))
    expect(runs.map((r) => r.length)).toEqual([2, 3])
    expect(collapseSpaceRuns(source.split('\n'), runs)).toEqual(['Een zin met extra spaties.'])
  })

  it('ignores indentation, hard line breaks, code, math, tables and html', () => {
    const source = [
      '- item  with run',
      '    continued',
      'hard break  ',
      'next',
      '`code  span` and $a  +  b$',
      '',
      '| a  | b |',
      '|----|---|',
      '| 1  | 2 |',
      '',
      '```',
      'code  block',
      '```',
      '',
      '<div>a  b</div>',
      '',
      '[l](<a  b.md>)'
    ].join('\n')
    const runs = findSpaceRuns(analyze(source))
    expect(runs.map((r) => r.line)).toEqual([0])
  })

  it('reports nothing for tidy text', () => {
    expect(findSpaceRuns(analyze('# Title\n\nOne space. Only one.\n'))).toEqual([])
  })
})

describe('table repair', () => {
  it('adds the missing header column when the delimiter row is wider', () => {
    const source = '| a | b |\n|---|---|---|\n| 1 | 2 | 3 |'
    const repair = repairTableAt(analyze(source), 0, { maxWidth: 0 })!
    const fixed = apply(source, repair)
    expect(fixed.split('\n')[0]).toBe('| a   | b   |     |')
    expect(rendered(fixed)).toContain('<th>b</th>')
    expect(findTableProblems(analyze(fixed))).toEqual([])
  })

  it('extends the delimiter row when the header is wider', () => {
    const source = '| a | b | c |\n|---|---|\n| 1 | 2 | 3 |'
    const fixed = apply(source, repairTableAt(analyze(source), 1, { maxWidth: 0 })!)
    expect(fixed.split('\n')[1]).toBe('|-----|-----|-----|')
    expect(findTableProblems(analyze(fixed))).toEqual([])
  })

  it('keeps cells that a row has beyond the header instead of dropping them', () => {
    const source = '| a | b |\n|---|---|\n| 1 | 2 | 3 |'
    expect(findTableProblems(analyze(source))).toHaveLength(1)
    const fixed = apply(source, repairTableAt(analyze(source), 2, { maxWidth: 0 })!)
    expect(fixed).toContain('3')
    expect(findTableProblems(analyze(fixed))).toEqual([])
  })

  it('has nothing to repair in a valid table', () => {
    expect(repairTableAt(analyze('| a | b |\n|---|---|\n| 1 | 2 |'), 0)).toBeNull()
  })
})

function rendered(source: string): string {
  return renderDocumentBody(source, { documentDirectory: null, workspaceRoot: null })
}

describe('format block', () => {
  it('reformats a table and is idempotent', () => {
    const source = '|a|b|\n|-|-|\n|long cell|x|'
    const first = formatBlockAt(analyze(source), 1)!
    expect(first.kind).toBe('table')
    const once = apply(source, first)
    expect(formatBlockAt(analyze(once), 1)).toBeNull()
  })

  it('normalizes heading spacing', () => {
    const edit = formatBlockAt(analyze('##   Titel   met  spaties  ##'), 0)!
    expect(edit.kind).toBe('heading')
    expect(edit.lines).toEqual(['## Titel met spaties'])
  })

  it('leaves a tidy heading alone', () => {
    expect(formatBlockAt(analyze('## Titel'), 0)).toBeNull()
  })

  it('normalizes list markers, spacing and numbering', () => {
    const source = '*   een\n-   twee\n+ drie'
    expect(formatBlockAt(analyze(source), 0)!.lines).toEqual(['* een', '* twee', '* drie'])
    const ordered = '1.  a\n3.  b\n7. c'
    expect(formatBlockAt(analyze(ordered), 1)!.lines).toEqual(['1. a', '2. b', '3. c'])
    const same = '1. a\n1. b\n1. c'
    expect(formatBlockAt(analyze(same), 0)).toBeNull()
  })

  it('keeps nesting and task checkboxes in lists', () => {
    const source = '-  [x]  klaar\n    -   diep'
    const lines = formatBlockAt(analyze(source), 0)!.lines
    expect(lines).toEqual(['- [x] klaar', '    - diep'])
  })

  it('collapses spaces in a paragraph and keeps a hard break', () => {
    const source = 'Eerste  regel  \nTweede   regel  '
    expect(formatBlockAt(analyze(source), 0)!.lines).toEqual(['Eerste regel  ', 'Tweede regel'])
  })

  it('does nothing inside code blocks', () => {
    expect(formatBlockAt(analyze('```\na   b\n```'), 1)).toBeNull()
  })
})

describe('heading level quick fix', () => {
  const issue = (line: number, detail: string): LintIssue => ({
    rule: 'MD001',
    alias: 'heading-increment',
    description: 'Heading levels should only increment by one level at a time',
    detail,
    line,
    range: null,
    fix: null
  })

  it('changes a skipped atx heading to the expected level', () => {
    const lines = ['# T', '', '#### Diep']
    expect(fixToEdit(issue(3, 'Expected: h2; Actual: h4'), lines)).toEqual({
      startLine: 3,
      startColumn: 1,
      endLine: 3,
      endColumn: 5,
      text: '##'
    })
  })

  it('offers nothing for setext headings', () => {
    expect(fixToEdit(issue(2, 'Expected: h2; Actual: h3'), ['# T', 'Diep', '---'])).toBeNull()
  })
})
