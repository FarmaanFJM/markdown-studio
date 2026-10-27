import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, applySettingsPatch, sanitizeSettings } from '@shared/settings'
import { matchesQuery, SETTINGS_CATEGORIES } from '../../src/renderer/src/settings/model'

describe('settings navigation', () => {
  it('has the categories of a real configuration surface, in order', () => {
    expect(SETTINGS_CATEGORIES.map((c) => c.label)).toEqual([
      'Editor',
      'Markdown',
      'Appearance',
      'Preview',
      'PDF / Export',
      'Files & Assets',
      'AI',
      'Advanced'
    ])
    expect(new Set(SETTINGS_CATEGORIES.map((c) => c.id)).size).toBe(SETTINGS_CATEGORIES.length)
  })

  it('searches titles and keywords, every word must match', () => {
    const entry = { title: 'Table source width', keywords: 'format table wide readable' }
    expect(matchesQuery(entry, '')).toBe(true)
    expect(matchesQuery(entry, 'WIDTH')).toBe(true)
    expect(matchesQuery(entry, 'readable table')).toBe(true)
    expect(matchesQuery(entry, 'table thumbnails')).toBe(false)
  })
})

describe('table width setting', () => {
  it('defaults to a readable width', () => {
    expect(DEFAULT_SETTINGS.markdown.tableMaxWidth).toBe(100)
  })

  it('accepts 0 (no limit) and clamps everything else', () => {
    const width = (value: unknown) =>
      sanitizeSettings({ markdown: { tableMaxWidth: value } }).markdown.tableMaxWidth
    expect(width(0)).toBe(0)
    expect(width(-5)).toBe(0)
    expect(width(10)).toBe(40)
    expect(width(5000)).toBe(400)
    expect(width('wide')).toBe(100)
    expect(
      applySettingsPatch(DEFAULT_SETTINGS, { markdown: { tableMaxWidth: 80 } }).markdown
        .tableMaxWidth
    ).toBe(80)
  })

  it('no longer accepts the removed settings sidebar as a sidebar view', () => {
    expect(sanitizeSettings({ layout: { sidebarView: 'settings' } }).layout.sidebarView).toBe(
      'explorer'
    )
    expect(sanitizeSettings({ layout: { sidebarView: 'ai' } }).layout.sidebarView).toBe('ai')
  })
})
