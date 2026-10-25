import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type MarkdownStudioApi, type MenuCommandMessage } from '@shared/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: MarkdownStudioApi = {
  platform: process.platform,
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    confirmClose: () => ipcRenderer.invoke(IPC.appConfirmClose),
    onCloseRequested: (listener) => subscribe<void>(IPC.appCloseRequested, () => listener()),
    onMenuCommand: (listener) => subscribe<MenuCommandMessage>(IPC.menuCommand, listener)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },
  workspace: {
    openDialog: () => ipcRenderer.invoke(IPC.workspaceOpenDialog),
    open: (path) => ipcRenderer.invoke(IPC.workspaceOpen, path),
    close: () => ipcRenderer.invoke(IPC.workspaceClose),
    onChanged: (listener) => subscribe<string[]>(IPC.workspaceChanged, listener)
  },
  fs: {
    readDir: (path) => ipcRenderer.invoke(IPC.fsReadDir, path),
    readText: (path) => ipcRenderer.invoke(IPC.fsReadText, path),
    writeText: (path, content, hasBom, expectedMtimeMs) =>
      ipcRenderer.invoke(IPC.fsWriteText, path, content, hasBom, expectedMtimeMs),
    createFile: (directory, name) => ipcRenderer.invoke(IPC.fsCreateFile, directory, name),
    createDirectory: (directory, name) =>
      ipcRenderer.invoke(IPC.fsCreateDirectory, directory, name),
    rename: (path, newName) => ipcRenderer.invoke(IPC.fsRename, path, newName),
    move: (path, targetDirectory) => ipcRenderer.invoke(IPC.fsMove, path, targetDirectory),
    listFiles: (options) => ipcRenderer.invoke(IPC.fsListFiles, options),
    statMany: (paths) => ipcRenderer.invoke(IPC.fsStatMany, paths),
    trash: (path) => ipcRenderer.invoke(IPC.fsTrash, path),
    deletePermanently: (path) => ipcRenderer.invoke(IPC.fsDeletePermanently, path)
  },
  dialogs: {
    openMarkdown: () => ipcRenderer.invoke(IPC.dialogOpenMarkdown),
    saveMarkdown: (defaultPath) => ipcRenderer.invoke(IPC.dialogSaveMarkdown, defaultPath),
    openImage: () => ipcRenderer.invoke(IPC.dialogOpenImage),
    openSources: () => ipcRenderer.invoke(IPC.dialogOpenSources)
  },
  assets: {
    pathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
    importImage: (sourcePath, targetDirectory) =>
      ipcRenderer.invoke(IPC.assetsImportImage, sourcePath, targetDirectory),
    saveClipboardImage: (bytes, mime, targetDirectory, baseName) =>
      ipcRenderer.invoke(IPC.assetsSaveClipboardImage, bytes, mime, targetDirectory, baseName)
  },
  recovery: {
    write: (snapshot) => ipcRenderer.invoke(IPC.recoveryWrite, snapshot),
    remove: (id) => ipcRenderer.invoke(IPC.recoveryRemove, id),
    list: () => ipcRenderer.invoke(IPC.recoveryList),
    clear: () => ipcRenderer.invoke(IPC.recoveryClear)
  },
  templates: {
    list: () => ipcRenderer.invoke(IPC.templatesList),
    save: (scope, template) => ipcRenderer.invoke(IPC.templatesSave, scope, template),
    delete: (scope, id) => ipcRenderer.invoke(IPC.templatesDelete, scope, id)
  },
  render: {
    pdf: (html, options, values) => ipcRenderer.invoke(IPC.renderPdf, html, options, values)
  },
  export: {
    run: (request) => ipcRenderer.invoke(IPC.exportRun, request),
    cancel: (jobId) => ipcRenderer.invoke(IPC.exportCancel, jobId)
  },
  presets: {
    list: () => ipcRenderer.invoke(IPC.presetsList),
    save: (scope, preset) => ipcRenderer.invoke(IPC.presetsSave, scope, preset),
    delete: (scope, id) => ipcRenderer.invoke(IPC.presetsDelete, scope, id),
    restoreBuiltins: (scope) => ipcRenderer.invoke(IPC.presetsRestore, scope)
  },
  presentation: {
    getWorkspace: () => ipcRenderer.invoke(IPC.presentationGetWorkspace),
    setWorkspace: (overrides) => ipcRenderer.invoke(IPC.presentationSetWorkspace, overrides),
    pickCss: (scope) => ipcRenderer.invoke(IPC.cssPick, scope),
    readCss: (path) => ipcRenderer.invoke(IPC.cssRead, path)
  },
  project: {
    get: () => ipcRenderer.invoke(IPC.projectGet),
    setPublication: (publication) => ipcRenderer.invoke(IPC.projectSetPublication, publication),
    setSources: (sources) => ipcRenderer.invoke(IPC.projectSetSources, sources)
  },
  diagram: {
    render: (request) => ipcRenderer.invoke(IPC.diagramRender, request),
    cancel: (ids) => ipcRenderer.invoke(IPC.diagramCancel, ids)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(IPC.shellOpenExternal, url),
    showItemInFolder: (path) => ipcRenderer.invoke(IPC.shellShowItem, path)
  }
}

contextBridge.exposeInMainWorld('markdownStudio', api)
