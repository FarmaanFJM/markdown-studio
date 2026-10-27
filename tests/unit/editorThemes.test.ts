import { describe, expect, it } from 'vitest'
import { DARK_THEME, LIGHT_THEME } from '../../src/renderer/src/editor/editorThemes'

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe.each([
  ['dark', DARK_THEME],
  ['light', LIGHT_THEME]
])('%s editor theme menus', (_name, theme) => {
  const c = theme.colors

  it('defines opaque menu surfaces explicitly', () => {
    for (const key of [
      'menu.background',
      'menu.foreground',
      'menu.selectionBackground',
      'menu.separatorBackground',
      'menu.border',
      'editorHoverWidget.background',
      'editorActionList.background'
    ]) {
      expect(c[key], key).toMatch(/^#[0-9A-Fa-f]{6}(?:[Ff]{2})?$|^#[0-9A-Fa-f]{6}[0-9A-Fa-f]{2}$/)
    }
    expect(c['menu.background']).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(c['editorActionList.background']).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('has readable menu text', () => {
    expect(contrast(c['menu.foreground'], c['menu.background'])).toBeGreaterThan(7)
  })

  it('has a visible hover state that keeps the text readable', () => {
    expect(c['menu.selectionBackground']).not.toBe(c['menu.background'])
    expect(c['menu.selectionForeground']).toBeDefined()
  })
})
