// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import {
  columnWidths,
  displayWidth,
  formatTable,
  parseTableBlock,
  splitCells,
  type TableModel
} from '@shared/markdown/tables'
import { renderDocumentBody } from '../../src/renderer/src/markdown/document'

function tableOf(source: string): TableModel {
  const analysis = analyzeDocument(source)
  const result = parseTableBlock(analysis, analysis.tables[0])
  if (!result.ok) throw new Error(result.reason)
  return result.table
}

function rendered(source: string): string {
  return renderDocumentBody(source, { documentDirectory: null, workspaceRoot: null })
}

const LONG =
  'Dit is een bijzonder lange omschrijving van het onderdeel die in de broncode nooit netjes in één regel past'

describe('table formatting width strategy', () => {
  it('aligns a narrow table completely', () => {
    const lines = formatTable(tableOf('| a | b |\n|---|:-:|\n| long cell | x |'))
    expect(lines).toEqual(['| a         |  b  |', '|-----------|:---:|', '| long cell |  x  |'])
  })

  it('keeps every pipe aligned while the table fits the target width', () => {
    const lines = formatTable(
      tableOf('| Naam | Prijs |\n|---|---|\n| Appel | 1,20 |\n| Peer | 2 |')
    )
    const columns = lines.map((line) => [...line].flatMap((c, i) => (c === '|' ? [i] : [])).join())
    expect(new Set(columns).size).toBe(1)
  })

  it('balances a wide table instead of padding every row to the longest cell', () => {
    const source = `| Onderdeel | Omschrijving | Prijs |\n|---|---|---|\n| Motor | ${LONG} | 10 |\n| Wiel | kort | 5 |`
    const table = tableOf(source)
    const aligned = formatTable(table, { maxWidth: 0 })
    const balanced = formatTable(table, { maxWidth: 80 })
    expect(Math.max(...aligned.map((l) => l.length))).toBeGreaterThan(100)
    // The short rows stay within the target; only the genuinely long cell runs past it.
    expect(balanced[0].length).toBeLessThanOrEqual(80)
    expect(balanced[3].length).toBeLessThanOrEqual(80)
    const pipes = (line: string) => [...line].flatMap((c, k) => (c === '|' ? [k] : []))
    expect(pipes(balanced[3])).toEqual(pipes(balanced[0]))
    expect(pipes(balanced[1])).toEqual(pipes(balanced[0]))
    // The one long cell runs past the cap.
    expect(balanced[2].length).toBeGreaterThan(80)
  })

  it('never changes the text of any cell, so the rendered table is identical', () => {
    const source = `| Onderdeel | Omschrijving | Prijs |\n|:--|---|--:|\n| Motor | ${LONG} | 10 |\n| Wiel | kort \\| met pipe | 5 |`
    const table = tableOf(source)
    const html = rendered(source)
    for (const maxWidth of [0, 60, 80, 100, 400]) {
      const out = formatTable(table, { maxWidth }).join('\n')
      expect(rendered(out)).toBe(html)
      const cells = out.split('\n').map((l) => splitCells(l, 0).map((c) => c.text))
      expect(cells[0]).toEqual(table.header)
      expect(cells.slice(2)).toEqual(table.rows)
    }
  })

  it('writes compact lines when there are too many columns to balance', () => {
    const header = Array.from({ length: 14 }, (_, i) => `Kolom ${i + 1}`)
    const row = Array.from({ length: 14 }, (_, i) => `waarde ${i + 1}`)
    const table: TableModel = {
      prefix: '',
      alignments: header.map(() => 'none'),
      header,
      rows: [row]
    }
    const { compact } = columnWidths(table, 100)
    expect(compact).toBe(true)
    const lines = formatTable(table, { maxWidth: 100 })
    expect(lines[0]).toBe(`| ${header.join(' | ')} |`)
    expect(lines[1]).toBe(`|${'---|'.repeat(14)}`.replace(/---\|/g, '-----|').replace(/^\|/, '|'))
  })

  it('treats escaped pipes and wide characters by their display width', () => {
    const lines = formatTable(tableOf('| a | b |\n|---|---|\n| x \\| y | 日本 |'))
    expect(lines[2]).toContain('x \\| y')
    expect(displayWidth('日本')).toBe(4)
    expect(new Set(lines.map((l) => displayWidth(l))).size).toBe(1)
  })

  it('formats inside quotes without losing the prefix', () => {
    const lines = formatTable(tableOf('> | a | b |\n> |---|---|\n> | 1 | 2 |'))
    expect(lines.every((l) => l.startsWith('> |'))).toBe(true)
  })

  it('keeps the delimiter alignment markers', () => {
    const lines = formatTable(tableOf('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |'))
    expect(lines[1]).toMatch(/^\|:-+\|:-+:\|-+:\|$/)
  })
})

const HEALTH_UI = `| Game | Type health-weergave | Zichtbaarheid tijdens gevechten | Effect op immersie | Toegankelijkheid |
|:--|---|---|:-:|--:|
| The Legend of Zelda | Hartjes in de hoek van het scherm | Altijd zichtbaar, duidelijk bij weinig levens | Laag | Goed |
| Hades | Rode balk onder het personage, aangevuld met een getal | Zichtbaar en direct gekoppeld aan het personage \\| geen aparte HUD | Gemiddeld | Zeer goed |
| God of War Ragnarök | Geen vaste balk; gezondheid in de HUD verschijnt bij schade | Alleen wanneer nodig, verdwijnt na enkele seconden zodat het beeld vrij blijft | Hoog | Gemiddeld |
| Dead Space | Balk op de rug van het pak, onderdeel van de wereld | Altijd in beeld, zonder het scherm te vullen met menu-elementen | Zeer hoog | Matig |
`

describe('a realistic wide comparison table', () => {
  const table = () => tableOf(HEALTH_UI)
  const widest = (lines: string[]) => Math.max(...lines.map((l) => displayWidth(l)))

  it('is very wide when every column is aligned in full', () => {
    expect(widest(formatTable(table(), { maxWidth: 0 }))).toBeGreaterThan(200)
  })

  it('is balanced to the configured width without losing or reordering a cell', () => {
    const lines = formatTable(table(), { maxWidth: 100 })
    // The columns add up to the target (the delimiter row shows it); only cells longer than their
    // column run past it.
    expect(displayWidth(lines[1])).toBeLessThanOrEqual(100)
    expect(widest(lines)).toBeLessThan(widest(formatTable(table(), { maxWidth: 0 })))
    const cells = lines.map((l) => splitCells(l, 0).map((c) => c.text))
    expect(cells[0]).toEqual(table().header)
    expect(cells.slice(2)).toEqual(table().rows)
  })

  it('renders exactly the same table however it is formatted', () => {
    const html = rendered(HEALTH_UI)
    for (const maxWidth of [0, 40, 60, 80, 100, 160, 400]) {
      expect(rendered(formatTable(table(), { maxWidth }).join('\n')), `maxWidth ${maxWidth}`).toBe(
        html
      )
    }
  })

  it('is stable: formatting a formatted table changes nothing, at every width', () => {
    for (const maxWidth of [0, 40, 60, 80, 100, 160]) {
      const once = formatTable(table(), { maxWidth })
      const twice = formatTable(tableOf(once.join('\n')), { maxWidth })
      expect(twice, `maxWidth ${maxWidth}`).toEqual(once)
    }
  })

  it('formats to a narrower editor width on request, and never below what is readable', () => {
    const fit = formatTable(table(), { maxWidth: 60 })
    expect(widest(fit)).toBeLessThan(widest(formatTable(table(), { maxWidth: 0 })))
    // Even a tiny target keeps a valid table: compact lines, still one row per source line.
    const tiny = formatTable(table(), { maxWidth: 20 })
    expect(tiny).toHaveLength(6)
    expect(tiny[0].split('|').length).toBe(table().header.length + 2)
  })

  it('keeps alignment markers and escaped pipes', () => {
    const lines = formatTable(table(), { maxWidth: 100 })
    expect(lines[1]).toMatch(/^\|:-+\|-+\|-+\|:-+:\|-+:\|$/)
    expect(lines.join('\n')).toContain('\\| geen aparte HUD')
  })

  it('fills missing cells and reports extra ones instead of dropping them', () => {
    const missing = '| a | b | c |\n|---|---|---|\n| 1 |\n| 2 | 3 | 4 |'
    expect(formatTable(tableOf(missing))[2]).toBe('| 1   |     |     |')
    const extra = analyzeDocument('| a | b |\n|---|---|\n| 1 | 2 | 3 |')
    const parsed = parseTableBlock(extra, extra.tables[0])
    expect(parsed.ok).toBe(false)
  })
})
