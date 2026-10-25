import { useEffect, useRef, useState } from 'react'
import { basename } from '@shared/paths'
import { DEFAULT_SETTINGS, LIMITS } from '@shared/settings'
import { api } from './bridge'
import { runMenuCommand } from './commands/commands'
import './commands/phase2'
import { handleGlobalKeydown } from './commands/keybindings'
import { ContextMenu, Toasts } from './dialogs/Overlays'
import { DialogHost } from './dialogs/DialogHost'
import { EditorTabs } from './editor/EditorTabs'
import { FormattingToolbar } from './editor/FormattingToolbar'
import { MarkdownEditor } from './editor/MarkdownEditor'
import { Explorer } from './explorer/Explorer'
import { ActivityBar } from './layout/ActivityBar'
import { Splitter } from './layout/Splitter'
import { StatusBar } from './layout/StatusBar'
import { Welcome } from './layout/Welcome'
import { PreviewPanel } from './preview/PreviewPanel'
import { SettingsPanel } from './settings/SettingsPanel'
import { confirmCloseAll, documentName, useDocuments } from './state/documents'
import { useExportSetup } from './state/exportSetup'
import { startPresentationStore } from './state/presentation'
import { flushSettings, useSettings } from './state/settings'
import { useWorkspace } from './state/workspace'

const ACTIVITY_BAR_WIDTH = 48

function useApplicationEvents(): void {
  useEffect(() => {
    let closing = false
    const offMenu = api.app.onMenuCommand(runMenuCommand)
    const offClose = api.app.onCloseRequested(async () => {
      if (closing) return
      closing = true
      try {
        if (await confirmCloseAll()) {
          await flushSettings()
          await api.app.confirmClose()
        }
      } finally {
        closing = false
      }
    })
    const offChanged = api.workspace.onChanged(
      (directories) => void useWorkspace.getState().refresh(directories)
    )

    // Dropping a file anywhere else must never navigate the window away from the application.
    const block = (event: DragEvent) => {
      if (!event.defaultPrevented) {
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
      }
    }
    window.addEventListener('keydown', handleGlobalKeydown, true)
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      offMenu()
      offClose()
      offChanged()
      window.removeEventListener('keydown', handleGlobalKeydown, true)
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])
}

function useWindowTitle(): void {
  const doc = useDocuments((s) => s.documents.find((d) => d.id === s.activeId) ?? null)
  const root = useWorkspace((s) => s.root)
  useEffect(() => {
    const parts = [
      doc ? `${doc.dirty ? '● ' : ''}${documentName(doc)}` : null,
      root ? basename(root) : null,
      'Markdown Studio'
    ]
    document.title = parts.filter(Boolean).join(' — ')
  }, [doc, root])
}

export function App() {
  const [ready, setReady] = useState(false)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const hasDocuments = useDocuments((s) => s.documents.length > 0)
  const editorAreaRef = useRef<HTMLDivElement>(null)

  useApplicationEvents()
  useWindowTitle()

  useEffect(() => {
    void useSettings
      .getState()
      .load()
      .then((loaded) => {
        // The main process has already re-opened (and authorised) the last workspace.
        if (loaded.workspace.lastWorkspace)
          useWorkspace.getState().setRoot(loaded.workspace.lastWorkspace)
        startPresentationStore()
        void useExportSetup.getState().loadPresets()
        setReady(true)
      })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const { layout } = settings
  const clampSidebar = (width: number) =>
    Math.round(Math.min(LIMITS.sidebarWidth.max, Math.max(LIMITS.sidebarWidth.min, width)))
  const clampRatio = (ratio: number) =>
    Math.min(LIMITS.previewRatio.max, Math.max(LIMITS.previewRatio.min, ratio))

  if (!ready) return <div className="app loading" />

  return (
    <div className="app">
      <div className="workbench">
        <ActivityBar />
        {layout.sidebarVisible && (
          <>
            <aside className="sidebar" style={{ width: layout.sidebarWidth }} data-testid="sidebar">
              {layout.sidebarView === 'settings' ? <SettingsPanel /> : <Explorer />}
            </aside>
            <Splitter
              label="Resize sidebar"
              testId="sidebar-splitter"
              onDrag={(x) =>
                update({ layout: { sidebarWidth: clampSidebar(x - ACTIVITY_BAR_WIDTH) } })
              }
              onStep={(d) =>
                update({ layout: { sidebarWidth: clampSidebar(layout.sidebarWidth + d * 16) } })
              }
              onReset={() =>
                update({ layout: { sidebarWidth: DEFAULT_SETTINGS.layout.sidebarWidth } })
              }
            />
          </>
        )}
        <main className="editor-area" ref={editorAreaRef}>
          <div className="editor-column" data-testid="editor-column">
            {hasDocuments && <EditorTabs />}
            {hasDocuments && settings.markdown.toolbar && <FormattingToolbar />}
            <div className="editor-stack">
              <MarkdownEditor />
              {!hasDocuments && <Welcome />}
            </div>
          </div>
          {layout.previewMode !== 'none' && (
            <>
              <Splitter
                label="Resize preview"
                testId="preview-splitter"
                onDrag={(x) => {
                  const rect = editorAreaRef.current?.getBoundingClientRect()
                  if (rect)
                    update({ layout: { previewRatio: clampRatio((rect.right - x) / rect.width) } })
                }}
                onStep={(d) =>
                  update({ layout: { previewRatio: clampRatio(layout.previewRatio - d * 0.03) } })
                }
                onReset={() =>
                  update({ layout: { previewRatio: DEFAULT_SETTINGS.layout.previewRatio } })
                }
              />
              <div className="preview-slot" style={{ flexBasis: `${layout.previewRatio * 100}%` }}>
                <PreviewPanel kind={layout.previewMode} />
              </div>
            </>
          )}
        </main>
      </div>
      <StatusBar />
      <DialogHost />
      <ContextMenu />
      <Toasts />
    </div>
  )
}
