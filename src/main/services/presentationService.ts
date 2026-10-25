import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dialog, type BrowserWindow } from 'electron'
import {
  hasWorkspaceOverrides,
  sanitizeWorkspacePresentation,
  type WorkspacePresentation
} from '@shared/presentation/settings'
import { CSS_LIMITS } from '@shared/presentation/css'
import type { AccessControl } from './accessControl'
import { writeFileAtomic } from './atomicWrite'
import { WORKSPACE_METADATA_FOLDER } from './templateService'

export interface WorkspacePresentationState {
  /** False when no folder is open. */
  available: boolean
  overrides: WorkspacePresentation | null
}

export interface CssFile {
  /** The path as it should be stored: workspace-relative inside the workspace, else absolute. */
  path: string
  text: string
  mtimeMs: number
}

const FILE_NAME = 'presentation.json'

/**
 * Workspace appearance overrides and custom CSS files.
 *
 * Overrides live in `<workspace>/.markdown-studio/presentation.json`, outside any Markdown
 * document. CSS files can be read only when they are inside the workspace or were chosen by the
 * user in the file dialog (or are the file saved in the user's own settings), so a compromised
 * renderer cannot use this API to read arbitrary files.
 */
export class PresentationService {
  private readonly grants = new Set<string>()

  constructor(
    private readonly access: AccessControl,
    private readonly getWindow: () => BrowserWindow | null
  ) {}

  private file(): string | null {
    const root = this.access.getWorkspace()
    return root ? path.join(root, WORKSPACE_METADATA_FOLDER, FILE_NAME) : null
  }

  /** Re-grants a CSS file the user chose in an earlier session (from their own settings). */
  grantPersisted(file: string | null | undefined): void {
    if (typeof file === 'string' && path.isAbsolute(file) && /\.css$/i.test(file)) {
      this.grants.add(path.resolve(file))
    }
  }

  async getWorkspace(): Promise<WorkspacePresentationState> {
    const file = this.file()
    if (!file) return { available: false, overrides: null }
    try {
      const stat = await fs.stat(file)
      if (stat.size > 512 * 1024) return { available: true, overrides: null }
      const overrides = sanitizeWorkspacePresentation(JSON.parse(await fs.readFile(file, 'utf8')))
      return { available: true, overrides: hasWorkspaceOverrides(overrides) ? overrides : null }
    } catch {
      return { available: true, overrides: null }
    }
  }

  /** Stores the overrides, or removes the file when `input` is null or empty. */
  async setWorkspace(input: unknown): Promise<WorkspacePresentationState> {
    const file = this.file()
    if (!file) throw new Error('Open a folder to set workspace appearance.')
    const overrides = input === null ? {} : sanitizeWorkspacePresentation(input)
    if (!hasWorkspaceOverrides(overrides)) {
      await fs.rm(file, { force: true })
    } else {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await writeFileAtomic(file, `${JSON.stringify({ version: 1, ...overrides }, null, 2)}\n`)
    }
    return { available: true, overrides: hasWorkspaceOverrides(overrides) ? overrides : null }
  }

  private storedPath(absolute: string, preferRelative: boolean): string {
    if (preferRelative && this.access.isInWorkspace(absolute)) {
      return path.relative(this.access.getWorkspace()!, absolute).split(path.sep).join('/')
    }
    return absolute
  }

  /** Resolves a stored path and checks that the renderer may read it. */
  private resolveReadable(stored: unknown): string {
    if (typeof stored !== 'string' || stored.length === 0 || stored.length > 1024) {
      throw new Error('Invalid CSS file.')
    }
    if (!/\.css$/i.test(stored)) throw new Error('Only .css files can be used.')
    const root = this.access.getWorkspace()
    const resolved = path.isAbsolute(stored)
      ? path.resolve(stored)
      : root
        ? path.resolve(root, stored)
        : null
    if (!resolved) throw new Error('Open the folder this stylesheet belongs to first.')
    if (!this.access.isInWorkspace(resolved) && !this.grants.has(resolved)) {
      throw new Error('Choose this stylesheet again with "Choose CSS File…" to allow access.')
    }
    return resolved
  }

  async readCss(stored: unknown): Promise<CssFile> {
    const resolved = this.resolveReadable(stored)
    const stat = await fs.stat(resolved)
    if (!stat.isFile()) throw new Error('The stylesheet is not a file.')
    if (stat.size > CSS_LIMITS.bytes) {
      throw new Error(`The stylesheet is larger than ${CSS_LIMITS.bytes / 1024} KB.`)
    }
    const text = (await fs.readFile(resolved, 'utf8')).replace(/^\uFEFF/, '')
    return { path: String(stored), text, mtimeMs: stat.mtimeMs }
  }

  /** Lets the user choose a stylesheet. `scope` decides whether the stored path is relative. */
  async pickCss(scope: unknown): Promise<CssFile | null> {
    const window = this.getWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose CSS File',
      defaultPath: this.access.getWorkspace() ?? undefined,
      properties: ['openFile'],
      filters: [
        { name: 'Stylesheet', extensions: ['css'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const chosen = path.resolve(result.filePaths[0])
    if (!/\.css$/i.test(chosen)) throw new Error('Only .css files can be used.')
    this.grants.add(chosen)
    const stored = this.storedPath(chosen, scope === 'workspace')
    const file = await this.readCss(stored)
    return file
  }
}
