import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { AccessControl, AccessDeniedError } from '../../src/main/services/accessControl'
import { AssetService, looksLikeImage } from '../../src/main/services/assetService'
import { FileService } from '../../src/main/services/fileService'
import { ProjectService } from '../../src/main/services/projectService'
import { RecoveryService } from '../../src/main/services/recoveryService'
import { sanitizePublication } from '@shared/publishing/project'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

let base: string
let root: string
let access: AccessControl

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'ms-safety-'))
  root = path.join(base, 'project')
  mkdirSync(root, { recursive: true })
  access = new AccessControl()
  access.setWorkspace(root)
})

describe('clipboard images', () => {
  it('recognises real image data and rejects the rest', () => {
    expect(looksLikeImage(PNG, 'image/png')).toBe(true)
    expect(looksLikeImage(PNG, 'image/jpeg')).toBe(false)
    expect(looksLikeImage(Buffer.from('<svg onload=alert(1)>'), 'image/png')).toBe(false)
    expect(looksLikeImage(Buffer.from('GIF89a....'), 'image/gif')).toBe(true)
  })

  it('stores a pasted image without overwriting and reuses identical data', async () => {
    const assets = new AssetService(access)
    const dir = path.join(root, 'assets')
    const first = await assets.saveClipboardImage(PNG, 'image/png', dir, 'pasted-image-1')
    expect(first).toEqual({ path: path.join(dir, 'pasted-image-1.png'), copied: true })
    const again = await assets.saveClipboardImage(PNG, 'image/png', dir, 'pasted-image-1')
    expect(again).toEqual({ path: first.path, copied: false })
    const other = Buffer.concat([PNG, Buffer.from([0])])
    const second = await assets.saveClipboardImage(other, 'image/png', dir, 'pasted-image-1')
    expect(second.path).toBe(path.join(dir, 'pasted-image-1-1.png'))
    expect(readFileSync(first.path).equals(PNG)).toBe(true)
  })

  it('sanitises the file name and refuses bad input and places outside the project', async () => {
    const assets = new AssetService(access)
    const dir = path.join(root, 'assets')
    const saved = await assets.saveClipboardImage(PNG, 'image/png', dir, '../../evil name.exe')
    expect(path.dirname(saved.path)).toBe(dir)
    expect(path.basename(saved.path)).toMatch(/^[A-Za-z0-9_-]+\.png$/)
    await expect(
      assets.saveClipboardImage(Buffer.from('nope'), 'image/png', dir, 'x')
    ).rejects.toThrow(/not a valid image/)
    await expect(assets.saveClipboardImage(PNG, 'text/html', dir, 'x')).rejects.toThrow(
      /supported image/
    )
    await expect(assets.saveClipboardImage(Buffer.alloc(0), 'image/png', dir, 'x')).rejects.toThrow(
      /empty/
    )
    await expect(
      assets.saveClipboardImage(PNG, 'image/png', path.join(base, 'elsewhere'), 'x')
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(assets.saveClipboardImage(PNG, 'image/png', 'relative/dir', 'x')).rejects.toThrow()
  })
})

describe('saving documents', () => {
  it('writes atomically, leaves no temporary files and keeps the byte order mark', async () => {
    const files = new FileService(access)
    const file = path.join(root, 'doc.md')
    await files.writeText(file, 'héllo\n', true)
    const bytes = readFileSync(file)
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(readdirSync(root).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('refuses to overwrite a file that changed after it was read', async () => {
    const files = new FileService(access)
    const file = path.join(root, 'doc.md')
    const { mtimeMs } = await files.writeText(file, 'one', false)
    const later = new Date(mtimeMs + 5000)
    utimesSync(file, later, later)
    writeFileSync(file, 'theirs')
    utimesSync(file, later, later)
    await expect(files.writeText(file, 'mine', false, mtimeMs)).rejects.toThrow(/changed on disk/)
    expect(readFileSync(file, 'utf8')).toBe('theirs')
    const fresh = statSync(file).mtimeMs
    await expect(files.writeText(file, 'mine', false, fresh)).resolves.toBeTruthy()
    expect(readFileSync(file, 'utf8')).toBe('mine')
  })
})

describe('recovery copies', () => {
  it('keeps, lists and removes snapshots and skips damaged files', async () => {
    const recovery = new RecoveryService(path.join(base, 'recovery'))
    await recovery.write({
      id: 'a-1',
      path: '/x/doc.md',
      name: 'doc.md',
      content: 'unsaved',
      hasBom: false,
      mtimeMs: 5
    })
    await recovery.write({
      id: 'a-2',
      path: null,
      name: 'Untitled-1',
      content: 'new',
      hasBom: true,
      mtimeMs: null
    })
    writeFileSync(path.join(base, 'recovery', 'broken.json'), '{ nope')
    const listed = await recovery.list()
    expect(listed.map((s) => s.id).sort()).toEqual(['a-1', 'a-2'])
    expect(listed.find((s) => s.id === 'a-1')?.content).toBe('unsaved')
    await recovery.remove('a-1')
    expect((await recovery.list()).map((s) => s.id)).toEqual(['a-2'])
    await recovery.clear()
    expect(await recovery.list()).toEqual([])
  })

  it('validates what it is given', async () => {
    const recovery = new RecoveryService(path.join(base, 'recovery'))
    await expect(recovery.write({ id: '../../evil', content: 'x' })).rejects.toThrow()
    await expect(recovery.write({ id: 'ok', content: 5 })).rejects.toThrow()
    await recovery.remove('../../etc/passwd')
    expect(existsSync(path.join(base, 'recovery'))).toBe(false)
  })
})

describe('project service', () => {
  it('stores and reads the publication and the source library inside the workspace', async () => {
    const project = new ProjectService(access)
    expect(await project.get()).toMatchObject({ available: true, publication: null, sources: [] })
    const config = sanitizePublication({
      title: 'Book',
      chapters: ['a.md', 'b/c.md'],
      layout: { columns: { count: 2, gapMm: 6 } }
    })
    await project.setPublication(config)
    await project.setSources([
      { id: 'k1', type: 'book', title: 'T' },
      { id: 'bad key', type: 'book' }
    ])
    const state = await project.get()
    expect(state.publication).toEqual(config)
    expect(state.sources.map((s) => s.id)).toEqual(['k1'])
    expect(existsSync(path.join(root, '.markdown-studio', 'publication.json'))).toBe(true)
    await project.setPublication(null)
    await project.setSources([])
    expect(existsSync(path.join(root, '.markdown-studio', 'publication.json'))).toBe(false)
    expect(existsSync(path.join(root, '.markdown-studio', 'sources.json'))).toBe(false)
  })

  it('reports damaged files and leaves them untouched', async () => {
    const project = new ProjectService(access)
    mkdirSync(path.join(root, '.markdown-studio'), { recursive: true })
    writeFileSync(path.join(root, '.markdown-studio', 'publication.json'), '{ not json')
    writeFileSync(path.join(root, '.markdown-studio', 'sources.json'), 'also broken')
    const state = await project.get()
    expect(state.publication).toBeNull()
    expect(state.problems.length).toBeGreaterThanOrEqual(2)
    expect(readFileSync(path.join(root, '.markdown-studio', 'publication.json'), 'utf8')).toBe(
      '{ not json'
    )
  })

  it('refuses to work without an open folder', async () => {
    const closed = new AccessControl()
    const project = new ProjectService(closed)
    expect(await project.get()).toMatchObject({ available: false })
    await expect(project.setPublication({})).rejects.toThrow(/Open a folder/)
  })
})

describe('pasting the same picture later', () => {
  it('reuses the earlier pasted file even when the generated name differs', async () => {
    const assets = new AssetService(access)
    const dir = path.join(root, 'assets')
    const first = await assets.saveClipboardImage(
      PNG,
      'image/png',
      dir,
      'pasted-image-20261025-100000'
    )
    const later = await assets.saveClipboardImage(
      PNG,
      'image/png',
      dir,
      'pasted-image-20261025-100007'
    )
    expect(later).toEqual({ path: first.path, copied: false })
    expect(readdirSync(dir)).toHaveLength(1)
  })
})
