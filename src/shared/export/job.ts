/** Export job contract between the renderer (which builds the document) and the main process. */
import { validatePdfOptions, type PdfOptions } from './pdf'

export type ExportFormat = 'pdf' | 'html'

export const EXPORT_LIMITS = {
  htmlBytes: 400 * 1024 * 1024,
  titleLength: 300,
  jobIdLength: 64
} as const

export interface ExportRequest {
  jobId: string
  format: ExportFormat
  /** The complete document, built by the shared presentation pipeline. */
  html: string
  defaultPath: string
  /** Document title and file name for header/footer placeholders. */
  title: string
  fileName: string
  /** Page settings; required for PDF. */
  pdf?: PdfOptions
}

export type ExportResult =
  | { status: 'saved'; path: string; bytes: number }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }

export type ExportRequestValidation =
  | { ok: true; request: ExportRequest & { pdf: PdfOptions | undefined } }
  | { ok: false; message: string }

export function validateExportRequest(input: unknown): ExportRequestValidation {
  if (typeof input !== 'object' || input === null)
    return { ok: false, message: 'Invalid export request.' }
  const v = input as Record<string, unknown>
  if (typeof v.jobId !== 'string' || !v.jobId || v.jobId.length > EXPORT_LIMITS.jobIdLength) {
    return { ok: false, message: 'Invalid export request.' }
  }
  if (v.format !== 'pdf' && v.format !== 'html')
    return { ok: false, message: 'Unknown export format.' }
  if (typeof v.html !== 'string' || v.html.length === 0)
    return { ok: false, message: 'There is nothing to export.' }
  if (v.html.length > EXPORT_LIMITS.htmlBytes)
    return { ok: false, message: 'The document is too large to export.' }
  if (typeof v.defaultPath !== 'string') return { ok: false, message: 'Invalid file name.' }
  const title = typeof v.title === 'string' ? v.title.slice(0, EXPORT_LIMITS.titleLength) : ''
  const fileName =
    typeof v.fileName === 'string' ? v.fileName.slice(0, EXPORT_LIMITS.titleLength) : ''
  let pdf: PdfOptions | undefined
  if (v.format === 'pdf') {
    const checked = validatePdfOptions(v.pdf)
    if (!checked.ok) {
      return { ok: false, message: `The page settings are not valid: ${checked.errors[0].message}` }
    }
    pdf = checked.options
  }
  return {
    ok: true,
    request: {
      jobId: v.jobId,
      format: v.format,
      html: v.html,
      defaultPath: v.defaultPath,
      title,
      fileName,
      pdf
    }
  }
}
