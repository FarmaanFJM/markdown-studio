import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promises as fsPromises } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessControl, AccessDeniedError } from '../../src/main/services/accessControl'
import { AssetService } from '../../src/main/services/assetService'
import { ImportService } from '../../src/main/services/importService'
import { imagePathForDocument } from '../../src/shared/imageReference'

const SCREENSHOTS = [
  'A - God of War Critical Health.png',
  'A - God of War Damage.png',
  'A - God of War Full Health.png',
  'B - Hades + God of War Critical Health.png',
  'B - Hades + God of War Damage.png',
  'B - Hades + God of War Full Health.png'
]

/** A PNG signature followed by bytes unique to the file, so a mix-up or a re-encode is detected. */
function pngBytes(seed: number): Buffer {
  const body = Buffer.alloc(2048 + seed)
  for (let i = 0; i < body.length; i++) body[i] = (i * 31 + seed * 7) & 0xff
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), body])
}

let base: string
let workspace: string
let external: string
let access: AccessControl
let imports: ImportService

function makeArcanox(): string {
  const folder = path.join(external, 'Arcanox Health UI System')
  mkdirSync(folder, { recursive: true })
  SCREENSHOTS.forEach((name, i) => writeFileSync(path.join(folder, name), pngBytes(i)))
  return folder
}

function listTree(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((d) =>
      d.isDirectory()
        ? [`${prefix}${d.name}/`, ...listTree(path.join(dir, d.name), `${prefix}${d.name}/`)]
        : [`${prefix}${d.name}`]
    )
    .sort()
}

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'ms-import-'))
  workspace = path.join(base, 'Documenteren')
  external = path.join(base, 'Downloads')
  mkdirSync(workspace, { recursive: true })
  mkdirSync(external, { recursive: true })
  access = new AccessControl()
  access.setWorkspace(workspace)
  imports = new ImportService(access)
})

describe('importing a folder from outside the project', () => {
  it('copies the Arcanox folder with every screenshot, byte for byte', async () => {
    const source = makeArcanox()
    const result = await imports.importExternal([source], workspace)

    const copy = path.join(workspace, 'Arcanox Health UI System')
    expect(result.imported).toEqual([
      { source, path: copy, kind: 'directory', fileCount: SCREENSHOTS.length }
    ])
    expect(result.fileCount).toBe(6)
    expect(result.skipped).toEqual([])
    expect(readdirSync(copy).sort()).toEqual([...SCREENSHOTS].sort())
    SCREENSHOTS.forEach((name, i) => {
      expect(readFileSync(path.join(copy, name)).equals(pngBytes(i))).toBe(true)
    })
  })

  it('is independent of the original: deleting it leaves the project intact', async () => {
    const source = makeArcanox()
    const result = await imports.importExternal([source], workspace)
    rmSync(source, { recursive: true })
    const copy = result.imported[0].path
    expect(readdirSync(copy)).toHaveLength(6)
    expect(readFileSync(path.join(copy, SCREENSHOTS[0])).equals(pngBytes(0))).toBe(true)
  })

  it('preserves nested directories, empty directories and file names', async () => {
    const source = path.join(external, 'Design (final) v2')
    mkdirSync(path.join(source, 'screens', 'mobile (small)'), { recursive: true })
    mkdirSync(path.join(source, 'empty'))
    writeFileSync(path.join(source, 'readme (copy).md'), '# Readme\r\nnaïve café\r\n')
    writeFileSync(path.join(source, 'screens', 'home page.png'), pngBytes(1))
    writeFileSync(
      path.join(source, 'screens', 'mobile (small)', 'Team Photo (2024).png'),
      pngBytes(2)
    )

    const result = await imports.importExternal([source], workspace)

    const copy = path.join(workspace, 'Design (final) v2')
    expect(result.imported[0].fileCount).toBe(3)
    expect(listTree(copy)).toEqual([
      'empty/',
      'readme (copy).md',
      'screens/',
      'screens/home page.png',
      'screens/mobile (small)/',
      'screens/mobile (small)/Team Photo (2024).png'
    ])
    // Text keeps its line endings: nothing is re-encoded.
    expect(readFileSync(path.join(copy, 'readme (copy).md'), 'utf8')).toBe(
      '# Readme\r\nnaïve café\r\n'
    )
  })

  it('imports into a chosen subfolder, not the project root', async () => {
    mkdirSync(path.join(workspace, 'images'))
    const result = await imports.importExternal([makeArcanox()], path.join(workspace, 'images'))
    expect(result.imported[0].path).toBe(path.join(workspace, 'images', 'Arcanox Health UI System'))
    expect(existsSync(path.join(workspace, 'Arcanox Health UI System'))).toBe(false)
  })

  it('never merges into or overwrites a folder that already exists', async () => {
    const source = makeArcanox()
    const first = await imports.importExternal([source], workspace)
    writeFileSync(path.join(first.imported[0].path, SCREENSHOTS[0]), 'my own edit')

    const second = await imports.importExternal([source], workspace)

    expect(path.basename(second.imported[0].path)).toBe('Arcanox Health UI System-1')
    expect(readFileSync(path.join(first.imported[0].path, SCREENSHOTS[0]), 'utf8')).toBe(
      'my own edit'
    )
    expect(
      readFileSync(path.join(second.imported[0].path, SCREENSHOTS[0])).equals(pngBytes(0))
    ).toBe(true)
    const third = await imports.importExternal([source], workspace)
    expect(path.basename(third.imported[0].path)).toBe('Arcanox Health UI System-2')
  })

  it('refuses to import a folder into a folder inside itself', async () => {
    const outerWorkspace = path.join(base, 'Outer')
    mkdirSync(path.join(outerWorkspace, 'project'), { recursive: true })
    access.setWorkspace(path.join(outerWorkspace, 'project'))
    // A drop of the folder that contains the open project would copy it into itself forever.
    await expect(
      imports.importExternal([outerWorkspace], path.join(outerWorkspace, 'project'))
    ).rejects.toThrow(/inside itself/)
  })

  it('skips symbolic links instead of following them', async () => {
    const source = makeArcanox()
    const secret = path.join(base, 'secret.txt')
    writeFileSync(secret, 'secret')
    try {
      symlinkSync(secret, path.join(source, 'link.txt'))
    } catch {
      return // Creating links needs privileges on some systems.
    }
    const result = await imports.importExternal([source], workspace)
    expect(result.skipped).toEqual(['Arcanox Health UI System/link.txt (shortcut or link)'])
    expect(existsSync(path.join(result.imported[0].path, 'link.txt'))).toBe(false)
    expect(result.fileCount).toBe(6)
  })
})

describe('importing files from outside the project', () => {
  it('copies one file', async () => {
    const file = path.join(external, 'A - God of War Damage.png')
    writeFileSync(file, pngBytes(5))
    const result = await imports.importExternal([file], workspace)
    expect(result.imported).toEqual([
      {
        source: file,
        path: path.join(workspace, 'A - God of War Damage.png'),
        kind: 'file',
        fileCount: 1
      }
    ])
    expect(readFileSync(result.imported[0].path).equals(pngBytes(5))).toBe(true)
    expect(existsSync(file)).toBe(true) // A copy, not a move.
  })

  it('copies several files, with spaces and parentheses in their names', async () => {
    const names = ['Team Photo (2024).png', 'notes (draft) v2.txt', 'a b  c.md']
    const sources = names.map((name, i) => {
      const file = path.join(external, name)
      writeFileSync(file, pngBytes(i))
      return file
    })
    mkdirSync(path.join(workspace, 'assets'))
    const result = await imports.importExternal(sources, path.join(workspace, 'assets'))
    expect(result.imported.map((i) => path.basename(i.path))).toEqual(names)
    expect(result.fileCount).toBe(3)
    expect(readdirSync(path.join(workspace, 'assets')).sort()).toEqual([...names].sort())
  })

  it('never overwrites an existing file: the copy gets a numeric suffix', async () => {
    const file = path.join(external, 'Team Photo (2024).png')
    writeFileSync(file, pngBytes(1))
    writeFileSync(path.join(workspace, 'Team Photo (2024).png'), 'original')

    const first = await imports.importExternal([file], workspace)
    const second = await imports.importExternal([file], workspace)

    expect(path.basename(first.imported[0].path)).toBe('Team Photo (2024)-1.png')
    expect(path.basename(second.imported[0].path)).toBe('Team Photo (2024)-2.png')
    expect(readFileSync(path.join(workspace, 'Team Photo (2024).png'), 'utf8')).toBe('original')
  })

  it('imports a dropped Markdown file as a project document', async () => {
    const file = path.join(external, 'Onderzoek Health UI.md')
    writeFileSync(file, '# Onderzoek\n\n![x](images/x.png)\n')
    const result = await imports.importExternal([file], workspace)
    expect(readFileSync(result.imported[0].path, 'utf8')).toBe(
      '# Onderzoek\n\n![x](images/x.png)\n'
    )
    expect(access.canAccessFile(result.imported[0].path)).toBe(true)
  })

  it('handles files and folders dropped together, listing each once', async () => {
    const folder = makeArcanox()
    const file = path.join(external, 'loose.png')
    writeFileSync(file, pngBytes(9))
    const result = await imports.importExternal([folder, file, file], workspace)
    expect(result.imported.map((i) => path.basename(i.path))).toEqual([
      'Arcanox Health UI System',
      'loose.png'
    ])
    expect(result.fileCount).toBe(7)
  })
})

describe('images stay valid after import', () => {
  it('an imported screenshot can be referenced relative to a document and still exists after a restart', async () => {
    const result = await imports.importExternal([makeArcanox()], workspace)
    const image = path.join(result.imported[0].path, SCREENSHOTS[2])
    const doc = path.join(workspace, 'Design-Health-UI.md')
    const relative = imagePathForDocument(path.dirname(doc), image)
    expect(relative).toBe('Arcanox Health UI System/A - God of War Full Health.png')

    // "Restart": new services over the same folder.
    const restarted = new AccessControl()
    restarted.setWorkspace(workspace)
    expect(restarted.canReadImage(image)).toBe(true)
    expect(readFileSync(path.join(path.dirname(doc), relative!)).equals(pngBytes(2))).toBe(true)
  })

  it('keeps the drop-into-document image workflow: copied into the asset folder, never overwritten', async () => {
    const assets = new AssetService(access)
    const file = path.join(external, 'A - God of War Damage.png')
    writeFileSync(file, pngBytes(1))
    const target = path.join(workspace, 'assets')
    const first = await assets.importImage(file, target)
    expect(first).toEqual({ path: path.join(target, 'A - God of War Damage.png'), copied: true })
    // Same picture again reuses the copy; a different one with the same name is renamed.
    expect((await assets.importImage(file, target)).copied).toBe(false)
    writeFileSync(file, pngBytes(2))
    expect((await assets.importImage(file, target)).path).toBe(
      path.join(target, 'A - God of War Damage-1.png')
    )
  })
})

describe('import security and limits', () => {
  it('only writes inside the open project', async () => {
    const source = makeArcanox()
    await expect(imports.importExternal([source], external)).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    await expect(
      imports.importExternal([source], path.join(workspace, '..'))
    ).rejects.toBeInstanceOf(AccessDeniedError)
    expect(
      existsSync(path.join(external, 'Arcanox Health UI System', 'Arcanox Health UI System'))
    ).toBe(false)
  })

  it('rejects a missing destination, a file as destination and bad input', async () => {
    const file = path.join(external, 'a.txt')
    writeFileSync(file, 'a')
    await expect(imports.importExternal([file], path.join(workspace, 'nope'))).rejects.toThrow(
      /not a folder/
    )
    writeFileSync(path.join(workspace, 'plain.md'), '')
    await expect(imports.importExternal([file], path.join(workspace, 'plain.md'))).rejects.toThrow(
      /not a folder/
    )
    await expect(imports.importExternal([], workspace)).rejects.toThrow(/nothing to import/i)
    await expect(imports.importExternal(['relative/path.png'], workspace)).rejects.toThrow(
      /no location on disk/
    )
    await expect(imports.importExternal([123], workspace)).rejects.toThrow(/no location on disk/)
    await expect(imports.importExternal(['nope'], undefined)).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    await expect(
      imports.importExternal([path.join(external, 'gone.png')], workspace)
    ).rejects.toThrow(/could not be found/)
  })

  it('leaves nothing behind when an import fails part-way', async () => {
    const source = makeArcanox()
    const realCopy = fsPromises.copyFile
    let calls = 0
    const spy = vi.spyOn(fsPromises, 'copyFile').mockImplementation(async (...args) => {
      if (++calls === 3) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
      return realCopy(...args)
    })
    try {
      await expect(imports.importExternal([source], workspace)).rejects.toThrow(/disk full/)
    } finally {
      spy.mockRestore()
    }
    expect(readdirSync(workspace)).toEqual([])
    expect(readdirSync(source)).toHaveLength(6) // The original is untouched.
  })
})
