import { BrowserWindow } from 'electron'
import type { MsFileProtocol } from './protocol'

const LOAD_TIMEOUT_MS = 30_000

/** A4 with 18 mm margins on every side, in inches as Electron expects. */
export const PDF_OPTIONS = {
  pageSize: 'A4',
  printBackground: true,
  preferCSSPageSize: false,
  margins: { top: 0.71, bottom: 0.71, left: 0.71, right: 0.71 }
} as const

/**
 * Generates PDFs with Chromium's print pipeline.
 *
 * The HTML is loaded in a hidden, sandboxed window with JavaScript disabled. The preview and the
 * exporter both call `print`, so the PDF shown in the application is byte-for-byte the document
 * produced by an export of the same source.
 */
export class PdfService {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly files: MsFileProtocol) {}

  print(html: string): Promise<Buffer> {
    // Serialise jobs: one hidden window at a time keeps memory use predictable.
    const job = this.queue.then(() => this.render(html))
    this.queue = job.catch(() => undefined)
    return job
  }

  private async render(html: string): Promise<Buffer> {
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
    try {
      await withTimeout(
        window.loadURL(hosted.url),
        LOAD_TIMEOUT_MS,
        'The document took too long to load.'
      )
      return await window.webContents.printToPDF(PDF_OPTIONS)
    } finally {
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
