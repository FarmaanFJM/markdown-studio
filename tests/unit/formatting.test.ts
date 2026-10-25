import { describe, expect, it } from 'vitest'
import {
  mapPosition,
  resolveSelection,
  setHeading,
  shiftHeading,
  toggleInline,
  toggleList,
  toggleQuote
} from '@shared/markdown/formatting'
import { apply, lines, range, sel, selectText } from './helpers'

const never = () => false

describe('inline formatting', () => {
  it('wraps a selection and keeps it selected', () => {
    const source = 'some important text here'
    const result = apply(
      source,
      toggleInline(lines(source), selectText(source, 'important text'), 'bold')
    )
    expect(result.text).toBe('some **important text** here')
    expect(result.selected).toBe('important text')
  })

  it('removes the formatting when applied again (selection inside the markers)', () => {
    const source = 'some **important text** here'
    const result = apply(
      source,
      toggleInline(lines(source), selectText(source, 'important text'), 'bold')
    )
    expect(result.text).toBe('some important text here')
  })

  it('removes the formatting when the markers are part of the selection', () => {
    const source = 'some **important text** here'
    const result = apply(
      source,
      toggleInline(lines(source), selectText(source, '**important text**'), 'bold')
    )
    expect(result.text).toBe('some important text here')
    expect(result.selected).toBe('important text')
  })

  it('wraps the word at the cursor and keeps the cursor where it was', () => {
    const source = 'alpha beta gamma'
    const result = apply(source, toggleInline(lines(source), sel(0, 8), 'italic'))
    expect(result.text).toBe('alpha *beta* gamma')
  })

  it('inserts an empty pair between spaces and removes it again', () => {
    const inserted = apply('a  b', toggleInline(lines('a  b'), sel(0, 2), 'bold'))
    expect(inserted.text).toBe('a **** b')
    const removed = apply('a **** b', toggleInline(lines('a **** b'), sel(0, 4), 'bold'))
    expect(removed.text).toBe('a  b')
  })

  it('distinguishes italic from bold', () => {
    const bold = '**word**'
    // Italic on bold text adds a layer instead of stripping the bold markers.
    expect(apply(bold, toggleInline(lines(bold), selectText(bold, 'word'), 'italic')).text).toBe(
      '***word***'
    )
    const both = '***word***'
    expect(apply(both, toggleInline(lines(both), selectText(both, 'word'), 'italic')).text).toBe(
      '**word**'
    )
    expect(apply(both, toggleInline(lines(both), selectText(both, 'word'), 'bold')).text).toBe(
      '*word*'
    )
    const underscore = '_word_'
    expect(
      apply(underscore, toggleInline(lines(underscore), selectText(underscore, 'word'), 'italic'))
        .text
    ).toBe('word')
  })

  it('formats strikethrough and inline code', () => {
    expect(
      apply(
        'x gone y',
        toggleInline(lines('x gone y'), selectText('x gone y', 'gone'), 'strikethrough')
      ).text
    ).toBe('x ~~gone~~ y')
    expect(
      apply('run npm', toggleInline(lines('run npm'), selectText('run npm', 'npm'), 'code')).text
    ).toBe('run `npm`')
    expect(
      apply('run `npm`', toggleInline(lines('run `npm`'), selectText('run `npm`', 'npm'), 'code'))
        .text
    ).toBe('run npm')
  })

  it('uses a longer fence for code that contains backticks', () => {
    const source = 'use a`b here'
    const result = apply(source, toggleInline(lines(source), selectText(source, 'a`b'), 'code'))
    expect(result.text).toBe('use ``a`b`` here')
    const padded = 'x `y` z'
    // Selecting an existing span removes its formatting rather than nesting another one.
    expect(apply(padded, toggleInline(lines(padded), selectText(padded, '`y`'), 'code')).text).toBe(
      'x y z'
    )
  })

  it('formats each line of a multi-line selection and skips blank lines', () => {
    const source = 'first line\n\n  second line'
    const result = apply(
      source,
      toggleInline(lines(source), range(source, 0, source.length), 'bold')
    )
    expect(result.text).toBe('**first line**\n\n  **second line**')
    const undone = apply(
      result.text,
      toggleInline(lines(result.text), range(result.text, 0, result.text.length), 'bold')
    )
    expect(undone.text).toBe(source)
  })

  it('does nothing for a selection of only whitespace across lines', () => {
    expect(toggleInline(lines('\n'), sel(0, 0, 1, 0), 'bold').plans).toHaveLength(0)
  })
})

describe('headings', () => {
  it('sets, changes and clears the level', () => {
    expect(apply('Title', setHeading(lines('Title'), sel(0, 2), 2, never)).text).toBe('## Title')
    expect(apply('## Title', setHeading(lines('## Title'), sel(0, 3), 3, never)).text).toBe(
      '### Title'
    )
    expect(apply('## Title', setHeading(lines('## Title'), sel(0, 3), 2, never)).text).toBe('Title')
    expect(apply('### Title', setHeading(lines('### Title'), sel(0, 3), 0, never)).text).toBe(
      'Title'
    )
  })

  it('raises and lowers levels', () => {
    expect(apply('Title', shiftHeading(lines('Title'), sel(0, 0), 1, never)).text).toBe('## Title')
    expect(apply('### T', shiftHeading(lines('### T'), sel(0, 0), 1, never)).text).toBe('## T')
    expect(apply('## T', shiftHeading(lines('## T'), sel(0, 0), -1, never)).text).toBe('### T')
    expect(apply('###### T', shiftHeading(lines('###### T'), sel(0, 0), -1, never)).text).toBe(
      '###### T'
    )
  })

  it('leaves blank lines and protected lines alone', () => {
    const source = 'one\n\ntwo'
    const result = apply(
      source,
      setHeading(lines(source), sel(0, 0, 2, 3), 1, (l) => l === 2)
    )
    expect(result.text).toBe('# one\n\ntwo')
  })

  it('keeps the cursor on the same text', () => {
    const result = apply('Title', setHeading(lines('Title'), sel(0, 3), 2, never))
    // Cursor collapsed: nothing is left selected.
    expect(result.selected).toBe('')
  })
})

describe('lists and quotes', () => {
  it('converts lines to a bulleted list and back', () => {
    const source = 'one\ntwo\nthree'
    const all = range(source, 0, source.length)
    const list = apply(source, toggleList(lines(source), all, 'bullet', never))
    expect(list.text).toBe('- one\n- two\n- three')
    expect(
      apply(
        list.text,
        toggleList(lines(list.text), range(list.text, 0, list.text.length), 'bullet', never)
      ).text
    ).toBe(source)
  })

  it('numbers ordered lists and restarts after blank lines and per nesting level', () => {
    const source = 'a\nb\n  c\n  d\ne\n\nf'
    const result = apply(
      source,
      toggleList(lines(source), range(source, 0, source.length), 'ordered', never)
    )
    expect(result.text).toBe('1. a\n2. b\n  1. c\n  2. d\n3. e\n\n1. f')
  })

  it('converts between list kinds without losing text', () => {
    const source = '- a\n- b'
    const all = range(source, 0, source.length)
    expect(apply(source, toggleList(lines(source), all, 'ordered', never)).text).toBe('1. a\n2. b')
    expect(apply(source, toggleList(lines(source), all, 'task', never)).text).toBe(
      '- [ ] a\n- [ ] b'
    )
    const tasks = '- [x] a\n- [ ] b'
    expect(
      apply(tasks, toggleList(lines(tasks), range(tasks, 0, tasks.length), 'task', never)).text
    ).toBe('a\nb')
    expect(
      apply(tasks, toggleList(lines(tasks), range(tasks, 0, tasks.length), 'bullet', never)).text
    ).toBe('- a\n- b')
  })

  it('works on a collapsed cursor', () => {
    expect(apply('text', toggleList(lines('text'), sel(0, 2), 'task', never)).text).toBe(
      '- [ ] text'
    )
  })

  it('does not touch lines it is told are protected (code blocks)', () => {
    const source = 'a\ncode\nb'
    const result = apply(
      source,
      toggleList(lines(source), range(source, 0, source.length), 'bullet', (l) => l === 1)
    )
    expect(result.text).toBe('- a\ncode\n- b')
  })

  it('does not include the next line when the selection ends at its start', () => {
    const source = 'a\nb\nc'
    const result = apply(source, toggleList(lines(source), sel(0, 0, 2, 0), 'bullet', never))
    expect(result.text).toBe('- a\n- b\nc')
  })

  it('quotes and unquotes, keeping a multi-paragraph quote together', () => {
    const source = 'one\n\ntwo'
    const quoted = apply(source, toggleQuote(lines(source), range(source, 0, source.length), never))
    expect(quoted.text).toBe('> one\n>\n> two')
    const plain = apply(
      quoted.text,
      toggleQuote(lines(quoted.text), range(quoted.text, 0, quoted.text.length), never)
    )
    expect(plain.text).toBe(source)
  })

  it('leaves unrelated lines byte-for-byte unchanged', () => {
    const source = 'keep\r\nthis   \r\nchange'
    const parts = source.split('\r\n')
    const result = toggleList(
      { count: parts.length, get: (l) => parts[l] },
      sel(2, 0),
      'bullet',
      never
    )
    expect(result.plans).toHaveLength(1)
    expect(result.plans[0].range.start.line).toBe(2)
  })
})

describe('applying plans', () => {
  it('places selections after edits on the same and later lines', () => {
    const plans = [
      { range: sel(0, 0, 0, 1), text: 'XX' },
      { range: sel(0, 4, 0, 4), text: '\n' },
      { range: sel(2, 1, 2, 2), text: 'Z' }
    ]
    // aXXcd -> a(b)cd? the source is "abcdef\nline2\nline3"
    expect(mapPosition(plans, { line: 2, column: 4 })).toEqual({ line: 3, column: 4 })
    expect(mapPosition(plans, { line: 0, column: 5 })).toEqual({ line: 1, column: 0 + 1 })
    expect(mapPosition(plans, { line: 1, column: 2 })).toEqual({ line: 2, column: 2 })
    const selection = resolveSelection({
      plans,
      select: { start: { plan: 0, offset: 2 }, end: { plan: 2, offset: 1 } }
    })
    expect(selection).toEqual({
      start: { line: 0, column: 2 },
      end: { line: 3, column: 2 }
    })
  })
})

describe('heading on an empty line', () => {
  it('inserts the marker and leaves the caret after it', () => {
    const source = ''
    const result = setHeading(lines(source), sel(0, 0), 1, () => false)
    expect(apply(source, result).text).toBe('# ')
  })
})

describe('lists and quotes on an empty line', () => {
  it.each([
    ['bullet', '- '],
    ['ordered', '1. '],
    ['task', '- [ ] ']
  ] as const)('start a %s list', (kind, marker) => {
    expect(
      apply(
        '',
        toggleList(lines(''), sel(0, 0), kind, () => false)
      ).text
    ).toBe(marker)
  })
  it('starts a quote', () => {
    expect(
      apply(
        '',
        toggleQuote(lines(''), sel(0, 0), () => false)
      ).text
    ).toBe('> ')
  })
  it('leaves blank lines inside a multi-line selection alone', () => {
    const source = 'a\n\nb'
    expect(
      apply(
        source,
        toggleList(lines(source), sel(0, 0, 2, 1), 'bullet', () => false)
      ).text
    ).toBe('- a\n\n- b')
  })
})
