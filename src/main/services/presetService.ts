import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  BUILTIN_PRESET_IDS,
  makePresetId,
  PRESET_ID_PATTERN,
  PRESET_LIMITS,
  validatePreset,
  type PresetScope,
  type StoredPreset
} from '@shared/export/presets'
import type { AccessControl } from './accessControl'
import { writeFileAtomic } from './atomicWrite'
import { WORKSPACE_METADATA_FOLDER } from './templateService'

export interface PresetListing {
  global: StoredPreset[]
  workspace: StoredPreset[]
  workspaceAvailable: boolean
}

export class PresetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PresetError'
  }
}

const MAX_PRESETS_PER_SCOPE = 200

/**
 * Stores export presets as one JSON file per preset: global ones in the user-data folder,
 * workspace ones in `<workspace>/.markdown-studio/export-presets`. File names come from validated
 * ids only; files are data that is validated on every read, never evaluated, and never rewritten
 * on load (a damaged or foreign file is simply skipped).
 */
export class PresetService {
  constructor(
    private readonly access: AccessControl,
    private readonly globalDirectory: string
  ) {}

  private directoryFor(scope: PresetScope): string | null {
    if (scope === 'global') return this.globalDirectory
    const root = this.access.getWorkspace()
    return root ? path.join(root, WORKSPACE_METADATA_FOLDER, 'export-presets') : null
  }

  private async readAll(directory: string | null, scope: PresetScope): Promise<StoredPreset[]> {
    if (!directory) return []
    let names: string[]
    try {
      names = await fs.readdir(directory)
    } catch {
      return []
    }
    const presets: StoredPreset[] = []
    for (const name of names.slice(0, MAX_PRESETS_PER_SCOPE * 2)) {
      if (!name.endsWith('.json') || !PRESET_ID_PATTERN.test(name.slice(0, -5))) continue
      try {
        const file = path.join(directory, name)
        const stat = await fs.stat(file)
        if (!stat.isFile() || stat.size > PRESET_LIMITS.fileBytes) continue
        const parsed = validatePreset(JSON.parse(await fs.readFile(file, 'utf8')))
        // The file name is the id; a mismatch means the file was edited or copied by hand.
        if (parsed.ok && parsed.preset.id === name.slice(0, -5)) {
          presets.push({ ...parsed.preset, scope, updatedAt: stat.mtime.toISOString() })
        }
      } catch {
        // Unreadable or damaged presets are skipped; the rest keep working.
      }
    }
    return presets.slice(0, MAX_PRESETS_PER_SCOPE)
  }

  async list(): Promise<PresetListing> {
    return {
      global: await this.readAll(this.directoryFor('global'), 'global'),
      workspace: await this.readAll(this.directoryFor('workspace'), 'workspace'),
      workspaceAvailable: this.access.getWorkspace() !== null
    }
  }

  /**
   * Creates a preset (empty `id`) or replaces the one with that id. A built-in id stores an
   * edited copy of that built-in.
   */
  async save(scope: unknown, input: unknown): Promise<StoredPreset> {
    if (scope !== 'global' && scope !== 'workspace') throw new PresetError('Unknown preset scope.')
    const directory = this.directoryFor(scope)
    if (!directory) throw new PresetError('Open a folder to save presets for it.')
    if (typeof input !== 'object' || input === null) throw new PresetError('Invalid preset.')

    const listing = await this.list()
    const existing = scope === 'global' ? listing.global : listing.workspace
    const requested = (input as { id?: unknown }).id
    const reuseId =
      typeof requested === 'string' &&
      PRESET_ID_PATTERN.test(requested) &&
      (BUILTIN_PRESET_IDS.has(requested) || existing.some((p) => p.id === requested))
    if (!reuseId && existing.length >= MAX_PRESETS_PER_SCOPE) {
      throw new PresetError('There are too many presets.')
    }
    const id = reuseId
      ? (requested as string)
      : makePresetId(
          String((input as { name?: unknown }).name ?? ''),
          [...listing.global, ...listing.workspace].map((p) => p.id)
        )
    const checked = validatePreset({ ...input, id })
    if (!checked.ok) throw new PresetError(checked.error)

    await fs.mkdir(directory, { recursive: true })
    await writeFileAtomic(
      path.join(directory, `${id}.json`),
      `${JSON.stringify(checked.preset, null, 2)}\n`
    )
    return { ...checked.preset, scope, updatedAt: new Date().toISOString() }
  }

  async delete(scope: unknown, id: unknown): Promise<void> {
    if (scope !== 'global' && scope !== 'workspace') throw new PresetError('Unknown preset scope.')
    if (typeof id !== 'string' || !PRESET_ID_PATTERN.test(id))
      throw new PresetError('Invalid preset id.')
    const directory = this.directoryFor(scope)
    if (!directory) throw new PresetError('No folder is open.')
    await fs.rm(path.join(directory, `${id}.json`), { force: true })
  }

  /** Removes the edited copies of built-in presets in a scope, restoring the originals. */
  async restoreBuiltins(scope: unknown): Promise<number> {
    if (scope !== 'global' && scope !== 'workspace') throw new PresetError('Unknown preset scope.')
    const directory = this.directoryFor(scope)
    if (!directory) return 0
    let removed = 0
    for (const id of BUILTIN_PRESET_IDS) {
      const file = path.join(directory, `${id}.json`)
      if (
        await fs.stat(file).then(
          () => true,
          () => false
        )
      ) {
        await fs.rm(file, { force: true })
        removed++
      }
    }
    return removed
  }
}
