/**
 * PDF page configuration: sizes, margins, headers and footers.
 *
 * All lengths are stored in millimetres. The main process converts them to the inches
 * `webContents.printToPDF` expects. Everything here is pure so that the same rules validate the
 * export dialog, loaded presets and the print job itself.
 */
import { normalizeColor } from '../presentation/theme'

export const PAGE_SIZES = ['A4', 'A5', 'Letter', 'Legal', 'Custom'] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export type Orientation = 'portrait' | 'landscape'
export type Align = 'left' | 'center' | 'right'

/** Portrait dimensions in millimetres. */
export const PAGE_DIMENSIONS_MM: Record<
  Exclude<PageSize, 'Custom'>,
  { width: number; height: number }
> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 }
}

export const PAGE_LIMITS = {
  customMm: { min: 50, max: 1200 },
  marginMm: { max: 100 },
  /** The printable area must stay at least this large in both directions. */
  minContentMm: 30,
  scale: { min: 0.5, max: 2 },
  textLength: 200,
  fontPt: { min: 6, max: 14 }
} as const

export interface HeaderFooter {
  enabled: boolean
  /** Text with `{title}`, `{file}`, `{date}`, `{page}` and `{pages}` placeholders. */
  text: string
  align: Align
}

export interface PdfOptions {
  pageSize: PageSize
  orientation: Orientation
  customWidthMm: number
  customHeightMm: number
  margins: { top: number; right: number; bottom: number; left: number }
  printBackground: boolean
  /** Page colour override (`#rrggbb`) or null for the theme's own background. */
  backgroundColor: string | null
  scale: number
  header: HeaderFooter
  footer: HeaderFooter
  /** Font size of headers and footers in points. */
  headerFooterPt: number
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  pageSize: 'A4',
  orientation: 'portrait',
  customWidthMm: 210,
  customHeightMm: 297,
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  printBackground: true,
  backgroundColor: null,
  scale: 1,
  header: { enabled: false, text: '{title}', align: 'left' },
  footer: { enabled: false, text: 'Page {page} of {pages}', align: 'center' },
  headerFooterPt: 9
}

export const PLACEHOLDERS = {
  title: 'The document title (its first heading, or the file name).',
  file: 'The file name.',
  date: 'The date of the export (YYYY-MM-DD).',
  page: 'The current page number.',
  pages: 'The total number of pages.'
} as const

export type PdfValidation =
  { ok: true; options: PdfOptions } | { ok: false; errors: { field: string; message: string }[] }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function headerFooter(value: unknown, fallback: HeaderFooter): HeaderFooter {
  const v = isObject(value) ? value : {}
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : fallback.enabled,
    text:
      typeof v.text === 'string'
        ? v.text.replace(/[\r\n]+/g, ' ').slice(0, PAGE_LIMITS.textLength)
        : fallback.text,
    align:
      v.align === 'left' || v.align === 'center' || v.align === 'right' ? v.align : fallback.align
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Lenient normalisation for stored data: unusable fields fall back to `base`. Use
 * `validatePdfOptions` where invalid input must be reported instead of repaired.
 */
export function sanitizePdfOptions(
  input: unknown,
  base: PdfOptions = DEFAULT_PDF_OPTIONS
): PdfOptions {
  const v = isObject(input) ? input : {}
  const m = isObject(v.margins) ? v.margins : {}
  const margin = (key: 'top' | 'right' | 'bottom' | 'left') => {
    const n = finite(m[key])
    return n !== null && n >= 0 && n <= PAGE_LIMITS.marginMm.max ? round(n) : base.margins[key]
  }
  const custom = (value: unknown, fallback: number) => {
    const n = finite(value)
    return n !== null && n >= PAGE_LIMITS.customMm.min && n <= PAGE_LIMITS.customMm.max
      ? round(n)
      : fallback
  }
  const scale = finite(v.scale)
  const pt = finite(v.headerFooterPt)
  const options: PdfOptions = {
    pageSize: (PAGE_SIZES as readonly unknown[]).includes(v.pageSize)
      ? (v.pageSize as PageSize)
      : base.pageSize,
    orientation:
      v.orientation === 'landscape' || v.orientation === 'portrait'
        ? v.orientation
        : base.orientation,
    customWidthMm: custom(v.customWidthMm, base.customWidthMm),
    customHeightMm: custom(v.customHeightMm, base.customHeightMm),
    margins: {
      top: margin('top'),
      right: margin('right'),
      bottom: margin('bottom'),
      left: margin('left')
    },
    printBackground:
      typeof v.printBackground === 'boolean' ? v.printBackground : base.printBackground,
    backgroundColor:
      v.backgroundColor === null
        ? null
        : (normalizeColor(v.backgroundColor) ?? base.backgroundColor),
    scale:
      scale !== null && scale >= PAGE_LIMITS.scale.min && scale <= PAGE_LIMITS.scale.max
        ? round(scale)
        : base.scale,
    header: headerFooter(v.header, base.header),
    footer: headerFooter(v.footer, base.footer),
    headerFooterPt:
      pt !== null && pt >= PAGE_LIMITS.fontPt.min && pt <= PAGE_LIMITS.fontPt.max
        ? Math.round(pt)
        : base.headerFooterPt
  }
  // A damaged combination (margins larger than the page) falls back to the base margins.
  const area = contentSizeMm(options)
  const fits = area.width >= PAGE_LIMITS.minContentMm && area.height >= PAGE_LIMITS.minContentMm
  return fits ? options : { ...options, margins: base.margins }
}

/** Page size in millimetres after applying the orientation. */
export function pageSizeMm(options: PdfOptions): { width: number; height: number } {
  const portrait =
    options.pageSize === 'Custom'
      ? { width: options.customWidthMm, height: options.customHeightMm }
      : PAGE_DIMENSIONS_MM[options.pageSize]
  return options.orientation === 'landscape'
    ? { width: portrait.height, height: portrait.width }
    : portrait
}

/** The smallest margin (mm) that keeps a header or footer clear of the body. */
export function minimumHeaderFooterMargin(pt: number): number {
  return Math.ceil(8 + pt * 0.3528 * 1.6)
}

/** Printable area in millimetres. */
export function contentSizeMm(options: PdfOptions): { width: number; height: number } {
  const page = pageSizeMm(options)
  return {
    width: page.width - options.margins.left - options.margins.right,
    height: page.height - options.margins.top - options.margins.bottom
  }
}

/** Strict validation with messages the user can act on. */
export function validatePdfOptions(input: unknown): PdfValidation {
  const errors: { field: string; message: string }[] = []
  const v = isObject(input) ? input : null
  if (!v) return { ok: false, errors: [{ field: 'pdf', message: 'The PDF settings are missing.' }] }
  const options = sanitizeLoose(v)

  if (!(PAGE_SIZES as readonly unknown[]).includes(v.pageSize)) {
    errors.push({ field: 'pageSize', message: 'Choose a page size.' })
  }
  if (v.pageSize === 'Custom') {
    for (const [field, label] of [
      ['customWidthMm', 'page width'],
      ['customHeightMm', 'page height']
    ] as const) {
      const n = finite(v[field])
      if (n === null || n < PAGE_LIMITS.customMm.min || n > PAGE_LIMITS.customMm.max) {
        errors.push({
          field,
          message: `The ${label} must be between ${PAGE_LIMITS.customMm.min} and ${PAGE_LIMITS.customMm.max} mm.`
        })
      }
    }
  }
  const margins = isObject(v.margins) ? v.margins : {}
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const n = finite(margins[side])
    if (n === null || n < 0 || n > PAGE_LIMITS.marginMm.max) {
      errors.push({
        field: `margins.${side}`,
        message: `The ${side} margin must be between 0 and ${PAGE_LIMITS.marginMm.max} mm.`
      })
    }
  }
  const scale = finite(v.scale)
  if (scale === null || scale < PAGE_LIMITS.scale.min || scale > PAGE_LIMITS.scale.max) {
    errors.push({
      field: 'scale',
      message: `The scale must be between ${Math.round(PAGE_LIMITS.scale.min * 100)}% and ${Math.round(PAGE_LIMITS.scale.max * 100)}%.`
    })
  }
  if (
    v.backgroundColor !== null &&
    v.backgroundColor !== undefined &&
    normalizeColor(v.backgroundColor) === null
  ) {
    errors.push({
      field: 'backgroundColor',
      message: 'The background colour must look like #ffffff.'
    })
  }

  if (errors.length === 0) {
    const content = contentSizeMm(options)
    if (content.width < PAGE_LIMITS.minContentMm) {
      errors.push({
        field: 'margins.left',
        message: `The left and right margins leave only ${Math.max(0, Math.round(content.width))} mm of width; at least ${PAGE_LIMITS.minContentMm} mm is needed.`
      })
    }
    if (content.height < PAGE_LIMITS.minContentMm) {
      errors.push({
        field: 'margins.top',
        message: `The top and bottom margins leave only ${Math.max(0, Math.round(content.height))} mm of height; at least ${PAGE_LIMITS.minContentMm} mm is needed.`
      })
    }
    const needed = minimumHeaderFooterMargin(options.headerFooterPt)
    if (options.header.enabled && options.margins.top < needed) {
      errors.push({
        field: 'margins.top',
        message: `A header needs a top margin of at least ${needed} mm so it does not overlap the text.`
      })
    }
    if (options.footer.enabled && options.margins.bottom < needed) {
      errors.push({
        field: 'margins.bottom',
        message: `A footer needs a bottom margin of at least ${needed} mm so it does not overlap the text.`
      })
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, options }
}

/** Reads fields without rejecting anything (the strict checks above report problems). */
function sanitizeLoose(v: Record<string, unknown>): PdfOptions {
  const m = isObject(v.margins) ? v.margins : {}
  const num = (value: unknown, fallback: number) => finite(value) ?? fallback
  return {
    pageSize: (PAGE_SIZES as readonly unknown[]).includes(v.pageSize)
      ? (v.pageSize as PageSize)
      : 'A4',
    orientation: v.orientation === 'landscape' ? 'landscape' : 'portrait',
    customWidthMm: num(v.customWidthMm, 210),
    customHeightMm: num(v.customHeightMm, 297),
    margins: {
      top: num(m.top, 20),
      right: num(m.right, 20),
      bottom: num(m.bottom, 20),
      left: num(m.left, 20)
    },
    printBackground: v.printBackground !== false,
    backgroundColor: normalizeColor(v.backgroundColor) ?? null,
    scale: num(v.scale, 1),
    header: headerFooter(v.header, DEFAULT_PDF_OPTIONS.header),
    footer: headerFooter(v.footer, DEFAULT_PDF_OPTIONS.footer),
    headerFooterPt: num(v.headerFooterPt, 9)
  }
}

// ------------------------------------------------------------------------ unit conversion

export type LengthUnit = 'mm' | 'cm' | 'in'
const MM_PER_UNIT: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4 }

export function toMillimetres(value: number, unit: LengthUnit): number {
  return round(value * MM_PER_UNIT[unit])
}

export function fromMillimetres(value: number, unit: LengthUnit): number {
  return Math.round((value / MM_PER_UNIT[unit]) * 1000) / 1000
}

export function mmToInches(mm: number): number {
  return mm / 25.4
}

/** The CSS pixel height of the printable area (96 CSS px per inch), after scaling. */
export function contentHeightPx(options: PdfOptions): number {
  return ((contentSizeMm(options).height / 25.4) * 96) / options.scale
}

// -------------------------------------------------------------------- headers and footers

export interface HeaderFooterValues {
  title: string
  file: string
  date: string
}

const PLACEHOLDER_PATTERN = /\\([{}\\])|\{(title|file|date|page|pages)\}/g

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/**
 * Expands placeholders into the HTML fragment Chromium renders in the page margin. Text is
 * escaped; `{page}` and `{pages}` become the engine's own page-number elements, so the numbers
 * come from the real pagination. `\{` writes a literal brace.
 */
export function expandHeaderFooterHtml(text: string, values: HeaderFooterValues): string {
  let out = ''
  let last = 0
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    out += escapeHtml(text.slice(last, match.index))
    last = match.index + match[0].length
    if (match[1] !== undefined) {
      out += escapeHtml(match[1])
      continue
    }
    switch (match[2]) {
      case 'title':
        out += escapeHtml(values.title)
        break
      case 'file':
        out += escapeHtml(values.file)
        break
      case 'date':
        out += escapeHtml(values.date)
        break
      case 'page':
        out += '<span class="pageNumber"></span>'
        break
      default:
        out += '<span class="totalPages"></span>'
    }
  }
  return out + escapeHtml(text.slice(last))
}

/** Plain-text preview of a header/footer (for the settings UI and tests). */
export function previewHeaderFooter(
  text: string,
  values: HeaderFooterValues,
  page = 1,
  pages = 1
): string {
  return text.replace(PLACEHOLDER_PATTERN, (_whole, escaped, name) => {
    if (escaped !== undefined) return escaped
    switch (name) {
      case 'title':
        return values.title
      case 'file':
        return values.file
      case 'date':
        return values.date
      case 'page':
        return String(page)
      default:
        return String(pages)
    }
  })
}

function templateFor(slot: HeaderFooter, options: PdfOptions, values: HeaderFooterValues): string {
  if (!slot.enabled || slot.text.trim() === '') return '<div></div>'
  const padLeft = options.margins.left
  const padRight = options.margins.right
  const style = [
    'box-sizing:border-box',
    'width:100%',
    `padding:0 ${padRight}mm 0 ${padLeft}mm`,
    `font-size:${options.headerFooterPt}pt`,
    "font-family:'Segoe UI',Arial,Helvetica,sans-serif",
    'color:#555555',
    `text-align:${slot.align}`,
    '-webkit-print-color-adjust:exact'
  ].join(';')
  return `<div style="${style}">${expandHeaderFooterHtml(slot.text, values)}</div>`
}

export interface PrintJobOptions {
  pageSize: { width: number; height: number }
  margins: { top: number; right: number; bottom: number; left: number }
  printBackground: boolean
  scale: number
  displayHeaderFooter: boolean
  headerTemplate: string
  footerTemplate: string
  landscape: false
  preferCSSPageSize: false
}

/** Converts validated options into the arguments of `webContents.printToPDF` (inches). */
export function toPrintOptions(options: PdfOptions, values: HeaderFooterValues): PrintJobOptions {
  const page = pageSizeMm(options)
  const showsHeaderFooter =
    (options.header.enabled && options.header.text.trim() !== '') ||
    (options.footer.enabled && options.footer.text.trim() !== '')
  return {
    pageSize: { width: mmToInches(page.width), height: mmToInches(page.height) },
    margins: {
      top: mmToInches(options.margins.top),
      right: mmToInches(options.margins.right),
      bottom: mmToInches(options.margins.bottom),
      left: mmToInches(options.margins.left)
    },
    printBackground: options.printBackground,
    scale: options.scale,
    displayHeaderFooter: showsHeaderFooter,
    headerTemplate: templateFor(options.header, options, values),
    footerTemplate: templateFor(options.footer, options, values),
    // Orientation is already part of the page size.
    landscape: false,
    preferCSSPageSize: false
  }
}
