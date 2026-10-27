import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, LIMITS } from '@shared/settings'
import { api } from './bridge'
import { runMenuCommand } from './commands/commands'
import './commands/phase2'
import './commands/publishing'
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
import { TitleBar, useWindowTitle } from './layout/TitleBar'
import { Welcome } from './layout/Welcome'
import { PreviewPanel } from './preview/PreviewPanel'
import { PublicationPanel } from './publishing/PublicationPanel'
import { SettingsPage } from './settings/SettingsPage'
import { AiPanel } from './ai/AiPanel'
import { checkForExternalChanges, confirmCloseAll, useDocuments } from './state/documents'
import { useExportSetup } from './state/exportSetup'
import { startPresentationStore } from './state/presentation'
import { startProjectStore } from './state/project'
import { clearSnapshots } from './state/recovery'
import { offerRecovery, restoreSession, startSessionTracking } from './state/session'
import { flushSettings, useSettings } from './state/settings'
import { useUi } from './state/ui'
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
          await clearSnapshots()
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
    // Files edited by another program are noticed when the window gets focus again.
    const onFocus = () => void checkForExternalChanges()
    window.addEventListener('focus', onFocus)
    window.addEventListener('keydown', handleGlobalKeydown, true)
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      offMenu()
      offClose()
      offChanged()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('keydown', handleGlobalKeydown, true)
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])
}

function useDocumentTitle(): void {
  const title = useWindowTitle()
  useEffect(() => {
    document.title = title
  }, [title])
}

export function App() {
  const [ready, setReady] = useState(false)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const hasDocuments = useDocuments((s) => s.documents.length > 0)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const activeId = useDocuments((s) => s.activeId)
  const editorAreaRef = useRef<HTMLDivElement>(null)

  useApplicationEvents()
  useDocumentTitle()

  useEffect(() => {
    void useSettings
      .getState()
      .load()
      .then((loaded) => {
        // The main process has already re-opened (and authorised) the last workspace.
        if (loaded.workspace.lastWorkspace)
          useWorkspace.getState().setRoot(loaded.workspace.lastWorkspace)
        startPresentationStore()
        startProjectStore()
        void useExportSetup.getState().loadPresets()
        setReady(true)
        void restoreSession().then(async () => {
          await offerRecovery()
          startSessionTracking()
        })
      })
  }, [])

  // Opening or switching to a document leaves the Settings page and shows it.
  useEffect(() => {
    useUi.setState({ settingsOpen: false })
  }, [activeId])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const { layout } = settings
  const clampSidebar = (width: number) =>
    Math.round(Math.min(LIMITS.sidebarWidth.max, Math.max(LIMITS.sidebarWidth.min, width)))
  const clampRatio = (ratio: number) =>
    Math.min(LIMITS.previewRatio.max, Math.max(LIMITS.previewRatio.min, ratio))

  if (!ready) {
    return (
      <div className="app loading">
        <TitleBar />
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="workbench">
        <ActivityBar />
        {layout.sidebarVisible && (
          <>
            <aside className="sidebar" style={{ width: layout.sidebarWidth }} data-testid="sidebar">
              {layout.sidebarView === 'ai' ? (
                <AiPanel />
              ) : layout.sidebarView === 'publication' ? (
                <PublicationPanel />
              ) : (
                <Explorer />
              )}
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
        {settingsOpen && <SettingsPage />}
        <main className="editor-area" ref={editorAreaRef} hidden={settingsOpen}>
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
