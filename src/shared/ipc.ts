/**
 * The contract between the sandboxed renderer and the main process.
 *
 * The preload script exposes exactly this API as `window.markdownStudio`. Every call is
 * validated again in the main process; the renderer is never given raw Node.js or Electron APIs.
 */
import type { AppSettings, SettingsPatch, ThemeName } from './settings'
import type { AiTaskRequest, AiTaskResult } from './ai/types'
import type {
  CopilotCompleteRequest,
  CopilotCompleteResult,
  CopilotStatus,
  CopilotSync
} from './ai/copilot'
import type { MenuHeading } from './windowChrome'

/** State of the stored AI key; the key itself never reaches the page. */
export interface AiStatus {
  hasKey: boolean
  canStoreKey: boolean
}
import type { StoredTemplate, TemplateScope } from './templates'
import type { DiagramRenderRequest, DiagramRenderResult } from './diagram'
import type { ExportRequest, ExportResult } from './export/job'
import type { PdfOptions } from './export/pdf'
import type { PresetScope, StoredPreset } from './export/presets'
import type { WorkspacePresentation } from './presentation/settings'
import type { PublicationConfig } from './publishing/project'
import type { Source } from './publishing/sources'

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

export interface PresetListing {
  global: StoredPreset[]
  workspace: StoredPreset[]
  workspaceAvailable: boolean
}

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

export interface ProjectState {
  /** False when no folder is open. */
  available: boolean
  publication: PublicationConfig | null
  /** The project's source library (CSL JSON). */
  sources: Source[]
  /** Problems found while reading the stored files (damaged entries, unreadable files). */
  problems: string[]
}

export interface RecoverySnapshot {
  /** Identifies the open document within a session. */
  id: string
  /** The file the text belongs to, or null for a document that was never saved. */
  path: string | null
  name: string
  content: string
  hasBom: boolean
  /** Modification time of the file when the document was opened or last saved. */
  mtimeMs: number | null
  savedAt: number
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
  | 'file.export'
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
  /** Runs a command of the renderer's command registry; the id travels as the argument. */
  | 'app.command'

export interface MenuCommandMessage {
  command: MenuCommand
  argument?: string
}

export const IPC = {
  appInfo: 'app:info',
  appConfirmClose: 'app:confirm-close',
  appCloseRequested: 'app:close-requested',
  menuCommand: 'menu:command',
  aiStatus: 'ai:status',
  aiSetKey: 'ai:set-key',
  aiClearKey: 'ai:clear-key',
  aiRun: 'ai:run',
  aiCancel: 'ai:cancel',
  copilotStatus: 'copilot:status',
  copilotChanged: 'copilot:changed',
  copilotSignIn: 'copilot:sign-in',
  copilotCancelSignIn: 'copilot:cancel-sign-in',
  copilotSignOut: 'copilot:sign-out',
  copilotSync: 'copilot:sync',
  copilotComplete: 'copilot:complete',
  copilotCancel: 'copilot:cancel',
  copilotShown: 'copilot:shown',
  copilotPartial: 'copilot:partial',
  copilotAccepted: 'copilot:accepted',
  windowMenuHeadings: 'window:menu-headings',
  windowPopupMenu: 'window:popup-menu',
  windowSetTheme: 'window:set-theme',
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
  dialogOpenImage: 'dialog:open-image',
  dialogOpenSources: 'dialog:open-sources',
  assetsImportImage: 'assets:import-image',
  assetsSaveClipboardImage: 'assets:save-clipboard-image',
  recoveryWrite: 'recovery:write',
  recoveryRemove: 'recovery:remove',
  recoveryList: 'recovery:list',
  recoveryClear: 'recovery:clear',
  templatesList: 'templates:list',
  templatesSave: 'templates:save',
  templatesDelete: 'templates:delete',
  renderPdf: 'render:pdf',
  exportRun: 'export:run',
  exportCancel: 'export:cancel',
  presetsList: 'presets:list',
  presetsSave: 'presets:save',
  presetsDelete: 'presets:delete',
  presetsRestore: 'presets:restore',
  presentationGetWorkspace: 'presentation:get-workspace',
  presentationSetWorkspace: 'presentation:set-workspace',
  projectGet: 'project:get',
  projectSetPublication: 'project:set-publication',
  projectSetSources: 'project:set-sources',
  cssPick: 'css:pick',
  cssRead: 'css:read',
  diagramRender: 'diagram:render',
  diagramCancel: 'diagram:cancel',
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
    /** Top-level application menu entries for the title bar (empty where the system shows them). */
    menuHeadings(): Promise<MenuHeading[]>
    /** Opens the application menu at index `index` below the given window coordinates. */
    popupMenu(index: number, x: number, y: number): Promise<void>
    /** Matches the native caption buttons and system menus to the application theme. */
    setTheme(theme: ThemeName): Promise<void>
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
    /** Lets the user choose an image; the file is granted for importing. */
    openImage(): Promise<string | null>
    /** Lets the user choose a bibliography file (CSL JSON or BibTeX); it is granted for reading. */
    openSources(): Promise<string | null>
  }
  assets: {
    /** Absolute path of a file dropped from the operating system, or '' if unavailable. */
    pathForFile(file: File): string
    importImage(sourcePath: string, targetDirectory: string): Promise<ImportedImage>
    /** Stores an image from the clipboard as a new file; never overwrites an existing one. */
    saveClipboardImage(
      bytes: Uint8Array,
      mime: string,
      targetDirectory: string,
      baseName: string
    ): Promise<ImportedImage>
  }
  recovery: {
    write(snapshot: RecoverySnapshot): Promise<void>
    remove(id: string): Promise<void>
    list(): Promise<RecoverySnapshot[]>
    /** Forgets every snapshot (after a clean close). */
    clear(): Promise<void>
  }
  templates: {
    list(): Promise<TemplateListing>
    /** Creates the template (empty `id`) or updates the stored one with that id. */
    save(scope: TemplateScope, template: Partial<StoredTemplate>): Promise<StoredTemplate>
    delete(scope: TemplateScope, id: string): Promise<void>
  }
  render: {
    /** Prints a document with the same engine and options an export of it would use. */
    pdf(
      html: string,
      options: PdfOptions,
      values: { title: string; file: string }
    ): Promise<Uint8Array>
  }
  export: {
    /** Asks for a destination and writes the export; expected failures are returned. */
    run(request: ExportRequest): Promise<ExportResult>
    cancel(jobId: string): Promise<void>
  }
  presets: {
    list(): Promise<PresetListing>
    /** Creates the preset (empty `id`) or replaces the stored one. A built-in id stores an edit. */
    save(scope: PresetScope, preset: Partial<StoredPreset>): Promise<StoredPreset>
    delete(scope: PresetScope, id: string): Promise<void>
    /** Deletes the edited copies of built-in presets in a scope; returns how many. */
    restoreBuiltins(scope: PresetScope): Promise<number>
  }
  presentation: {
    getWorkspace(): Promise<WorkspacePresentationState>
    /** Stores workspace overrides, or clears them with `null`. */
    setWorkspace(overrides: WorkspacePresentation | null): Promise<WorkspacePresentationState>
    pickCss(scope: 'global' | 'workspace'): Promise<CssFile | null>
    readCss(path: string): Promise<CssFile>
  }
  project: {
    get(): Promise<ProjectState>
    /** Stores the publication of the open folder, or removes it with `null`. */
    setPublication(publication: PublicationConfig | null): Promise<ProjectState>
    /** Replaces the project's source library. */
    setSources(sources: Source[]): Promise<ProjectState>
  }
  diagram: {
    render(request: DiagramRenderRequest): Promise<DiagramRenderResult>
    cancel(ids: string[]): Promise<void>
  }
  ai: {
    status(): Promise<AiStatus>
    /** Stores the API key, encrypted by the operating system. It can never be read back. */
    setKey(key: string): Promise<AiStatus>
    clearKey(): Promise<AiStatus>
    /** Runs a writing task with the configured provider; `id` lets it be cancelled. */
    run(id: string, task: AiTaskRequest): Promise<AiTaskResult>
    cancel(id: string): Promise<void>
  }
  /**
   * GitHub Copilot, through the official language server run by the main process. Credentials
   * stay in the language server's private folder; the page only ever sees `CopilotStatus`.
   */
  copilot: {
    status(): Promise<CopilotStatus>
    signIn(): Promise<CopilotStatus>
    cancelSignIn(): Promise<CopilotStatus>
    signOut(): Promise<CopilotStatus>
    /** Sends one document event; `false` means the whole document must be sent again. */
    sync(event: CopilotSync): Promise<boolean>
    complete(request: CopilotCompleteRequest): Promise<CopilotCompleteResult>
    cancel(requestId: string): Promise<void>
    /** The suggestion with this handle was displayed. */
    shown(key: string): Promise<void>
    partiallyAccepted(key: string, acceptedLength: number): Promise<void>
    accepted(key: string): Promise<void>
    onChanged(listener: (status: CopilotStatus) => void): () => void
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
