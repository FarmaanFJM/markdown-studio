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
    writeText: (path, content, hasBom) =>
      ipcRenderer.invoke(IPC.fsWriteText, path, content, hasBom),
    createFile: (directory, name) => ipcRenderer.invoke(IPC.fsCreateFile, directory, name),
    createDirectory: (directory, name) =>
      ipcRenderer.invoke(IPC.fsCreateDirectory, directory, name),
    rename: (path, newName) => ipcRenderer.invoke(IPC.fsRename, path, newName),
    trash: (path) => ipcRenderer.invoke(IPC.fsTrash, path),
    deletePermanently: (path) => ipcRenderer.invoke(IPC.fsDeletePermanently, path)
  },
  dialogs: {
    openMarkdown: () => ipcRenderer.invoke(IPC.dialogOpenMarkdown),
    saveMarkdown: (defaultPath) => ipcRenderer.invoke(IPC.dialogSaveMarkdown, defaultPath)
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
      ipcRenderer.invoke(IPC.assetsImportImage, sourcePath, targetDirectory)
  },
  render: {
    pdf: (html) => ipcRenderer.invoke(IPC.renderPdf, html),
    exportPdf: (html, defaultPath) => ipcRenderer.invoke(IPC.exportPdf, html, defaultPath),
    exportHtml: (html, defaultPath) => ipcRenderer.invoke(IPC.exportHtml, html, defaultPath)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(IPC.shellOpenExternal, url),
    showItemInFolder: (path) => ipcRenderer.invoke(IPC.shellShowItem, path)
  }
}

contextBridge.exposeInMainWorld('markdownStudio', api)
