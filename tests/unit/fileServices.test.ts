import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { AccessControl, AccessDeniedError } from '../../src/main/services/accessControl'
import { AssetService, candidateName } from '../../src/main/services/assetService'
import { FileService, validateEntryName } from '../../src/main/services/fileService'

const FIXTURES = path.resolve(__dirname, '../fixtures')

let root: string
let outside: string
let access: AccessControl
let files: FileService
let assets: AssetService

beforeEach(() => {
  const base = mkdtempSync(path.join(tmpdir(), 'ms-fs-'))
  root = path.join(base, 'workspace')
  outside = path.join(base, 'external')
  cpSync(path.join(FIXTURES, 'workspace'), root, { recursive: true })
  cpSync(path.join(FIXTURES, 'external'), outside, { recursive: true })
  access = new AccessControl()
  access.setWorkspace(root)
  files = new FileService(access)
  assets = new AssetService(access)
})

describe('AccessControl', () => {
  it('allows the workspace and rejects everything else', async () => {
    await expect(files.readDir(root)).resolves.toBeTruthy()
    await expect(files.readDir(outside)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(
      files.readText(path.join(root, '..', 'external', 'notes.txt'))
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(files.readText(path.join(root, 'docs', '..', '..', 'x'))).rejects.toThrow()
  })

  it('grants individually opened files and image reads beside them', () => {
    const file = path.join(outside, 'notes.txt')
    expect(access.canAccessFile(file)).toBe(false)
    access.grantFile(file)
    expect(access.canAccessFile(file)).toBe(true)
    expect(access.canReadImage(path.join(outside, 'architecture.png'))).toBe(true)
    expect(access.canAccessFile(path.join(outside, 'architecture.png'))).toBe(false)
  })
})

describe('FileService', () => {
  it('lists folders first, hides .git, and sorts naturally', async () => {
    writeFileSync(path.join(root, 'chapter10.md'), '')
    writeFileSync(path.join(root, 'chapter2.md'), '')
    cpSync(path.join(root, 'docs'), path.join(root, '.git'), { recursive: true })
    const names = (await files.readDir(root)).map((e) => e.name)
    expect(names.slice(0, 2)).toEqual(['assets', 'docs'])
    expect(names).not.toContain('.git')
    expect(names.indexOf('chapter2.md')).toBeLessThan(names.indexOf('chapter10.md'))
  })

  it('round-trips content byte-for-byte, including BOM and CRLF', async () => {
    const crlf = path.join(root, 'windows-notes.md')
    const original = readFileSync(crlf)
    const doc = await files.readText(crlf)
    expect(doc.content).toContain('\r\n')
    await files.writeText(crlf, doc.content, doc.hasBom)
    expect(readFileSync(crlf).equals(original)).toBe(true)

    const bomFile = path.join(root, 'bom.md')
    writeFileSync(
      bomFile,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# Héllo\n')])
    )
    const bom = await files.readText(bomFile)
    expect(bom.hasBom).toBe(true)
    expect(bom.content).toBe('# Héllo\n')
    await files.writeText(bomFile, bom.content + 'more\n', bom.hasBom)
    expect(readFileSync(bomFile).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
  })

  it('creates Markdown files and folders without overwriting', async () => {
    const created = await files.createFile(root, 'notes')
    expect(path.basename(created)).toBe('notes.md')
    await expect(files.createFile(root, 'notes.md')).rejects.toThrow(/already exists/)
    const folder = await files.createDirectory(root, 'chapters')
    expect(existsSync(folder)).toBe(true)
    await expect(files.createDirectory(root, 'chapters')).rejects.toThrow(/already exists/)
  })

  it('renames and refuses collisions', async () => {
    const renamed = await files.rename(path.join(root, 'docs'), 'manual')
    expect(existsSync(path.join(renamed, 'guide.md'))).toBe(true)
    await expect(files.rename(path.join(root, 'README.md'), 'unsafe.md')).rejects.toThrow(
      /already exists/
    )
    await expect(files.rename(root, 'x')).rejects.toThrow(/workspace folder/)
  })

  it('deletes through the trash callback and protects the root', async () => {
    const trashed: string[] = []
    await files.trash(path.join(root, 'unsafe.md'), async (p) => void trashed.push(p))
    expect(trashed).toEqual([path.join(root, 'unsafe.md')])
    await expect(files.trash(root, async () => undefined)).rejects.toThrow(/workspace folder/)
    await files.deletePermanently(path.join(root, 'docs'))
    expect(existsSync(path.join(root, 'docs'))).toBe(false)
  })

  it('validates names', () => {
    expect(validateEntryName(' ok.md ')).toBe('ok.md')
    for (const bad of ['', '..', 'a/b', 'a\\b', 'what?.md', 'CON', 'nul.txt', 'trailing.']) {
      expect(() => validateEntryName(bad)).toThrow()
    }
  })
})

describe('AssetService', () => {
  it('references workspace images in place without copying', async () => {
    const source = path.join(root, 'assets', 'architecture.png')
    const result = await assets.importImage(source, path.join(root, 'assets'))
    expect(result).toEqual({ path: source, copied: false })
    expect(readdirSync(path.join(root, 'assets'))).toHaveLength(5)
  })

  it('copies external images into the asset folder, creating it if needed', async () => {
    const target = path.join(root, 'media', 'images')
    const result = await assets.importImage(path.join(outside, 'Team Photo (2024).png'), target)
    expect(result.copied).toBe(true)
    expect(result.path).toBe(path.join(target, 'Team Photo (2024).png'))
    expect(
      readFileSync(result.path).equals(readFileSync(path.join(outside, 'Team Photo (2024).png')))
    ).toBe(true)
  })

  it('never overwrites a different file with the same name', async () => {
    const existing = path.join(root, 'assets', 'architecture.png')
    const before = readFileSync(existing)
    const result = await assets.importImage(
      path.join(outside, 'architecture.png'),
      path.join(root, 'assets')
    )
    expect(result.path).toBe(path.join(root, 'assets', 'architecture-1.png'))
    expect(readFileSync(existing).equals(before)).toBe(true)
    const again = await assets.importImage(
      path.join(outside, 'architecture.png'),
      path.join(root, 'assets')
    )
    expect(again).toEqual({ path: result.path, copied: false })
  })

  it('rejects non-images and destinations outside the workspace', async () => {
    await expect(
      assets.importImage(path.join(outside, 'notes.txt'), path.join(root, 'assets'))
    ).rejects.toThrow(/not a supported image/)
    await expect(
      assets.importImage(path.join(outside, 'architecture.png'), path.join(outside, 'elsewhere'))
    ).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it('numbers collision candidates', () => {
    expect(candidateName('a.png', 0)).toBe('a.png')
    expect(candidateName('a.png', 2)).toBe('a-2.png')
    expect(candidateName('Team Photo (2024).png', 1)).toBe('Team Photo (2024)-1.png')
  })
})

describe('FileService (Phase 2 operations)', () => {
  it('lists workspace files breadth first, with filters, skipping hidden and dependency folders', async () => {
    mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(path.join(root, 'node_modules', 'pkg', 'x.md'), '')
    mkdirSync(path.join(root, '.markdown-studio'), { recursive: true })
    writeFileSync(path.join(root, '.markdown-studio', 'hidden.md'), '')
    const all = await files.listFiles({})
    const names = all.files.map((f) => path.relative(root, f).replace(/\\/g, '/'))
    expect(names).toContain('docs/guide.md')
    expect(names).not.toContain('node_modules/pkg/x.md')
    expect(names).not.toContain('.markdown-studio/hidden.md')
    // Shallow files come before deeply nested ones.
    expect(names.indexOf('README.md')).toBeLessThan(names.indexOf('docs/guide.md'))

    const images = await files.listFiles({ extensions: ['.png', '.JPG'] })
    expect(images.files.every((f) => /\.(png|jpg)$/i.test(f))).toBe(true)
    expect(images.files.length).toBeGreaterThan(1)

    const limited = await files.listFiles({ limit: 2 })
    expect(limited).toMatchObject({ truncated: true })
    expect(limited.files).toHaveLength(2)
  })

  it('reports whether paths exist, and refuses to look outside permitted areas', async () => {
    const states = await files.statMany([
      path.join(root, 'README.md'),
      path.join(root, 'docs'),
      path.join(root, 'nope.md'),
      path.join(outside, 'notes.txt'),
      ''
    ])
    expect(states).toEqual(['file', 'directory', 'missing', 'unknown', 'unknown'])
    await expect(files.statMany('x')).rejects.toThrow()
  })

  it('moves entries into folders without overwriting or escaping the workspace', async () => {
    mkdirSync(path.join(root, 'archive'))
    const moved = await files.move(path.join(root, 'README.md'), path.join(root, 'archive'))
    expect(moved).toBe(path.join(root, 'archive', 'README.md'))
    expect(existsSync(path.join(root, 'README.md'))).toBe(false)

    writeFileSync(path.join(root, 'archive', 'guide.md'), 'existing')
    await expect(
      files.move(path.join(root, 'docs', 'guide.md'), path.join(root, 'archive'))
    ).rejects.toThrow(/already exists/)
    expect(readFileSync(path.join(root, 'archive', 'guide.md'), 'utf8')).toBe('existing')

    await expect(files.move(path.join(root, 'docs'), path.join(root, 'docs'))).rejects.toThrow(
      /into itself/
    )
    mkdirSync(path.join(root, 'docs', 'inner'))
    await expect(
      files.move(path.join(root, 'docs'), path.join(root, 'docs', 'inner'))
    ).rejects.toThrow(/into itself/)
    await expect(files.move(path.join(root, 'docs'), outside)).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    await expect(files.move(root, path.join(root, 'archive'))).rejects.toThrow(/workspace folder/)
  })

  it('refuses to overwrite a file that changed on disk since it was read', async () => {
    const target = path.join(root, 'docs', 'guide.md')
    const { mtimeMs } = await files.readText(target)
    await expect(files.writeText(target, 'mine', false, mtimeMs)).resolves.toBeTruthy()
    // Someone else edits the file afterwards.
    writeFileSync(target, 'theirs')
    utimesSync(target, new Date(), new Date(Date.now() + 5000))
    await expect(files.writeText(target, 'mine again', false, mtimeMs)).rejects.toThrow(
      /changed on disk/
    )
    expect(readFileSync(target, 'utf8')).toBe('theirs')
    // Without the guard (an ordinary save) writing still works.
    await expect(files.writeText(target, 'forced', false)).resolves.toBeTruthy()
  })
})
