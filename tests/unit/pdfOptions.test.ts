import { describe, expect, it } from 'vitest'
import {
  contentHeightPx,
  contentSizeMm,
  DEFAULT_PDF_OPTIONS,
  expandHeaderFooterHtml,
  fromMillimetres,
  minimumHeaderFooterMargin,
  pageSizeMm,
  previewHeaderFooter,
  sanitizePdfOptions,
  toMillimetres,
  toPrintOptions,
  validatePdfOptions,
  type PdfOptions
} from '@shared/export/pdf'

const values = { title: 'My <Report>', file: 'report.md', date: '2026-10-25' }
const opts = (patch: Partial<PdfOptions>): PdfOptions => ({ ...DEFAULT_PDF_OPTIONS, ...patch })

describe('page sizes', () => {
  it('knows the standard sizes in millimetres', () => {
    expect(pageSizeMm(opts({ pageSize: 'A4' }))).toEqual({ width: 210, height: 297 })
    expect(pageSizeMm(opts({ pageSize: 'A5' }))).toEqual({ width: 148, height: 210 })
    expect(pageSizeMm(opts({ pageSize: 'Letter' }))).toEqual({ width: 215.9, height: 279.4 })
    expect(pageSizeMm(opts({ pageSize: 'Legal' }))).toEqual({ width: 215.9, height: 355.6 })
  })

  it('swaps the dimensions in landscape and honours custom sizes', () => {
    expect(pageSizeMm(opts({ pageSize: 'A4', orientation: 'landscape' }))).toEqual({
      width: 297,
      height: 210
    })
    expect(
      pageSizeMm(
        opts({
          pageSize: 'Custom',
          customWidthMm: 120,
          customHeightMm: 200,
          orientation: 'landscape'
        })
      )
    ).toEqual({ width: 200, height: 120 })
  })

  it('computes the printable area', () => {
    expect(contentSizeMm(opts({}))).toEqual({ width: 170, height: 257 })
    expect(contentHeightPx(opts({}))).toBeCloseTo((257 / 25.4) * 96, 3)
  })
})

describe('validation', () => {
  it('accepts the defaults', () => {
    expect(validatePdfOptions(DEFAULT_PDF_OPTIONS).ok).toBe(true)
  })

  const invalid: [string, Partial<PdfOptions>, string][] = [
    ['negative margin', { margins: { top: -1, right: 20, bottom: 20, left: 20 } }, 'margins.top'],
    ['huge margin', { margins: { top: 20, right: 500, bottom: 20, left: 20 } }, 'margins.right'],
    ['NaN margin', { margins: { top: NaN, right: 20, bottom: 20, left: 20 } }, 'margins.top'],
    ['zero-width page', { pageSize: 'Custom', customWidthMm: 0 }, 'customWidthMm'],
    ['tiny page', { pageSize: 'Custom', customHeightMm: 10 }, 'customHeightMm'],
    ['oversized page', { pageSize: 'Custom', customWidthMm: 99999 }, 'customWidthMm'],
    [
      'margins consume the width',
      { margins: { top: 20, right: 95, bottom: 20, left: 95 } },
      'margins.left'
    ],
    [
      'margins consume the height',
      { pageSize: 'A5', margins: { top: 95, right: 20, bottom: 95, left: 20 } },
      'margins.top'
    ],
    ['zero scale', { scale: 0 }, 'scale'],
    ['bad colour', { backgroundColor: 'red' }, 'backgroundColor']
  ]
  for (const [name, patch, field] of invalid) {
    it(`rejects ${name} with a message that names the problem`, () => {
      const result = validatePdfOptions(opts(patch))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        const error = result.errors.find((e) => e.field === field)
        expect(error, JSON.stringify(result.errors)).toBeDefined()
        expect(error!.message.length).toBeGreaterThan(15)
      }
    })
  }

  it('refuses a header or footer that would overlap the text', () => {
    const header = validatePdfOptions(
      opts({
        header: { enabled: true, text: '{title}', align: 'left' },
        margins: { top: 5, right: 20, bottom: 20, left: 20 }
      })
    )
    expect(header.ok).toBe(false)
    const needed = minimumHeaderFooterMargin(9)
    expect(
      validatePdfOptions(
        opts({
          header: { enabled: true, text: '{title}', align: 'left' },
          margins: { top: needed, right: 20, bottom: 20, left: 20 }
        })
      ).ok
    ).toBe(true)
    expect(
      validatePdfOptions(
        opts({
          footer: { enabled: true, text: '{page}', align: 'left' },
          margins: { top: 20, right: 20, bottom: 4, left: 20 }
        })
      ).ok
    ).toBe(false)
  })

  it('never lets lenient sanitising produce a clipped or empty page', () => {
    const result = sanitizePdfOptions({
      pageSize: 'Custom',
      customWidthMm: 0,
      customHeightMm: -5,
      margins: { top: 400, right: 400, bottom: 400, left: 400 },
      scale: 'big'
    })
    expect(validatePdfOptions(result).ok).toBe(true)
    expect(result.customWidthMm).toBeGreaterThan(0)
  })
})

describe('units', () => {
  it('converts millimetres, centimetres and inches', () => {
    expect(toMillimetres(2.54, 'cm')).toBe(25.4)
    expect(toMillimetres(1, 'in')).toBe(25.4)
    expect(fromMillimetres(25.4, 'in')).toBe(1)
    expect(fromMillimetres(20, 'cm')).toBe(2)
    expect(fromMillimetres(20, 'mm')).toBe(20)
  })
})

describe('header and footer text', () => {
  it('expands placeholders and uses the engine page numbers', () => {
    const html = expandHeaderFooterHtml(
      '{title} — Page {page} of {pages} on {date} ({file})',
      values
    )
    expect(html).toContain('My &#60;Report&#62;')
    expect(html).toContain('<span class="pageNumber"></span>')
    expect(html).toContain('<span class="totalPages"></span>')
    expect(html).toContain('2026-10-25')
    expect(html).toContain('report.md')
  })

  it('escapes everything the user typed', () => {
    const html = expandHeaderFooterHtml('<img src=x onerror=alert(1)> & {nope}', values)
    expect(html).not.toContain('<img')
    expect(html).toContain('&#60;img')
    expect(html).toContain('{nope}')
  })

  it('supports escaped braces', () => {
    expect(previewHeaderFooter('\\{page\\} is {page}', values, 3, 9)).toBe(
      '{page\\} is 3'.replace('\\}', '}')
    )
  })

  it('previews as plain text', () => {
    expect(previewHeaderFooter('Page {page} of {pages}', values, 2, 8)).toBe('Page 2 of 8')
  })
})

describe('print job options', () => {
  it('converts to inches and includes real header and footer templates', () => {
    const job = toPrintOptions(
      opts({
        pageSize: 'Letter',
        orientation: 'landscape',
        margins: { top: 25.4, right: 12.7, bottom: 25.4, left: 12.7 },
        header: { enabled: true, text: '{title}', align: 'right' },
        footer: { enabled: true, text: 'Page {page} of {pages}', align: 'center' },
        scale: 0.9
      }),
      values
    )
    expect(job.pageSize.width).toBeCloseTo(11, 2)
    expect(job.pageSize.height).toBeCloseTo(8.5, 2)
    expect(job.margins).toEqual({ top: 1, right: 0.5, bottom: 1, left: 0.5 })
    expect(job.displayHeaderFooter).toBe(true)
    expect(job.headerTemplate).toContain('text-align:right')
    expect(job.footerTemplate).toContain('class="pageNumber"')
    expect(job.footerTemplate).toContain('class="totalPages"')
    expect(job.scale).toBe(0.9)
    expect(job.landscape).toBe(false)
  })

  it('hides Chromium default header and footer when none is configured', () => {
    const job = toPrintOptions(DEFAULT_PDF_OPTIONS, values)
    expect(job.displayHeaderFooter).toBe(false)
    expect(job.headerTemplate).toBe('<div></div>')
  })

  it('blanks the disabled slot when only one is enabled', () => {
    const job = toPrintOptions(
      opts({ footer: { enabled: true, text: '{page}', align: 'left' } }),
      values
    )
    expect(job.displayHeaderFooter).toBe(true)
    expect(job.headerTemplate).toBe('<div></div>')
    expect(job.footerTemplate).toContain('class="pageNumber"')
  })
})
