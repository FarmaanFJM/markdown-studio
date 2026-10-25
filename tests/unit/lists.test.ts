import { describe, expect, it } from 'vitest'
import {
  enterEdit,
  indentListItem,
  linesOf,
  outdentListItem,
  parseListLine
} from '@shared/markdown/lists'

const at = (source: string, line: number, column?: number) => {
  const all = source.split('\n')
  return enterEdit(linesOf(all), line, column ?? all[line].length)
}

describe('list parsing', () => {
  it('reads markers, tasks and nesting', () => {
    expect(parseListLine('- item')).toMatchObject({ kind: 'bullet', indent: 0, contentColumn: 2 })
    expect(parseListLine('  1. item')).toMatchObject({ kind: 'ordered', number: 1, indent: 2 })
    expect(parseListLine('- [x] done')).toMatchObject({ task: 'x', content: 'done' })
    expect(parseListLine('> - quoted')).toMatchObject({ quote: '> ', indent: 0 })
  })

  it('rejects thematic breaks and marker-like text', () => {
    expect(parseListLine('---')).toBeNull()
    expect(parseListLine('* * *')).toBeNull()
    expect(parseListLine('-text')).toBeNull()
    expect(parseListLine('plain')).toBeNull()
    expect(parseListLine('1.5 liters')).toBeNull()
  })
})

describe('Enter', () => {
  it('continues bullet lists with the same marker', () => {
    expect(at('* one', 0)).toEqual({ insert: '\n* ' })
    expect(at('  - nested', 0)).toEqual({ insert: '\n  - ' })
  })

  it('numbers ordered lists and keeps lazy numbering', () => {
    expect(at('1. a', 0)).toEqual({ insert: '\n2. ' })
    expect(at('9. a', 0)).toEqual({ insert: '\n10. ' })
    expect(at('1. a\n1. b', 1)).toEqual({ insert: '\n1. ' })
    expect(at('1) a', 0)).toEqual({ insert: '\n2) ' })
  })

  it('continues task lists with an unchecked box', () => {
    expect(at('- [x] done', 0)).toEqual({ insert: '\n- [ ] ' })
    expect(at('- [ ] todo', 0)).toEqual({ insert: '\n- [ ] ' })
  })

  it('exits the list on an empty item', () => {
    expect(at('- a\n- ', 1)).toEqual({ replaceLine: '' })
    expect(at('1. a\n2. ', 1)).toEqual({ replaceLine: '' })
    expect(at('- [ ] ', 0)).toEqual({ replaceLine: '' })
  })

  it('moves an empty nested item out one level', () => {
    expect(at('- a\n  - ', 1)).toEqual({ replaceLine: '- ' })
    expect(at('- a\n  - b\n    - ', 2)).toEqual({ replaceLine: '  - ' })
  })

  it('splits text at the cursor into the new item', () => {
    expect(at('- hello world', 0, 7)).toEqual({ insert: '\n- ' })
  })

  it('leaves Enter alone inside the marker and for ordinary paragraphs', () => {
    expect(at('- item', 0, 1)).toBeNull()
    expect(at('plain paragraph', 0)).toBeNull()
    expect(at('', 0)).toBeNull()
  })

  it('continues and exits blockquotes', () => {
    expect(at('> quoted', 0)).toEqual({ insert: '\n> ' })
    expect(at('> ', 0)).toEqual({ replaceLine: '' })
    expect(at('> - item', 0)).toEqual({ insert: '\n> - ' })
  })
})

describe('Tab and Shift+Tab', () => {
  const doc = '- a\n- b\n  - c\n- d'
  const lines = linesOf(doc.split('\n'))

  it('nests an item under the previous one', () => {
    const change = indentListItem(lines, 1)!
    expect([...change.lines]).toEqual([
      [1, '  - b'],
      [2, '    - c']
    ])
  })

  it('moves children together with the item', () => {
    const change = indentListItem(lines, 3)!
    expect(change.lines.get(3)).toBe('  - d')
  })

  it('does not indent the first item or an item already nested deepest', () => {
    expect(indentListItem(lines, 0)).toBeNull()
    expect(indentListItem(linesOf(['- a', '  - b']), 1)).toBeNull()
  })

  it('aligns children under ordered parents', () => {
    const change = indentListItem(linesOf(['1. a', '2. b']), 1)!
    expect(change.lines.get(1)).toBe('   2. b')
  })

  it('outdents to the parent level', () => {
    const change = outdentListItem(lines, 2)!
    expect(change.lines.get(2)).toBe('- c')
    expect(outdentListItem(lines, 0)).toBeNull()
  })
})
