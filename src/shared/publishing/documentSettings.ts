/**
 * Settings that belong to one document and are stored in its front matter.
 *
 * Standard keys keep their Pandoc/Quarto meaning (`title`, `author`, `date`, `lang`, `toc`,
 * `toc-depth`, `number-sections`, `bibliography`). Everything specific to Markdown Studio lives
 * under one `studio:` key, which other tools ignore:
 *
 * ```yaml
 * studio:
 *   theme: report
 *   columns: { count: 2, gap: 8 }      # applies to the whole document
 *   page:
 *     size: A4
 *     orientation: portrait
 *     margins: { top: 20, right: 20, bottom: 20, left: 20 }
 *   header: { text: '{title}', align: left }
 *   footer: { text: 'Page {page} of {pages}', align: center }
 * ```
 */
import {
  PAGE_LIMITS,
  PAGE_SIZES,
  sanitizePdfOptions,
  type Align,
  type HeaderFooter,
  type Orientation,
  type PageSize,
  type PdfOptions
} from '../export/pdf'
import { isThemeId, type ThemeId } from '../presentation/theme'
import { splitFrontMatter, updateFrontMatter } from './frontMatter'

export const COLUMN_LIMITS = { gapMm: { min: 2, max: 30 }, defaultGapMm: 8 } as const

export interface DocumentColumns {
  count: 1 | 2
  /** Space between the columns in millimetres. */
  gapMm: number
}

export interface DocumentPageOverrides {
  pageSize?: PageSize
  orientation?: Orientation
  customWidthMm?: number
  customHeightMm?: number
  margins?: Partial<PdfOptions['margins']>
}

export interface DocumentHeaderFooter {
  enabled?: boolean
  text?: string
  align?: Align
}

export interface DocumentSettingsData {
  title?: string
  author?: string
  date?: string
  lang?: string
  toc?: { enabled: boolean; depth: number }
  numberSections?: boolean
  /** Extra bibliography file (CSL JSON or BibTeX), relative to the document. */
  bibliography?: string
  theme?: ThemeId
  columns?: DocumentColumns
  page?: DocumentPageOverrides
  header?: DocumentHeaderFooter
  footer?: DocumentHeaderFooter
}

export interface ReadSettings {
  settings: DocumentSettingsData
  /** Messages for values that were ignored, so nothing is dropped silently. */
  problems: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown, max = 500): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' && value.trim() !== '' ? value.slice(0, max) : undefined
}

function authorText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const names = value.map((v) => (isObject(v) ? str(v.name) : str(v))).filter(Boolean)
    return names.length > 0 ? names.join(', ') : undefined
  }
  return str(value)
}

function readHeaderFooter(
  value: unknown,
  name: string,
  problems: string[]
): DocumentHeaderFooter | undefined {
  if (value === undefined) return undefined
  if (value === false) return { enabled: false }
  if (typeof value === 'string')
    return { enabled: true, text: value.slice(0, PAGE_LIMITS.textLength) }
  if (!isObject(value)) {
    problems.push(`studio.${name} must be text, false or a mapping.`)
    return undefined
  }
  const out: DocumentHeaderFooter = {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true
  }
  if (typeof value.text === 'string') out.text = value.text.slice(0, PAGE_LIMITS.textLength)
  if (value.align === 'left' || value.align === 'center' || value.align === 'right')
    out.align = value.align
  else if (value.align !== undefined)
    problems.push(`studio.${name}.align must be left, center or right.`)
  return out
}

/** Reads the settings out of parsed front matter. Unusable values are reported and skipped. */
export function readDocumentSettings(data: Record<string, unknown>): ReadSettings {
  const problems: string[] = []
  const settings: DocumentSettingsData = {}

  const title = str(data.title)
  if (title) settings.title = title
  const author = authorText(data.author)
  if (author) settings.author = author
  const date = str(data.date)
  if (date) settings.date = date
  const lang = str(data.lang, 20)
  if (lang && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) settings.lang = lang

  const depth = num(data['toc-depth'])
  if (data.toc !== undefined || depth !== null) {
    if (data.toc !== undefined && typeof data.toc !== 'boolean')
      problems.push('toc must be true or false.')
    if (depth !== null && (depth < 1 || depth > 6 || !Number.isInteger(depth)))
      problems.push('toc-depth must be a whole number from 1 to 6.')
    settings.toc = {
      enabled: data.toc === true,
      depth: depth !== null && Number.isInteger(depth) && depth >= 1 && depth <= 6 ? depth : 3
    }
  }
  if (data['number-sections'] !== undefined) {
    if (typeof data['number-sections'] === 'boolean')
      settings.numberSections = data['number-sections']
    else problems.push('number-sections must be true or false.')
  }
  const bibliography = Array.isArray(data.bibliography) ? data.bibliography[0] : data.bibliography
  if (typeof bibliography === 'string' && bibliography.trim())
    settings.bibliography = bibliography.trim()

  const studio = data.studio
  if (studio !== undefined && !isObject(studio)) {
    problems.push('studio must be a mapping of settings.')
    return { settings, problems }
  }
  if (isObject(studio)) {
    if (studio.theme !== undefined) {
      if (isThemeId(studio.theme)) settings.theme = studio.theme
      else problems.push('studio.theme is not a known theme.')
    }
    if (studio.columns !== undefined) {
      const raw = studio.columns
      const count = num(isObject(raw) ? raw.count : raw)
      const gap = isObject(raw) ? num(raw.gap) : null
      if (count === 1 || count === 2) {
        settings.columns = {
          count,
          gapMm:
            gap !== null && gap >= COLUMN_LIMITS.gapMm.min && gap <= COLUMN_LIMITS.gapMm.max
              ? gap
              : COLUMN_LIMITS.defaultGapMm
        }
        if (gap !== null && settings.columns.gapMm !== gap)
          problems.push(
            `studio.columns.gap must be between ${COLUMN_LIMITS.gapMm.min} and ${COLUMN_LIMITS.gapMm.max} mm.`
          )
      } else
        problems.push('studio.columns must be 1 or 2 (only one and two columns are supported).')
    }
    if (studio.page !== undefined) {
      if (!isObject(studio.page)) problems.push('studio.page must be a mapping.')
      else {
        const p = studio.page
        const page: DocumentPageOverrides = {}
        if (p.size !== undefined) {
          if ((PAGE_SIZES as readonly unknown[]).includes(p.size))
            page.pageSize = p.size as PageSize
          else problems.push(`studio.page.size must be one of ${PAGE_SIZES.join(', ')}.`)
        }
        if (p.orientation !== undefined) {
          if (p.orientation === 'portrait' || p.orientation === 'landscape')
            page.orientation = p.orientation
          else problems.push('studio.page.orientation must be portrait or landscape.')
        }
        for (const [key, field] of [
          ['width', 'customWidthMm'],
          ['height', 'customHeightMm']
        ] as const) {
          const n = num(p[key])
          if (n !== null && n >= PAGE_LIMITS.customMm.min && n <= PAGE_LIMITS.customMm.max)
            page[field] = n
          else if (p[key] !== undefined)
            problems.push(`studio.page.${key} must be a number of millimetres.`)
        }
        if (p.margins !== undefined) {
          if (isObject(p.margins)) {
            const margins: Partial<PdfOptions['margins']> = {}
            for (const side of ['top', 'right', 'bottom', 'left'] as const) {
              const n = num(p.margins[side])
              if (n !== null && n >= 0 && n <= PAGE_LIMITS.marginMm.max) margins[side] = n
              else if (p.margins[side] !== undefined)
                problems.push(
                  `studio.page.margins.${side} must be between 0 and ${PAGE_LIMITS.marginMm.max} mm.`
                )
            }
            page.margins = margins
          } else
            problems.push('studio.page.margins must be a mapping with top, right, bottom and left.')
        }
        if (Object.keys(page).length > 0) settings.page = page
      }
    }
    const header = readHeaderFooter(studio.header, 'header', problems)
    if (header) settings.header = header
    const footer = readHeaderFooter(studio.footer, 'footer', problems)
    if (footer) settings.footer = footer
  }
  return { settings, problems }
}

/** Convenience: settings straight from document text. */
export function settingsFromText(text: string): ReadSettings & { frontMatterError: string | null } {
  const fm = splitFrontMatter(text)
  const read = readDocumentSettings(fm.data)
  return { ...read, frontMatterError: fm.error }
}

/** Applies the document's page overrides on top of a base PDF configuration. */
export function applyDocumentPage(base: PdfOptions, settings: DocumentSettingsData): PdfOptions {
  const { page, header, footer } = settings
  if (!page && !header && !footer) return base
  const merged = {
    ...base,
    ...(page?.pageSize ? { pageSize: page.pageSize } : {}),
    ...(page?.orientation ? { orientation: page.orientation } : {}),
    ...(page?.customWidthMm ? { customWidthMm: page.customWidthMm } : {}),
    ...(page?.customHeightMm ? { customHeightMm: page.customHeightMm } : {}),
    margins: { ...base.margins, ...(page?.margins ?? {}) },
    header: { ...base.header, ...(header ?? {}) } as HeaderFooter,
    footer: { ...base.footer, ...(footer ?? {}) } as HeaderFooter
  }
  return sanitizePdfOptions(merged, base)
}

/** Which page fields the document itself defines (shown in the export dialog). */
export function documentPageFields(settings: DocumentSettingsData): string[] {
  const fields: string[] = []
  if (settings.page?.pageSize || settings.page?.orientation || settings.page?.customWidthMm)
    fields.push('page size')
  if (settings.page?.margins && Object.keys(settings.page.margins).length > 0)
    fields.push('margins')
  if (settings.header) fields.push('header')
  if (settings.footer) fields.push('footer')
  return fields
}

/** Front-matter patch for a complete settings object (absent fields remove their keys). */
export function settingsToPatch(settings: DocumentSettingsData): Record<string, unknown> {
  const studio: Record<string, unknown> = {}
  if (settings.theme) studio.theme = settings.theme
  if (settings.columns && settings.columns.count === 2)
    studio.columns = { count: 2, gap: settings.columns.gapMm }
  if (settings.page) {
    const page: Record<string, unknown> = {}
    if (settings.page.pageSize) page.size = settings.page.pageSize
    if (settings.page.orientation) page.orientation = settings.page.orientation
    if (settings.page.customWidthMm) page.width = settings.page.customWidthMm
    if (settings.page.customHeightMm) page.height = settings.page.customHeightMm
    if (settings.page.margins && Object.keys(settings.page.margins).length > 0)
      page.margins = settings.page.margins
    if (Object.keys(page).length > 0) studio.page = page
  }
  for (const key of ['header', 'footer'] as const) {
    const value = settings[key]
    if (!value) continue
    studio[key] =
      value.enabled === false
        ? false
        : { text: value.text ?? '', ...(value.align ? { align: value.align } : {}) }
  }
  return {
    title: settings.title,
    author: settings.author,
    date: settings.date,
    lang: settings.lang,
    toc: settings.toc ? settings.toc.enabled : undefined,
    'toc-depth': settings.toc && settings.toc.enabled ? settings.toc.depth : undefined,
    'number-sections': settings.numberSections,
    bibliography: settings.bibliography,
    studio: Object.keys(studio).length > 0 ? studio : undefined
  }
}

/** Writes the settings into the document's front matter, keeping unrelated keys. */
export function writeDocumentSettings(text: string, settings: DocumentSettingsData): string {
  return updateFrontMatter(text, settingsToPatch(settings))
}
