import { useMemo } from 'react'
import { FileCode2, FileDown, Palette, X } from 'lucide-react'
import type { PreviewKind } from '@shared/settings'
import { commands } from '../commands/commands'
import { runCommand } from '../commands/registry'
import { openDocumentSettings } from '../commands/phase3'
import { useActiveSetup, useExportSetup } from '../state/exportSetup'
import { usePresentation } from '../state/presentation'
import { BUILTIN_THEMES } from '@shared/presentation/theme'
import { useDocuments } from '../state/documents'
import { documentModels } from '../editor/models'
import { settingsFromText } from '@shared/publishing/documentSettings'
import { HtmlPreview } from './HtmlPreview'
import { PdfPreview } from './PdfPreview'

export function PreviewPanel({ kind }: { kind: PreviewKind }) {
  const hasDocument = useDocuments((s) => s.activeId !== null)
  const workspaceOverride = usePresentation((s) => s.workspace)
  const activeId = useDocuments((s) => s.activeId)
  const revision = useDocuments((s) => s.revision)
  const appThemeId = usePresentation((s) => s.effective.themeId)
  // A theme set in the document's own front matter wins over the one from Settings.
  const documentTheme = useMemo(() => {
    void revision
    const model = documentModels.get(activeId)
    return model ? (settingsFromText(model.getValue()).settings.theme ?? null) : null
  }, [activeId, revision])
  const themeName = BUILTIN_THEMES[documentTheme ?? appThemeId].name
  const setup = useActiveSetup()
  const presets = useExportSetup((s) => s.presets)
  const setupLabel = setup.presetId
    ? (presets.find((p) => p.id === setup.presetId)?.name ?? 'Preset')
    : 'Settings defaults'

  return (
    <section
      className="preview-panel"
      aria-label="Preview"
      data-testid="preview-panel"
      data-kind={kind}
    >
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
          className="chip-button"
          data-testid="theme-chip"
          title={
            documentTheme
              ? 'This document sets its own theme — click to change it in Document Settings'
              : 'Document theme — click to change it in Settings'
          }
          onClick={documentTheme ? () => runCommand('document.settings') : openDocumentSettings}
        >
          <Palette size={13} aria-hidden="true" />
          <span>{themeName}</span>
          {documentTheme && (
            <span className="chip-badge" data-testid="document-theme-badge">
              Document
            </span>
          )}
          {!documentTheme && workspaceOverride && (
            <span className="chip-badge" data-testid="workspace-override-badge">
              Workspace
            </span>
          )}
        </button>
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
            {!hasDocument && (
              <div className="preview-message overlay">Open a Markdown document to preview it.</div>
            )}
          </>
        ) : (
          <PdfPreview label={setupLabel} />
        )}
      </div>
    </section>
  )
}
