import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { aiAvailability, toggledPath } from '@shared/ai/availability'
import { checkAiEndpoint, normalizeAiModel } from '@shared/ai/endpoint'
import { buildMessages, cleanReply, isPlausibleRewrite, tailOf } from '@shared/ai/prompts'
import { AI_LIMITS, AI_PROVIDERS, type AiTaskRequest } from '@shared/ai/types'
import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  sanitizeSettings,
  type AppSettings
} from '@shared/settings'
import { AiService, type KeyVault } from '../../src/main/services/aiService'

type Ai = AppSettings['ai']
const on = (patch: Partial<Ai> = {}): Ai => ({
  ...DEFAULT_SETTINGS.ai,
  enabled: true,
  provider: 'openai-compatible',
  endpoint: 'https://ai.example.com/v1',
  model: 'test-model',
  ...patch
})

describe('AI is optional', () => {
  it('is off by default and sends nothing', () => {
    expect(DEFAULT_SETTINGS.ai.enabled).toBe(false)
    expect(DEFAULT_SETTINGS.ai.provider).toBe('none')
    expect(DEFAULT_SETTINGS.ai.inlineSuggestions).toBe(false)
    expect(aiAvailability(DEFAULT_SETTINGS.ai, null, null)).toEqual({
      available: false,
      blocked: 'off'
    })
  })

  it('reports why it is unavailable, in the order a user would fix it', () => {
    expect(aiAvailability(on({ provider: 'none' }), null, null).blocked).toBe('no-provider')
    expect(aiAvailability(on({ model: '' }), null, null).blocked).toBe('not-configured')
    expect(aiAvailability(on(), null, null).available).toBe(true)
  })

  it('can be switched off per workspace and per document', () => {
    const ai = on({ disabledWorkspaces: ['/work/a'], disabledDocuments: ['/work/b/x.md'] })
    expect(aiAvailability(ai, '/work/a', '/work/a/y.md').blocked).toBe('workspace-disabled')
    expect(aiAvailability(ai, '/work/b', '/work/b/x.md').blocked).toBe('document-disabled')
    expect(aiAvailability(ai, '/work/b', '/work/b/y.md').available).toBe(true)
    expect(aiAvailability(ai, null, null).available).toBe(true)
  })

  it('compares Windows paths case-insensitively', () => {
    const ai = on({ disabledDocuments: ['C:\\Work\\Report.md'] })
    expect(aiAvailability(ai, null, 'c:/work/report.md').blocked).toBe('document-disabled')
  })

  it('adds and removes paths without duplicates', () => {
    expect(toggledPath(['/a'], '/b', true)).toEqual(['/a', '/b'])
    expect(toggledPath(['/a', '/b'], '/b', false)).toEqual(['/a'])
    expect(toggledPath(['/a'], '/a', true)).toEqual(['/a'])
  })
})

describe('AI settings validation', () => {
  it('sanitizes damaged values back to safe defaults', () => {
    const s = sanitizeSettings({
      ai: {
        enabled: 'yes',
        provider: 'skynet',
        endpoint: 'http://evil.example.com/v1',
        model: 'bad model name',
        disabledWorkspaces: ['/ok', 5, '', '/ok'],
        disabledDocuments: 'nope'
      }
    })
    expect(s.ai).toEqual({
      ...DEFAULT_SETTINGS.ai,
      disabledWorkspaces: ['/ok']
    })
  })

  it('keeps a valid configuration through a patch', () => {
    const s = applySettingsPatch(DEFAULT_SETTINGS, {
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        endpoint: 'http://localhost:11434/v1/',
        model: 'llama3.1:8b'
      }
    })
    expect(s.ai).toMatchObject({
      enabled: true,
      provider: 'openai-compatible',
      endpoint: 'http://localhost:11434/v1',
      model: 'llama3.1:8b'
    })
  })

  it('never stores an API key in settings', () => {
    const s = sanitizeSettings({ ai: { apiKey: 'sk-secret', key: 'sk-secret' } })
    expect(JSON.stringify(s)).not.toContain('sk-secret')
  })
})

describe('provider endpoints', () => {
  it('requires https except for this computer', () => {
    expect(checkAiEndpoint('https://api.openai.com/v1').url).toBe('https://api.openai.com/v1')
    expect(checkAiEndpoint('http://localhost:11434/v1').url).toBe('http://localhost:11434/v1')
    expect(checkAiEndpoint('http://127.0.0.1:1234/v1').url).toBe('http://127.0.0.1:1234/v1')
    expect(checkAiEndpoint('http://api.example.com/v1').problem).toMatch(/https/)
  })

  it('refuses credentials, queries, other schemes and junk', () => {
    for (const bad of [
      'https://user:pw@api.example.com/v1',
      'https://api.example.com/v1?key=1',
      'ftp://api.example.com',
      'file:///etc/passwd',
      'not a url',
      '',
      undefined
    ]) {
      expect(checkAiEndpoint(bad).url, String(bad)).toBeNull()
    }
  })

  it('accepts only plausible model names', () => {
    expect(normalizeAiModel('gpt-4o-mini')).toBe('gpt-4o-mini')
    expect(normalizeAiModel('meta-llama/Llama-3.1-8B:free')).toBe('meta-llama/Llama-3.1-8B:free')
    expect(normalizeAiModel('has space')).toBeNull()
    expect(normalizeAiModel('')).toBeNull()
    expect(normalizeAiModel('x'.repeat(200))).toBeNull()
  })
})

describe('provider abstraction', () => {
  it('offers GitHub Copilot and the OpenAI-compatible endpoint, and says what Copilot cannot do', () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual(['github-copilot', 'openai-compatible'])
    const copilot = AI_PROVIDERS.find((p) => p.id === 'github-copilot')!
    expect(copilot.needsKey).toBe(false)
    expect(copilot.capabilities.rewrite).toBe(false)
    expect(copilot.limitations).toMatch(/rewrite/i)
    expect(AI_PROVIDERS.find((p) => p.id === 'openai-compatible')!.capabilities.rewrite).toBe(true)
  })
})

const task = (patch: Partial<AiTaskRequest> = {}): AiTaskRequest => ({
  kind: 'continue',
  before: 'Het onderzoek begon in ',
  after: '',
  selection: '',
  instruction: '',
  language: '',
  ...patch
})

describe('prompts', () => {
  it('marks the cursor in a continuation request', () => {
    const messages = buildMessages(task({ after: ' 2024.' }))
    expect(messages[0].role).toBe('system')
    expect(messages[1].content).toContain('Het onderzoek begon in <cursor/> 2024.')
  })

  it('bounds the text it sends', () => {
    const long = 'a'.repeat(50_000)
    const content = buildMessages(task({ before: long, after: long }))[1].content
    expect(content.length).toBeLessThan(
      AI_LIMITS.beforeCharacters + AI_LIMITS.afterCharacters + 500
    )
    expect(tailOf('abcdef', 3)).toBe('def')
  })

  it('asks to rewrite only the selection', () => {
    const content = buildMessages(
      task({ kind: 'rewrite', selection: 'Dit zijn slechte zin.', instruction: 'Fix grammar' })
    )[1].content
    expect(content).toContain('Instruction: Fix grammar')
    expect(content).toContain('<selection>\nDit zijn slechte zin.\n</selection>')
  })

  it('removes fences and quotes models wrap around a reply', () => {
    expect(cleanReply('```markdown\nHallo wereld\n```')).toBe('Hallo wereld')
    expect(cleanReply('"Hallo wereld"')).toBe('Hallo wereld')
    expect(cleanReply('\n\nHallo wereld  \n')).toBe('Hallo wereld')
    expect(cleanReply('Hij zei "hoi" en "dag"')).toBe('Hij zei "hoi" en "dag"')
  })

  it('refuses rewrites that are empty or run away', () => {
    expect(isPlausibleRewrite('tekst', '   ')).toBe(false)
    expect(isPlausibleRewrite('tekst', 'x'.repeat(5000))).toBe(false)
    expect(isPlausibleRewrite('tekst', 'betere tekst')).toBe(true)
  })
})

describe('AiService', () => {
  let folder: string
  let keyFile: string
  const vault: KeyVault = {
    isAvailable: () => true,
    encrypt: (plain) => Buffer.from([...plain].reverse().join('')),
    decrypt: (data) => [...Buffer.from(data).toString()].reverse().join('')
  }
  let calls: { url: string; init: RequestInit }[]
  let reply: () => Response
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return reply()
  }) as unknown as typeof fetch
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'ms-ai-'))
    keyFile = path.join(folder, 'ai-key.bin')
    calls = []
    reply = () => json({ choices: [{ message: { content: ' en vervolgens ging het door.' } }] })
  })

  const service = (ai: Ai) => new AiService(keyFile, () => ai, vault, fakeFetch)

  it('refuses to run while AI is off, without touching the network', async () => {
    const result = await service(DEFAULT_SETTINGS.ai).run('1', task())
    expect(result).toMatchObject({ ok: false, code: 'disabled' })
    expect(calls).toHaveLength(0)
  })

  it('asks for configuration and for a key before sending anything', async () => {
    expect(await service(on({ model: '' })).run('1', task())).toMatchObject({
      code: 'not-configured'
    })
    expect(await service(on()).run('1', task())).toMatchObject({ code: 'no-key' })
    expect(calls).toHaveLength(0)
  })

  it('stores the key encrypted and outside the settings, and never returns it', async () => {
    const ai = service(on())
    const status = await ai.setKey('sk-test-123')
    expect(status).toEqual({ hasKey: true, canStoreKey: true })
    expect(readFileSync(keyFile).toString()).not.toContain('sk-test-123')
    expect(await ai.clearKey()).toMatchObject({ hasKey: false })
  })

  it('refuses to store a key when the system cannot encrypt it', async () => {
    const weak = new AiService(
      keyFile,
      () => on(),
      { ...vault, isAvailable: () => false },
      fakeFetch
    )
    await expect(weak.setKey('sk-x')).rejects.toThrow(/cannot encrypt/)
    expect((await weak.status()).hasKey).toBe(false)
  })

  it('sends the chat request with the key and returns the cleaned reply', async () => {
    const ai = service(on())
    await ai.setKey('sk-test-123')
    const result = await ai.run('1', task())
    expect(result).toEqual({ ok: true, text: ' en vervolgens ging het door.' })
    expect(calls[0].url).toBe('https://ai.example.com/v1/chat/completions')
    const init = calls[0].init
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test-123')
    expect(init.redirect).toBe('error')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('test-model')
    expect(body.stream).toBe(false)
  })

  it('lets a local model run without a key', async () => {
    const local = service(on({ endpoint: 'http://localhost:11434/v1' }))
    expect(await local.run('1', task())).toMatchObject({ ok: true })
    expect((calls[0].init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('maps provider failures to clear results', async () => {
    const ai = service(on())
    await ai.setKey('k')
    reply = () => json({}, 401)
    expect(await ai.run('1', task())).toMatchObject({ code: 'unauthorized' })
    reply = () => json({}, 429)
    expect(await ai.run('2', task())).toMatchObject({ code: 'rate-limited' })
    reply = () => json({ nope: true })
    expect(await ai.run('3', task())).toMatchObject({ code: 'bad-response' })
    reply = () => {
      throw new TypeError('fetch failed')
    }
    expect(await ai.run('4', task())).toMatchObject({ code: 'network' })
  })

  it('validates what the page sends', async () => {
    const ai = service(on({ endpoint: 'http://localhost:1/v1' }))
    expect(await ai.run('1', { kind: 'delete-everything' })).toMatchObject({ ok: false })
    expect(
      await ai.run('2', task({ kind: 'rewrite', selection: '', instruction: 'x' }))
    ).toMatchObject({ ok: false })
    expect(
      await ai.run('3', task({ kind: 'rewrite', selection: 'x'.repeat(20_000), instruction: 'x' }))
    ).toMatchObject({ code: 'too-large' })
    expect(calls).toHaveLength(0)
  })
})
