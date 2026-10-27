import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { toggleInline } from '@shared/markdown/formatting'
import {
  bindingsByCombination,
  combinationFor,
  shortcutAccelerator,
  shortcutFor,
  shortcutLabel,
  SHORTCUTS
} from '@shared/shortcuts'
import { apply, lines, selectText, sel } from './helpers'

const PLATFORMS = ['win32', 'linux', 'darwin']

describe('shortcut definitions', () => {
  it.each(PLATFORMS)('never bind one key combination to two commands on %s', (platform) => {
    for (const [combination, ids] of bindingsByCombination(platform)) {
      expect(ids, `${combination} is used by ${ids.join(', ')}`).toHaveLength(1)
    }
  })

  it('gives every command one definition', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('maps the standard Markdown shortcuts on Windows and Linux', () => {
    const label = (id: string, platform = 'win32') => shortcutLabel(shortcutFor(id)!, platform)
    for (const platform of ['win32', 'linux']) {
      expect(label('markdown.bold', platform)).toBe('Ctrl+B')
      expect(label('markdown.italic', platform)).toBe('Ctrl+I')
      expect(label('insert.link', platform)).toBe('Ctrl+K')
      expect(label('markdown.orderedList', platform)).toBe('Ctrl+Shift+7')
      expect(label('markdown.bulletList', platform)).toBe('Ctrl+Shift+8')
      expect(label('markdown.blockquote', platform)).toBe('Ctrl+Shift+9')
      expect(label('edit.undo', platform)).toBe('Ctrl+Z')
      expect(label('edit.redo', platform)).toBe('Ctrl+Y / Ctrl+Shift+Z')
    }
  })

  it('maps them to Cmd on macOS', () => {
    const label = (id: string) => shortcutLabel(shortcutFor(id)!, 'darwin')
    expect(label('markdown.bold')).toBe('Cmd+B')
    expect(label('markdown.italic')).toBe('Cmd+I')
    expect(label('insert.link')).toBe('Cmd+K')
    expect(label('markdown.orderedList')).toBe('Cmd+Shift+7')
    expect(label('markdown.bulletList')).toBe('Cmd+Shift+8')
    expect(label('markdown.blockquote')).toBe('Cmd+Shift+9')
    expect(label('edit.undo')).toBe('Cmd+Z')
    expect(label('edit.redo')).toBe('Cmd+Shift+Z')
    expect(label('edit.replace')).toBe('Cmd+Option+F')
  })

  it('gives the standard Markdown keys to Markdown, not to application commands', () => {
    const owner = (key: string, shift = false) =>
      SHORTCUTS.filter((s) => s.key === key && !!s.mod && !!s.shift === shift && !s.alt).map(
        (s) => s.id
      )
    expect(owner('b')).toEqual(['markdown.bold'])
    expect(owner('i')).toEqual(['markdown.italic'])
    expect(owner('k')).toEqual(['insert.link'])
    // Hiding the preview and the sidebar have their own keys.
    expect(shortcutFor('view.togglePreview')).toMatchObject({ key: 'v', mod: true, shift: true })
    expect(shortcutFor('view.toggleSidebar')).toMatchObject({ key: '\\', mod: true })
  })

  it('only fires formatting shortcuts while the editor has the keyboard', () => {
    for (const id of ['markdown.bold', 'markdown.italic', 'insert.link', 'markdown.blockquote']) {
      expect(shortcutFor(id)!.editorOnly, id).toBe(true)
    }
  })

  it('produces Electron accelerators for the menu', () => {
    expect(shortcutAccelerator(shortcutFor('markdown.bold')!, 'win32')).toBe('CmdOrCtrl+B')
    expect(shortcutAccelerator(shortcutFor('markdown.bulletList')!, 'linux')).toBe(
      'CmdOrCtrl+Shift+8'
    )
    expect(shortcutAccelerator(shortcutFor('view.toggleSidebar')!, 'win32')).toBe('CmdOrCtrl+\\')
    expect(combinationFor(shortcutFor('edit.redo')!, 'darwin')).toMatchObject({
      key: 'z',
      shift: true
    })
  })

  it('is documented: every shortcut appears in docs/KEYBOARD_SHORTCUTS.md', () => {
    const doc = readFileSync(path.join(__dirname, '../../docs/KEYBOARD_SHORTCUTS.md'), 'utf8')
    for (const spec of SHORTCUTS) {
      const win = shortcutLabel(spec, 'win32')
      const mac = shortcutLabel(spec, 'darwin')
      expect(doc, `${spec.id}: ${win}`).toContain(`\`${win}\``)
      expect(doc, `${spec.id}: ${mac}`).toContain(`\`${mac}\``)
    }
  })
})

describe('bold and italic from the keyboard', () => {
  const SENTENCE = 'This is important text.'

  it('wraps a selection in bold or italic', () => {
    expect(
      apply(SENTENCE, toggleInline(lines(SENTENCE), selectText(SENTENCE, 'important'), 'bold'))
    ).toEqual({ text: 'This is **important** text.', selected: 'important' })
    expect(
      apply(SENTENCE, toggleInline(lines(SENTENCE), selectText(SENTENCE, 'important'), 'italic'))
    ).toEqual({ text: 'This is *important* text.', selected: 'important' })
  })

  it('removes the formatting when pressed again, with the same selection kept', () => {
    const bold = 'This is **important** text.'
    expect(apply(bold, toggleInline(lines(bold), selectText(bold, 'important'), 'bold'))).toEqual({
      text: SENTENCE,
      selected: 'important'
    })
    const italic = 'This is *important* text.'
    expect(
      apply(italic, toggleInline(lines(italic), selectText(italic, 'important'), 'italic'))
    ).toEqual({ text: SENTENCE, selected: 'important' })
  })

  it('inserts a pair and puts the cursor between the markers when nothing is selected', () => {
    const result = apply('a  b', toggleInline(lines('a  b'), sel(0, 2), 'bold'))
    expect(result.text).toBe('a **** b')
    // The cursor sits between the two halves of the pair.
    const italic = apply('', toggleInline(lines(''), sel(0, 0), 'italic'))
    expect(italic.text).toBe('**')
  })

  it('treats the word under the cursor as the selection', () => {
    const result = apply(SENTENCE, toggleInline(lines(SENTENCE), sel(0, 10), 'bold'))
    expect(result.text).toBe('This is **important** text.')
  })

  it('formats every line of a multi-line selection without joining or corrupting them', () => {
    const source = 'first line\nsecond line\n\nfourth line'
    const result = apply(source, toggleInline(lines(source), sel(0, 0, 3, 11), 'bold'))
    expect(result.text).toBe('**first line**\n**second line**\n\n**fourth line**')
    // And it is reversible.
    const back = apply(
      result.text,
      toggleInline(lines(result.text), sel(0, 0, 3, result.text.split('\n')[3].length), 'bold')
    )
    expect(back.text).toBe(source)
  })

  it('keeps a multi-line selection selected so the same key undoes the formatting', () => {
    const source = 'first line\nsecond line'
    const wrapped = apply(source, toggleInline(lines(source), sel(0, 0, 1, 11), 'italic'))
    expect(wrapped.text).toBe('*first line*\n*second line*')
    expect(wrapped.selected).toBe(wrapped.text)
    const removed = apply(
      wrapped.text,
      toggleInline(lines(wrapped.text), selectText(wrapped.text, wrapped.selected), 'italic')
    )
    expect(removed.text).toBe(source)
  })

  it('combines bold and italic without malformed nesting', () => {
    const bold = 'This is **important** text.'
    const both = apply(bold, toggleInline(lines(bold), selectText(bold, 'important'), 'italic'))
    expect(both.text).toBe('This is ***important*** text.')
    // Removing italic again leaves bold alone.
    const back = apply(
      both.text,
      toggleInline(lines(both.text), selectText(both.text, 'important'), 'italic')
    )
    expect(back.text).toBe(bold)
  })

  it('leaves surrounding whitespace outside the markers', () => {
    const source = 'a  important  b'
    const result = apply(source, toggleInline(lines(source), sel(0, 1, 0, 14), 'bold'))
    expect(result.text).toBe('a  **important**  b')
  })
})
