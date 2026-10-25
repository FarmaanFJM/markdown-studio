import type { LintIssue } from '@shared/lint'
import LintWorker from './lint.worker?worker'
import type { LintResponse } from './lint.worker'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<
  number,
  { resolve(issues: LintIssue[]): void; reject(error: Error): void }
>()

function start(): Worker {
  worker ??= new LintWorker()
  worker.onmessage = (event: MessageEvent<LintResponse>) => {
    const entry = pending.get(event.data.id)
    if (!entry) return
    pending.delete(event.data.id)
    if ('failure' in event.data) entry.reject(new Error(event.data.failure))
    else entry.resolve(event.data.issues)
  }
  worker.onerror = (event) => {
    const reason = event.message ? `: ${event.message}` : ''
    for (const entry of pending.values())
      entry.reject(new Error(`The lint worker stopped${reason}`))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

/** Lints Markdown text in the worker. Rejects if the worker fails; callers keep old markers. */
export function lintText(text: string, config: Record<string, unknown>): Promise<LintIssue[]> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    start().postMessage({ id, text, config })
  })
}

export function stopLintWorker(): void {
  worker?.terminate()
  worker = null
  pending.clear()
}
