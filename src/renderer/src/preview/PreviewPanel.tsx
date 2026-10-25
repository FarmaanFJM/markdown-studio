import { FileCode2, FileDown, X } from 'lucide-react'
import type { PreviewKind } from '@shared/settings'
import { commands } from '../commands/commands'
import { useDocuments } from '../state/documents'
import { HtmlPreview } from './HtmlPreview'
import { PdfPreview } from './PdfPreview'

export function PreviewPanel({ kind }: { kind: PreviewKind }) {
  const hasDocument = useDocuments((s) => s.activeId !== null)

  return (
    <section className="preview-panel" aria-label="Preview" data-testid="preview-panel" data-kind={kind}>
      <header className="panel-header">
        <div className="segmented" role="radiogroup" aria-label="Preview type">
          {(['html', 'pdf'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? 'active' : ''}
              data-testid={`preview-tab-${k}`}
              onClick={() => commands.setPreview(k)}
            >
              {k.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="toolbar-spacer" />
        <button
          type="button"
          className="icon-button"
          title="Export as HTML…"
          aria-label="Export as HTML"
          disabled={!hasDocument}
          onClick={() => void commands.exportHtml()}
        >
          <FileCode2 size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Export as PDF…"
          aria-label="Export as PDF"
          disabled={!hasDocument}
          onClick={() => void commands.exportPdf()}
        >
          <FileDown size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Close preview"
          aria-label="Close preview"
          data-testid="preview-close"
          onClick={() => commands.setPreview('none')}
        >
          <X size={15} />
        </button>
      </header>
      <div className="panel-body">
        {kind === 'html' ? (
          <>
            <HtmlPreview />
            {!hasDocument && <div className="preview-message overlay">Open a Markdown document to preview it.</div>}
          </>
        ) : (
          <PdfPreview />
        )}
      </div>
    </section>
  )
}
