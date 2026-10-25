import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessControl } from '../../src/main/services/accessControl'

vi.mock('electron', () => ({ dialog: {}, BrowserWindow: class {} }))
const { PresentationService } = await import('../../src/main/services/presentationService')

let base: string
let workspace: string
let access: AccessControl
let service: InstanceType<typeof PresentationService>

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'ms-presentation-'))
  workspace = path.join(base, 'project')
  mkdirSync(path.join(workspace, 'styles'), { recursive: true })
  access = new AccessControl()
  access.setWorkspace(workspace)
  service = new PresentationService(access, () => null)
})

describe('workspace presentation overrides', () => {
  it('stores validated overrides inside the project and removes them when cleared', async () => {
    const state = await service.setWorkspace({
      theme: 'technical',
      customization: { accentColor: '#112233', bodyFontSize: 999 },
      math: { enabled: false },
      bogus: true
    })
    expect(state.overrides).toEqual({
      theme: 'technical',
      customization: { accentColor: '#112233', bodyFontSize: 28 },
      math: { enabled: false }
    })
    const file = path.join(workspace, '.markdown-studio', 'presentation.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 1, theme: 'technical' })
    expect((await service.getWorkspace()).overrides?.theme).toBe('technical')

    await service.setWorkspace(null)
    expect(existsSync(file)).toBe(false)
    expect(await service.getWorkspace()).toEqual({ available: true, overrides: null })
  })

  it('ignores a damaged override file', async () => {
    mkdirSync(path.join(workspace, '.markdown-studio'))
    writeFileSync(path.join(workspace, '.markdown-studio', 'presentation.json'), '{ broken')
    expect(await service.getWorkspace()).toEqual({ available: true, overrides: null })
  })

  it('is unavailable without a folder', async () => {
    access.setWorkspace(null)
    expect(await service.getWorkspace()).toEqual({ available: false, overrides: null })
    await expect(service.setWorkspace({ theme: 'report' })).rejects.toThrow('folder')
  })
})

describe('reading custom CSS files', () => {
  it('reads stylesheets inside the workspace by relative or absolute path', async () => {
    writeFileSync(path.join(workspace, 'styles', 'doc.css'), '﻿h1 { color: red }')
    const relative = await service.readCss('styles/doc.css')
    expect(relative.text).toBe('h1 { color: red }')
    expect(relative.path).toBe('styles/doc.css')
    expect((await service.readCss(path.join(workspace, 'styles', 'doc.css'))).text).toContain('h1')
  })

  it('refuses files outside the workspace unless the user chose them', async () => {
    const outside = path.join(base, 'outside.css')
    writeFileSync(outside, 'p{}')
    await expect(service.readCss(outside)).rejects.toThrow(/Choose this stylesheet again/)
    service.grantPersisted(outside)
    expect((await service.readCss(outside)).text).toBe('p{}')
  })

  it('never reads other kinds of files or paths that escape the workspace', async () => {
    writeFileSync(path.join(workspace, 'secret.txt'), 'x')
    writeFileSync(path.join(base, 'secret.css'), 'x')
    await expect(service.readCss('secret.txt')).rejects.toThrow('.css')
    await expect(service.readCss('../secret.css')).rejects.toThrow()
    await expect(service.readCss('')).rejects.toThrow()
    await expect(service.readCss(42)).rejects.toThrow()
  })

  it('rejects oversized stylesheets', async () => {
    writeFileSync(path.join(workspace, 'big.css'), 'a'.repeat(300 * 1024))
    await expect(service.readCss('big.css')).rejects.toThrow(/larger/)
  })

  it('does not grant a persisted relative or non-css path', async () => {
    const outside = path.join(base, 'notes.txt')
    writeFileSync(outside, 'x')
    service.grantPersisted(outside)
    service.grantPersisted('relative.css')
    await expect(service.readCss(outside)).rejects.toThrow()
  })
})
