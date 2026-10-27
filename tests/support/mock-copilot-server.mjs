// A deterministic stand-in for the GitHub Copilot language server, used only by the automated
// tests. It speaks the same LSP subset (initialize, text synchronisation, signIn / signOut /
// checkStatus, textDocument/inlineCompletion and the acceptance commands), keeps its own copy of
// the synchronised document, and writes every message it receives to a log the tests read.
// It never contacts a network and never uses real credentials.
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const stateRoot = path.resolve(process.env.XDG_CONFIG_HOME ?? '.', '..')
const sessionFile = path.join(stateRoot, 'config', 'github-copilot', 'mock-session.json')
const logFile = path.join(stateRoot, 'mock-log.jsonl')
const behaviorFile = path.join(stateRoot, 'mock-behavior.json')
mkdirSync(path.dirname(sessionFile), { recursive: true })

const log = (entry) => appendFileSync(logFile, `${JSON.stringify(entry)}\n`)
const behavior = () => {
  try {
    return JSON.parse(readFileSync(behaviorFile, 'utf8'))
  } catch {
    return {}
  }
}

const documents = new Map()
const delayed = new Map()
let buffer = Buffer.alloc(0)

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8')
  process.stdout.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]))
}
const reply = (id, result) => send({ id, result })
const fail = (id, code, message) => send({ id, error: { code, message } })

function session() {
  try {
    return JSON.parse(readFileSync(sessionFile, 'utf8'))
  } catch {
    return null
  }
}

function announce() {
  const s = session()
  send({
    method: 'didChangeStatus/v2',
    params: {
      statuses: [
        s
          ? { category: 'auth', kind: 'Normal', result: { status: 'OK', user: s.user } }
          : {
              category: 'auth',
              kind: 'Error',
              message: 'You are not signed into GitHub.',
              askToReSignin: Boolean(behavior().expired),
              result: { status: 'NotSignedIn' }
            }
      ]
    }
  })
}

function offsetAt(text, position) {
  let line = 0
  let index = 0
  while (line < position.line) {
    const next = text.indexOf('\n', index)
    if (next < 0) return text.length
    index = next + 1
    line++
  }
  return Math.min(index + position.character, text.length)
}

function applyChange(text, change) {
  if (!change.range) return change.text
  const start = offsetAt(text, change.range.start)
  const end = offsetAt(text, change.range.end)
  return text.slice(0, start) + change.text + text.slice(end)
}

function suggestionFor(before) {
  const line = before.split('\n').pop()
  if (/effective because$/.test(line)) return ' it keeps the player immersed in the story.'
  if (/^\s*$/.test(line)) return null
  return ' and this is the mock continuation.'
}

function handleRequest(id, method, params) {
  switch (method) {
    case 'initialize':
      return reply(id, {
        capabilities: {
          textDocumentSync: { openClose: true, change: 2 },
          inlineCompletionProvider: {}
        },
        serverInfo: { name: 'Mock GitHub Copilot Language Server', version: '0.0.0-mock' }
      })
    case 'shutdown':
      return reply(id, null)
    case 'checkStatus': {
      const s = session()
      return reply(id, s ? { status: 'OK', user: s.user } : { status: 'NotSignedIn' })
    }
    case 'signIn': {
      if (behavior().signInFails)
        return fail(id, 1001, 'Could not log in with device flow: mock failure')
      const s = session()
      if (s) return reply(id, { status: 'AlreadySignedIn', user: s.user })
      return reply(id, {
        status: 'PromptUserDeviceFlow',
        userCode: 'MOCK-1234',
        verificationUri: 'https://github.com/login/device',
        expiresIn: 900,
        interval: 5,
        command: {
          command: 'github.copilot.finishDeviceFlow',
          title: 'Sign in with GitHub',
          arguments: []
        }
      })
    }
    case 'signOut':
      if (!behavior().signOutNoop) rmSync(sessionFile, { force: true })
      announce()
      return reply(id, { status: 'NotSignedIn' })
    case 'workspace/executeCommand': {
      if (params.command === 'github.copilot.finishDeviceFlow') {
        const wait = Number(behavior().authDelayMs ?? 700)
        if (behavior().showDocument) {
          send({
            id: 9001,
            method: 'window/showDocument',
            params: { uri: behavior().showDocument, external: true }
          })
        }
        return void setTimeout(() => {
          const outcome = behavior().authOutcome ?? 'success'
          if (outcome === 'denied') return fail(id, 1002, 'The authorisation was denied.')
          if (outcome === 'no-access') {
            writeFileSync(sessionFile, JSON.stringify({ user: 'mock-user', noAccess: true }))
          } else {
            writeFileSync(sessionFile, JSON.stringify({ user: 'mock-user' }))
          }
          reply(id, { status: 'OK', user: 'mock-user' })
          announce()
        }, wait)
      }
      if (params.command === 'github.copilot.didAcceptCompletionItem') {
        log({ method: 'accepted', arguments: params.arguments })
        return reply(id, null)
      }
      return fail(id, -32601, 'Unknown command')
    }
    case 'textDocument/inlineCompletion': {
      const { textDocument, position } = params
      const doc = documents.get(textDocument.uri)
      const b = behavior()
      if (!doc || doc.version !== textDocument.version) {
        log({ method: 'completion-stale', uri: textDocument.uri, version: textDocument.version })
        return reply(id, { items: [] })
      }
      const before = doc.text.slice(0, offsetAt(doc.text, position))
      log({
        method: 'completion',
        uri: textDocument.uri,
        version: doc.version,
        position,
        docText: doc.text,
        triggerKind: params.context?.triggerKind
      })
      if (b.crashOnCompletion) {
        rmSync(behaviorFile, { force: true })
        process.exit(3)
      }
      const respond = () => {
        delayed.delete(id)
        const text = b.emptyCompletions ? null : suggestionFor(before)
        if (text === null) return reply(id, { items: [] })
        reply(id, {
          items: [
            {
              insertText: b.suggestion ?? text,
              range: { start: position, end: position },
              command: {
                command: 'github.copilot.didAcceptCompletionItem',
                title: 'Completion accepted',
                arguments: [`mock-${id}`]
              }
            }
          ]
        })
      }
      const latency = Number(b.latencyMs ?? 0)
      if (latency > 0) delayed.set(id, setTimeout(respond, latency))
      else respond()
      return
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`)
  }
}

function handleNotification(method, params) {
  switch (method) {
    case 'initialized':
      return announce()
    case 'textDocument/didOpen': {
      const d = params.textDocument
      documents.set(d.uri, { version: d.version, text: d.text, languageId: d.languageId })
      return log({ method, uri: d.uri, languageId: d.languageId, version: d.version, text: d.text })
    }
    case 'textDocument/didChange': {
      const doc = documents.get(params.textDocument.uri)
      if (!doc) return log({ method, error: 'unknown document' })
      for (const change of params.contentChanges) doc.text = applyChange(doc.text, change)
      doc.version = params.textDocument.version
      return log({ method, uri: params.textDocument.uri, version: doc.version, text: doc.text })
    }
    case 'textDocument/didClose':
      documents.delete(params.textDocument.uri)
      return log({ method, uri: params.textDocument.uri })
    case '$/cancelRequest': {
      const timer = delayed.get(params.id)
      log({ method, id: params.id, wasPending: Boolean(timer) })
      if (timer) {
        clearTimeout(timer)
        delayed.delete(params.id)
        fail(params.id, -32800, 'cancelled')
      }
      return
    }
    case 'exit':
      return process.exit(0)
    default:
      return log({ method })
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd < 0) return
    const length = Number(
      /Content-Length: (\d+)/i.exec(buffer.subarray(0, headerEnd).toString())[1]
    )
    if (buffer.length < headerEnd + 4 + length) return
    const message = JSON.parse(
      buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8')
    )
    buffer = buffer.subarray(headerEnd + 4 + length)
    log({
      received: message.method ?? 'response',
      id: message.id,
      result: message.method ? undefined : message.result
    })
    if (message.id !== undefined && message.method)
      handleRequest(message.id, message.method, message.params ?? {})
    else if (message.method) handleNotification(message.method, message.params ?? {})
  }
})
process.stdin.on('end', () => process.exit(0))
