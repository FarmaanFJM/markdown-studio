import { useMemo } from 'react'
import { Check, Circle } from 'lucide-react'
import { documentModels } from '../editor/models'
import { useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'

function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)?.length ?? 0
}

export function StatusBar() {
  const doc = useDocuments((s) => s.documents.find((d) => d.id === s.activeId) ?? null)
  const cursor = useDocuments((s) => s.cursor)
  const revision = useDocuments((s) => s.revision)
  const previewMode = useSettings((s) => s.settings.layout.previewMode)
  const wordWrap = useSettings((s) => s.settings.editor.wordWrap)

  const info = useMemo(() => {
    const model = documentModels.get(doc?.id ?? null)
    if (!model) return null
    return { words: countWords(model.getValue()), eol: model.getEOL() === '\r\n' ? 'CRLF' : 'LF' }
    // revision changes whenever the active text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, revision])

  return (
    <footer className="status-bar" data-testid="status-bar">
      <div className="status-group">
        {doc && (
          <span
            className={`status-item save-state${doc.dirty ? ' dirty' : ''}`}
            data-testid="save-state"
          >
            {doc.dirty ? <Circle size={9} fill="currentColor" /> : <Check size={12} />}
            {doc.dirty ? 'Unsaved changes' : doc.path ? 'Saved' : 'New document'}
          </span>
        )}
        {previewMode !== 'none' && (
          <span className="status-item">Preview: {previewMode.toUpperCase()}</span>
        )}
      </div>
      {doc && info && (
        <div className="status-group">
          <span className="status-item" data-testid="cursor-position">
            Ln {cursor.line}, Col {cursor.column}
            {cursor.selectedCharacters > 0 && ` (${cursor.selectedCharacters} selected)`}
          </span>
          <span className="status-item">{info.words.toLocaleString()} words</span>
          {!wordWrap && <span className="status-item">No wrap</span>}
          <span className="status-item">{info.eol}</span>
          <span className="status-item">{doc.hasBom ? 'UTF-8 with BOM' : 'UTF-8'}</span>
          <span className="status-item status-language">Markdown</span>
        </div>
      )}
    </footer>
  )
}
