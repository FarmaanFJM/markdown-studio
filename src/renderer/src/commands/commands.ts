import { LIMITS, DEFAULT_SETTINGS, type ExplorerMode, type PreviewMode } from '@shared/settings'
import type { MenuCommandMessage } from '@shared/ipc'
import { api, errorMessage } from '../bridge'
import { getActiveEditor, runEditorAction } from '../editor/models'
import { setExplorerMode } from '../explorer/mode'
import { exportSourceFor } from '../export/source'
import { runExport } from '../export/runExport'
import { openExportDialog } from '../presentation/openExportDialog'
import { currentSetup } from '../state/exportSetup'
import {
  activateDocument,
  activeDocument,
  closeDocument,
  closeDocumentsIn,
  newDocument,
  openDocument,
  saveAllDocuments,
  saveDocument,
  saveDocumentAs,
  useDocuments
} from '../state/documents'
import { refreshSettings, useSettings } from '../state/settings'
import { dialogs, notify, openSettings, type SettingsCategoryId } from '../state/ui'
import { useWorkspace } from '../state/workspace'
import { runRegisteredCommand } from './dispatch'

function settings() {
  return useSettings.getState().settings
}

export { exportSourceFor } from '../export/source'

async function openFolder(path?: string): Promise<void> {
  try {
    const target = path ?? (await api.workspace.openDialog())
    if (!target) return
    const current = useWorkspace.getState().root
    if (current && !(await closeDocumentsIn(current))) return
    const root = await api.workspace.open(target)
    useWorkspace.getState().setRoot(root)
    showSidebar('explorer')
    await refreshSettings()
  } catch (error) {
    notify('error', errorMessage(error))
    await refreshSettings()
  }
}

function showSidebar(view: 'explorer' | 'publication' | 'ai'): void {
  useSettings.getState().update({ layout: { sidebarVisible: true, sidebarView: view } })
}

function setPreview(mode: PreviewMode): void {
  useSettings.getState().update({
    layout: { previewMode: mode, ...(mode !== 'none' ? { lastPreviewKind: mode } : {}) }
  })
}

function setFontSize(size: number): void {
  const clamped = Math.min(LIMITS.fontSize.max, Math.max(LIMITS.fontSize.min, size))
  useSettings.getState().update({ editor: { fontSize: clamped } })
}

function cycleTab(step: number): void {
  const { documents, activeId } = useDocuments.getState()
  if (documents.length < 2) return
  const index = documents.findIndex((d) => d.id === activeId)
  activateDocument(documents[(index + step + documents.length) % documents.length].id)
}

export const commands = {
  newFile: () => void newDocument(),

  async openFile() {
    const paths = await api.dialogs.openMarkdown()
    for (const path of paths) await openDocument(path)
  },

  openFolder,

  async closeFolder() {
    const root = useWorkspace.getState().root
    if (!root || !(await closeDocumentsIn(root))) return
    await api.workspace.close()
    useWorkspace.getState().setRoot(null)
    await refreshSettings()
  },

  save: () => void saveDocument(),
  saveAs: () => void saveDocumentAs(),
  saveAll: () => void saveAllDocuments(),
  closeEditor: () => void closeDocument(),
  nextTab: () => cycleTab(1),
  previousTab: () => cycleTab(-1),

  exportHtml: () => void openExportDialog('html'),
  exportPdf: () => void openExportDialog('pdf'),
  exportDialog: () => void openExportDialog(),

  /** Exports with the active preset (or the Settings defaults) without opening the dialog. */
  async exportWithActiveSetup() {
    const doc = activeDocument()
    const source = doc && exportSourceFor(doc)
    if (!doc || !source) return notify('info', 'Open a Markdown document to export it.')
    await runExport(doc, source, currentSetup())
  },

  undo: () => runEditorAction('undo'),
  redo: () => runEditorAction('redo'),
  find: () => runEditorAction('actions.find'),
  replace: () => runEditorAction('editor.action.startFindReplaceAction'),
  selectAll() {
    const editor = getActiveEditor()
    if (editor?.hasTextFocus()) runEditorAction('editor.action.selectAll')
    else document.execCommand('selectAll')
  },

  toggleSidebar() {
    useSettings.getState().update({ layout: { sidebarVisible: !settings().layout.sidebarVisible } })
  },
  showExplorer: () => showSidebar('explorer'),
  showSettings: (category?: SettingsCategoryId) => openSettings(category),
  showAi: () => showSidebar('ai'),
  showPublication: () => showSidebar('publication'),

  setPreview,
  togglePreview() {
    const { previewMode, lastPreviewKind } = settings().layout
    setPreview(previewMode === 'none' ? lastPreviewKind : 'none')
  },

  setExplorerMode(mode: ExplorerMode) {
    setExplorerMode(mode)
    showSidebar('explorer')
  },

  toggleToolbar() {
    useSettings.getState().update({ markdown: { toolbar: !settings().markdown.toolbar } })
  },

  toggleWordWrap() {
    useSettings.getState().update({ editor: { wordWrap: !settings().editor.wordWrap } })
  },
  increaseFontSize: () => setFontSize(settings().editor.fontSize + 1),
  decreaseFontSize: () => setFontSize(settings().editor.fontSize - 1),
  resetFontSize: () => setFontSize(DEFAULT_SETTINGS.editor.fontSize),

  about: () => void dialogs.about(),
  shortcuts: () => void dialogs.shortcuts()
}

export function runMenuCommand({ command, argument }: MenuCommandMessage): void {
  if (command === 'app.command') {
    if (argument) runRegisteredCommand(argument)
    return
  }
  const map: Record<MenuCommandMessage['command'], () => unknown> = {
    'file.new': commands.newFile,
    'file.open': commands.openFile,
    'file.openFolder': () => commands.openFolder(argument),
    'file.save': commands.save,
    'file.saveAs': commands.saveAs,
    'file.saveAll': commands.saveAll,
    'file.exportHtml': commands.exportHtml,
    'file.exportPdf': commands.exportPdf,
    'file.export': commands.exportDialog,
    'file.closeEditor': commands.closeEditor,
    'file.closeFolder': commands.closeFolder,
    'edit.undo': commands.undo,
    'edit.redo': commands.redo,
    'edit.find': commands.find,
    'edit.replace': commands.replace,
    'edit.selectAll': commands.selectAll,
    'view.toggleSidebar': commands.toggleSidebar,
    'view.explorer': commands.showExplorer,
    'view.settings': () => commands.showSettings(),
    'view.previewNone': () => commands.setPreview('none'),
    'view.previewHtml': () => commands.setPreview('html'),
    'view.previewPdf': () => commands.setPreview('pdf'),
    'view.togglePreview': commands.togglePreview,
    'view.explorerTree': () => commands.setExplorerMode('tree'),
    'view.explorerThumbnails': () => commands.setExplorerMode('thumbnails'),
    'view.toggleWordWrap': commands.toggleWordWrap,
    'view.fontIncrease': commands.increaseFontSize,
    'view.fontDecrease': commands.decreaseFontSize,
    'view.fontReset': commands.resetFontSize,
    'help.about': commands.about,
    'help.shortcuts': commands.shortcuts,
    'app.command': () => undefined
  }
  void map[command]?.()
}
