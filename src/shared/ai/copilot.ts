/**
 * Contracts and validation for the GitHub Copilot integration. The renderer never talks to the
 * Copilot language server and never sees a credential: it sends bounded, validated document
 * events to the main process and receives suggestions and a status object back.
 */

export type CopilotState =
  /** Copilot is not selected or AI is off; no process is running. */
  | 'off'
  /** The language server cannot be found or started on this computer. */
  | 'unavailable'
  | 'starting'
  | 'signed-out'
  /** The device-code sign-in is waiting for the user to finish in the browser. */
  | 'pending'
  | 'signed-in'
  /** Signed in with GitHub, but the account has no Copilot access. */
  | 'no-access'
  | 'error'

export interface CopilotStatus {
  state: CopilotState
  /** GitHub login of the signed-in account; null unless `signed-in`. */
  user: string | null
  /** One-time code the user types on GitHub while `pending`. */
  userCode: string | null
  /** The GitHub page where the code is entered while `pending`. */
  verificationUri: string | null
  /** Human-readable detail: what went wrong, or the latest notice from the service. */
  message: string
  /** The previous sign-in expired or was revoked, so signing in again is required. */
  needsReauth: boolean
  serverVersion: string | null
  /** Increases whenever the language server (re)starts; documents must then be sent again. */
  generation: number
}

export const COPILOT_OFF: CopilotStatus = {
  state: 'off',
  user: null,
  userCode: null,
  verificationUri: null,
  message: '',
  needsReauth: false,
  serverVersion: null,
  generation: 0
}

export const COPILOT_LIMITS = {
  /** Largest document that is sent to Copilot, in UTF-16 code units. */
  documentCharacters: 1_000_000,
  changesPerEvent: 500,
  changeCharacters: 1_000_000,
  idLength: 64,
  suggestionCharacters: 20_000,
  maxDelayMs: 2000
} as const

export interface LspPosition {
  line: number
  character: number
}

export interface LspRange {
  start: LspPosition
  end: LspPosition
}

export interface CopilotChange {
  range: LspRange
  text: string
}

/** One edit to the single document that is currently shared with Copilot. */
export type CopilotSync =
  | { op: 'open'; id: string; version: number; text: string }
  | { op: 'change'; id: string; version: number; changes: CopilotChange[] }
  | { op: 'close'; id: string }

export interface CopilotCompleteRequest {
  /** Client-chosen id, used to cancel the request. */
  requestId: string
  id: string
  version: number
  line: number
  character: number
  /** `invoked` when the user asked for a suggestion, `automatic` while typing. */
  trigger: 'automatic' | 'invoked'
  tabSize: number
  insertSpaces: boolean
}

export interface CopilotSuggestion {
  /** Opaque handle; the renderer reports shown/accepted events by handle, never by command. */
  key: string
  text: string
  range: LspRange
}

export type CopilotCompleteResult =
  | { ok: true; suggestions: CopilotSuggestion[] }
  | {
      ok: false
      code:
        'disabled' | 'not-signed-in' | 'stale' | 'cancelled' | 'network' | 'unavailable' | 'error'
    }

/** Identifier of a document in the language server. Opaque: it never contains a path or name. */
export function copilotDocumentUri(id: string): string {
  return `untitled:markdown-studio-${id}.md`
}

const ID = /^[A-Za-z0-9_-]+$/

export function isValidId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= COPILOT_LIMITS.idLength &&
    ID.test(value)
  )
}

function isInt(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function parsePosition(value: unknown): LspPosition | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  return isInt(v.line, 0, 100_000_000) && isInt(v.character, 0, 100_000_000)
    ? { line: v.line, character: v.character }
    : null
}

export function parseRange(value: unknown): LspRange | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const start = parsePosition(v.start)
  const end = parsePosition(v.end)
  if (!start || !end) return null
  if (end.line < start.line || (end.line === start.line && end.character < start.character)) {
    return null
  }
  return { start, end }
}

/** Validates a document event from the renderer; null when it is malformed or too large. */
export function parseCopilotSync(input: unknown): CopilotSync | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  if (!isValidId(v.id)) return null
  if (v.op === 'close') return { op: 'close', id: v.id }
  if (!isInt(v.version, 1, 2_000_000_000)) return null
  if (v.op === 'open') {
    if (typeof v.text !== 'string' || v.text.length > COPILOT_LIMITS.documentCharacters) return null
    return { op: 'open', id: v.id, version: v.version, text: v.text }
  }
  if (v.op === 'change') {
    if (!Array.isArray(v.changes) || v.changes.length > COPILOT_LIMITS.changesPerEvent) return null
    const changes: CopilotChange[] = []
    for (const raw of v.changes as unknown[]) {
      if (typeof raw !== 'object' || raw === null) return null
      const c = raw as Record<string, unknown>
      const range = parseRange(c.range)
      if (!range || typeof c.text !== 'string' || c.text.length > COPILOT_LIMITS.changeCharacters) {
        return null
      }
      changes.push({ range, text: c.text })
    }
    return { op: 'change', id: v.id, version: v.version, changes }
  }
  return null
}

export function parseCompleteRequest(input: unknown): CopilotCompleteRequest | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  if (!isValidId(v.requestId) || !isValidId(v.id)) return null
  if (!isInt(v.version, 1, 2_000_000_000)) return null
  if (!isInt(v.line, 0, 100_000_000) || !isInt(v.character, 0, 100_000_000)) return null
  if (v.trigger !== 'automatic' && v.trigger !== 'invoked') return null
  if (!isInt(v.tabSize, 1, 16) || typeof v.insertSpaces !== 'boolean') return null
  return {
    requestId: v.requestId,
    id: v.id,
    version: v.version,
    line: v.line,
    character: v.character,
    trigger: v.trigger,
    tabSize: v.tabSize,
    insertSpaces: v.insertSpaces
  }
}

/** Accepts only the commands the Copilot protocol documents for accepted completions. */
export const COPILOT_ACCEPT_COMMAND = 'github.copilot.didAcceptCompletionItem'

/** Whether a URL returned by the language server may be opened in the user's browser. */
export function isGitHubSignInUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      (url.hostname === 'github.com' || url.hostname === 'www.github.com') &&
      (url.port === '' || url.port === '443')
    )
  } catch {
    return false
  }
}
