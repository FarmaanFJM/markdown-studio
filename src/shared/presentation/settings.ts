/**
 * Document-presentation settings: the document theme, its customisation, custom CSS, math and
 * diagram switches and the export defaults. They live in the application settings (global
 * defaults) and, for a few appearance fields, in the workspace (overrides). None of them is ever
 * written into a Markdown document.
 */
import { DEFAULT_PDF_OPTIONS, sanitizePdfOptions, type PdfOptions } from '../export/pdf'
import {
  DEFAULT_THEME_ID,
  isThemeId,
  resolveTheme,
  sanitizeCustomization,
  type ResolvedTheme,
  type ThemeCustomization,
  type ThemeId
} from './theme'

export type CssSource = 'none' | 'inline' | 'file'

export interface CustomCssSetting {
  source: CssSource
  /** The stylesheet text when `source` is `inline`. */
  text: string
  /** Absolute path (global) or workspace-relative path when `source` is `file`. */
  path: string | null
}

export interface HtmlOptions {
  /** Embed local images as data URIs so the file is self-contained. */
  embedImages: boolean
}

export interface DocumentSettings {
  theme: ThemeId
  customization: ThemeCustomization
  customCss: CustomCssSetting
  math: { enabled: boolean }
  diagrams: { enabled: boolean }
  pdf: PdfOptions
  html: HtmlOptions
  /** The export preset last used in the Export dialog; empty means the defaults above. */
  exportPreset: string
}

export const DEFAULT_CUSTOM_CSS: CustomCssSetting = { source: 'none', text: '', path: null }

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  theme: DEFAULT_THEME_ID,
  customization: {},
  customCss: DEFAULT_CUSTOM_CSS,
  math: { enabled: true },
  diagrams: { enabled: true },
  pdf: DEFAULT_PDF_OPTIONS,
  html: { embedImages: true },
  exportPreset: ''
}

export const CSS_PATH_MAX = 1024

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function sanitizeCustomCss(input: unknown, fallback = DEFAULT_CUSTOM_CSS): CustomCssSetting {
  const v = isObject(input) ? input : {}
  const source: CssSource =
    v.source === 'inline' || v.source === 'file' || v.source === 'none' ? v.source : fallback.source
  const text = typeof v.text === 'string' ? v.text.slice(0, 256 * 1024) : fallback.text
  const path =
    typeof v.path === 'string' &&
    v.path.length > 0 &&
    v.path.length <= CSS_PATH_MAX &&
    /\.css$/i.test(v.path)
      ? v.path
      : null
  // A file source without a usable path degrades to "none" rather than pointing nowhere.
  return { source: source === 'file' && !path ? 'none' : source, text, path }
}

export function sanitizeDocumentSettings(input: unknown): DocumentSettings {
  const d = DEFAULT_DOCUMENT_SETTINGS
  const v = isObject(input) ? input : {}
  const math = isObject(v.math) ? v.math : {}
  const diagrams = isObject(v.diagrams) ? v.diagrams : {}
  const html = isObject(v.html) ? v.html : {}
  const preset =
    typeof v.exportPreset === 'string' &&
    (v.exportPreset === '' || /^[a-z0-9][a-z0-9-]{0,63}$/.test(v.exportPreset))
      ? v.exportPreset
      : d.exportPreset
  return {
    theme: isThemeId(v.theme) ? v.theme : d.theme,
    customization: sanitizeCustomization(v.customization),
    customCss: sanitizeCustomCss(v.customCss),
    math: { enabled: bool(math.enabled, d.math.enabled) },
    diagrams: { enabled: bool(diagrams.enabled, d.diagrams.enabled) },
    pdf: sanitizePdfOptions(v.pdf),
    html: { embedImages: bool(html.embedImages, d.html.embedImages) },
    exportPreset: preset
  }
}

// ------------------------------------------------------------------- workspace overrides

/** Fields a workspace may override. Absent keys inherit the application's defaults. */
export interface WorkspacePresentation {
  theme?: ThemeId
  customization?: ThemeCustomization
  customCss?: CustomCssSetting
  math?: { enabled: boolean }
  diagrams?: { enabled: boolean }
}

export const WORKSPACE_PRESENTATION_KEYS = [
  'theme',
  'customization',
  'customCss',
  'math',
  'diagrams'
] as const

export function sanitizeWorkspacePresentation(input: unknown): WorkspacePresentation {
  const v = isObject(input) ? input : {}
  const out: WorkspacePresentation = {}
  if (isThemeId(v.theme)) out.theme = v.theme
  if (isObject(v.customization)) out.customization = sanitizeCustomization(v.customization)
  if (isObject(v.customCss)) out.customCss = sanitizeCustomCss(v.customCss)
  if (isObject(v.math) && typeof v.math.enabled === 'boolean')
    out.math = { enabled: v.math.enabled }
  if (isObject(v.diagrams) && typeof v.diagrams.enabled === 'boolean') {
    out.diagrams = { enabled: v.diagrams.enabled }
  }
  return out
}

export function hasWorkspaceOverrides(
  overrides: WorkspacePresentation | null | undefined
): boolean {
  return !!overrides && Object.keys(overrides).length > 0
}

export type OverrideOrigin = 'default' | 'workspace' | 'export'

/** What the export dialog (or a preset) overrides for one export only. */
export interface ExportOverrides {
  theme?: ThemeId
  customization?: ThemeCustomization
  customCss?: CustomCssSetting
}

export interface EffectivePresentation {
  themeId: ThemeId
  customization: ThemeCustomization
  theme: ResolvedTheme
  customCss: CustomCssSetting
  math: boolean
  diagrams: boolean
  origin: {
    theme: OverrideOrigin
    customization: OverrideOrigin
    customCss: OverrideOrigin
    math: OverrideOrigin
    diagrams: OverrideOrigin
  }
}

/**
 * Layers the three sources of appearance, from weakest to strongest:
 *   1. application defaults, 2. workspace overrides, 3. export-specific overrides.
 */
export function resolvePresentation(
  defaults: DocumentSettings,
  workspace: WorkspacePresentation | null | undefined,
  exportOverrides?: ExportOverrides | null
): EffectivePresentation {
  const w = workspace ?? {}
  const e = exportOverrides ?? {}
  const pick = <T>(
    base: T,
    fromWorkspace: T | undefined,
    fromExport: T | undefined
  ): { value: T; origin: OverrideOrigin } =>
    fromExport !== undefined
      ? { value: fromExport, origin: 'export' }
      : fromWorkspace !== undefined
        ? { value: fromWorkspace, origin: 'workspace' }
        : { value: base, origin: 'default' }

  const theme = pick<ThemeId>(defaults.theme, w.theme, e.theme)
  const customization = pick<ThemeCustomization>(
    defaults.customization,
    w.customization,
    e.customization
  )
  const customCss = pick<CustomCssSetting>(defaults.customCss, w.customCss, e.customCss)
  const math = pick<boolean>(defaults.math.enabled, w.math?.enabled, undefined)
  const diagrams = pick<boolean>(defaults.diagrams.enabled, w.diagrams?.enabled, undefined)
  return {
    themeId: theme.value,
    customization: customization.value,
    theme: resolveTheme(theme.value, customization.value),
    customCss: customCss.value,
    math: math.value,
    diagrams: diagrams.value,
    origin: {
      theme: theme.origin,
      customization: customization.origin,
      customCss: customCss.origin,
      math: math.origin,
      diagrams: diagrams.origin
    }
  }
}
