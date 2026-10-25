import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  normalizeAssetDirectory,
  sanitizeSettings,
  withRecentWorkspace
} from '@shared/settings'
import { SettingsService } from '../../src/main/services/settingsService'

describe('settings schema', () => {
  it('fills defaults for missing or invalid input', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS)
    const s = sanitizeSettings({ theme: 'neon', editor: { fontSize: 'big', wordWrap: 'yes' } })
    expect(s.theme).toBe('dark')
    expect(s.editor.fontSize).toBe(14)
    expect(s.editor.wordWrap).toBe(true)
  })

  it('clamps numeric values', () => {
    const s = sanitizeSettings({
      editor: { fontSize: 400 },
      layout: { previewRatio: 2, sidebarWidth: 10 }
    })
    expect(s.editor.fontSize).toBe(40)
    expect(s.layout.previewRatio).toBe(0.85)
    expect(s.layout.sidebarWidth).toBe(170)
  })

  it('validates the asset directory', () => {
    expect(normalizeAssetDirectory('assets')).toBe('assets')
    expect(normalizeAssetDirectory('./docs\\images/')).toBe('docs/images')
    expect(normalizeAssetDirectory('../outside')).toBeNull()
    expect(normalizeAssetDirectory('/abs')).toBeNull()
    expect(normalizeAssetDirectory('C:/abs')).toBeNull()
    expect(normalizeAssetDirectory('   ')).toBeNull()
    expect(sanitizeSettings({ assets: { directory: '../../etc' } }).assets.directory).toBe('assets')
  })

  it('applies nested patches', () => {
    const s = applySettingsPatch(DEFAULT_SETTINGS, {
      layout: { previewMode: 'pdf' },
      editor: { fontSize: 18 }
    })
    expect(s.layout.previewMode).toBe('pdf')
    expect(s.layout.sidebarWidth).toBe(DEFAULT_SETTINGS.layout.sidebarWidth)
    expect(s.editor.fontSize).toBe(18)
    expect(s.editor.wordWrap).toBe(DEFAULT_SETTINGS.editor.wordWrap)
  })

  it('keeps a bounded, de-duplicated recent list', () => {
    let recent: string[] = []
    for (let i = 0; i < 15; i++) recent = withRecentWorkspace(recent, `/p${i}`)
    recent = withRecentWorkspace(recent, '/p10')
    expect(recent[0]).toBe('/p10')
    expect(recent).toHaveLength(10)
    expect(new Set(recent).size).toBe(10)
  })
})

describe('SettingsService', () => {
  it('persists settings to disk and reloads them', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ms-settings-'))
    const file = path.join(dir, 'settings.json')
    const service = new SettingsService(file)
    service.load()
    service.update({ theme: 'light', explorer: { mode: 'thumbnails' } })
    await service.flush()
    expect(JSON.parse(readFileSync(file, 'utf8')).theme).toBe('light')

    const reloaded = new SettingsService(file)
    expect(reloaded.load().explorer.mode).toBe('thumbnails')
  })

  it('recovers from a corrupt settings file', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ms-settings-'))
    const file = path.join(dir, 'settings.json')
    writeFileSync(file, '{ not json')
    const service = new SettingsService(file)
    expect(service.load()).toEqual(DEFAULT_SETTINGS)
    await new Promise((r) => setTimeout(r, 50))
    expect(existsSync(`${file}.corrupt`)).toBe(true)
  })
})

describe('SettingsService.flushSync', () => {
  it('writes pending changes immediately, as needed when the app quits', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ms-settings-'))
    const file = path.join(dir, 'settings.json')
    const service = new SettingsService(file)
    service.load()
    service.update({ editor: { fontSize: 20 } })
    service.flushSync()
    expect(JSON.parse(readFileSync(file, 'utf8')).editor.fontSize).toBe(20)
  })
})
