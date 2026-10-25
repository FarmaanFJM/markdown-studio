import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
  session,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { IPC, type AppInfo } from '@shared/ipc'
import { withRecentWorkspace, type SettingsPatch } from '@shared/settings'
import iconPath from '../../resources/build/icon.png?asset'
import { buildApplicationMenu } from './menu'
import { AccessControl } from './services/accessControl'
import { AssetService } from './services/assetService'
import { DiagramService } from './services/diagramService'
import { ExportService } from './services/exportService'
import { FileService } from './services/fileService'
import { PdfService } from './services/pdfService'
import { PresentationService } from './services/presentationService'
import { PresetService } from './services/presetService'
import { MsFileProtocol, registerSchemePrivileges } from './services/protocol'
import { SettingsService } from './services/settingsService'
import { TemplateService } from './services/templateService'
import { WorkspaceWatcher } from './services/workspaceWatcher'

// Automated tests and portable setups can isolate all application data.
if (process.env.MARKDOWN_STUDIO_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.MARKDOWN_STUDIO_USER_DATA))
}
app.setName('Markdown Studio')
if (process.platform === 'win32') app.setAppUserModelId('com.farmaanfjm.markdownstudio')

registerSchemePrivileges()

const access = new AccessControl()
const files = new FileService(access)
const assets = new AssetService(access)
const settings = new SettingsService(path.join(app.getPath('userData'), 'settings.json'))
const templates = new TemplateService(access, path.join(app.getPath('userData'), 'templates'))
const msfile = new MsFileProtocol(access)
const pdf = new PdfService(msfile)
const presets = new PresetService(access, path.join(app.getPath('userData'), 'export-presets'))
const presentation = new PresentationService(access, () => mainWindow)
const exportService = new ExportService({
  pdf,
  chooseTarget: async (format, defaultPath) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, {
      title: format === 'pdf' ? 'Export as PDF' : 'Export as HTML',
      defaultPath,
      properties: ['showOverwriteConfirmation', 'createDirectory'],
      filters:
        format === 'pdf'
          ? [{ name: 'PDF Document', extensions: ['pdf'] }]
          : [{ name: 'HTML Document', extensions: ['html', 'htm'] }]
    })
    return result.canceled || !result.filePath ? null : result.filePath
  },
  exported: (file) => {
    exportedFiles.add(file)
  }
})
let diagrams: DiagramService | null = null

let mainWindow: BrowserWindow | null = null
let allowClose = false
/** Exported files the user may reveal in the system file manager. */
const exportedFiles = new Set<string>()
/** Folders the user picked in the folder dialog; only these and recent folders may be opened. */
const pickedFolders = new Set<string>()

const watcher = new WorkspaceWatcher((directories) => {
  mainWindow?.webContents.send(IPC.workspaceChanged, directories)
})

function rendererUrl(): string | null {
  return !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : null
}

function isOwnPage(url: string): boolean {
  const dev = rendererUrl()
  if (dev) return url.startsWith(dev)
  return url.startsWith('file://') && url.includes('/renderer/index.html')
}

function applySecurityPolicies(): void {
  // Nothing in the application needs camera, notifications, geolocation or similar.
  // Only clipboard writes (used by "Copy Path") are allowed.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write')
  )

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.on('will-navigate', (event, url) => {
      if (!isOwnPage(url)) event.preventDefault()
    })
    // The preview iframe must never leave its srcdoc document.
    contents.on('will-frame-navigate', (event) => {
      if (!event.isMainFrame && event.url !== 'about:srcdoc' && event.url !== 'about:blank') {
        event.preventDefault()
      }
    })
  })
}

/** Registers an IPC handler that only answers the main window's top-level frame. */
function handle<A extends unknown[], R>(
  channel: string,
  handler: (...args: A) => R | Promise<R>
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('Unauthorised IPC sender.')
    }
    return handler(...(args as A))
  })
}

async function openWorkspace(folder: string): Promise<string> {
  const resolved = path.resolve(folder)
  const stat = await fs.stat(resolved).catch(() => null)
  if (!stat?.isDirectory()) throw new Error(`The folder "${resolved}" does not exist.`)
  access.setWorkspace(resolved)
  watcher.start(resolved)
  const current = settings.get()
  settings.update({
    workspace: {
      lastWorkspace: resolved,
      recent: withRecentWorkspace(current.workspace.recent, resolved)
    }
  })
  if (mainWindow) buildApplicationMenu(mainWindow, settings.get().workspace.recent)
  return resolved
}

/** The isolated Mermaid renderer is created on first use. */
function getDiagrams(): DiagramService {
  if (!diagrams) {
    const dev = rendererUrl()
    const hostUrl = dev
      ? `${dev.replace(/\/$/, '')}/diagram-host.html`
      : pathToFileURL(path.join(__dirname, '../renderer/diagram-host.html')).toString()
    diagrams = new DiagramService(hostUrl)
  }
  return diagrams
}

function registerIpc(): void {
  handle(IPC.appInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    settingsPath: settings.filePath
  }))
  handle(IPC.appConfirmClose, () => {
    allowClose = true
    mainWindow?.close()
  })

  handle(IPC.settingsGet, () => settings.get())
  handle(IPC.settingsUpdate, (patch: SettingsPatch) => {
    // Recent folders are owned by the main process; they decide which folders may be reopened.
    const { workspace, window: _window, ...rest } = patch ?? {}
    const safeWorkspace = workspace
      ? {
          restoreLastWorkspace: workspace.restoreLastWorkspace,
          ...(Array.isArray(workspace.recent) && workspace.recent.length === 0
            ? { recent: [] }
            : {})
        }
      : undefined
    const updated = settings.update({ ...rest, workspace: safeWorkspace })
    if (safeWorkspace?.recent && mainWindow) buildApplicationMenu(mainWindow, [])
    return updated
  })

  handle(IPC.workspaceOpenDialog, async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = path.resolve(result.filePaths[0])
    pickedFolders.add(picked)
    return picked
  })
  handle(IPC.workspaceOpen, async (folder: string) => {
    const allowed = [...settings.get().workspace.recent, ...pickedFolders]
    if (
      typeof folder !== 'string' ||
      !allowed.some((p) => path.resolve(p) === path.resolve(folder))
    ) {
      throw new Error('Only folders chosen in the folder dialog or the recent list can be opened.')
    }
    return openWorkspace(folder)
  })
  handle(IPC.workspaceClose, () => {
    watcher.stop()
    access.setWorkspace(null)
    settings.update({ workspace: { lastWorkspace: null } })
  })

  handle(IPC.fsReadDir, (dir: string) => files.readDir(dir))
  handle(IPC.fsReadText, (file: string) => files.readText(file))
  handle(
    IPC.fsWriteText,
    (file: string, content: string, hasBom: boolean, expectedMtimeMs?: number) =>
      files.writeText(file, content, hasBom, expectedMtimeMs)
  )
  handle(IPC.fsCreateFile, (dir: string, name: string) => files.createFile(dir, name))
  handle(IPC.fsCreateDirectory, (dir: string, name: string) => files.createDirectory(dir, name))
  handle(IPC.fsRename, (file: string, name: string) => files.rename(file, name))
  handle(IPC.fsMove, (file: string, directory: string) => files.move(file, directory))
  handle(IPC.fsListFiles, (options: { extensions?: string[]; limit?: number }) =>
    files.listFiles(options)
  )
  handle(IPC.fsStatMany, (paths: string[]) => files.statMany(paths))
  handle(IPC.fsTrash, (file: string) => files.trash(file, (p) => shell.trashItem(p)))
  handle(IPC.fsDeletePermanently, (file: string) => files.deletePermanently(file))

  handle(IPC.templatesList, () => templates.list())
  handle(IPC.templatesSave, (scope: unknown, template: unknown) => templates.save(scope, template))
  handle(IPC.templatesDelete, (scope: unknown, id: unknown) => templates.delete(scope, id))

  handle(IPC.dialogOpenMarkdown, async () => {
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open File',
      defaultPath: access.getWorkspace() ?? undefined,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled) return []
    result.filePaths.forEach((file) => access.grantFile(file))
    return result.filePaths
  })
  handle(IPC.dialogSaveMarkdown, async (defaultPath: string) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save As',
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return null
    access.grantFile(result.filePath)
    return result.filePath
  })

  handle(IPC.assetsImportImage, (source: string, target: string) =>
    assets.importImage(source, target)
  )

  handle(
    IPC.renderPdf,
    (html: string, options: unknown, values: { title?: unknown; file?: unknown }) =>
      exportService.preview(html, options, {
        title: typeof values?.title === 'string' ? values.title : '',
        file: typeof values?.file === 'string' ? values.file : ''
      })
  )
  handle(IPC.exportRun, (request: unknown) => exportService.run(request))
  handle(IPC.exportCancel, (jobId: unknown) => exportService.cancel(jobId))

  handle(IPC.presetsList, () => presets.list())
  handle(IPC.presetsSave, (scope: unknown, preset: unknown) => presets.save(scope, preset))
  handle(IPC.presetsDelete, (scope: unknown, id: unknown) => presets.delete(scope, id))
  handle(IPC.presetsRestore, (scope: unknown) => presets.restoreBuiltins(scope))

  handle(IPC.presentationGetWorkspace, () => presentation.getWorkspace())
  handle(IPC.presentationSetWorkspace, (overrides: unknown) => presentation.setWorkspace(overrides))
  handle(IPC.cssPick, (scope: unknown) => presentation.pickCss(scope))
  handle(IPC.cssRead, (file: unknown) => presentation.readCss(file))

  handle(IPC.diagramRender, (request: unknown) => getDiagrams().render(request))
  handle(IPC.diagramCancel, (ids: unknown) => getDiagrams().cancel(ids))

  handle(IPC.shellOpenExternal, async (url: string) => {
    const parsed = new URL(url)
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      throw new Error(`Links using "${parsed.protocol}" cannot be opened.`)
    }
    await shell.openExternal(parsed.toString())
  })
  handle(IPC.shellShowItem, (target: string) => {
    const resolved = path.resolve(String(target))
    if (
      !access.canAccessFile(resolved) &&
      !exportedFiles.has(resolved) &&
      resolved !== settings.filePath
    ) {
      throw new Error('This item cannot be revealed.')
    }
    shell.showItemInFolder(resolved)
  })
}

function initialBounds() {
  const saved = settings.get().window.bounds
  if (saved) {
    const area = screen.getDisplayMatching(saved).workArea
    const visible =
      saved.x < area.x + area.width - 100 &&
      saved.y < area.y + area.height - 100 &&
      saved.x + saved.width > area.x + 100 &&
      saved.y + saved.height > area.y + 50
    if (visible) return saved
  }
  return { width: 1360, height: 860 }
}

function createWindow(): void {
  const window = new BrowserWindow({
    ...initialBounds(),
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Markdown Studio',
    backgroundColor: settings.get().theme === 'light' ? '#F7F8F8' : '#0C0D0E',
    icon: iconPath,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      spellcheck: false
    }
  })
  mainWindow = window
  allowClose = false
  if (settings.get().window.maximized) window.maximize()

  window.once('ready-to-show', () => window.show())

  window.on('close', (event) => {
    if (!allowClose) {
      // Let the renderer resolve unsaved documents first; it calls appConfirmClose when done.
      event.preventDefault()
      window.webContents.send(IPC.appCloseRequested)
      return
    }
    settings.update({
      window: { bounds: window.getNormalBounds(), maximized: window.isMaximized() }
    })
  })
  window.on('closed', () => {
    mainWindow = null
  })
  window.webContents.on('render-process-gone', () => {
    // A crashed renderer cannot answer the close request; never trap the user.
    allowClose = true
  })

  buildApplicationMenu(window, settings.get().workspace.recent)

  const dev = rendererUrl()
  if (dev) void window.loadURL(dev)
  else void window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    settings.load()
    presentation.grantPersisted(settings.get().document.customCss.path)
    const last = settings.get().workspace
    if (last.restoreLastWorkspace && last.lastWorkspace) {
      // Restoring is best-effort: a removed folder simply leaves the Explorer empty.
      await openWorkspace(last.lastWorkspace).catch(() =>
        settings.update({ workspace: { lastWorkspace: null } })
      )
    }
    applySecurityPolicies()
    msfile.register()
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    watcher.stop()
    if (process.platform !== 'darwin') app.quit()
  })

  // Runs after every window has closed (including the final window-bounds update).
  app.on('will-quit', () => {
    diagrams?.dispose()
    settings.flushSync()
  })
}
