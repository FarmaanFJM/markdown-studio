// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import {
  cellPosition,
  deleteColumn,
  deleteRow,
  displayWidth,
  escapeTableCell,
  findTableProblems,
  formatTable,
  insertColumn,
  insertRow,
  locateInTable,
  parseTableBlock,
  setColumnAlignment,
  splitCells,
  unescapeTableCell
} from '@shared/markdown/tables'
import { renderDocumentBody } from '../../src/renderer/src/markdown/document'

function parse(source: string, index = 0) {
  const analysis = analyzeDocument(source)
  const result = parseTableBlock(analysis, analysis.tables[index])
  if (!result.ok) throw new Error(result.reason)
  return { analysis, ...result }
}

function format(source: string, index = 0): string[] {
  return formatTable(parse(source, index).table)
}

/** Cell texts the preview renders for the first table of a document. */
function renderedCells(source: string): string[][] {
  const host = document.createElement('div')
  host.innerHTML = renderDocumentBody(source, { documentDirectory: null, workspaceRoot: null })
  return [...host.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('th,td')].map((cell) => cell.textContent ?? '')
  )
}

describe('table formatting', () => {
  it('aligns the specification example', () => {
    expect(
      format('|Name|Age|City|\n|---|---|---|\n|Alice|24|Amsterdam|\n|Bob|30|Rotterdam|')
    ).toEqual([
      '| Name  | Age | City      |',
      '|-------|-----|-----------|',
      '| Alice | 24  | Amsterdam |',
      '| Bob   | 30  | Rotterdam |'
    ])
  })

  it('preserves and renders left, center and right alignment', () => {
    const lines = format('a|b|c|d\n:--|:-:|--:|---\n1|2|3|4')
    expect(lines).toEqual([
      '| a   |  b  |   c | d   |',
      '|:----|:---:|----:|-----|',
      '| 1   |  2  |   3 | 4   |'
    ])
    const html = renderDocumentBody(lines.join('\n'), {
      documentDirectory: null,
      workspaceRoot: null
    })
    expect(html).toContain('text-align:left')
    expect(html).toContain('text-align:center')
    expect(html).toContain('text-align:right')
  })

  it('handles empty cells, ragged rows and missing outer pipes', () => {
    expect(format('| a | b |\n|-|-|\n| x |\n|| y |')).toEqual([
      '| a   | b   |',
      '|-----|-----|',
      '| x   |     |',
      '|     | y   |'
    ])
  })

  it('keeps escaped pipes inside their cell', () => {
    const lines = format('| expr | note |\n|---|---|\n| a \\| b | ok |')
    expect(lines[2]).toBe('| a \\| b | ok   |')
    expect(renderedCells(lines.join('\n'))[1]).toEqual(['a | b', 'ok'])
  })

  it('keeps inline formatting, links and code untouched', () => {
    const source = '| **bold** | `code` | [l](u.md) |\n|---|---|---|\n| *i* | ~~s~~ | ![a](b.png) |'
    const lines = format(source)
    expect(lines[0]).toContain('**bold**')
    expect(lines[2]).toContain('![a](b.png)')
    expect(renderedCells(lines.join('\n'))).toEqual(renderedCells(source))
  })

  it('aligns by display width for CJK, emoji and combining characters', () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('日本語')).toBe(6)
    expect(displayWidth('😀')).toBe(2)
    expect(displayWidth('👨‍👩‍👧')).toBe(2)
    expect(displayWidth('é')).toBe(1)
    expect(displayWidth('é')).toBe(1)
    expect(displayWidth('한글')).toBe(4)
    const lines = format('| 名前 | x |\n|---|---|\n| abc | 😀 |')
    // "名前" is 4 columns wide, as wide as the header "abc" padded to 4... column is max(3, 4).
    expect(lines[0]).toBe('| 名前 | x   |')
    expect(lines[2]).toBe('| abc  | 😀  |')
  })

  it('formats several tables independently and ignores code blocks', () => {
    const source = '|a|b|\n|-|-|\n|1|2|\n\ntext\n\n```md\n|x|y|\n|-|-|\n```\n\n|c|\n|-|\n|3|\n'
    const analysis = analyzeDocument(source)
    expect(analysis.tables).toHaveLength(2)
    expect(format(source, 1)).toEqual(['| c   |', '|-----|', '| 3   |'])
  })

  it('preserves the quote prefix of tables inside blockquotes', () => {
    const lines = format('> |a|b|\n> |-|-|\n> |1|2|')
    expect(lines).toEqual(['> | a   | b   |', '> |-----|-----|', '> | 1   | 2   |'])
  })

  it('preserves indentation inside list items (continuation lines)', () => {
    const source = '- item\n\n  |a|b|\n  |-|-|\n  |1|2|\n'
    const { table } = parse(source)
    expect(table.prefix).toBe('  ')
    expect(formatTable(table)[0]).toBe('  | a   | b   |')
  })

  it('is idempotent', () => {
    const once = format('|a|bb|\n|:-:|-:|\n|ccc|d|')
    expect(format(once.join('\n'))).toEqual(once)
  })

  it('refuses to drop non-empty surplus cells instead of losing data', () => {
    const analysis = analyzeDocument('|a|b|\n|-|-|\n|1|2|3|')
    const result = parseTableBlock(analysis, analysis.tables[0])
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/drop the extra cells/)
  })

  it('refuses tables that start on a list marker line', () => {
    const analysis = analyzeDocument('- |a|b|\n  |-|-|\n  |1|2|')
    if (analysis.tables.length > 0) {
      const result = parseTableBlock(analysis, analysis.tables[0])
      expect(result.ok).toBe(false)
    }
  })

  it('keeps what the renderer understands as a table', () => {
    const source = '|Name|Qty|\n|:--|--:|\n|Pen|2|\n|Ink \\| Blue|10|\n|||'
    const lines = format(source)
    expect(renderedCells(lines.join('\n'))).toEqual(renderedCells(source))
  })
})

describe('splitting and cursor mapping', () => {
  it('reports cell offsets for navigation', () => {
    const cells = splitCells('| ab | c |', 0)
    expect(cells.map((c) => [c.text, c.start, c.end])).toEqual([
      ['ab', 2, 4],
      ['c', 7, 8]
    ])
  })

  it('locates the cursor row and column', () => {
    const source = '| a | b |\n|---|---|\n| 1 | 2 |'
    const { analysis, ...parsed } = parse(source)
    expect(locateInTable(analysis, parsed, 0, 2)).toEqual({ row: 'header', column: 0 })
    expect(locateInTable(analysis, parsed, 2, 7)).toEqual({ row: 0, column: 1 })
    expect(locateInTable(analysis, parsed, 1, 1)).toEqual({ row: 'delimiter', column: 0 })
  })

  it('computes the end of a cell in formatted output', () => {
    const lines = format('|a|bb|\n|-|-|\n|ccc|d|')
    expect(cellPosition(lines, 10, 0, 1)).toEqual({ line: 12, column: 9 })
  })
})

describe('structural edits', () => {
  const base = parse('| a | b |\n|:--|--:|\n| 1 | 2 |\n| 3 | 4 |').table

  it('inserts and deletes rows', () => {
    expect(insertRow(base, 1).rows).toEqual([
      ['1', '2'],
      ['', ''],
      ['3', '4']
    ])
    expect(deleteRow(base, 0).rows).toEqual([['3', '4']])
  })

  it('inserts and deletes columns, keeping alignment in step', () => {
    const inserted = insertColumn(base, 1)
    expect(inserted.header).toEqual(['a', '', 'b'])
    expect(inserted.alignments).toEqual(['left', 'none', 'right'])
    expect(inserted.rows[0]).toEqual(['1', '', '2'])
    const removed = deleteColumn(base, 0)
    expect(removed.header).toEqual(['b'])
    expect(removed.alignments).toEqual(['right'])
  })

  it('changes alignment', () => {
    expect(setColumnAlignment(base, 0, 'center').alignments).toEqual(['center', 'right'])
  })

  it('round-trips cell escaping for the graphical editor', () => {
    expect(escapeTableCell('a | b')).toBe('a \\| b')
    expect(escapeTableCell('line1\nline2')).toBe('line1<br>line2')
    expect(unescapeTableCell('a \\| b')).toBe('a | b')
  })
})

describe('table problems', () => {
  it('reports a header and delimiter that disagree', () => {
    const problems = findTableProblems(analyzeDocument('| a | b | c |\n|---|---|\n| 1 | 2 | 3 |'))
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toMatch(/3 columns .* 2/)
  })

  it('reports surplus body cells that are not displayed', () => {
    const problems = findTableProblems(analyzeDocument('|a|b|\n|-|-|\n|1|2|3|'))
    expect(problems.map((p) => p.line)).toEqual([2])
  })

  it('stays quiet for valid tables and code blocks', () => {
    expect(
      findTableProblems(analyzeDocument('|a|b|\n|-|-|\n|1|2|\n\n```\n|a|b|c|\n|-|-|\n```\n'))
    ).toEqual([])
  })
})
