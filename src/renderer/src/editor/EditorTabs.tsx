import { AlertTriangle, Columns2, FileText, X } from 'lucide-react'
import type { PreviewMode } from '@shared/settings'
import { commands } from '../commands/commands'
import { FileIcon } from '../explorer/FileIcon'
import { activateDocument, closeDocument, documentName, useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'

const LAYOUTS: { mode: PreviewMode; label: string; icon: typeof FileText }[] = [
  { mode: 'none', label: 'Source only', icon: FileText },
  { mode: 'html', label: 'Source and HTML preview', icon: Columns2 },
  { mode: 'pdf', label: 'Source and PDF preview', icon: Columns2 }
]

export function EditorTabs() {
  const documents = useDocuments((s) => s.documents)
  const activeId = useDocuments((s) => s.activeId)
  const previewMode = useSettings((s) => s.settings.layout.previewMode)

  return (
    <div className="tabs-bar">
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
      <div className="layout-switch" role="radiogroup" aria-label="Preview layout">
        {LAYOUTS.map(({ mode, label, icon: Icon }) => (
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
            <Icon size={14} />
            {mode !== 'none' && <span className="layout-tag">{mode.toUpperCase()}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
