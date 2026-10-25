import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_PUBLICATION,
  sanitizePublication,
  type PublicationConfig
} from '@shared/publishing/project'
import {
  parseSourcesJson,
  sanitizeSources,
  serializeSources,
  SOURCE_LIMITS,
  type Source
} from '@shared/publishing/sources'
import type { ProjectState } from '@shared/ipc'
import type { AccessControl } from './accessControl'
import { writeFileAtomic } from './atomicWrite'
import { WORKSPACE_METADATA_FOLDER } from './templateService'

const PUBLICATION_FILE = 'publication.json'
const SOURCES_FILE = 'sources.json'
const MAX_CONFIG_BYTES = 512 * 1024

/**
 * Project data stored with the workspace, outside every document: the publication (chapter
 * order and options) and the source library. Both are validated on the way in and out, written
 * atomically, and never executed. Unreadable files are reported and left untouched.
 */
export class ProjectService {
  constructor(private readonly access: AccessControl) {}

  private folder(): string | null {
    const root = this.access.getWorkspace()
    return root ? path.join(root, WORKSPACE_METADATA_FOLDER) : null
  }

  async get(): Promise<ProjectState> {
    const folder = this.folder()
    if (!folder) return { available: false, publication: null, sources: [], problems: [] }
    const problems: string[] = []
    let publication: PublicationConfig | null = null
    let sources: Source[] = []
    try {
      const file = path.join(folder, PUBLICATION_FILE)
      const stat = await fs.stat(file)
      if (stat.size > MAX_CONFIG_BYTES) throw new Error('too large')
      publication = sanitizePublication(JSON.parse(await fs.readFile(file, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        problems.push('The publication file could not be read and was ignored.')
      }
    }
    try {
      const file = path.join(folder, SOURCES_FILE)
      const stat = await fs.stat(file)
      if (stat.size > SOURCE_LIMITS.maxFileChars) throw new Error('too large')
      const parsed = parseSourcesJson(await fs.readFile(file, 'utf8'))
      sources = parsed.sources
      problems.push(...parsed.problems)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        problems.push('The source library could not be read and was ignored.')
      }
    }
    return { available: true, publication, sources, problems }
  }

  async setPublication(input: unknown): Promise<ProjectState> {
    const folder = this.folder()
    if (!folder) throw new Error('Open a folder to create a publication.')
    const file = path.join(folder, PUBLICATION_FILE)
    if (input === null) {
      await fs.rm(file, { force: true })
    } else {
      const publication = sanitizePublication(input)
      await fs.mkdir(folder, { recursive: true })
      await writeFileAtomic(file, `${JSON.stringify(publication, null, 2)}\n`)
    }
    return this.get()
  }

  async setSources(input: unknown): Promise<ProjectState> {
    const folder = this.folder()
    if (!folder) throw new Error('Open a folder to keep a source library.')
    const { sources } = sanitizeSources(input)
    const file = path.join(folder, SOURCES_FILE)
    if (sources.length === 0) {
      await fs.rm(file, { force: true })
    } else {
      await fs.mkdir(folder, { recursive: true })
      await writeFileAtomic(file, serializeSources(sources))
    }
    return this.get()
  }
}

export { DEFAULT_PUBLICATION }
