import type { Readable, Writable } from 'node:stream'
import {
  COPILOT_ACCEPT_COMMAND,
  COPILOT_LIMITS,
  COPILOT_OFF,
  copilotDocumentUri,
  isGitHubSignInUrl,
  isValidId,
  parseCompleteRequest,
  parseCopilotSync,
  parseRange,
  type CopilotCompleteResult,
  type CopilotState,
  type CopilotStatus,
  type CopilotSuggestion,
  type LspRange
} from '@shared/ai/copilot'
import type { AppSettings } from '@shared/settings'
import {
  CONNECTION_CLOSED,
  REQUEST_CANCELLED,
  RpcConnection,
  RpcRequestError,
  SERVER_CANCELLED
} from './jsonRpc'

/** The running language server, as the service sees it. */
export interface CopilotProcess {
  stdout: Readable
  stdin: Writable
  kill(): void
  onExit(listener: (code: number | null) => void): void
}

export interface CopilotDeps {
  getSettings(): AppSettings['ai']
  /** Starts the language server; null when it cannot be found on this computer. */
  launch(): CopilotProcess | null
  openExternal(url: string): Promise<void>
  /** Removes the stored account session from disk (the process is stopped when this runs). */
  clearSession?(): Promise<void>
  onStatus(status: CopilotStatus): void
  clientVersion: string
  /** Milliseconds to wait before restarting after a crash; tests shorten it. */
  restartDelayMs?: number
}

const REQUEST_TIMEOUT_MS = 30_000
const COMPLETION_TIMEOUT_MS = 20_000
const MAX_RESTARTS = 3
const RESTART_WINDOW_MS = 60_000
const MAX_REMEMBERED_ITEMS = 50
const MAX_MESSAGE = 300

/** Status text from the server, trimmed so it can be shown but never grows unbounded. */
function clip(text: unknown): string {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE) : ''
}

export interface AuthReading {
  state: CopilotState
  user: string | null
  needsReauth: boolean
  message: string
}

/**
 * Maps the language server's account status (`checkStatus` result or the `auth` entry of
 * `didChangeStatus/v2`) onto the application's states.
 */
export function mapAuthStatus(
  status: unknown,
  user: unknown,
  message: unknown,
  askToReSignin: unknown
): AuthReading {
  const text = clip(message)
  const login = typeof user === 'string' && user !== '' ? user.slice(0, 100) : null
  switch (status) {
    case 'OK':
    case 'MaybeOK':
    case 'AlreadySignedIn':
      return { state: 'signed-in', user: login, needsReauth: false, message: '' }
    case 'NotSignedIn':
      return {
        state: 'signed-out',
        user: null,
        needsReauth: askToReSignin === true,
        message:
          askToReSignin === true ? 'Your GitHub sign-in expired or was revoked. Sign in again.' : ''
      }
    case 'NotAuthorized':
      return {
        state: 'no-access',
        user: login,
        needsReauth: false,
        message:
          text ||
          'This GitHub account has no GitHub Copilot access. Check your subscription or organisation.'
      }
    default:
      return {
        state: 'error',
        user: null,
        needsReauth: false,
        message: text || 'GitHub Copilot reported an unexpected account state.'
      }
  }
}

interface RememberedItem {
  item: Record<string, unknown>
  docId: string
}

/**
 * Runs the GitHub Copilot language server as a managed child process and speaks the Language
 * Server Protocol to it. Everything about the account (the device-code sign-in, the stored
 * session) is handled by the language server itself in an application-private folder; this
 * class only relays status. The renderer can reach it only through validated IPC calls.
 *
 * Exactly one document is shared with the server at a time: the one being edited, and only while
 * Copilot is enabled, signed in and allowed for that document.
 */
export class CopilotService {
  private proc: CopilotProcess | null = null
  private conn: RpcConnection | null = null
  private ready: Promise<boolean> | null = null
  private stopping = false
  private status: CopilotStatus = { ...COPILOT_OFF }
  private openDoc: { id: string; version: number } | null = null
  private sawV2Status = false
  private chain: Promise<unknown> = Promise.resolve()
  private readonly inflight = new Map<string, number>()
  private readonly remembered = new Map<string, RememberedItem>()
  private itemCounter = 0
  private crashTimes: number[] = []
  private restartTimer: NodeJS.Timeout | null = null
  private browserOpened = false

  constructor(private readonly deps: CopilotDeps) {}

  getStatus(): CopilotStatus {
    return this.status
  }

  /** True while Copilot is selected, AI is on, and no server error forbids using it. */
  private wanted(): boolean {
    const ai = this.deps.getSettings()
    return ai.enabled && ai.provider === 'github-copilot'
  }

  private set(patch: Partial<CopilotStatus>): void {
    const next = { ...this.status, ...patch }
    if (JSON.stringify(next) === JSON.stringify(this.status)) return
    this.status = next
    this.deps.onStatus(next)
  }

  /** Starts or stops the language server to match the settings. Safe to call at any time. */
  async reconcile(): Promise<CopilotStatus> {
    if (!this.wanted()) {
      await this.stop()
      this.set({ ...COPILOT_OFF, generation: this.status.generation })
    } else if (!this.conn && !this.ready) {
      void this.start()
    }
    return this.status
  }

  private start(): Promise<boolean> {
    if (this.ready) return this.ready
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.stopping = false
    this.ready = this.boot().finally(() => {
      if (!this.conn) this.ready = null
    })
    return this.ready
  }

  private async boot(): Promise<boolean> {
    this.set({ state: 'starting', message: '' })
    let proc: CopilotProcess | null
    try {
      proc = this.deps.launch()
    } catch {
      proc = null
    }
    if (!proc) {
      this.set({
        state: 'unavailable',
        message: 'The GitHub Copilot language server was not found in this installation.'
      })
      return false
    }
    this.proc = proc
    const conn = new RpcConnection(proc.stdout, proc.stdin, {
      onNotification: (method, params) => this.onNotification(method, params),
      onRequest: (method, params) => this.onServerRequest(method, params),
      onClose: (reason) => this.onClosed(conn, reason)
    })
    this.conn = conn
    proc.onExit(() => conn.close('The language server stopped.'))
    this.sawV2Status = false
    try {
      const init = (await conn.request(
        'initialize',
        {
          processId: process.pid,
          capabilities: { window: { showDocument: { support: true } }, workspace: {} },
          initializationOptions: {
            editorInfo: { name: 'Markdown Studio', version: this.deps.clientVersion },
            editorPluginInfo: { name: 'Markdown Studio Copilot', version: this.deps.clientVersion }
          }
        },
        REQUEST_TIMEOUT_MS
      ).promise) as { serverInfo?: { version?: unknown } } | null
      conn.notify('initialized', {})
      conn.notify('workspace/didChangeConfiguration', { settings: {} })
      const version = init?.serverInfo?.version
      this.set({
        serverVersion: typeof version === 'string' ? version.slice(0, 40) : null,
        generation: this.status.generation + 1
      })
      await this.refreshAuth()
      return true
    } catch (error) {
      if (this.conn === conn) {
        this.dropConnection()
        this.set({
          state: 'error',
          message: `The GitHub Copilot language server could not be started${error instanceof Error && error.message ? ` (${clip(error.message)})` : ''}.`
        })
      }
      return false
    }
  }

  private dropConnection(): void {
    const proc = this.proc
    const conn = this.conn
    this.conn = null
    this.proc = null
    this.ready = null
    this.openDoc = null
    this.inflight.clear()
    this.remembered.clear()
    conn?.close('Stopped.')
    try {
      proc?.kill()
    } catch {
      /* already gone */
    }
  }

  private onClosed(conn: RpcConnection, reason: string): void {
    if (this.conn !== conn) return
    const intentional = this.stopping
    this.dropConnection()
    if (intentional || !this.wanted()) return
    const now = Date.now()
    this.crashTimes = this.crashTimes.filter((t) => now - t < RESTART_WINDOW_MS)
    this.crashTimes.push(now)
    if (this.crashTimes.length > MAX_RESTARTS) {
      this.set({
        state: 'error',
        message:
          'The GitHub Copilot language server keeps stopping. Turn Copilot off and on again to retry.',
        generation: this.status.generation + 1
      })
      return
    }
    this.set({ state: 'starting', message: clip(reason), generation: this.status.generation + 1 })
    const delay = (this.deps.restartDelayMs ?? 500) * 2 ** (this.crashTimes.length - 1)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (this.wanted()) void this.start()
    }, delay)
  }

  /** Ends the process immediately (application quit). */
  dispose(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.stopping = true
    this.dropConnection()
  }

  /** Stops the server; used when Copilot is switched off, on sign-out and at quit. */
  async stop(): Promise<void> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    const conn = this.conn
    if (!conn) return
    this.stopping = true
    try {
      await conn.request('shutdown', null, 1500).promise
      conn.notify('exit')
    } catch {
      /* the process is killed below either way */
    }
    this.dropConnection()
  }

  /** Runs `job` after every earlier document operation, so the server sees them in order. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job)
    this.chain = run.catch(() => undefined)
    return run
  }

  // ---- Account -----------------------------------------------------------------------------

  private async refreshAuth(): Promise<void> {
    const conn = this.conn
    if (!conn) return
    try {
      const result = (await conn.request('checkStatus', {}, REQUEST_TIMEOUT_MS).promise) as {
        status?: unknown
        user?: unknown
      } | null
      this.applyAuth(mapAuthStatus(result?.status, result?.user, '', false))
    } catch {
      this.set({ state: 'error', message: 'Could not read the GitHub Copilot account status.' })
    }
  }

  private applyAuth(reading: AuthReading): void {
    // A "not signed in" report must not cancel a sign-in the user is in the middle of.
    if (this.status.state === 'pending' && reading.state === 'signed-out') return
    // An expired sign-in stays flagged until the user signs in (or out) again, even if a later,
    // plainer "not signed in" report arrives.
    const keepReauth =
      reading.state === 'signed-out' &&
      this.status.state === 'signed-out' &&
      this.status.needsReauth
    this.set({
      state: reading.state,
      user: reading.user,
      needsReauth: reading.needsReauth || keepReauth,
      message: keepReauth && reading.message === '' ? this.status.message : reading.message,
      userCode: null,
      verificationUri: null
    })
  }

  async signIn(): Promise<CopilotStatus> {
    if (!this.wanted()) return this.status
    if (!(await this.start())) return this.status
    if (this.status.state === 'signed-in' || this.status.state === 'pending') return this.status
    const conn = this.conn
    if (!conn) return this.status
    let reply: Record<string, unknown> | null
    try {
      reply = (await conn.request('signIn', {}, REQUEST_TIMEOUT_MS).promise) as Record<
        string,
        unknown
      > | null
    } catch (error) {
      this.set({
        state: 'signed-out',
        message: `Could not start the GitHub sign-in${error instanceof Error && error.message ? `: ${clip(error.message)}` : '.'}`
      })
      return this.status
    }
    if (reply?.status === 'AlreadySignedIn') {
      this.applyAuth(mapAuthStatus('OK', reply.user, '', false))
      return this.status
    }
    const code = reply?.userCode
    if (
      reply?.status !== 'PromptUserDeviceFlow' ||
      typeof code !== 'string' ||
      !/^[A-Za-z0-9-]{4,32}$/.test(code)
    ) {
      this.set({ state: 'signed-out', message: 'GitHub did not return a sign-in code. Try again.' })
      return this.status
    }
    const uri = isGitHubSignInUrl(reply.verificationUri)
      ? reply.verificationUri
      : 'https://github.com/login/device'
    this.browserOpened = false
    this.set({
      state: 'pending',
      userCode: code,
      verificationUri: uri,
      message: '',
      needsReauth: false
    })
    const expiresIn =
      typeof reply.expiresIn === 'number' ? Math.min(Math.max(reply.expiresIn, 60), 1800) : 900
    // The language server polls GitHub while this command is running and opens the browser through
    // window/showDocument. It finishes when the user has authorised the device (or the code expires).
    conn
      .request(
        'workspace/executeCommand',
        { command: 'github.copilot.finishDeviceFlow', arguments: [] },
        (expiresIn + 30) * 1000
      )
      .promise.then(
        () => this.finishSignIn(conn),
        (error: unknown) => {
          if (this.conn !== conn || this.status.state !== 'pending') return
          if (error instanceof RpcRequestError && error.code === CONNECTION_CLOSED) return
          this.set({
            state: 'signed-out',
            userCode: null,
            verificationUri: null,
            message: 'The GitHub sign-in did not complete. Try again.'
          })
        }
      )
    // If the server did not open a browser by itself, do it here (the user asked to sign in).
    setTimeout(() => {
      if (!this.browserOpened && this.status.state === 'pending' && this.status.verificationUri) {
        void this.openSignIn(this.status.verificationUri)
      }
    }, 2000)
    return this.status
  }

  private async finishSignIn(conn: RpcConnection): Promise<void> {
    if (this.conn !== conn) return
    // finishDeviceFlow answering means GitHub accepted the code; read the resulting account.
    const wasPending = this.status.state === 'pending'
    if (wasPending) this.set({ state: 'starting' })
    await this.refreshAuth()
    if (wasPending && this.status.state === 'starting') {
      this.set({ state: 'signed-out', message: 'The GitHub sign-in did not complete. Try again.' })
    }
  }

  private async openSignIn(url: string): Promise<boolean> {
    if (!isGitHubSignInUrl(url)) return false
    this.browserOpened = true
    try {
      await this.deps.openExternal(url)
      return true
    } catch {
      return false
    }
  }

  /** Abandons a sign-in that is waiting for the browser. */
  async cancelSignIn(): Promise<CopilotStatus> {
    if (this.status.state !== 'pending') return this.status
    await this.restart()
    return this.status
  }

  async signOut(): Promise<CopilotStatus> {
    const conn = this.conn
    if (conn) {
      try {
        await conn.request('signOut', {}, REQUEST_TIMEOUT_MS).promise
      } catch {
        /* a fresh process below drops any remaining session in memory */
      }
    }
    // Stop the process, delete the stored session whatever the server did, then start a fresh
    // process, so neither disk nor memory keeps anything of the previous account.
    this.set({ needsReauth: false, message: '' })
    await this.stop()
    try {
      await this.deps.clearSession?.()
    } catch {
      this.set({
        message: 'The stored sign-in could not be deleted. Remove the copilot folder manually.'
      })
    }
    await this.restart()
    return this.status
  }

  private async restart(): Promise<void> {
    await this.stop()
    this.set({ userCode: null, verificationUri: null, generation: this.status.generation + 1 })
    if (this.wanted()) await this.start()
  }

  // ---- Documents ---------------------------------------------------------------------------

  private canShare(): boolean {
    return this.wanted() && this.status.state === 'signed-in' && this.conn !== null
  }

  /** Applies one document event from the editor. Returns false if the caller must send the document again. */
  sync(input: unknown): Promise<boolean> {
    const event = parseCopilotSync(input)
    if (!event) return Promise.resolve(false)
    return this.enqueue(async () => {
      const conn = this.conn
      if (event.op === 'close') {
        if (conn && this.openDoc?.id === event.id) {
          conn.notify('textDocument/didClose', {
            textDocument: { uri: copilotDocumentUri(event.id) }
          })
          this.openDoc = null
          this.forgetItems()
        }
        return true
      }
      if (!conn || !this.canShare()) return false
      if (event.op === 'open') {
        if (this.openDoc) {
          conn.notify('textDocument/didClose', {
            textDocument: { uri: copilotDocumentUri(this.openDoc.id) }
          })
          this.forgetItems()
        }
        const uri = copilotDocumentUri(event.id)
        conn.notify('textDocument/didOpen', {
          textDocument: { uri, languageId: 'markdown', version: event.version, text: event.text }
        })
        conn.notify('textDocument/didFocus', { textDocument: { uri } })
        this.openDoc = { id: event.id, version: event.version }
        return true
      }
      if (this.openDoc?.id !== event.id || event.version !== this.openDoc.version + 1) {
        // Out of step: drop the server's copy so the editor sends the whole text again.
        if (this.openDoc?.id === event.id) {
          conn.notify('textDocument/didClose', {
            textDocument: { uri: copilotDocumentUri(event.id) }
          })
          this.openDoc = null
        }
        return false
      }
      conn.notify('textDocument/didChange', {
        textDocument: { uri: copilotDocumentUri(event.id), version: event.version },
        contentChanges: event.changes.map((c) => ({ range: c.range, text: c.text }))
      })
      this.openDoc = { id: event.id, version: event.version }
      return true
    })
  }

  private forgetItems(): void {
    this.remembered.clear()
  }

  // ---- Completions -------------------------------------------------------------------------

  async complete(input: unknown): Promise<CopilotCompleteResult> {
    const request = parseCompleteRequest(input)
    if (!request) return { ok: false, code: 'error' }
    if (!this.wanted()) return { ok: false, code: 'disabled' }
    if (this.status.state !== 'signed-in') return { ok: false, code: 'not-signed-in' }
    // Wait for earlier document events so the server has the text this position refers to.
    await this.chain
    const conn = this.conn
    const open = this.openDoc
    if (!conn || !this.canShare()) return { ok: false, code: 'unavailable' }
    if (!open || open.id !== request.id || open.version !== request.version) {
      return { ok: false, code: 'stale' }
    }
    const { id: rpcId, promise } = conn.request(
      'textDocument/inlineCompletion',
      {
        textDocument: { uri: copilotDocumentUri(request.id), version: request.version },
        position: { line: request.line, character: request.character },
        context: { triggerKind: request.trigger === 'invoked' ? 1 : 2 },
        formattingOptions: { tabSize: request.tabSize, insertSpaces: request.insertSpaces }
      },
      COMPLETION_TIMEOUT_MS
    )
    this.inflight.set(request.requestId, rpcId)
    try {
      const raw = (await promise) as { items?: unknown } | unknown[] | null
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : []
      if (this.openDoc?.id !== request.id || this.openDoc.version !== request.version) {
        return { ok: false, code: 'stale' }
      }
      return {
        ok: true,
        suggestions: this.acceptItems(list, request.id, request.line, request.character)
      }
    } catch (error) {
      if (error instanceof RpcRequestError) {
        if (error.code === REQUEST_CANCELLED || error.code === SERVER_CANCELLED)
          return { ok: false, code: 'cancelled' }
        if (error.code === CONNECTION_CLOSED) return { ok: false, code: 'unavailable' }
        void this.refreshAuth()
        return {
          ok: false,
          code: /connect|network|fetch|ENOTFOUND|ECONN|timed? ?out|HTTP/i.test(error.message)
            ? 'network'
            : 'error'
        }
      }
      return { ok: false, code: 'error' }
    } finally {
      this.inflight.delete(request.requestId)
    }
  }

  private acceptItems(
    list: unknown[],
    docId: string,
    line: number,
    character: number
  ): CopilotSuggestion[] {
    const out: CopilotSuggestion[] = []
    for (const raw of list.slice(0, 5)) {
      if (typeof raw !== 'object' || raw === null) continue
      const item = raw as Record<string, unknown>
      const text = item.insertText
      if (
        typeof text !== 'string' ||
        text === '' ||
        text.length > COPILOT_LIMITS.suggestionCharacters
      )
        continue
      const range: LspRange | null =
        item.range === undefined
          ? { start: { line, character }, end: { line, character } }
          : parseRange(item.range)
      if (!range) continue
      const key = `c${++this.itemCounter}`
      this.remembered.set(key, { item, docId })
      if (this.remembered.size > MAX_REMEMBERED_ITEMS) {
        this.remembered.delete(this.remembered.keys().next().value as string)
      }
      out.push({ key, text, range })
    }
    return out
  }

  cancel(requestId: unknown): void {
    if (!isValidId(requestId)) return
    const rpcId = this.inflight.get(requestId)
    if (rpcId !== undefined) this.conn?.cancel(rpcId)
  }

  /** Reports to the server that a suggestion was displayed. */
  shown(key: unknown): void {
    const entry = this.lookup(key)
    if (entry) this.conn?.notify('textDocument/didShowCompletion', { item: entry.item })
  }

  /** Reports a partly accepted suggestion; `acceptedLength` counts from the start of its text. */
  partiallyAccepted(key: unknown, acceptedLength: unknown): void {
    const entry = this.lookup(key)
    if (
      !entry ||
      typeof acceptedLength !== 'number' ||
      !Number.isInteger(acceptedLength) ||
      acceptedLength < 0
    )
      return
    this.conn?.notify('textDocument/didPartiallyAcceptCompletion', {
      item: entry.item,
      acceptedLength
    })
  }

  /**
   * Runs the acceptance command that came with the suggestion, as the protocol requires. Only the
   * documented command is executed; the renderer cannot supply a command of its own.
   */
  accepted(key: unknown): void {
    const entry = this.lookup(key)
    const command = entry?.item.command as { command?: unknown; arguments?: unknown } | undefined
    if (!entry || command?.command !== COPILOT_ACCEPT_COMMAND) return
    const args = Array.isArray(command.arguments) ? command.arguments.slice(0, 4) : []
    this.conn
      ?.request(
        'workspace/executeCommand',
        { command: COPILOT_ACCEPT_COMMAND, arguments: args },
        REQUEST_TIMEOUT_MS
      )
      .promise.catch(() => undefined)
  }

  private lookup(key: unknown): RememberedItem | null {
    if (typeof key !== 'string' || !this.canShare()) return null
    const entry = this.remembered.get(key)
    return entry && entry.docId === this.openDoc?.id ? entry : null
  }

  // ---- Messages from the server ------------------------------------------------------------

  private onNotification(method: string, params: unknown): void {
    const p = (params ?? {}) as Record<string, unknown>
    if (method === 'didChangeStatus/v2' && Array.isArray(p.statuses)) {
      this.sawV2Status = true
      const auth = (p.statuses as Record<string, unknown>[]).find((s) => s?.category === 'auth')
      if (auth) {
        const result = (auth.result ?? {}) as Record<string, unknown>
        this.applyAuth(mapAuthStatus(result.status, result.user, auth.message, auth.askToReSignin))
      }
      return
    }
    if (method === 'didChangeStatus' && !this.sawV2Status && p.kind === 'Error') {
      this.applyAuth(mapAuthStatus('NotSignedIn', null, p.message, false))
      return
    }
    if (method === 'window/showMessage') {
      const message = clip(p.message)
      if (message && this.status.state === 'signed-in') this.set({ message })
    }
  }

  private async onServerRequest(method: string, params: unknown): Promise<unknown> {
    const p = (params ?? {}) as Record<string, unknown>
    switch (method) {
      case 'window/showDocument':
        return { success: await this.openSignIn(typeof p.uri === 'string' ? p.uri : '') }
      case 'window/showMessageRequest': {
        // Account and quota notices (for example "monthly limit reached"). Shown, never auto-answered.
        const message = clip(p.message)
        if (message) this.set({ message })
        return null
      }
      case 'workspace/configuration':
        return Array.isArray(p.items) ? p.items.map(() => null) : []
      case 'workspace/workspaceFolders':
        return null
      case 'client/registerCapability':
      case 'client/unregisterCapability':
      case 'window/workDoneProgress/create':
        return null
      default:
        throw new Error(`Unsupported request ${method}`)
    }
  }
}
