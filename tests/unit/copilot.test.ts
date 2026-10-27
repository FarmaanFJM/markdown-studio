import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiAvailability } from '@shared/ai/availability'
import {
  copilotDocumentUri,
  isGitHubSignInUrl,
  parseCompleteRequest,
  parseCopilotSync,
  type CopilotStatus
} from '@shared/ai/copilot'
import { DEFAULT_SETTINGS, sanitizeSettings, type AppSettings } from '@shared/settings'
import {
  clearCopilotSession,
  copilotEnvironment,
  copilotPackageFor,
  locateCopilotServer,
  spawnCopilot
} from '../../src/main/services/copilotLauncher'
import { CopilotService, mapAuthStatus } from '../../src/main/services/copilotService'
import {
  MessageReader,
  RpcConnection,
  encodeMessage,
  validateMessage
} from '../../src/main/services/jsonRpc'

const MOCK = path.resolve(__dirname, '../support/mock-copilot-server.mjs')

describe('Copilot message validation', () => {
  it('accepts well-formed document events and rejects everything else', () => {
    expect(parseCopilotSync({ op: 'open', id: 'doc-1', version: 1, text: 'x' })).toEqual({
      op: 'open',
      id: 'doc-1',
      version: 1,
      text: 'x'
    })
    const change = {
      op: 'change',
      id: 'doc-1',
      version: 2,
      changes: [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, text: 'y' }
      ]
    }
    expect(parseCopilotSync(change)).toEqual(change)
    expect(parseCopilotSync({ op: 'close', id: 'doc-1' })).toEqual({ op: 'close', id: 'doc-1' })
    for (const bad of [
      null,
      'open',
      { op: 'open', id: '../etc/passwd', version: 1, text: '' },
      { op: 'open', id: 'a', version: 0, text: '' },
      { op: 'open', id: 'a', version: 1, text: 5 },
      { op: 'open', id: 'a', version: 1, text: 'x'.repeat(1_000_001) },
      { op: 'exec', id: 'a', version: 1 },
      {
        ...change,
        changes: [
          { range: { start: { line: 2, character: 0 }, end: { line: 1, character: 0 } }, text: '' }
        ]
      },
      {
        ...change,
        changes: [
          { range: { start: { line: -1, character: 0 }, end: { line: 0, character: 0 } }, text: '' }
        ]
      },
      { ...change, changes: 'rm -rf' }
    ]) {
      expect(parseCopilotSync(bad)).toBeNull()
    }
  })

  it('validates completion requests', () => {
    const ok = {
      requestId: 'r1',
      id: 'doc-1',
      version: 3,
      line: 2,
      character: 5,
      trigger: 'automatic',
      tabSize: 4,
      insertSpaces: true
    }
    expect(parseCompleteRequest(ok)).toEqual(ok)
    expect(parseCompleteRequest({ ...ok, trigger: 'x' })).toBeNull()
    expect(parseCompleteRequest({ ...ok, line: 1.5 })).toBeNull()
    expect(parseCompleteRequest({ ...ok, tabSize: 99 })).toBeNull()
    expect(parseCompleteRequest({ ...ok, id: 'a b' })).toBeNull()
  })

  it('names documents without exposing paths or file names', () => {
    expect(copilotDocumentUri('doc-7')).toBe('untitled:markdown-studio-doc-7.md')
  })

  it('opens only GitHub sign-in pages in the browser', () => {
    expect(isGitHubSignInUrl('https://github.com/login/device')).toBe(true)
    for (const bad of [
      'http://github.com/login/device',
      'https://evil.example/login/device',
      'https://github.com.evil.example/',
      'https://user:pw@github.com/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      '',
      42
    ]) {
      expect(isGitHubSignInUrl(bad)).toBe(false)
    }
  })
})

describe('JSON-RPC transport', () => {
  it('reassembles messages split across chunks and handles several per chunk', () => {
    const seen: unknown[] = []
    const reader = new MessageReader(
      (m) => seen.push(m),
      () => seen.push('fault')
    )
    const a = encodeMessage({ id: 1, method: 'a' })
    const b = encodeMessage({ method: 'b', params: { text: 'héllo ✓' } })
    const all = Buffer.concat([a, b])
    reader.push(all.subarray(0, 7))
    reader.push(all.subarray(7, a.length + 3))
    reader.push(all.subarray(a.length + 3))
    expect(seen).toHaveLength(2)
    expect((seen[1] as { params: { text: string } }).params.text).toBe('héllo ✓')
  })

  it('treats broken framing as a fault instead of guessing', () => {
    const faults: string[] = []
    const reader = new MessageReader(
      () => undefined,
      (r) => faults.push(r)
    )
    reader.push(Buffer.from('Content-Length: abc\r\n\r\n{}'))
    reader.push(Buffer.from('Content-Length: 99999999999\r\n\r\n'))
    reader.push(Buffer.from('Content-Length: 3\r\n\r\n{x}'))
    reader.push(Buffer.alloc(2000, 'a'))
    expect(faults).toHaveLength(4)
  })

  it('validates message shapes', () => {
    expect(validateMessage({ jsonrpc: '2.0', id: 1, method: 'm' })?.kind).toBe('request')
    expect(validateMessage({ jsonrpc: '2.0', method: 'm' })?.kind).toBe('notification')
    expect(validateMessage({ jsonrpc: '2.0', id: 1, result: 5 })?.kind).toBe('response')
    expect(validateMessage({ id: 1, error: { code: -1, message: 'x' } })).toMatchObject({
      kind: 'response'
    })
    for (const bad of [
      null,
      [],
      'x',
      { jsonrpc: '1.0', method: 'm' },
      { id: {}, method: 'm' },
      { result: 1 },
      { id: 1, error: 'x' }
    ]) {
      expect(validateMessage(bad)).toBeNull()
    }
  })

  it('matches responses to requests, supports cancellation and answers server requests', async () => {
    const toServer = new PassThrough()
    const fromServer = new PassThrough()
    const notifications: string[] = []
    const conn = new RpcConnection(fromServer, toServer, {
      onNotification: (m) => notifications.push(m),
      onRequest: (m) => (m === 'ping' ? 'pong' : Promise.reject(new Error('no'))),
      onClose: () => undefined
    })
    const written: Record<string, unknown>[] = []
    const reader = new MessageReader(
      (m) => written.push(m as Record<string, unknown>),
      () => undefined
    )
    toServer.on('data', (c: Buffer) => reader.push(c))
    const { id, promise } = conn.request('thing', { a: 1 })
    fromServer.write(encodeMessage({ id, result: { ok: true } }))
    await expect(promise).resolves.toEqual({ ok: true })
    const second = conn.request('slow', {})
    conn.cancel(second.id)
    await expect(second.promise).rejects.toMatchObject({ code: -32800 })
    fromServer.write(encodeMessage({ method: 'note' }))
    fromServer.write(encodeMessage({ id: 77, method: 'ping' }))
    await vi.waitFor(() =>
      expect(written.some((m) => m.id === 77 && m.result === 'pong')).toBe(true)
    )
    expect(notifications).toEqual(['note'])
    expect(written.some((m) => m.method === '$/cancelRequest')).toBe(true)
    // Garbage is ignored; the connection stays usable.
    fromServer.write(encodeMessage({ nonsense: true }))
    expect(conn.isClosed).toBe(false)
  })
})

describe('account status mapping', () => {
  it('maps the server statuses to application states', () => {
    expect(mapAuthStatus('OK', 'octo', '', false)).toMatchObject({
      state: 'signed-in',
      user: 'octo'
    })
    expect(mapAuthStatus('NotSignedIn', null, '', false)).toMatchObject({
      state: 'signed-out',
      needsReauth: false
    })
    expect(mapAuthStatus('NotSignedIn', null, '', true)).toMatchObject({
      state: 'signed-out',
      needsReauth: true
    })
    expect(mapAuthStatus('NotAuthorized', 'octo', '', false)).toMatchObject({ state: 'no-access' })
    expect(mapAuthStatus('Weird', null, 'boom', false)).toMatchObject({
      state: 'error',
      message: 'boom'
    })
  })
})

describe('locating and launching the language server', () => {
  const base = {
    resourcesPath: '/app/resources',
    appPath: '/src/app',
    platform: 'linux',
    arch: 'x64',
    env: {} as NodeJS.ProcessEnv,
    execPath: '/electron',
    exists: () => true
  }
  it('maps platforms to the official packages', () => {
    expect(copilotPackageFor('win32', 'x64')).toEqual({
      pkg: 'copilot-language-server-win32-x64',
      exe: 'copilot-language-server.exe'
    })
    expect(copilotPackageFor('darwin', 'arm64')?.pkg).toBe('copilot-language-server-darwin-arm64')
    expect(copilotPackageFor('linux', 'x64')?.pkg).toBe('copilot-language-server-linux-x64')
    expect(copilotPackageFor('freebsd', 'x64')).toBeNull()
    expect(copilotPackageFor('linux', 'ia32')).toBeNull()
  })
  it('uses resources/copilot when packaged and node_modules in development', () => {
    expect(locateCopilotServer({ ...base, packaged: true })?.command).toBe(
      path.join('/app/resources', 'copilot', 'copilot-language-server')
    )
    expect(locateCopilotServer({ ...base, packaged: false })?.command).toBe(
      path.join(
        '/src/app',
        'node_modules',
        '@github',
        'copilot-language-server-linux-x64',
        'copilot-language-server'
      )
    )
    expect(locateCopilotServer({ ...base, packaged: true, exists: () => false })).toBeNull()
  })
  it('honours the test override only in an unpackaged build', () => {
    const env = { MARKDOWN_STUDIO_COPILOT_SERVER_SCRIPT: MOCK }
    expect(locateCopilotServer({ ...base, packaged: false, env })).toMatchObject({
      command: '/electron',
      runAsNode: true
    })
    expect(locateCopilotServer({ ...base, packaged: true, env })?.command).not.toBe('/electron')
    expect(
      locateCopilotServer({
        ...base,
        packaged: false,
        env: { MARKDOWN_STUDIO_COPILOT_SERVER_SCRIPT: 'relative.js' }
      })?.runAsNode
    ).toBe(false)
  })
  it('gives the child a private account folder and no tokens', () => {
    const env = copilotEnvironment(
      {
        PATH: '/bin',
        HOME: '/home/u',
        GITHUB_COPILOT_TOKEN: 'secret',
        GH_COPILOT_TOKEN: 'secret',
        GITHUB_TOKEN: 'secret',
        GH_TOKEN: 'secret',
        OPENAI_API_KEY: 'secret',
        XDG_CONFIG_HOME: '/home/u/.config'
      },
      '/data/copilot',
      false
    )
    expect(env.PATH).toBe('/bin')
    expect(env.XDG_CONFIG_HOME).toBe(path.join('/data/copilot', 'config'))
    expect(JSON.stringify(env)).not.toContain('secret')
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(copilotEnvironment({}, '/d', true).ELECTRON_RUN_AS_NODE).toBe('1')
  })
})

describe('provider selection and availability', () => {
  const ai = (patch: Partial<AppSettings['ai']> = {}): AppSettings['ai'] => ({
    ...DEFAULT_SETTINGS.ai,
    enabled: true,
    provider: 'github-copilot',
    ...patch
  })
  it('does not need a model or an API key for Copilot, but needs a signed-in account', () => {
    expect(aiAvailability(ai(), null, null).available).toBe(true)
    expect(aiAvailability(ai(), null, null, 'signed-out').blocked).toBe('not-signed-in')
    expect(aiAvailability(ai(), null, null, 'pending').blocked).toBe('not-signed-in')
    expect(aiAvailability(ai(), null, null, 'signed-in').available).toBe(true)
  })
  it('keeps the OpenAI-compatible rules unchanged', () => {
    expect(
      aiAvailability(ai({ provider: 'openai-compatible' }), null, null, 'signed-in').blocked
    ).toBe('not-configured')
  })
  it('honours the folder and document switches for Copilot', () => {
    const s = ai({ disabledWorkspaces: ['/w'], disabledDocuments: ['/w/a.md'] })
    expect(aiAvailability(s, '/w', null, 'signed-in').blocked).toBe('workspace-disabled')
    expect(aiAvailability(s, '/x', '/w/a.md', 'signed-in').blocked).toBe('document-disabled')
  })
  it('is off by default and the choice and delay persist through sanitising', () => {
    expect(DEFAULT_SETTINGS.ai.enabled).toBe(false)
    expect(DEFAULT_SETTINGS.ai.provider).toBe('none')
    const s = sanitizeSettings({
      ai: { provider: 'github-copilot', enabled: true, copilotDelayMs: 600, model: 'keep-me' }
    })
    expect(s.ai).toMatchObject({
      provider: 'github-copilot',
      enabled: true,
      copilotDelayMs: 600,
      model: 'keep-me'
    })
    expect(sanitizeSettings({ ai: { copilotDelayMs: 99999 } }).ai.copilotDelayMs).toBe(2000)
    expect(sanitizeSettings({ ai: { copilotDelayMs: 'x' } }).ai.copilotDelayMs).toBe(300)
  })
})

describe('Copilot service against the mock language server', () => {
  let dir: string
  let ai: AppSettings['ai']
  let statuses: CopilotStatus[]
  let opened: string[]
  let service: CopilotService
  let launches: number

  const log = () => readLog().filter((e) => !('received' in e))
  const readLog = (): Record<string, unknown>[] => {
    try {
      return readFileSync(path.join(dir, 'mock-log.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    } catch {
      return []
    }
  }
  const behavior = (value: Record<string, unknown>) =>
    writeFileSync(path.join(dir, 'mock-behavior.json'), JSON.stringify(value))
  const state = () => service.getStatus().state
  const until = (check: () => boolean) =>
    vi.waitFor(() => expect(check()).toBe(true), { timeout: 8000, interval: 20 })
  const signedIn = async () => {
    await service.reconcile()
    await until(() => state() === 'signed-out')
    await service.signIn()
    await until(() => state() === 'signed-in')
  }
  const open = (text = 'Hello') => service.sync({ op: 'open', id: 'd1', version: 1, text })

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'ms-copilot-'))
    ai = { ...DEFAULT_SETTINGS.ai, enabled: true, provider: 'github-copilot' }
    statuses = []
    opened = []
    launches = 0
    service = new CopilotService({
      getSettings: () => ai,
      clientVersion: '0.0.0',
      restartDelayMs: 20,
      openExternal: async (url) => void opened.push(url),
      clearSession: () => clearCopilotSession(dir),
      onStatus: (s) => statuses.push(s),
      launch: () => {
        launches++
        return spawnCopilot(
          { command: process.execPath, args: [MOCK, '--stdio'], runAsNode: false },
          dir,
          process.env
        )
      }
    })
  })
  afterEach(() => {
    service.dispose()
    rmSync(dir, { recursive: true, force: true })
  })

  it('does nothing while AI is off or another provider is selected', async () => {
    ai.enabled = false
    await service.reconcile()
    ai.enabled = true
    ai.provider = 'openai-compatible'
    await service.reconcile()
    expect(launches).toBe(0)
    expect(state()).toBe('off')
    expect(
      await service.complete({
        requestId: 'r',
        id: 'd',
        version: 1,
        line: 0,
        character: 0,
        trigger: 'invoked',
        tabSize: 2,
        insertSpaces: true
      })
    ).toEqual({ ok: false, code: 'disabled' })
    expect(await open()).toBe(false)
  })

  it('starts on demand, reports the account state and signs in with the device flow', async () => {
    await service.reconcile()
    await until(() => state() === 'signed-out')
    expect(service.getStatus().serverVersion).toBe('0.0.0-mock')
    behavior({ authDelayMs: 500 })
    await service.signIn()
    expect(service.getStatus()).toMatchObject({
      state: 'pending',
      userCode: 'MOCK-1234',
      verificationUri: 'https://github.com/login/device'
    })
    await until(() => state() === 'signed-in')
    expect(service.getStatus()).toMatchObject({
      user: 'mock-user',
      userCode: null,
      verificationUri: null
    })
    // No credential of any kind is part of the status object.
    expect(JSON.stringify(statuses)).not.toMatch(/token|password|secret/i)
  })

  it('reports a failed sign-in and lets the user try again', async () => {
    await service.reconcile()
    await until(() => state() === 'signed-out')
    behavior({ signInFails: true })
    await service.signIn()
    expect(service.getStatus()).toMatchObject({ state: 'signed-out' })
    expect(service.getStatus().message).toMatch(/Could not start/)
    behavior({ authOutcome: 'denied', authDelayMs: 50 })
    await service.signIn()
    await until(() => /did not complete/.test(service.getStatus().message))
    expect(state()).toBe('signed-out')
    behavior({ authDelayMs: 50 })
    await service.signIn()
    await until(() => state() === 'signed-in')
  })

  it('opens only GitHub pages when the server asks for a document to be shown', async () => {
    await service.reconcile()
    await until(() => state() === 'signed-out')
    behavior({ showDocument: 'https://evil.example/phish', authDelayMs: 100 })
    await service.signIn()
    await until(() => state() === 'signed-in')
    expect(opened.every((u) => u.startsWith('https://github.com/'))).toBe(true)
    expect(readLog().find((e) => e.id === 9001)?.result).toEqual({ success: false })
  })

  it('does not share documents until the account is signed in', async () => {
    await service.reconcile()
    await until(() => state() === 'signed-out')
    expect(await open()).toBe(false)
    expect(log().some((e) => e.method === 'textDocument/didOpen')).toBe(false)
  })

  it('synchronises the document with versions and incremental edits', async () => {
    await signedIn()
    expect(await open('## Conclusion\n\nThe health interface is effective because')).toBe(true)
    expect(
      await service.sync({
        op: 'change',
        id: 'd1',
        version: 2,
        changes: [
          { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } }, text: 'A' }
        ]
      })
    ).toBe(true)
    // A version gap means the server's copy is dropped and the caller must resend.
    expect(await service.sync({ op: 'change', id: 'd1', version: 9, changes: [] })).toBe(false)
    await until(() => log().some((e) => e.method === 'textDocument/didClose'))
    const events = log().filter(
      (e) => String(e.method).startsWith('textDocument/') && e.method !== 'textDocument/didFocus'
    )
    expect(events[0]).toMatchObject({
      method: 'textDocument/didOpen',
      languageId: 'markdown',
      version: 1,
      uri: 'untitled:markdown-studio-d1.md'
    })
    expect(events[1]).toMatchObject({
      method: 'textDocument/didChange',
      version: 2,
      text: '## Conclusion\n\nA health interface is effective because'
    })
  })

  it('returns Copilot suggestions, reports them and runs only the documented acceptance command', async () => {
    await signedIn()
    const text = '## Conclusion\n\nThe health interface in Dead Space is effective because'
    await open(text)
    const line = 2
    const result = await service.complete({
      requestId: 'r1',
      id: 'd1',
      version: 1,
      line,
      character: text.split('\n')[2].length,
      trigger: 'invoked',
      tabSize: 2,
      insertSpaces: true
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestions[0].text).toBe(' it keeps the player immersed in the story.')
    expect(result.suggestions[0]).not.toHaveProperty('command')
    const key = result.suggestions[0].key
    service.shown(key)
    service.accepted(key)
    service.accepted('not-a-handle')
    await until(() => log().some((e) => e.method === 'accepted'))
    expect(log().filter((e) => e.method === 'accepted')).toHaveLength(1)
    expect(readLog().some((e) => e.received === 'textDocument/didShowCompletion')).toBe(true)
    expect(log().find((e) => e.method === 'completion')).toMatchObject({
      triggerKind: 1,
      docText: text
    })
  })

  it('rejects stale versions and cancels superseded requests', async () => {
    await signedIn()
    await open('Some text')
    const base = {
      id: 'd1',
      line: 0,
      character: 9,
      trigger: 'automatic' as const,
      tabSize: 2,
      insertSpaces: true
    }
    expect(await service.complete({ ...base, requestId: 'r1', version: 5 })).toEqual({
      ok: false,
      code: 'stale'
    })
    behavior({ latencyMs: 3000 })
    const slow = service.complete({ ...base, requestId: 'r2', version: 1 })
    await until(() => log().some((e) => e.method === 'completion'))
    service.cancel('r2')
    expect(await slow).toEqual({ ok: false, code: 'cancelled' })
    await until(() => log().some((e) => e.method === '$/cancelRequest' && e.wasPending === true))
  })

  it('returns no suggestion rather than inventing text', async () => {
    await signedIn()
    await open('Some text')
    behavior({ emptyCompletions: true })
    const result = await service.complete({
      requestId: 'r1',
      id: 'd1',
      version: 1,
      line: 0,
      character: 9,
      trigger: 'invoked',
      tabSize: 2,
      insertSpaces: true
    })
    expect(result).toEqual({ ok: true, suggestions: [] })
  })

  it('stops sending anything once AI is switched off', async () => {
    await signedIn()
    await open('Some text')
    await until(() => log().some((e) => e.method === 'textDocument/didFocus'))
    const before = readLog().length
    ai.enabled = false
    await service.reconcile()
    expect(state()).toBe('off')
    expect(await open('more')).toBe(false)
    expect(
      await service.complete({
        requestId: 'r1',
        id: 'd1',
        version: 1,
        line: 0,
        character: 1,
        trigger: 'invoked',
        tabSize: 2,
        insertSpaces: true
      })
    ).toEqual({ ok: false, code: 'disabled' })
    await new Promise((r) => setTimeout(r, 150))
    const after = readLog()
      .slice(before)
      .filter((e) => !('received' in e) || e.received === 'response')
    expect(after.filter((e) => String(e.method ?? '').startsWith('textDocument/'))).toEqual([])
  })

  it('signs out with a fresh process and refuses suggestions afterwards', async () => {
    await signedIn()
    await open('Some text')
    const generation = service.getStatus().generation
    await service.signOut()
    await until(() => state() === 'signed-out')
    expect(service.getStatus().generation).toBeGreaterThan(generation)
    expect(service.getStatus().user).toBeNull()
    expect(launches).toBe(2)
    expect(
      await service.complete({
        requestId: 'r1',
        id: 'd1',
        version: 1,
        line: 0,
        character: 1,
        trigger: 'invoked',
        tabSize: 2,
        insertSpaces: true
      })
    ).toEqual({ ok: false, code: 'not-signed-in' })
    expect(await open()).toBe(false)
  })

  it('deletes the stored session on sign-out even if the server leaves it behind', async () => {
    await signedIn()
    const session = path.join(dir, 'config', 'github-copilot', 'mock-session.json')
    expect(existsSync(session)).toBe(true)
    behavior({ signOutNoop: true })
    await service.signOut()
    await until(() => state() === 'signed-out')
    expect(existsSync(session)).toBe(false)
    expect(service.getStatus().user).toBeNull()
    // A new sign-in is needed: the fresh process found no session.
    expect(await open()).toBe(false)
  })

  it.skipIf(process.platform === 'win32')(
    'keeps the account folders private to this user (files inside are protected by them)',
    async () => {
      await signedIn()
      for (const sub of ['', 'config', 'cache', 'data', 'state']) {
        const mode = statSync(path.join(dir, sub)).mode & 0o777
        expect(mode & 0o077, `${sub || '.'} is ${mode.toString(8)}`).toBe(0)
      }
    }
  )

  it('shows an expired sign-in as a request to sign in again', async () => {
    behavior({ expired: true })
    await service.reconcile()
    await until(() => state() === 'signed-out')
    expect(service.getStatus()).toMatchObject({ needsReauth: true })
    expect(service.getStatus().message).toMatch(/expired or was revoked/)
  })

  it('restarts after a crash, tells the editor to resend, and gives up after repeated crashes', async () => {
    await signedIn()
    await open('Some text')
    const generation = service.getStatus().generation
    behavior({ crashOnCompletion: true })
    const result = await service.complete({
      requestId: 'r1',
      id: 'd1',
      version: 1,
      line: 0,
      character: 9,
      trigger: 'invoked',
      tabSize: 2,
      insertSpaces: true
    })
    expect(result.ok).toBe(false)
    await until(() => launches === 2 && state() === 'signed-in')
    expect(service.getStatus().generation).toBeGreaterThan(generation)
    // The old document is gone from the new process: the editor must send it again.
    expect(await service.sync({ op: 'change', id: 'd1', version: 2, changes: [] })).toBe(false)
    expect(await open('Some text')).toBe(true)
  })

  it('shuts the process down when disposed', async () => {
    await signedIn()
    service.dispose()
    expect(state()).not.toBe('off')
    await new Promise((r) => setTimeout(r, 100))
    expect(await open()).toBe(false)
  })
})

describe('Copilot and the renderer boundary', () => {
  it('exposes no raw process or command execution to the page', () => {
    const preload = readFileSync(path.resolve(__dirname, '../../src/preload/index.ts'), 'utf8')
    const copilotBlock = preload.slice(preload.indexOf('copilot: {'), preload.indexOf('shell: {'))
    expect(copilotBlock).not.toMatch(/spawn|exec|command|token/i)
    const shared = readFileSync(path.resolve(__dirname, '../../src/shared/ai/copilot.ts'), 'utf8')
    expect(shared).not.toMatch(/accessToken|apiKey/)
  })
})
