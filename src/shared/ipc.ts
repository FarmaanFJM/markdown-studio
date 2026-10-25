/**
 * The contract between the sandboxed renderer and the main process.
 *
 * The preload script exposes exactly this API as `window.markdownStudio`. Every call is
 * validated again in the main process; the renderer is never given raw Node.js or Electron APIs.
 */
import type { AppSettings, SettingsPatch } from './settings'
import type { StoredTemplate, TemplateScope } from './templates'

export interface DirEntry {
  name: string
  path: string
  kind: 'file' | 'directory'
  size: number
  mtimeMs: number
}

export interface TextFile {
  path: string
  content: string
  /** Whether the file started with a UTF-8 byte-order mark, which is restored on save. */
  hasBom: boolean
  mtimeMs: number
}

export interface FileListing {
  /** Absolute paths of the files found. */
  files: string[]
  /** True when the listing stopped at the limit and more files exist. */
  truncated: boolean
}

export interface TemplateListing {
  global: StoredTemplate[]
  workspace: StoredTemplate[]
  /** False when no folder is open, so workspace templates cannot be saved. */
  workspaceAvailable: boolean
}

export type EntryState = 'file' | 'directory' | 'missing' | 'unknown'

export interface ImportedImage {
  path: string
  /** False when the image already lived in the workspace and was referenced in place. */
  copied: boolean
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  userDataPath: string
  settingsPath: string
}

/** Commands sent from the native application menu to the renderer. */
export type MenuCommand =
  | 'file.new'
  | 'file.open'
  | 'file.openFolder'
  | 'file.save'
  | 'file.saveAs'
  | 'file.saveAll'
  | 'file.exportHtml'
  | 'file.exportPdf'
  | 'file.closeEditor'
  | 'file.closeFolder'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.find'
  | 'edit.replace'
  | 'edit.selectAll'
  | 'view.toggleSidebar'
  | 'view.explorer'
  | 'view.settings'
  | 'view.previewNone'
  | 'view.previewHtml'
  | 'view.previewPdf'
  | 'view.togglePreview'
  | 'view.explorerTree'
  | 'view.explorerThumbnails'
  | 'view.toggleWordWrap'
  | 'view.fontIncrease'
  | 'view.fontDecrease'
  | 'view.fontReset'
  | 'help.about'
  | 'help.shortcuts'

export interface MenuCommandMessage {
  command: MenuCommand
  argument?: string
}

export const IPC = {
  appInfo: 'app:info',
  appConfirmClose: 'app:confirm-close',
  appCloseRequested: 'app:close-requested',
  menuCommand: 'menu:command',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  workspaceOpenDialog: 'workspace:open-dialog',
  workspaceOpen: 'workspace:open',
  workspaceClose: 'workspace:close',
  workspaceChanged: 'workspace:changed',
  fsReadDir: 'fs:read-dir',
  fsReadText: 'fs:read-text',
  fsWriteText: 'fs:write-text',
  fsCreateFile: 'fs:create-file',
  fsCreateDirectory: 'fs:create-directory',
  fsRename: 'fs:rename',
  fsMove: 'fs:move',
  fsListFiles: 'fs:list-files',
  fsStatMany: 'fs:stat-many',
  fsTrash: 'fs:trash',
  fsDeletePermanently: 'fs:delete-permanently',
  dialogOpenMarkdown: 'dialog:open-markdown',
  dialogSaveMarkdown: 'dialog:save-markdown',
  assetsImportImage: 'assets:import-image',
  templatesList: 'templates:list',
  templatesSave: 'templates:save',
  templatesDelete: 'templates:delete',
  renderPdf: 'render:pdf',
  exportPdf: 'export:pdf',
  exportHtml: 'export:html',
  shellOpenExternal: 'shell:open-external',
  shellShowItem: 'shell:show-item'
} as const

export interface MarkdownStudioApi {
  platform: string
  app: {
    info(): Promise<AppInfo>
    /** Called once the renderer has resolved any unsaved documents and the window may close. */
    confirmClose(): Promise<void>
    onCloseRequested(listener: () => void): () => void
    onMenuCommand(listener: (message: MenuCommandMessage) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: SettingsPatch): Promise<AppSettings>
  }
  workspace: {
    /** Shows the native folder picker; the chosen folder may then be passed to `open`. */
    openDialog(): Promise<string | null>
    /** Opens a folder picked in the dialog or listed in the recent folders kept by main. */
    open(path: string): Promise<string>
    close(): Promise<void>
    onChanged(listener: (directories: string[]) => void): () => void
  }
  fs: {
    readDir(path: string): Promise<DirEntry[]>
    readText(path: string): Promise<TextFile>
    /**
     * Writes a document. When `expectedMtimeMs` is given, the write is refused if the file was
     * modified on disk since that time, so concurrent changes are never overwritten silently.
     */
    writeText(
      path: string,
      content: string,
      hasBom: boolean,
      expectedMtimeMs?: number
    ): Promise<{ mtimeMs: number }>
    createFile(directory: string, name: string): Promise<string>
    createDirectory(directory: string, name: string): Promise<string>
    rename(path: string, newName: string): Promise<string>
    /** Moves a file or folder into another folder of the workspace; never overwrites. */
    move(path: string, targetDirectory: string): Promise<string>
    /** Recursive listing of the workspace, skipping hidden and dependency folders. */
    listFiles(options?: { extensions?: string[]; limit?: number }): Promise<FileListing>
    /** Existence check for many paths at once; paths outside permitted areas report `unknown`. */
    statMany(paths: string[]): Promise<EntryState[]>
    trash(path: string): Promise<void>
    deletePermanently(path: string): Promise<void>
  }
  dialogs: {
    openMarkdown(): Promise<string[]>
    saveMarkdown(defaultPath: string): Promise<string | null>
  }
  assets: {
    /** Absolute path of a file dropped from the operating system, or '' if unavailable. */
    pathForFile(file: File): string
    importImage(sourcePath: string, targetDirectory: string): Promise<ImportedImage>
  }
  templates: {
    list(): Promise<TemplateListing>
    /** Creates the template (empty `id`) or updates the stored one with that id. */
    save(scope: TemplateScope, template: Partial<StoredTemplate>): Promise<StoredTemplate>
    delete(scope: TemplateScope, id: string): Promise<void>
  }
  render: {
    pdf(html: string): Promise<Uint8Array>
    exportPdf(html: string, defaultPath: string): Promise<string | null>
    exportHtml(html: string, defaultPath: string): Promise<string | null>
  }
  shell: {
    openExternal(url: string): Promise<void>
    showItemInFolder(path: string): Promise<void>
  }
}

/** URL helpers for the privileged `msfile:` protocol used to display local images. */
export const MSFILE_SCHEME = 'msfile'

/**
 * Content policy embedded in every generated document (preview, PDF and export):
 * no scripts, frames, plugins or forms; images from local files, data URIs and the web.
 */
export const DOCUMENT_CSP =
  "default-src 'none'; img-src msfile: data: https: http:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"

/** Exported HTML embeds its images, so it has no use for the private `msfile:` scheme. */
export const EXPORT_CSP =
  "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"

export function localFileUrl(absolutePath: string): string {
  return `${MSFILE_SCHEME}://local/${encodeURIComponent(absolutePath.replace(/\\/g, '/'))}`
}

export function thumbnailUrl(absolutePath: string, size: number, version: number): string {
  return `${MSFILE_SCHEME}://thumb/${encodeURIComponent(absolutePath.replace(/\\/g, '/'))}?s=${size}&v=${Math.round(version)}`
}

/** Extracts the absolute path from an `msfile://local/...` URL, or null for any other URL. */
export function pathFromLocalFileUrl(url: string): string | null {
  const prefix = `${MSFILE_SCHEME}://local/`
  if (!url.startsWith(prefix)) return null
  try {
    return decodeURIComponent(url.slice(prefix.length).split(/[?#]/)[0])
  } catch {
    return null
  }
}
