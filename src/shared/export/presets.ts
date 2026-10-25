/**
 * Export presets: reusable, validated publishing configurations.
 *
 * A preset captures everything an export needs beyond the Markdown itself. Built-in presets are
 * defined here. A user can edit one (the edit is stored as a file with the built-in's id and
 * marks it "modified"; restoring defaults deletes those files) or duplicate it into a custom
 * preset. Files are plain JSON read as data: unknown fields are ignored, obsolete or damaged
 * values fall back to safe defaults, and nothing is ever rewritten on load.
 */
import { DEFAULT_PDF_OPTIONS, sanitizePdfOptions, type PdfOptions } from './pdf'
import {
  sanitizeCustomCss,
  type CustomCssSetting,
  type ExportOverrides,
  type HtmlOptions
} from '../presentation/settings'
import {
  isThemeId,
  sanitizeCustomization,
  type ThemeCustomization,
  type ThemeId
} from '../presentation/theme'

export type ExportFormat = 'pdf' | 'html'
export type PresetScope = 'global' | 'workspace'

export const PRESET_VERSION = 1
export const PRESET_LIMITS = {
  nameLength: 60,
  descriptionLength: 200,
  fileBytes: 256 * 1024
} as const
export const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export interface PresetData {
  format: ExportFormat
  /** A document theme, or `inherit` to use the theme chosen in Settings. */
  theme: ThemeId | 'inherit'
  /** Appearance customisation; `null` inherits the one from Settings. */
  customization: ThemeCustomization | null
  /** `inherit` keeps the Settings/workspace CSS; `none` exports without custom CSS. */
  customCss: { mode: 'inherit' | 'none' | 'file'; path: string | null }
  pdf: PdfOptions
  html: HtmlOptions
}

export interface ExportPreset {
  version: typeof PRESET_VERSION
  id: string
  name: string
  description: string
  data: PresetData
}

export interface StoredPreset extends ExportPreset {
  scope: PresetScope
  updatedAt: string
}

export interface EffectivePreset extends ExportPreset {
  builtIn: boolean
  /** A built-in preset the user has edited. */
  modified: boolean
  scope: PresetScope | 'built-in'
}

function pdf(
  overrides: Partial<PdfOptions> & { margins?: Partial<PdfOptions['margins']> }
): PdfOptions {
  return sanitizePdfOptions({
    ...DEFAULT_PDF_OPTIONS,
    ...overrides,
    margins: { ...DEFAULT_PDF_OPTIONS.margins, ...overrides.margins }
  })
}

const NO_CSS = { mode: 'inherit', path: null } as const

function builtIn(
  id: string,
  name: string,
  description: string,
  data: Partial<PresetData> & { format: ExportFormat }
): ExportPreset {
  return {
    version: PRESET_VERSION,
    id,
    name,
    description,
    data: {
      theme: 'inherit',
      customization: null,
      customCss: NO_CSS,
      pdf: DEFAULT_PDF_OPTIONS,
      html: { embedImages: true },
      ...data
    }
  }
}

export const BUILTIN_PRESETS: readonly ExportPreset[] = [
  builtIn(
    'standard-pdf',
    'Standard PDF',
    'A4 portrait, 20 mm margins, page numbers in the footer.',
    {
      format: 'pdf',
      pdf: pdf({ footer: { enabled: true, text: 'Page {page} of {pages}', align: 'center' } })
    }
  ),
  builtIn(
    'technical-documentation',
    'Technical Documentation',
    'Technical theme with dark code blocks, the title in the header and page numbers on the right.',
    {
      format: 'pdf',
      theme: 'technical',
      pdf: pdf({
        margins: { top: 20, right: 16, bottom: 20, left: 16 },
        header: { enabled: true, text: '{title}', align: 'left' },
        footer: { enabled: true, text: 'Page {page} of {pages}', align: 'right' }
      })
    }
  ),
  builtIn(
    'professional-report',
    'Professional Report',
    'Formal report layout with numbered sections, wide margins and a full footer.',
    {
      format: 'pdf',
      theme: 'report',
      pdf: pdf({
        margins: { top: 25, right: 22, bottom: 25, left: 22 },
        header: { enabled: true, text: '{title}', align: 'right' },
        footer: { enabled: true, text: '{date} · Page {page} of {pages}', align: 'center' }
      })
    }
  ),
  builtIn(
    'compact-notes',
    'Compact Notes',
    'Small type and narrow margins for dense personal notes.',
    {
      format: 'pdf',
      theme: 'minimal',
      customization: { bodyFontSize: 13, lineHeight: 1.45, paragraphSpacing: 0.7 },
      pdf: pdf({
        margins: { top: 12, right: 12, bottom: 14, left: 12 },
        footer: { enabled: true, text: '{page}', align: 'right' }
      })
    }
  ),
  builtIn(
    'standalone-html',
    'Standalone HTML',
    'One self-contained HTML file that opens offline.',
    {
      format: 'html',
      html: { embedImages: true }
    }
  )
]

export const BUILTIN_PRESET_IDS: ReadonlySet<string> = new Set(BUILTIN_PRESETS.map((p) => p.id))
export const DEFAULT_PRESET_ID = 'standard-pdf'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function line(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, max)
    : ''
}

export function sanitizePresetData(
  input: unknown,
  base: PresetData = BUILTIN_PRESETS[0].data
): PresetData {
  const v = isObject(input) ? input : {}
  const css = isObject(v.customCss) ? v.customCss : {}
  const mode =
    css.mode === 'none' || css.mode === 'file' || css.mode === 'inherit' ? css.mode : 'inherit'
  const cssPath = sanitizeCustomCss({ source: 'file', path: css.path }).path
  const html = isObject(v.html) ? v.html : {}
  return {
    format: v.format === 'html' || v.format === 'pdf' ? v.format : base.format,
    theme: v.theme === 'inherit' || isThemeId(v.theme) ? v.theme : 'inherit',
    customization: isObject(v.customization) ? sanitizeCustomization(v.customization) : null,
    // A file mode without a usable path cannot be honoured; keep inheriting.
    customCss:
      mode === 'file' && !cssPath
        ? { mode: 'inherit', path: null }
        : { mode, path: mode === 'file' ? cssPath : null },
    pdf: sanitizePdfOptions(v.pdf),
    html: { embedImages: typeof html.embedImages === 'boolean' ? html.embedImages : true }
  }
}

export type PresetValidation = { ok: true; preset: ExportPreset } | { ok: false; error: string }

/**
 * Validates a preset read from disk or received over IPC. Unknown fields are dropped; files from
 * a future version are read with the fields this version understands.
 */
export function validatePreset(input: unknown): PresetValidation {
  if (!isObject(input)) return { ok: false, error: 'The preset is not valid.' }
  const id = typeof input.id === 'string' ? input.id : ''
  if (!PRESET_ID_PATTERN.test(id)) return { ok: false, error: 'The preset has an invalid id.' }
  const name = line(input.name, PRESET_LIMITS.nameLength)
  if (!name) return { ok: false, error: 'A preset needs a name.' }
  // Version 1 files may store the data at the top level (hand-written) or under `data`.
  const data = isObject(input.data) ? input.data : input
  return {
    ok: true,
    preset: {
      version: PRESET_VERSION,
      id,
      name,
      description: line(input.description, PRESET_LIMITS.descriptionLength),
      data: sanitizePresetData(data)
    }
  }
}

export function makePresetId(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken, ...BUILTIN_PRESET_IDS])
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'preset'
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  return id
}

/**
 * Builds the list shown to the user: built-ins, replaced by edited copies, then custom presets.
 * A workspace preset hides a global one with the same id.
 */
export function effectivePresets(
  global: readonly StoredPreset[],
  workspace: readonly StoredPreset[]
): EffectivePreset[] {
  const stored = new Map<string, StoredPreset>()
  for (const preset of global) stored.set(preset.id, preset)
  for (const preset of workspace) stored.set(preset.id, preset)
  const result: EffectivePreset[] = BUILTIN_PRESETS.map((preset) => {
    const edited = stored.get(preset.id)
    return edited
      ? { ...edited, builtIn: true, modified: true }
      : { ...preset, builtIn: true, modified: false, scope: 'built-in' as const }
  })
  const custom = [...stored.values()]
    .filter((preset) => !BUILTIN_PRESET_IDS.has(preset.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((preset) => ({ ...preset, builtIn: false, modified: false }))
  return [...result, ...custom]
}

/** The built-in preset with this id, for "restore defaults". */
export function builtinPreset(id: string): ExportPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id)
}

/** Appearance overrides a preset applies on top of the document's settings. */
export function presetOverrides(
  data: PresetData,
  cssFromPreset: CustomCssSetting | null
): ExportOverrides {
  const overrides: ExportOverrides = {}
  if (data.theme !== 'inherit') overrides.theme = data.theme
  if (data.customization !== null) overrides.customization = data.customization
  if (data.customCss.mode === 'none') overrides.customCss = { source: 'none', text: '', path: null }
  else if (data.customCss.mode === 'file' && cssFromPreset) overrides.customCss = cssFromPreset
  return overrides
}
