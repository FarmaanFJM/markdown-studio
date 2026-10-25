import { describe, expect, it } from 'vitest'
import { validatePdfOptions } from '@shared/export/pdf'
import {
  BUILTIN_PRESETS,
  effectivePresets,
  makePresetId,
  presetOverrides,
  sanitizePresetData,
  validatePreset,
  type StoredPreset
} from '@shared/export/presets'

describe('built-in presets', () => {
  it('provides the five required presets, all valid', () => {
    expect(BUILTIN_PRESETS.map((p) => p.name)).toEqual([
      'Standard PDF',
      'Technical Documentation',
      'Professional Report',
      'Compact Notes',
      'Standalone HTML'
    ])
    for (const preset of BUILTIN_PRESETS) {
      expect(validatePdfOptions(preset.data.pdf).ok, preset.id).toBe(true)
      expect(validatePreset(preset).ok, preset.id).toBe(true)
    }
  })

  it('are meaningfully different configurations', () => {
    const byId = Object.fromEntries(BUILTIN_PRESETS.map((p) => [p.id, p.data]))
    expect(byId['technical-documentation'].theme).toBe('technical')
    expect(byId['professional-report'].theme).toBe('report')
    expect(byId['standalone-html'].format).toBe('html')
    expect(byId['compact-notes'].pdf.margins.left).toBeLessThan(
      byId['standard-pdf'].pdf.margins.left
    )
    expect(byId['standard-pdf'].pdf.footer.text).toContain('{pages}')
  })
})

describe('preset files', () => {
  it('ignore unknown fields and repair unusable values', () => {
    const data = sanitizePresetData({
      format: 'docx',
      theme: 'neon',
      customization: { accentColor: 'bad', bodyFontSize: 14 },
      customCss: { mode: 'file', path: 'notes.txt' },
      pdf: { pageSize: 'A5', margins: { top: 'x' } },
      html: { embedImages: 'maybe' },
      extra: { nested: true }
    })
    expect(data.format).toBe('pdf')
    expect(data.theme).toBe('inherit')
    expect(data.customization).toEqual({ bodyFontSize: 14 })
    expect(data.customCss).toEqual({ mode: 'inherit', path: null })
    expect(data.pdf.pageSize).toBe('A5')
    expect(data.pdf.margins.top).toBe(20)
    expect(data.html.embedImages).toBe(true)
    expect('extra' in data).toBe(false)
  })

  it('reject damaged or unsafe files', () => {
    expect(validatePreset(null).ok).toBe(false)
    expect(validatePreset('x').ok).toBe(false)
    expect(validatePreset({ id: '../evil', name: 'x' }).ok).toBe(false)
    expect(validatePreset({ id: 'ok', name: '   ' }).ok).toBe(false)
  })

  it('read future versions with the fields this version understands', () => {
    const result = validatePreset({
      version: 7,
      id: 'future',
      name: 'From the future',
      data: { format: 'pdf', pdf: { pageSize: 'Legal' }, hologram: true }
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.preset.data.pdf.pageSize).toBe('Legal')
  })

  it('accept a hand-written flat file', () => {
    const result = validatePreset({ id: 'flat', name: 'Flat', format: 'html', theme: 'editorial' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.preset.data.format).toBe('html')
      expect(result.preset.data.theme).toBe('editorial')
    }
  })

  it('make unique ids that cannot collide with built-ins', () => {
    expect(makePresetId('My preset', [])).toBe('my-preset')
    expect(makePresetId('My preset', ['my-preset'])).toBe('my-preset-2')
    expect(makePresetId('Standard PDF', [])).toBe('standard-pdf-2')
    expect(makePresetId('???', [])).toBe('preset')
  })
})

describe('effective presets', () => {
  const stored = (id: string, name: string, scope: 'global' | 'workspace'): StoredPreset => ({
    ...(BUILTIN_PRESETS[0] as StoredPreset),
    id,
    name,
    scope,
    updatedAt: ''
  })

  it('lists built-ins first, then customs alphabetically', () => {
    const list = effectivePresets(
      [stored('zeta', 'Zeta', 'global'), stored('alpha', 'Alpha', 'global')],
      []
    )
    expect(list.slice(0, 5).every((p) => p.builtIn && !p.modified)).toBe(true)
    expect(list.slice(5).map((p) => p.name)).toEqual(['Alpha', 'Zeta'])
  })

  it('shows an edited built-in as modified, with workspace winning over global', () => {
    const list = effectivePresets(
      [stored('standard-pdf', 'Global edit', 'global')],
      [stored('standard-pdf', 'Workspace edit', 'workspace')]
    )
    const standard = list.find((p) => p.id === 'standard-pdf')!
    expect(standard.modified).toBe(true)
    expect(standard.name).toBe('Workspace edit')
    expect(standard.builtIn).toBe(true)
    expect(list.filter((p) => p.id === 'standard-pdf')).toHaveLength(1)
  })

  it('turns preset appearance into export overrides', () => {
    const technical = BUILTIN_PRESETS.find((p) => p.id === 'technical-documentation')!
    expect(presetOverrides(technical.data, null)).toEqual({ theme: 'technical' })
    const compact = BUILTIN_PRESETS.find((p) => p.id === 'compact-notes')!
    expect(presetOverrides(compact.data, null).customization).toMatchObject({ bodyFontSize: 13 })
    expect(
      presetOverrides({ ...compact.data, customCss: { mode: 'none', path: null } }, null).customCss
        ?.source
    ).toBe('none')
  })
})
