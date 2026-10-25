import { BrowserWindow } from 'electron'
import type { PrintJobOptions } from '@shared/export/pdf'
import type { MsFileProtocol } from './protocol'

const LOAD_TIMEOUT_MS = 30_000
const PRINT_TIMEOUT_MS = 120_000

export class PdfJobCancelled extends Error {
  constructor() {
    super('The export was cancelled.')
    this.name = 'PdfJobCancelled'
  }
}

/** A PDF produced by Chromium must be a complete file; anything else is a failed job. */
export function assertValidPdf(bytes: Uint8Array): void {
  if (bytes.length < 400) throw new Error('The PDF engine produced an empty file.')
  const head = Buffer.from(bytes.subarray(0, 8)).toString('latin1')
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1100))).toString('latin1')
  if (!head.startsWith('%PDF-') || !tail.includes('%%EOF')) {
    throw new Error('The PDF engine produced an incomplete file.')
  }
}

/**
 * Generates PDFs with Chromium's print pipeline.
 *
 * The HTML is loaded in a hidden, sandboxed window with JavaScript disabled. The preview and the
 * exporter both call `print` with the same page options, so the PDF shown in the application is
 * the document an export of the same source produces. Jobs are serialised; a job can be
 * cancelled, which destroys its window and leaves the queue usable.
 */
export class PdfService {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly files: MsFileProtocol) {}

  print(html: string, options: PrintJobOptions, signal?: AbortSignal): Promise<Buffer> {
    // Serialise jobs: one hidden window at a time keeps memory use predictable.
    const job = this.queue.then(() => this.render(html, options, signal))
    this.queue = job.catch(() => undefined)
    return job
  }

  private async render(
    html: string,
    options: PrintJobOptions,
    signal?: AbortSignal
  ): Promise<Buffer> {
    if (signal?.aborted) throw new PdfJobCancelled()
    const hosted = this.files.hostDocument(html)
    const window = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        javascript: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        images: true,
        spellcheck: false
      }
    })
    let abort: (() => void) | null = null
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new PdfJobCancelled())
      signal?.addEventListener('abort', abort, { once: true })
    })
    try {
      const printed = (async () => {
        await withTimeout(
          window.loadURL(hosted.url),
          LOAD_TIMEOUT_MS,
          'The document took too long to load.'
        )
        const bytes = await withTimeout(
          window.webContents.printToPDF({
            pageSize: options.pageSize,
            margins: options.margins,
            printBackground: options.printBackground,
            scale: options.scale,
            displayHeaderFooter: options.displayHeaderFooter,
            headerTemplate: options.headerTemplate,
            footerTemplate: options.footerTemplate,
            landscape: false,
            preferCSSPageSize: false
          }),
          PRINT_TIMEOUT_MS,
          'The PDF engine took too long.'
        )
        assertValidPdf(bytes)
        return bytes
      })()
      // Avoid an unhandled rejection when cancellation wins the race.
      printed.catch(() => undefined)
      return await Promise.race([printed, cancelled])
    } finally {
      if (abort) signal?.removeEventListener('abort', abort)
      hosted.dispose()
      if (!window.isDestroyed()) window.destroy()
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
