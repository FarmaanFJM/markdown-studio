import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsPatch } from '@shared/settings'

const update = vi.fn<(patch: SettingsPatch) => Promise<unknown>>()

vi.mock('../../src/renderer/src/bridge', () => ({
  api: {
    settings: {
      update: (patch: SettingsPatch) => update(patch),
      get: () => Promise.resolve({})
    }
  }
}))

describe('settings store persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    update.mockReset()
    update.mockResolvedValue(undefined)
  })
  afterEach(() => vi.useRealTimers())

  it('applies a change at once and persists only the last of several quick provider choices', async () => {
    const { useSettings } = await import('../../src/renderer/src/state/settings')
    useSettings.getState().update({ ai: { provider: 'github-copilot' } })
    expect(useSettings.getState().settings.ai.provider).toBe('github-copilot')
    useSettings.getState().update({ ai: { provider: 'openai-compatible' } })
    useSettings.getState().update({ ai: { provider: 'github-copilot' } })
    expect(update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0]).toEqual({ ai: { provider: 'github-copilot' } })
  })

  it('keeps other provider fields untouched and orders later changes after earlier ones', async () => {
    const { useSettings, flushSettings } = await import('../../src/renderer/src/state/settings')
    useSettings.getState().update({ ai: { provider: 'openai-compatible', model: 'm' } })
    await flushSettings()
    useSettings.getState().update({ ai: { provider: 'github-copilot' } })
    await flushSettings()
    expect(update.mock.calls.map((c) => c[0])).toEqual([
      { ai: { provider: 'openai-compatible', model: 'm' } },
      { ai: { provider: 'github-copilot' } }
    ])
    // The provider switch never wrote the other provider's fields.
    expect(update.mock.calls[1][0].ai).not.toHaveProperty('model')
    expect(useSettings.getState().settings.ai.model).toBe('m')
  })

  it('flushes a pending change immediately on request (used when the window closes)', async () => {
    const { useSettings, flushSettings } = await import('../../src/renderer/src/state/settings')
    useSettings.getState().update({ ai: { enabled: true } })
    await flushSettings()
    expect(update).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
