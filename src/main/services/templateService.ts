import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  makeTemplateId,
  validateTemplate,
  type StoredTemplate,
  type TemplateScope
} from '@shared/templates'
import type { TemplateListing } from '@shared/ipc'
import type { AccessControl } from './accessControl'

export const WORKSPACE_METADATA_FOLDER = '.markdown-studio'
const MAX_TEMPLATE_FILE_BYTES = 1024 * 1024
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export class TemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateError'
  }
}

/**
 * Stores user templates and snippets as JSON files: global ones in the application's data folder,
 * workspace ones in `<workspace>/.markdown-studio/templates`, which travels with the project.
 *
 * File names come from validated ids only, never from renderer-supplied paths, and the contents
 * are treated as data: they are parsed and validated, never evaluated.
 */
export class TemplateService {
  constructor(
    private readonly access: AccessControl,
    private readonly globalDirectory: string
  ) {}

  private directoryFor(scope: TemplateScope): string | null {
    if (scope === 'global') return this.globalDirectory
    const root = this.access.getWorkspace()
    return root ? path.join(root, WORKSPACE_METADATA_FOLDER, 'templates') : null
  }

  private async readAll(directory: string | null, scope: TemplateScope): Promise<StoredTemplate[]> {
    if (!directory) return []
    let names: string[]
    try {
      names = await fs.readdir(directory)
    } catch {
      return []
    }
    const templates: StoredTemplate[] = []
    for (const name of names) {
      if (!name.endsWith('.json') || !ID_PATTERN.test(name.slice(0, -5))) continue
      try {
        const file = path.join(directory, name)
        const stat = await fs.stat(file)
        if (!stat.isFile() || stat.size > MAX_TEMPLATE_FILE_BYTES) continue
        const parsed = validateTemplate(JSON.parse(await fs.readFile(file, 'utf8')))
        // The file name is the id; a mismatch means the file was edited or copied by hand.
        if (parsed.ok && parsed.template.id === name.slice(0, -5)) {
          templates.push({ ...parsed.template, scope })
        }
      } catch {
        // Unreadable or damaged templates are skipped; the rest keep working.
      }
    }
    return templates.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
  }

  async list(): Promise<TemplateListing> {
    return {
      global: await this.readAll(this.directoryFor('global'), 'global'),
      workspace: await this.readAll(this.directoryFor('workspace'), 'workspace'),
      workspaceAvailable: this.access.getWorkspace() !== null
    }
  }

  /** Creates a template (when `id` is empty) or replaces the stored one with the same id. */
  async save(scope: unknown, input: unknown): Promise<StoredTemplate> {
    if (scope !== 'global' && scope !== 'workspace')
      throw new TemplateError('Unknown template scope.')
    const directory = this.directoryFor(scope)
    if (!directory) throw new TemplateError('Open a folder to save templates for it.')
    if (typeof input !== 'object' || input === null) throw new TemplateError('Invalid template.')

    const existing = await this.readAll(directory, scope)
    const requested = (input as { id?: unknown }).id
    const previous =
      typeof requested === 'string' && requested
        ? existing.find((t) => t.id === requested)
        : undefined
    const id =
      previous?.id ??
      makeTemplateId(
        String((input as { name?: unknown }).name ?? ''),
        existing.map((t) => t.id)
      )
    const now = new Date().toISOString()
    const checked = validateTemplate({
      ...input,
      id,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    })
    if (!checked.ok) throw new TemplateError(checked.error)

    await fs.mkdir(directory, { recursive: true })
    const target = path.join(directory, `${id}.json`)
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
    try {
      await fs.writeFile(temporary, `${JSON.stringify(checked.template, null, 2)}\n`, 'utf8')
      await fs.rename(temporary, target)
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }
    return { ...checked.template, scope }
  }

  async delete(scope: unknown, id: unknown): Promise<void> {
    if (scope !== 'global' && scope !== 'workspace')
      throw new TemplateError('Unknown template scope.')
    if (typeof id !== 'string' || !ID_PATTERN.test(id))
      throw new TemplateError('Invalid template id.')
    const directory = this.directoryFor(scope)
    if (!directory) throw new TemplateError('No folder is open.')
    await fs.rm(path.join(directory, `${id}.json`), { force: true })
  }
}
