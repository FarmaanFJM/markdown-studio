/**
 * Application settings schema, defaults and validation.
 *
 * Settings are stored as JSON in the user's application-data directory. Everything read from
 * disk or received over IPC passes through `sanitizeSettings`, so a damaged or hand-edited file
 * can never put the application into an invalid state.
 */

import { pathsEqual } from './paths'

export type ThemeName = 'dark' | 'light'
export type ExplorerMode = 'tree' | 'thumbnails'
export type PreviewKind = 'html' | 'pdf'
export type PreviewMode = 'none' | PreviewKind
export type SidebarView = 'explorer' | 'settings'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface AppSettings {
  version: 1
  theme: ThemeName
  editor: {
    fontSize: number
    wordWrap: boolean
    minimap: boolean
  }
  explorer: {
    mode: ExplorerMode
    thumbnailSize: number
  }
  assets: {
    /** Directory, relative to the workspace root, that receives imported images. */
    directory: string
  }
  preview: {
    /** Regenerate the PDF preview automatically after edits. */
    pdfAutoRefresh: boolean
  }
  markdown: {
    /** Enter continues lists and quotes; Tab and Shift+Tab indent list items. */
    smartLists: boolean
    /** Tab and Shift+Tab move between cells (and tidy the table) inside Markdown tables. */
    tableNavigation: boolean
    /** Show suggestions automatically after trigger characters (`/`, link and image paths). */
    autoSuggest: boolean
    /** Show the formatting toolbar above the editor. */
    toolbar: boolean
    diagnostics: {
      /** Missing files, images and heading anchors in local links. */
      links: boolean
      /** Tables the renderer does not display as written. */
      tables: boolean
      /** Style checks provided by markdownlint. */
      lint: boolean
      /** markdownlint rule ids (for example `MD012`) that are switched off. */
      disabledRules: string[]
    }
    toc: {
      /** List the document title (a leading level-1 heading) in generated tables of contents. */
      includeTopLevel: boolean
      maxDepth: number
    }
  }
  templates: {
    /** Last author name typed when creating a document from a template. Never guessed. */
    author: string
  }
  workspace: {
    restoreLastWorkspace: boolean
    lastWorkspace: string | null
    recent: string[]
  }
  layout: {
    sidebarVisible: boolean
    sidebarWidth: number
    sidebarView: SidebarView
    previewMode: PreviewMode
    lastPreviewKind: PreviewKind
    /** Fraction of the editor area occupied by the preview panel. */
    previewRatio: number
    /** The Outline section of the Explorer is expanded. */
    outlineOpen: boolean
  }
  window: {
    bounds: WindowBounds | null
    maximized: boolean
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  theme: 'dark',
  editor: { fontSize: 14, wordWrap: true, minimap: false },
  explorer: { mode: 'tree', thumbnailSize: 96 },
  assets: { directory: 'assets' },
  preview: { pdfAutoRefresh: true },
  markdown: {
    smartLists: true,
    tableNavigation: true,
    autoSuggest: true,
    toolbar: true,
    diagnostics: { links: true, tables: true, lint: true, disabledRules: [] },
    toc: { includeTopLevel: false, maxDepth: 6 }
  },
  templates: { author: '' },
  workspace: { restoreLastWorkspace: true, lastWorkspace: null, recent: [] },
  layout: {
    sidebarVisible: true,
    sidebarWidth: 260,
    sidebarView: 'explorer',
    previewMode: 'html',
    lastPreviewKind: 'html',
    previewRatio: 0.5,
    outlineOpen: true
  },
  window: { bounds: null, maximized: false }
}

export const LIMITS = {
  fontSize: { min: 8, max: 40 },
  thumbnailSize: { min: 64, max: 192 },
  sidebarWidth: { min: 170, max: 640 },
  previewRatio: { min: 0.15, max: 0.85 },
  recentWorkspaces: 10,
  tocDepth: { min: 1, max: 6 },
  authorLength: 120,
  disabledRules: 100
} as const

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object | null ? DeepPartial<NonNullable<T[K]>> | T[K] : T[K]
}

export type SettingsPatch = DeepPartial<Omit<AppSettings, 'version'>>

type Obj = Record<string, unknown>

function isObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function num(value: unknown, fallback: number, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const n = integer ? Math.round(value) : value
  return Math.min(max, Math.max(min, n))
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length < 4096 ? value : null
}

/**
 * Validates the asset directory: a relative path inside the workspace without `..` segments.
 * Returns `null` when the value is unusable.
 */
export function normalizeAssetDirectory(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '')
  if (!trimmed) return null
  if (trimmed.startsWith('/') || /^[a-zA-Z]:/.test(trimmed)) return null
  const segments = trimmed.split('/').filter((s) => s !== '' && s !== '.')
  if (segments.length === 0 || segments.some((s) => s === '..')) return null
  // eslint-disable-next-line no-control-regex -- control characters are never valid in names
  if (segments.some((s) => /[<>:"|?*\u0000-\u001f]/.test(s))) return null
  return segments.join('/')
}

/** Keeps well-formed markdownlint rule ids such as `MD012` (or `md012`), upper-cased and unique. */
function ruleIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().toUpperCase())
    .filter((v) => /^MD\d{3}$/.test(v))
  return [...new Set(ids)].slice(0, LIMITS.disabledRules)
}

function bounds(value: unknown): WindowBounds | null {
  if (!isObject(value)) return null
  const { x, y, width, height } = value
  if ([x, y, width, height].some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null
  if ((width as number) < 400 || (height as number) < 300) return null
  return {
    x: Math.round(x as number),
    y: Math.round(y as number),
    width: Math.round(width as number),
    height: Math.round(height as number)
  }
}

export function sanitizeSettings(input: unknown): AppSettings {
  const d = DEFAULT_SETTINGS
  const s = isObject(input) ? input : {}
  const editor = isObject(s.editor) ? s.editor : {}
  const explorer = isObject(s.explorer) ? s.explorer : {}
  const assets = isObject(s.assets) ? s.assets : {}
  const preview = isObject(s.preview) ? s.preview : {}
  const markdown = isObject(s.markdown) ? s.markdown : {}
  const diagnostics = isObject(markdown.diagnostics) ? markdown.diagnostics : {}
  const toc = isObject(markdown.toc) ? markdown.toc : {}
  const templates = isObject(s.templates) ? s.templates : {}
  const workspace = isObject(s.workspace) ? s.workspace : {}
  const layout = isObject(s.layout) ? s.layout : {}
  const win = isObject(s.window) ? s.window : {}

  const recent = Array.isArray(workspace.recent)
    ? [...new Set(workspace.recent.map(str).filter((v): v is string => v !== null))].slice(
        0,
        LIMITS.recentWorkspaces
      )
    : []

  return {
    version: 1,
    theme: pick(s.theme, ['dark', 'light'] as const, d.theme),
    editor: {
      fontSize: num(editor.fontSize, d.editor.fontSize, LIMITS.fontSize.min, LIMITS.fontSize.max),
      wordWrap: bool(editor.wordWrap, d.editor.wordWrap),
      minimap: bool(editor.minimap, d.editor.minimap)
    },
    explorer: {
      mode: pick(explorer.mode, ['tree', 'thumbnails'] as const, d.explorer.mode),
      thumbnailSize: num(
        explorer.thumbnailSize,
        d.explorer.thumbnailSize,
        LIMITS.thumbnailSize.min,
        LIMITS.thumbnailSize.max
      )
    },
    assets: {
      directory: normalizeAssetDirectory(assets.directory) ?? d.assets.directory
    },
    preview: {
      pdfAutoRefresh: bool(preview.pdfAutoRefresh, d.preview.pdfAutoRefresh)
    },
    markdown: {
      smartLists: bool(markdown.smartLists, d.markdown.smartLists),
      tableNavigation: bool(markdown.tableNavigation, d.markdown.tableNavigation),
      autoSuggest: bool(markdown.autoSuggest, d.markdown.autoSuggest),
      toolbar: bool(markdown.toolbar, d.markdown.toolbar),
      diagnostics: {
        links: bool(diagnostics.links, d.markdown.diagnostics.links),
        tables: bool(diagnostics.tables, d.markdown.diagnostics.tables),
        lint: bool(diagnostics.lint, d.markdown.diagnostics.lint),
        disabledRules: ruleIds(diagnostics.disabledRules)
      },
      toc: {
        includeTopLevel: bool(toc.includeTopLevel, d.markdown.toc.includeTopLevel),
        maxDepth: num(
          toc.maxDepth,
          d.markdown.toc.maxDepth,
          LIMITS.tocDepth.min,
          LIMITS.tocDepth.max
        )
      }
    },
    templates: {
      author:
        typeof templates.author === 'string'
          ? templates.author.replace(/[\r\n]+/g, ' ').slice(0, LIMITS.authorLength)
          : d.templates.author
    },
    workspace: {
      restoreLastWorkspace: bool(workspace.restoreLastWorkspace, d.workspace.restoreLastWorkspace),
      lastWorkspace: str(workspace.lastWorkspace),
      recent
    },
    layout: {
      sidebarVisible: bool(layout.sidebarVisible, d.layout.sidebarVisible),
      sidebarWidth: num(
        layout.sidebarWidth,
        d.layout.sidebarWidth,
        LIMITS.sidebarWidth.min,
        LIMITS.sidebarWidth.max
      ),
      sidebarView: pick(
        layout.sidebarView,
        ['explorer', 'settings'] as const,
        d.layout.sidebarView
      ),
      previewMode: pick(layout.previewMode, ['none', 'html', 'pdf'] as const, d.layout.previewMode),
      lastPreviewKind: pick(
        layout.lastPreviewKind,
        ['html', 'pdf'] as const,
        d.layout.lastPreviewKind
      ),
      previewRatio: num(
        layout.previewRatio,
        d.layout.previewRatio,
        LIMITS.previewRatio.min,
        LIMITS.previewRatio.max,
        false
      ),
      outlineOpen: bool(layout.outlineOpen, d.layout.outlineOpen)
    },
    window: {
      bounds: bounds(win.bounds),
      maximized: bool(win.maximized, d.window.maximized)
    }
  }
}

function deepMerge(base: Obj, patch: Obj): Obj {
  const out: Obj = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    out[key] = isObject(value) && isObject(base[key]) ? deepMerge(base[key] as Obj, value) : value
  }
  return out
}

export function applySettingsPatch(base: AppSettings, patch: SettingsPatch): AppSettings {
  return sanitizeSettings(deepMerge(base as unknown as Obj, patch as Obj))
}

/** Moves `path` to the front of the recent-workspace list. */
export function withRecentWorkspace(recent: readonly string[], path: string): string[] {
  return [path, ...recent.filter((p) => !pathsEqual(p, path))].slice(0, LIMITS.recentWorkspaces)
}
