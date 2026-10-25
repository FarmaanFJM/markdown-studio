import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_PRESETS } from '@shared/export/presets'
import { AccessControl } from '../../src/main/services/accessControl'
import { PresetService } from '../../src/main/services/presetService'

let base: string
let workspace: string
let globalDir: string
let access: AccessControl
let service: PresetService

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'ms-presets-'))
  workspace = path.join(base, 'project')
  globalDir = path.join(base, 'user-data', 'export-presets')
  mkdirSync(workspace, { recursive: true })
  access = new AccessControl()
  access.setWorkspace(workspace)
  service = new PresetService(access, globalDir)
})

const data = BUILTIN_PRESETS[0].data
const input = (name: string, extra: Record<string, unknown> = {}) => ({
  id: '',
  name,
  description: 'About',
  data: { ...data, format: 'pdf', theme: 'editorial' },
  ...extra
})

describe('PresetService', () => {
  it('creates, lists, edits and deletes custom presets in each scope', async () => {
    const created = await service.save('global', input('My Report'))
    expect(created).toMatchObject({ id: 'my-report', scope: 'global', name: 'My Report' })
    expect(created.data.theme).toBe('editorial')
    await service.save('workspace', input('Team Notes'))

    const listing = await service.list()
    expect(listing.global.map((p) => p.name)).toEqual(['My Report'])
    expect(listing.workspace.map((p) => p.name)).toEqual(['Team Notes'])
    expect(listing.workspaceAvailable).toBe(true)

    const renamed = await service.save('global', { ...created, name: 'My Report v2' })
    expect(renamed.id).toBe('my-report')
    expect((await service.list()).global[0].name).toBe('My Report v2')

    await service.delete('global', 'my-report')
    expect((await service.list()).global).toEqual([])
    await expect(service.delete('global', 'my-report')).resolves.toBeUndefined()
  })

  it('stores workspace presets in the project and gives each preset its own file', async () => {
    await service.save('workspace', input('Spec'))
    expect(existsSync(path.join(workspace, '.markdown-studio', 'export-presets', 'spec.json'))).toBe(true)
    const stored = JSON.parse(readFileSync(path.join(workspace, '.markdown-studio', 'export-presets', 'spec.json'), 'utf8'))
    expect(stored).toMatchObject({ version: 1, id: 'spec', name: 'Spec' })
  })

  it('does not let a custom preset take a built-in id', async () => {
    const created = await service.save('global', input('Standard PDF'))
    expect(created.id).toBe('standard-pdf-2')
  })

  it('stores an edit of a built-in preset and restores the original by deleting it', async () => {
    const standard = BUILTIN_PRESETS.find((p) => p.id === 'standard-pdf')!
    const edited = await service.save('global', { ...standard, data: { ...standard.data, theme: 'report' } })
    expect(edited.id).toBe('standard-pdf')
    expect((await service.list()).global).toHaveLength(1)

    expect(await service.restoreBuiltins('global')).toBe(1)
    expect((await service.list()).global).toEqual([])
    expect(await service.restoreBuiltins('global')).toBe(0)
  })

  it('skips damaged, foreign and mismatched files without touching them', async () => {
    mkdirSync(globalDir, { recursive: true })
    writeFileSync(path.join(globalDir, 'broken.json'), '{ not json')
    writeFileSync(path.join(globalDir, 'mismatch.json'), JSON.stringify({ id: 'other', name: 'X' }))
    writeFileSync(path.join(globalDir, 'Not An Id.json'), JSON.stringify({ id: 'x', name: 'X' }))
    writeFileSync(path.join(globalDir, 'notes.txt'), 'hello')
    writeFileSync(
      path.join(globalDir, 'future.json'),
      JSON.stringify({ version: 9, id: 'future', name: 'From later', data: { format: 'html', hologram: 1 } })
    )
    await service.save('global', input('Fine'))
    const names = (await service.list()).global.map((p) => p.name).sort()
    expect(names).toEqual(['Fine', 'From later'])
    expect(readdirSync(globalDir).sort()).toContain('broken.json')
    expect(readFileSync(path.join(globalDir, 'broken.json'), 'utf8')).toBe('{ not json')
  })

  it('validates what it is given', async () => {
    await expect(service.save('nope', input('x'))).rejects.toThrow('scope')
    await expect(service.save('global', input('   '))).rejects.toThrow(/name/i)
    await expect(service.save('global', null)).rejects.toThrow()
    await expect(service.delete('global', '../evil')).rejects.toThrow('id')
  })

  it('needs a folder for workspace presets', async () => {
    access.setWorkspace(null)
    await expect(service.save('workspace', input('x'))).rejects.toThrow('folder')
    const listing = await service.list()
    expect(listing.workspaceAvailable).toBe(false)
    expect(listing.workspace).toEqual([])
  })
})
