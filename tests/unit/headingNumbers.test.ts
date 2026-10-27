// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { manualHeadingNumber, startsWithNumber } from '@shared/markdown/headingNumbers'
import { THEME_CSS } from '@shared/presentation/themeCss'
import { renderDocumentBody } from '../../src/renderer/src/markdown/document'

function headings(source: string, selector = 'h1,h2,h3'): HTMLElement[] {
  const host = document.createElement('div')
  host.innerHTML = renderDocumentBody(source, { documentDirectory: null, workspaceRoot: null })
  return [...host.querySelectorAll<HTMLElement>(selector)]
}

describe('typed section numbers', () => {
  it('recognises enumerations', () => {
    expect(manualHeadingNumber('1. Inleiding')?.number).toBe('1')
    expect(manualHeadingNumber('2) Research')?.number).toBe('2')
    expect(manualHeadingNumber('4.1 Vergelijkingstabel')?.number).toBe('4.1')
    expect(manualHeadingNumber('4.1. Vergelijkingstabel')?.number).toBe('4.1')
    expect(manualHeadingNumber('4.1.2 Detail')?.parts).toEqual([4, 1, 2])
  })

  it('does not mistake numbers that belong to the title for enumeration', () => {
    for (const text of [
      '2024 Results',
      '2024. A year in review',
      '3 Reasons to wait',
      '1',
      '1.',
      '12345 users',
      'Chapter 1. Intro',
      'Version 2.0 released',
      'Top 10 tips'
    ]) {
      expect(manualHeadingNumber(text), text).toBeNull()
    }
  })

  it('compares against the number automatic numbering would add', () => {
    expect(startsWithNumber('1. Inleiding', '1')).toBe(true)
    expect(startsWithNumber('1. Inleiding', '2')).toBe(false)
    expect(startsWithNumber('Inleiding', '1')).toBe(false)
  })
})

describe('Professional Report heading numbers', () => {
  const report = { css: THEME_CSS.report }

  it('counts with the report theme counters', () => {
    expect(report.css).toContain('counter-increment: report-h2')
  })

  it('does not number headings that already carry a number', () => {
    const [h1, h2a, h2b, h3] = headings(
      '# 1. Title\n\n## 1. Introduction\n\n## 2. Research\n\n### 2.1 Comparison\n'
    )
    expect(h1.className).not.toContain('manual-number')
    expect(h2a.classList.contains('manual-number')).toBe(true)
    expect(h2b.classList.contains('manual-number')).toBe(true)
    expect(h3.classList.contains('manual-number')).toBe(true)
  })

  it('carries the typed value into the theme counters', () => {
    const [h2, h3] = headings('## 4. Vergelijking\n\n### 4.1 Tabel\n')
    expect(h2.getAttribute('style')).toContain('counter-set: report-h2 4')
    expect(h3.getAttribute('style')).toContain('counter-set: report-h3 1')
  })

  it('keeps numbering headings without a number automatically', () => {
    const items = headings('## Inleiding\n\n### Detail\n\n## Onderzoek\n')
    expect(items.some((h) => h.classList.contains('manual-number'))).toBe(false)
  })

  it('leaves unrelated numbers in titles to the automatic numbering', () => {
    const items = headings('## 2024 Results\n\n## 3 Reasons\n\n### 3.5 million users\n')
    expect(items.some((h) => h.classList.contains('manual-number'))).toBe(false)
  })

  it('only trusts a subsection number that matches its section', () => {
    const [, sub] = headings('## 2. Research\n\n### 7.5 Millions\n')
    expect(sub.classList.contains('manual-number')).toBe(false)
  })

  it('suppresses the generated number and the counter step for typed numbers', () => {
    expect(report.css).toMatch(/h2\.manual-number::before[^{]*\{\s*content:\s*none/)
    expect(report.css).toMatch(/manual-number[^{]*\{\s*counter-increment:\s*none/)
  })
})
