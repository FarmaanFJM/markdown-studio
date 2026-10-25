import { basename, dirname, joinPath, stripExtension } from '@shared/paths'
import type { ExportSetup } from '@shared/export/setup'
import { api, errorMessage } from '../bridge'
import {
  buildPdfSourceHtml,
  buildStandaloneHtml,
  titleFor,
  UnsafeExportError,
  type ExportSource
} from '../markdown/exporters'
import { renderPresentationFor } from '../state/presentation'
import { documentName, type EditorDocument } from '../state/documents'
import { notify } from '../state/ui'
import { useWorkspace } from '../state/workspace'

export interface ExportOutcome {
  status: 'saved' | 'cancelled' | 'failed'
  path?: string
  message?: string
}

export function exportDefaultPath(doc: EditorDocument, extension: string): string {
  const name = `${stripExtension(documentName(doc))}${extension}`
  if (doc.path) return joinPath(dirname(doc.path), name)
  const root = useWorkspace.getState().root
  return root ? joinPath(root, name) : name
}

let jobCounter = 0
let activeJob: string | null = null

export function cancelExport(): void {
  if (activeJob) void api.export.cancel(activeJob).catch(() => undefined)
}

export function isExporting(): boolean {
  return activeJob !== null
}

function revealAction(path: string) {
  return {
    label: 'Show in folder',
    run: () => void api.shell.showItemInFolder(path).catch(() => undefined)
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Builds the document with the shared presentation pipeline and asks the main process to write
 * it. The Markdown text is only read, never changed. Failures and cancellation are reported
 * without throwing, and leave the destination untouched.
 */
export async function runExport(
  doc: EditorDocument,
  source: ExportSource,
  setup: ExportSetup
): Promise<ExportOutcome> {
  if (activeJob) {
    notify('info', 'An export is already running.')
    return { status: 'failed', message: 'An export is already running.' }
  }
  const jobId = `export-${++jobCounter}`
  activeJob = jobId
  try {
    const presentation = await renderPresentationFor(
      setup.overrides,
      setup.format === 'pdf' ? setup.pdf : undefined
    )
    const warnings: string[] = []
    let html: string
    if (setup.format === 'pdf') {
      const built = await buildPdfSourceHtml(source, presentation, setup.pdf)
      html = built.html
      if (built.diagramProblems.length > 0) {
        warnings.push(
          plural(built.diagramProblems.length, 'diagram has an error', 'diagrams have errors')
        )
      }
    } else {
      const built = await buildStandaloneHtml(source, presentation, setup.html)
      html = built.html
      if (built.missingImages.length > 0) {
        warnings.push(`images not found: ${built.missingImages.join(', ')}`)
      }
      if (built.unresolvedLinks.length > 0) {
        warnings.push(
          `${plural(built.unresolvedLinks.length, 'link', 'links')} to local files will not work once the file is moved (${built.unresolvedLinks.slice(0, 3).join(', ')}${built.unresolvedLinks.length > 3 ? ', …' : ''})`
        )
      }
      if (built.remoteImages.length > 0) {
        warnings.push(
          `${plural(built.remoteImages.length, 'remote image stays', 'remote images stay')} online`
        )
      }
      if (built.diagramProblems.length > 0) {
        warnings.push(
          plural(built.diagramProblems.length, 'diagram has an error', 'diagrams have errors')
        )
      }
    }

    const extension = setup.format === 'pdf' ? '.pdf' : '.html'
    const result = await api.export.run({
      jobId,
      format: setup.format,
      html,
      defaultPath: exportDefaultPath(doc, extension),
      title: titleFor(source),
      fileName: source.fileName,
      pdf: setup.format === 'pdf' ? setup.pdf : undefined
    })
    if (result.status === 'saved') {
      const extra = warnings.length > 0 ? ` Note: ${warnings.join('; ')}.` : ''
      notify(
        warnings.length > 0 ? 'info' : 'success',
        `Exported ${basename(result.path)}.${extra}`,
        revealAction(result.path)
      )
      return { status: 'saved', path: result.path }
    }
    if (result.status === 'failed') {
      notify('error', `Export failed: ${result.message}`)
      return { status: 'failed', message: result.message }
    }
    return { status: 'cancelled' }
  } catch (error) {
    const message = error instanceof UnsafeExportError ? error.message : errorMessage(error)
    notify('error', `Export failed: ${message}`)
    return { status: 'failed', message }
  } finally {
    activeJob = null
  }
}
