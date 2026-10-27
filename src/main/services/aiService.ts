import { promises as fs } from 'node:fs'
import path from 'node:path'
import { checkAiEndpoint, normalizeAiModel } from '@shared/ai/endpoint'
import { buildMessages, cleanReply } from '@shared/ai/prompts'
import { AI_LIMITS, type AiTaskRequest, type AiTaskResult } from '@shared/ai/types'
import type { AiStatus } from '@shared/ipc'
import type { AppSettings } from '@shared/settings'
import { writeFileAtomic } from './atomicWrite'

/** The operating system's credential encryption (Electron's `safeStorage`). */
export interface KeyVault {
  isAvailable(): boolean
  encrypt(plain: string): Uint8Array
  decrypt(data: Uint8Array): string
}

const REQUEST_TIMEOUT_MS = 45_000
const MAX_REPLY_CHARACTERS = 20_000
const MAX_KEY_LENGTH = 400

/**
 * Runs AI writing tasks against the user's configured provider. This is the only place text
 * leaves the application, and only when AI is switched on in Settings and the user triggers an
 * action or has enabled inline suggestions.
 *
 * The API key lives in a file in the application's data folder, encrypted by the operating
 * system (DPAPI, Keychain or libsecret) — never in the settings file and never sent to the page.
 */
export class AiService {
  private readonly running = new Map<string, AbortController>()

  constructor(
    private readonly keyFile: string,
    private readonly getSettings: () => AppSettings['ai'],
    private readonly vault: KeyVault,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async status(): Promise<AiStatus> {
    return {
      hasKey: await fs.access(this.keyFile).then(
        () => true,
        () => false
      ),
      canStoreKey: this.vault.isAvailable()
    }
  }

  async setKey(key: unknown): Promise<AiStatus> {
    if (typeof key !== 'string' || key.trim() === '' || key.length > MAX_KEY_LENGTH) {
      throw new Error('Enter a valid API key.')
    }
    if (!this.vault.isAvailable()) {
      throw new Error(
        'This computer cannot encrypt the key (no system credential store), so it is not stored.'
      )
    }
    await fs.mkdir(path.dirname(this.keyFile), { recursive: true })
    await writeFileAtomic(this.keyFile, this.vault.encrypt(key.trim()))
    return this.status()
  }

  async clearKey(): Promise<AiStatus> {
    await fs.rm(this.keyFile, { force: true })
    return this.status()
  }

  private async readKey(): Promise<string | null> {
    try {
      return this.vault.decrypt(await fs.readFile(this.keyFile))
    } catch {
      return null
    }
  }

  cancel(id: unknown): void {
    if (typeof id !== 'string') return
    this.running.get(id)?.abort()
  }

  async run(id: unknown, input: unknown): Promise<AiTaskResult> {
    const task = sanitizeTask(input)
    const settings = this.getSettings()
    if (typeof id !== 'string' || !task) {
      return { ok: false, code: 'bad-response', message: 'The request was not valid.' }
    }
    if (!settings.enabled || settings.provider !== 'openai-compatible') {
      return { ok: false, code: 'disabled', message: 'AI assistance is switched off.' }
    }
    const endpoint = checkAiEndpoint(settings.endpoint)
    const model = normalizeAiModel(settings.model)
    if (!endpoint.url || !model) {
      return {
        ok: false,
        code: 'not-configured',
        message: 'Set the service address and model in Settings › AI first.'
      }
    }
    const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(endpoint.url)
    const key = await this.readKey()
    if (!key && !local) {
      return { ok: false, code: 'no-key', message: 'Add an API key in Settings › AI first.' }
    }
    if (task.selection.length > AI_LIMITS.selectionCharacters) {
      return { ok: false, code: 'too-large', message: 'The selection is too long to rewrite.' }
    }

    const controller = new AbortController()
    this.running.set(id, controller)
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await this.fetchImpl(`${endpoint.url}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(key ? { authorization: `Bearer ${key}` } : {})
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(task),
          temperature: 0.4,
          max_tokens: task.kind === 'continue' ? 160 : 2000,
          stream: false
        }),
        signal: controller.signal,
        redirect: 'error'
      })
      if (response.status === 401 || response.status === 403) {
        return { ok: false, code: 'unauthorized', message: 'The service rejected the API key.' }
      }
      if (response.status === 429) {
        return {
          ok: false,
          code: 'rate-limited',
          message: 'The service is limiting requests; try again shortly.'
        }
      }
      if (!response.ok) {
        return {
          ok: false,
          code: 'bad-response',
          message: `The service answered with status ${response.status}.`
        }
      }
      const body = (await response.json().catch(() => null)) as {
        choices?: { message?: { content?: unknown } }[]
      } | null
      const content = body?.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        return { ok: false, code: 'bad-response', message: 'The service sent an unexpected reply.' }
      }
      const text = cleanReply(content.slice(0, MAX_REPLY_CHARACTERS))
      if (text === '')
        return { ok: false, code: 'bad-response', message: 'The service returned no text.' }
      return { ok: true, text }
    } catch (error) {
      if (controller.signal.aborted) {
        return { ok: false, code: 'cancelled', message: 'Cancelled.' }
      }
      return {
        ok: false,
        code: 'network',
        message: `Could not reach the service${error instanceof Error ? ` (${error.name})` : ''}.`
      }
    } finally {
      clearTimeout(timer)
      this.running.delete(id)
    }
  }
}

function sanitizeTask(input: unknown): AiTaskRequest | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  if (v.kind !== 'continue' && v.kind !== 'rewrite') return null
  const text = (value: unknown, limit: number) =>
    typeof value === 'string' ? value.slice(0, limit) : ''
  const task: AiTaskRequest = {
    kind: v.kind,
    before: text(v.before, AI_LIMITS.beforeCharacters * 2),
    after: text(v.after, AI_LIMITS.afterCharacters * 2),
    selection: text(v.selection, AI_LIMITS.selectionCharacters + 1),
    instruction: text(v.instruction, AI_LIMITS.instructionCharacters),
    language: text(v.language, 12)
  }
  if (task.kind === 'rewrite' && (task.selection.trim() === '' || task.instruction.trim() === '')) {
    return null
  }
  return task
}
