import { BrowserWindow, session, type Session } from 'electron'
import {
  DIAGRAM_LIMITS,
  validateDiagramRequest,
  type DiagramRenderRequest,
  type DiagramRenderResult
} from '@shared/diagram'

interface Job {
  request: DiagramRenderRequest
  resolve: (result: DiagramRenderResult) => void
  cancelled: boolean
}

const IDLE_CLOSE_MS = 60_000

function failure(id: string, message: string): DiagramRenderResult {
  return { id, ok: false, message, line: null }
}

/**
 * Renders Mermaid diagrams in a hidden window that is isolated from the application.
 *
 * Mermaid needs a real DOM to measure text, so it runs in its own `BrowserWindow`: sandboxed,
 * without a preload script (no IPC, no Node.js), in a private session whose network requests are
 * limited to the bundled host page. The window receives untrusted diagram text and returns an SVG
 * string; the application sanitises that string again before using it. Because this is a
 * separate process, a slow diagram never blocks typing in the editor.
 *
 * Requests are processed one at a time and can be cancelled while queued.
 */
export class DiagramService {
  private window: BrowserWindow | null = null
  private loading: Promise<BrowserWindow> | null = null
  private readonly queue: Job[] = []
  private running = false
  private idleTimer: NodeJS.Timeout | null = null
  private partition: Session | null = null

  /** `hostUrl` is the URL of the bundled `diagram-host.html`. */
  constructor(private readonly hostUrl: string) {}

  render(input: unknown): Promise<DiagramRenderResult> {
    const checked = validateDiagramRequest(input)
    if (!checked.ok) {
      const id =
        typeof (input as { id?: unknown })?.id === 'string' ? (input as { id: string }).id : ''
      return Promise.resolve(failure(id, checked.error))
    }
    return new Promise((resolve) => {
      this.queue.push({ request: checked.request, resolve, cancelled: false })
      void this.pump()
    })
  }

  /** Drops queued requests with these ids; a diagram already being drawn finishes normally. */
  cancel(ids: unknown): void {
    if (!Array.isArray(ids)) return
    const wanted = new Set(ids.filter((id): id is string => typeof id === 'string'))
    for (const job of this.queue) {
      if (wanted.has(job.request.id)) job.cancelled = true
    }
  }

  dispose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    for (const job of this.queue.splice(0)) job.resolve(failure(job.request.id, 'Cancelled.'))
    this.destroyWindow()
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (let job = this.queue.shift(); job; job = this.queue.shift()) {
        if (job.cancelled) {
          job.resolve(failure(job.request.id, 'Cancelled.'))
          continue
        }
        job.resolve(await this.execute(job.request))
      }
    } finally {
      this.running = false
      this.scheduleIdleClose()
    }
  }

  private async execute(request: DiagramRenderRequest): Promise<DiagramRenderResult> {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    try {
      const window = await this.ensureWindow()
      const run = window.webContents.executeJavaScript(
        `window.msDiagram.render(${JSON.stringify(request)})`,
        true
      ) as Promise<DiagramRenderResult>
      const result = await withTimeout(run, DIAGRAM_LIMITS.timeoutMs)
      return result && typeof result === 'object' && result.id === request.id
        ? result
        : failure(request.id, 'The diagram renderer returned an unexpected answer.')
    } catch (error) {
      const message = (error as Error).message
      if (message === 'timeout') {
        // A runaway diagram may have wedged the page; start from a clean window next time.
        this.destroyWindow()
        return failure(
          request.id,
          `The diagram took longer than ${DIAGRAM_LIMITS.timeoutMs / 1000} seconds to draw and was stopped.`
        )
      }
      this.destroyWindow()
      return failure(request.id, `The diagram renderer failed: ${message}`)
    }
  }

  private scheduleIdleClose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      if (!this.running && this.queue.length === 0) this.destroyWindow()
    }, IDLE_CLOSE_MS)
    this.idleTimer.unref?.()
  }

  private destroyWindow(): void {
    const window = this.window
    this.window = null
    this.loading = null
    if (window && !window.isDestroyed()) window.destroy()
  }

  private isAllowedRequest(url: string): boolean {
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('devtools:'))
      return true
    const base = this.hostUrl.slice(0, this.hostUrl.lastIndexOf('/') + 1)
    if (url.startsWith(base)) return true
    // The development server also talks to its page over a websocket on the same host.
    try {
      const host = new URL(this.hostUrl)
      const target = new URL(url)
      return (
        host.protocol === 'http:' && target.hostname === host.hostname && target.port === host.port
      )
    } catch {
      return false
    }
  }

  private ensureWindow(): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) return Promise.resolve(this.window)
    this.loading ??= this.createWindow()
    return this.loading
  }

  private async createWindow(): Promise<BrowserWindow> {
    this.partition ??= session.fromPartition('ms-diagram')
    const partition = this.partition
    partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    partition.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !this.isAllowedRequest(details.url) })
    )
    const window = new BrowserWindow({
      show: false,
      width: 1100,
      height: 800,
      webPreferences: {
        session: partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        webviewTag: false,
        spellcheck: false,
        backgroundThrottling: false
      }
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.on('render-process-gone', () => {
      if (this.window === window) {
        this.window = null
        this.loading = null
      }
    })
    this.window = window
    try {
      await withTimeout(window.loadURL(this.hostUrl), DIAGRAM_LIMITS.timeoutMs)
      await withTimeout(
        window.webContents.executeJavaScript('typeof window.msDiagram === "object"', true),
        DIAGRAM_LIMITS.timeoutMs
      )
    } catch (error) {
      this.destroyWindow()
      throw error
    }
    return window
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
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
