import { describe, expect, it } from 'vitest'
import { PREVIEW_LAYOUTS } from '../../src/renderer/src/layout/previewLayouts'

describe('preview controls', () => {
  it('has no separate "source only" opener: closing is the preview panel\'s job', () => {
    expect(PREVIEW_LAYOUTS.map((l) => l.mode)).toEqual(['html', 'pdf'])
    expect(PREVIEW_LAYOUTS.some((l) => /source only/i.test(l.label))).toBe(false)
  })

  it('gives every opener a distinct label', () => {
    expect(new Set(PREVIEW_LAYOUTS.map((l) => l.label)).size).toBe(PREVIEW_LAYOUTS.length)
  })
})
