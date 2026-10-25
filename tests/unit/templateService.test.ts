import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { AccessControl } from '../../src/main/services/accessControl'
import { TemplateService } from '../../src/main/services/templateService'

let base: string
let workspace: string
let globalDir: string
let access: AccessControl
let service: TemplateService

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'ms-templates-'))
  workspace = path.join(base, 'project')
  globalDir = path.join(base, 'user-data', 'templates')
  mkdirSync(workspace, { recursive: true })
  access = new AccessControl()
  access.setWorkspace(workspace)
  service = new TemplateService(access, globalDir)
})

const input = (name: string, extra: Record<string, unknown> = {}) => ({
  id: '',
  name,
  description: 'About it',
  kind: 'document',
  body: `# ${name}\n`,
  ...extra
})

describe('TemplateService', () => {
  it('saves, lists, updates and deletes templates in each scope', async () => {
    const created = await service.save('global', input('Weekly Review'))
    expect(created).toMatchObject({ id: 'weekly-review', scope: 'global', name: 'Weekly Review' })
    await service.save('workspace', input('Release notes', { kind: 'snippet' }))

    const listing = await service.list()
    expect(listing.global.map((t) => t.name)).toEqual(['Weekly Review'])
    expect(listing.workspace.map((t) => [t.name, t.kind])).toEqual([['Release notes', 'snippet']])
    expect(listing.workspaceAvailable).toBe(true)

    // Updating keeps the id and creation time, and renaming does not move the file.
    const renamed = await service.save('global', { ...created, name: 'Weekly Retro', body: 'new' })
    expect(renamed.id).toBe('weekly-review')
    expect(renamed.createdAt).toBe(created.createdAt)
    expect((await service.list()).global).toMatchObject([{ name: 'Weekly Retro', body: 'new' }])

    await service.delete('global', 'weekly-review')
    expect((await service.list()).global).toEqual([])
    await expect(service.delete('global', 'weekly-review')).resolves.toBeUndefined()
  })

  it('stores workspace templates inside the project, hidden from ordinary documents', async () => {
    await service.save('workspace', input('Spec'))
    expect(existsSync(path.join(workspace, '.markdown-studio', 'templates', 'spec.json'))).toBe(
      true
    )
    expect(readdirSync(workspace)).toEqual(['.markdown-studio'])
  })

  it('keeps workspace templates with the folder when it moves to another computer', async () => {
    await service.save('workspace', input('Portable'))
    const moved = path.join(base, 'other-machine', 'renamed-project')
    mkdirSync(path.dirname(moved), { recursive: true })
    cpSync(workspace, moved, { recursive: true })

    const otherAccess = new AccessControl()
    otherAccess.setWorkspace(moved)
    const other = new TemplateService(otherAccess, path.join(base, 'other-machine', 'data'))
    expect((await other.list()).workspace.map((t) => t.name)).toEqual(['Portable'])
    // Global templates are not part of the project and stay behind.
    expect((await other.list()).global).toEqual([])
  })

  it('persists across service instances (application restarts)', async () => {
    await service.save('global', input('Persistent'))
    const restarted = new TemplateService(access, globalDir)
    expect((await restarted.list()).global.map((t) => t.name)).toEqual(['Persistent'])
  })

  it('refuses workspace templates when no folder is open', async () => {
    access.setWorkspace(null)
    await expect(service.save('workspace', input('Nope'))).rejects.toThrow(/Open a folder/)
    expect((await service.list()).workspaceAvailable).toBe(false)
    expect((await service.list()).workspace).toEqual([])
  })

  it('generates unique ids for templates with the same name', async () => {
    const a = await service.save('global', input('Notes'))
    const b = await service.save('global', input('Notes'))
    expect([a.id, b.id]).toEqual(['notes', 'notes-2'])
  })

  it('ignores damaged, foreign and mismatched files', async () => {
    await service.save('global', input('Good'))
    writeFileSync(path.join(globalDir, 'broken.json'), '{ not json')
    writeFileSync(path.join(globalDir, 'notes.txt'), 'hello')
    writeFileSync(
      path.join(globalDir, 'mismatch.json'),
      JSON.stringify({ id: 'other', name: 'Wrong', body: 'x', kind: 'document' })
    )
    writeFileSync(path.join(globalDir, 'Bad Name.json'), '{}')
    expect((await service.list()).global.map((t) => t.name)).toEqual(['Good'])
  })

  it('rejects invalid input and never writes outside its folders', async () => {
    await expect(service.save('elsewhere', input('x'))).rejects.toThrow(/scope/)
    await expect(service.save('global', input('  '))).rejects.toThrow(/name/)
    await expect(service.save('global', 'text')).rejects.toThrow(/Invalid/)
    await expect(
      service.save('global', { ...input('Big'), body: 'x'.repeat(600 * 1024) })
    ).rejects.toThrow(/large/)
    // A hostile id is replaced by a generated one, so it cannot select a file path.
    const saved = await service.save('global', input('Evil', { id: '../../escape' }))
    expect(saved.id).toBe('evil')
    expect(existsSync(path.join(base, 'escape.json'))).toBe(false)
    await expect(service.delete('global', '../../x')).rejects.toThrow(/Invalid template id/)
    await expect(service.delete('global', 42)).rejects.toThrow()
  })

  it('leaves no temporary files behind', async () => {
    await service.save('global', input('Tidy'))
    expect(readdirSync(globalDir)).toEqual(['tidy.json'])
  })
})
