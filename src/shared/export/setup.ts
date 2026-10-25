import type { DocumentSettings, ExportOverrides, HtmlOptions } from '../presentation/settings'
import type { PdfOptions } from './pdf'
import { presetOverrides, type ExportFormat, type ExportPreset, type PresetData } from './presets'

/**
 * The complete configuration of one export: the output format, page and HTML options, and the
 * export-specific appearance overrides (layered on top of Settings and workspace overrides).
 */
export interface ExportSetup {
  /** The preset this setup started from; null for "Settings defaults". */
  presetId: string | null
  format: ExportFormat
  overrides: ExportOverrides
  pdf: PdfOptions
  html: HtmlOptions
}

/** The setup used when no preset is chosen: the defaults from Settings. */
export function settingsSetup(settings: DocumentSettings): ExportSetup {
  return { presetId: null, format: 'pdf', overrides: {}, pdf: settings.pdf, html: settings.html }
}

export function setupFromPreset(preset: ExportPreset, settings: DocumentSettings): ExportSetup {
  const { data } = preset
  void settings
  return {
    presetId: preset.id,
    format: data.format,
    overrides: presetOverrides(
      data,
      data.customCss.mode === 'file' && data.customCss.path
        ? { source: 'file', text: '', path: data.customCss.path }
        : null
    ),
    pdf: data.pdf,
    html: data.html
  }
}

/** The preset contents that correspond to a setup (what "Save as preset" stores). */
export function presetDataFromSetup(setup: ExportSetup): PresetData {
  const css = setup.overrides.customCss
  return {
    format: setup.format,
    theme: setup.overrides.theme ?? 'inherit',
    customization: setup.overrides.customization ?? null,
    customCss: !css
      ? { mode: 'inherit', path: null }
      : css.source === 'none'
        ? { mode: 'none', path: null }
        : css.source === 'file' && css.path
          ? { mode: 'file', path: css.path }
          : // Inline CSS belongs to Settings and cannot be stored inside a preset.
            { mode: 'inherit', path: null },
    pdf: setup.pdf,
    html: setup.html
  }
}

export function setupsEqual(a: ExportSetup, b: ExportSetup): boolean {
  return (
    JSON.stringify([a.format, a.overrides, a.pdf, a.html]) ===
    JSON.stringify([b.format, b.overrides, b.pdf, b.html])
  )
}
