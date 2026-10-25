import { LIMITS, DEFAULT_SETTINGS, type ExplorerMode, type PreviewMode } from '@shared/settings'
import { basename, dirname, joinPath, stripExtension } from '@shared/paths'
import type { MenuCommandMessage } from '@shared/ipc'
import { api, errorMessage } from '../bridge'
import { documentModels, getActiveEditor, runEditorAction } from '../editor/models'
import { buildPdfSourceHtml, buildStandaloneHtml, type ExportSource } from '../markdown/exporters'
import {
  activateDocument,
  activeDocument,
  closeDocument,
  closeDocumentsIn,
  documentName,
  newDocument,
  openDocument,
  saveAllDocuments,
  saveDocument,
  saveDocumentAs,
  useDocuments,
  type EditorDocument
} from '../state/documents'
import { refreshSettings, useSettings } from '../state/settings'
import { dialogs, notify } from '../state/ui'
import { useWorkspace } from '../state/workspace'
import { runRegisteredCommand } from './dispatch'

function settings() {
  return useSettings.getState().settings
}

export function exportSourceFor(doc: EditorDocument): ExportSource | null {
  const model = documentModels.get(doc.id)
  if (!model) return null
  return {
    source: model.getValue(),
    fileName: documentName(doc),
    context: {
      documentDirectory: doc.path ? dirname(doc.path) : null,
      workspaceRoot: useWorkspace.getState().root
    }
  }
}

function exportDefaultPath(doc: EditorDocument, extension: string): string {
  const name = `${stripExtension(documentName(doc))}${extension}`
  if (doc.path) return joinPath(dirname(doc.path), name)
  const root = useWorkspace.getState().root
  return root ? joinPath(root, name) : name
}

function revealAction(path: string) {
  return {
    label: 'Show in folder',
    run: () => void api.shell.showItemInFolder(path).catch(() => undefined)
  }
}

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

function showSidebar(view: 'explorer' | 'settings'): void {
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

  async exportHtml() {
    const doc = activeDocument()
    const source = doc && exportSourceFor(doc)
    if (!doc || !source) return notify('info', 'Open a Markdown document to export it.')
    try {
      const { html, missingImages } = await buildStandaloneHtml(source)
      const target = await api.render.exportHtml(html, exportDefaultPath(doc, '.html'))
      if (!target) return
      if (missingImages.length > 0) {
        notify(
          'error',
          `Exported ${basename(target)}, but these images were not found: ${missingImages.join(', ')}`
        )
      } else {
        notify('success', `Exported ${basename(target)}.`, revealAction(target))
      }
    } catch (error) {
      notify('error', `HTML export failed: ${errorMessage(error)}`)
    }
  },

  async exportPdf() {
    const doc = activeDocument()
    const source = doc && exportSourceFor(doc)
    if (!doc || !source) return notify('info', 'Open a Markdown document to export it.')
    try {
      const target = await api.render.exportPdf(
        buildPdfSourceHtml(source),
        exportDefaultPath(doc, '.pdf')
      )
      if (target) notify('success', `Exported ${basename(target)}.`, revealAction(target))
    } catch (error) {
      notify('error', `PDF export failed: ${errorMessage(error)}`)
    }
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
  showSettings: () => showSidebar('settings'),

  setPreview,
  togglePreview() {
    const { previewMode, lastPreviewKind } = settings().layout
    setPreview(previewMode === 'none' ? lastPreviewKind : 'none')
  },

  setExplorerMode(mode: ExplorerMode) {
    useSettings.getState().update({ explorer: { mode } })
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
    'file.closeEditor': commands.closeEditor,
    'file.closeFolder': commands.closeFolder,
    'edit.undo': commands.undo,
    'edit.redo': commands.redo,
    'edit.find': commands.find,
    'edit.replace': commands.replace,
    'edit.selectAll': commands.selectAll,
    'view.toggleSidebar': commands.toggleSidebar,
    'view.explorer': commands.showExplorer,
    'view.settings': commands.showSettings,
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
