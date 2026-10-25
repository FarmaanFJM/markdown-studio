import { promises as fs } from 'node:fs'
import path from 'node:path'
import { formatDate } from '@shared/templates'
import { validateExportRequest, type ExportRequest, type ExportResult } from '@shared/export/job'
import { toPrintOptions, validatePdfOptions, type HeaderFooterValues } from '@shared/export/pdf'
import { writeFileAtomic } from './atomicWrite'
import { PdfJobCancelled, type PdfService } from './pdfService'

export interface ExportDependencies {
  pdf: PdfService
  /** Asks the user where to save; resolves to null when the dialog is cancelled. */
  chooseTarget(format: 'pdf' | 'html', defaultPath: string): Promise<string | null>
  /** Called with every file written, so it can be revealed in the file manager. */
  exported(path: string): void
}

function withExtension(file: string, extensions: string[], fallback: string): string {
  return extensions.includes(path.extname(file).toLowerCase()) ? file : `${file}${fallback}`
}

/**
 * Runs export jobs.
 *
 * A job never changes the destination unless it produced a complete, valid result: PDFs are
 * checked for structure, and the file is written to a temporary name in the destination folder
 * and renamed into place. A cancelled or failed job leaves any existing file exactly as it was.
 * Expected failures are returned as values, so the application stays usable.
 */
export class ExportService {
  private readonly jobs = new Map<string, AbortController>()

  constructor(private readonly deps: ExportDependencies) {}

  /** Prints for the PDF preview; no file is written. */
  async preview(
    html: string,
    pdfInput: unknown,
    values: { title: string; file: string }
  ): Promise<Uint8Array> {
    if (typeof html !== 'string') throw new Error('Invalid document.')
    const checked = validatePdfOptions(pdfInput)
    if (!checked.ok) throw new Error(checked.errors[0].message)
    const bytes = await this.deps.pdf.print(
      html,
      toPrintOptions(checked.options, this.headerValues(values))
    )
    return new Uint8Array(bytes)
  }

  cancel(jobId: unknown): void {
    if (typeof jobId === 'string') this.jobs.get(jobId)?.abort()
  }

  async run(input: unknown): Promise<ExportResult> {
    const checked = validateExportRequest(input)
    if (!checked.ok) return { status: 'failed', message: checked.message }
    const request = checked.request
    if (this.jobs.has(request.jobId))
      return { status: 'failed', message: 'This export is already running.' }
    const controller = new AbortController()
    this.jobs.set(request.jobId, controller)
    try {
      const chosen = await this.deps.chooseTarget(request.format, request.defaultPath)
      if (!chosen) return { status: 'cancelled' }
      const target =
        request.format === 'pdf'
          ? withExtension(chosen, ['.pdf'], '.pdf')
          : withExtension(chosen, ['.html', '.htm'], '.html')
      const stat = await fs.stat(target).catch(() => null)
      if (stat?.isDirectory()) return { status: 'failed', message: `"${target}" is a folder.` }

      const data = await this.produce(request, controller.signal)
      if (controller.signal.aborted) return { status: 'cancelled' }
      await writeFileAtomic(target, data)
      this.deps.exported(target)
      return { status: 'saved', path: target, bytes: data.length }
    } catch (error) {
      if (error instanceof PdfJobCancelled || controller.signal.aborted)
        return { status: 'cancelled' }
      return { status: 'failed', message: (error as Error).message || 'The export failed.' }
    } finally {
      this.jobs.delete(request.jobId)
    }
  }

  private headerValues(values: { title: string; file: string }): HeaderFooterValues {
    return { title: values.title, file: values.file, date: formatDate(new Date()) }
  }

  private async produce(
    request: ExportRequest & { pdf: unknown },
    signal: AbortSignal
  ): Promise<Uint8Array> {
    if (request.format === 'html') {
      const html = request.html
      if (!/^\s*<!doctype html>/i.test(html)) throw new Error('The HTML document is incomplete.')
      return new TextEncoder().encode(html)
    }
    const options = validatePdfOptions(request.pdf)
    if (!options.ok) throw new Error(options.errors[0].message)
    const bytes = await this.deps.pdf.print(
      request.html,
      toPrintOptions(
        options.options,
        this.headerValues({ title: request.title, file: request.fileName })
      ),
      signal
    )
    return new Uint8Array(bytes)
  }
}
