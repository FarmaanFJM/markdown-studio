import { describe, expect, it } from 'vitest'
import { DIAGRAM_LIMITS, validateDiagramRequest } from '@shared/diagram'

const valid = {
  id: 'd1',
  source: 'flowchart TD\n A --> B',
  variant: 'light',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  accent: '#10b981',
  text: '#111111',
  background: '#ffffff',
  svgId: 'ms-mmd-0123456789abcdef'
}

describe('diagram render requests', () => {
  it('accepts a well-formed request', () => {
    const result = validateDiagramRequest(valid)
    expect(result.ok).toBe(true)
  })

  const bad: Record<string, Record<string, unknown>> = {
    'empty source': { source: '   ' },
    'huge source': { source: 'a'.repeat(DIAGRAM_LIMITS.sourceChars + 1) },
    'unknown variant': { variant: 'sepia' },
    'font injection': { fontFamily: 'Arial; background:url(x)' },
    'script in font': { fontFamily: '<script>' },
    'colour injection': { accent: 'red;x' },
    'bad svg id': { svgId: '1"><script>' },
    'missing id': { id: '' },
    'long id': { id: 'x'.repeat(100) }
  }
  for (const [name, patch] of Object.entries(bad)) {
    it(`rejects ${name}`, () => {
      expect(validateDiagramRequest({ ...valid, ...patch }).ok).toBe(false)
    })
  }

  it('states the size limit in plain words', () => {
    const result = validateDiagramRequest({ ...valid, source: 'a'.repeat(60_000) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('50,000 characters')
  })

  it('rejects non-objects', () => {
    for (const value of [null, undefined, 'x', 3, []]) expect(validateDiagramRequest(value).ok).toBe(false)
  })
})
