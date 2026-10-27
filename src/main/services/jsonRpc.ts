import type { Readable, Writable } from 'node:stream'

/** A JSON-RPC 2.0 message as it arrives from the language server, after validation. */
export type RpcMessage =
  | { kind: 'request'; id: number | string; method: string; params: unknown }
  | { kind: 'notification'; method: string; params: unknown }
  | { kind: 'response'; id: number | string; result: unknown; error: RpcError | null }

export interface RpcError {
  code: number
  message: string
}

const MAX_MESSAGE_BYTES = 64 * 1024 * 1024
const MAX_HEADER_BYTES = 1024

/**
 * Parses one message object. Anything that is not a well-formed JSON-RPC 2.0 request,
 * notification or response is rejected (returns null) and never reaches the service.
 */
export function validateMessage(raw: unknown): RpcMessage | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const m = raw as Record<string, unknown>
  if (m.jsonrpc !== undefined && m.jsonrpc !== '2.0') return null
  const hasId = m.id !== undefined && m.id !== null
  if (hasId && typeof m.id !== 'number' && typeof m.id !== 'string') return null
  if (typeof m.method === 'string' && m.method !== '') {
    return hasId
      ? { kind: 'request', id: m.id as number | string, method: m.method, params: m.params }
      : { kind: 'notification', method: m.method, params: m.params }
  }
  if (!hasId || m.method !== undefined) return null
  let error: RpcError | null = null
  if (m.error !== undefined) {
    const e = m.error as Record<string, unknown> | null
    if (typeof e !== 'object' || e === null || typeof e.code !== 'number') return null
    error = { code: e.code, message: typeof e.message === 'string' ? e.message : '' }
  }
  return { kind: 'response', id: m.id as number | string, result: m.result ?? null, error }
}

/** Splits a byte stream into `Content-Length` framed messages (the LSP base protocol). */
export class MessageReader {
  private buffer: Buffer = Buffer.alloc(0)

  constructor(
    private readonly onMessage: (message: unknown) => void,
    private readonly onFault: (reason: string) => void
  ) {}

  push(chunk: Buffer): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) {
        if (this.buffer.length > MAX_HEADER_BYTES)
          this.fault('The language server sent an oversized header.')
        return
      }
      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const match = /^content-length:\s*(\d{1,10})\s*$/im.exec(header)
      const length = match ? Number(match[1]) : NaN
      if (!Number.isSafeInteger(length) || length > MAX_MESSAGE_BYTES) {
        return this.fault('The language server sent an invalid message header.')
      }
      const end = headerEnd + 4 + length
      if (this.buffer.length < end) return
      const body = this.buffer.subarray(headerEnd + 4, end).toString('utf8')
      this.buffer = this.buffer.subarray(end)
      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        this.fault('The language server sent a message that is not valid JSON.')
        return
      }
      this.onMessage(parsed)
    }
  }

  private fault(reason: string): void {
    this.buffer = Buffer.alloc(0)
    this.onFault(reason)
  }
}

export function encodeMessage(message: Record<string, unknown>): Buffer {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body])
}

export class RpcRequestError extends Error {
  constructor(
    message: string,
    readonly code: number
  ) {
    super(message)
  }
}

export const REQUEST_CANCELLED = -32800
export const SERVER_CANCELLED = -32802
export const CONNECTION_CLOSED = -32099
export const REQUEST_TIMEOUT = -32098

export interface ConnectionHandlers {
  onNotification(method: string, params: unknown): void
  /** Answers a request from the server; the result (or a thrown error) is sent back. */
  onRequest(method: string, params: unknown): Promise<unknown> | unknown
  onClose(reason: string): void
}

/** One JSON-RPC connection over a pair of streams, with request ids and timeouts. */
export class RpcConnection {
  private nextId = 1
  private closed = false
  private readonly pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }
  >()
  private readonly reader: MessageReader

  constructor(
    input: Readable,
    private readonly output: Writable,
    private readonly handlers: ConnectionHandlers
  ) {
    this.reader = new MessageReader(
      (raw) => this.receive(raw),
      (reason) => this.close(reason)
    )
    input.on('data', (chunk: Buffer) => this.reader.push(chunk))
    input.on('end', () => this.close('The language server closed its output.'))
    output.on('error', () => this.close('The language server input closed.'))
  }

  get isClosed(): boolean {
    return this.closed
  }

  request(
    method: string,
    params: unknown,
    timeoutMs = 30_000
  ): { id: number; promise: Promise<unknown> } {
    const id = this.nextId++
    const promise = new Promise<unknown>((resolve, reject) => {
      if (this.closed)
        return reject(new RpcRequestError('The language server is not running.', CONNECTION_CLOSED))
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.notify('$/cancelRequest', { id })
        reject(
          new RpcRequestError(`The language server did not answer ${method}.`, REQUEST_TIMEOUT)
        )
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.write({ id, method, params })
    })
    return { id, promise }
  }

  notify(method: string, params?: unknown): void {
    this.write({ method, ...(params === undefined ? {} : { params }) })
  }

  /** Asks the server to stop working on a request and fails the waiting caller right away. */
  cancel(id: number): void {
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    clearTimeout(entry.timer)
    this.notify('$/cancelRequest', { id })
    entry.reject(new RpcRequestError('Cancelled.', REQUEST_CANCELLED))
  }

  close(reason: string): void {
    if (this.closed) return
    this.closed = true
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new RpcRequestError(reason, CONNECTION_CLOSED))
    }
    this.pending.clear()
    this.handlers.onClose(reason)
  }

  private write(message: Record<string, unknown>): void {
    if (this.closed) return
    try {
      this.output.write(encodeMessage(message))
    } catch {
      this.close('The language server input closed.')
    }
  }

  private receive(raw: unknown): void {
    const message = validateMessage(raw)
    if (!message) return // Malformed messages are dropped, never interpreted.
    if (message.kind === 'response') {
      if (typeof message.id !== 'number') return
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error)
        entry.reject(new RpcRequestError(message.error.message, message.error.code))
      else entry.resolve(message.result)
      return
    }
    if (message.kind === 'notification') {
      try {
        this.handlers.onNotification(message.method, message.params)
      } catch {
        // A faulty notification handler must not take the connection down.
      }
      return
    }
    void (async () => {
      try {
        const result = await this.handlers.onRequest(message.method, message.params)
        this.write({ id: message.id, result: result ?? null })
      } catch (error) {
        this.write({
          id: message.id,
          error: { code: -32601, message: error instanceof Error ? error.message : 'Unsupported.' }
        })
      }
    })()
  }
}
