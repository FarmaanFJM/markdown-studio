import { AlertTriangle, Columns2, X } from 'lucide-react'
import { PREVIEW_LAYOUTS } from '../layout/previewLayouts'
import { commands } from '../commands/commands'
import { isMarkdownPath } from '@shared/fileTypes'
import {
  carriesExternalFiles,
  externalPathsFrom,
  openMarkdownDrops
} from '../explorer/externalDrop'
import { FileIcon } from '../explorer/FileIcon'
import { notify } from '../state/ui'
import { activateDocument, closeDocument, documentName, useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'

export function EditorTabs() {
  const documents = useDocuments((s) => s.documents)
  const activeId = useDocuments((s) => s.activeId)
  const previewMode = useSettings((s) => s.settings.layout.previewMode)

  return (
    <div
      className="tabs-bar"
      onDragOver={(e) => {
        if (!carriesExternalFiles(e.dataTransfer)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(e) => {
        if (!carriesExternalFiles(e.dataTransfer)) return
        e.preventDefault()
        e.stopPropagation()
        const markdown = externalPathsFrom(e.dataTransfer).filter(isMarkdownPath)
        if (markdown.length > 0) void openMarkdownDrops(markdown)
        else
          notify(
            'info',
            'Drop Markdown files here to open them, or drop files and folders onto the Explorer to import them.'
          )
      }}
    >
      <div className="tabs" role="tablist" aria-label="Open documents">
        {documents.map((doc) => {
          const name = documentName(doc)
          const active = doc.id === activeId
          return (
            <div
              key={doc.id}
              role="tab"
              aria-selected={active}
              className={`tab${active ? ' active' : ''}${doc.dirty ? ' dirty' : ''}`}
              title={
                doc.saveError
                  ? `${name}: could not be saved — ${doc.saveError}`
                  : doc.conflict
                    ? `${name}: changed on disk while you have unsaved edits`
                    : (doc.path ?? `${name} (not saved yet)`)
              }
              data-testid="tab"
              data-name={name}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  void closeDocument(doc.id)
                }
              }}
              onClick={() => activateDocument(doc.id)}
            >
              <FileIcon name={doc.path ?? `${name}.md`} size={14} />
              <span className="tab-label">{name}</span>
              {(doc.conflict || doc.saveError) && (
                <AlertTriangle
                  size={13}
                  className="tab-warning"
                  data-testid="tab-warning"
                  aria-label={doc.saveError ? 'Could not be saved' : 'Changed on disk'}
                />
              )}
              <button
                type="button"
                className="tab-close"
                aria-label={doc.dirty ? `Close ${name} (unsaved changes)` : `Close ${name}`}
                title={doc.dirty ? 'Unsaved changes — close' : 'Close (Ctrl+W)'}
                onClick={(e) => {
                  e.stopPropagation()
                  void closeDocument(doc.id)
                }}
              >
                <span className="dirty-dot" aria-hidden />
                <X size={14} className="close-icon" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
      <div className="layout-switch" role="radiogroup" aria-label="Open preview">
        {PREVIEW_LAYOUTS.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={previewMode === mode}
            className={`layout-button${previewMode === mode ? ' active' : ''}`}
            title={label}
            aria-label={label}
            data-testid={`layout-${mode}`}
            onClick={() => commands.setPreview(mode)}
          >
            <Columns2 size={14} />
            <span className="layout-tag">{mode.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
