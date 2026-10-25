/**
 * Document themes.
 *
 * A *document theme* styles the rendered document (HTML preview, PDF preview, HTML export, PDF
 * export). It is independent of the application's own light/dark theme. A theme is data: a set of
 * design tokens plus structural variants. The CSS lives in `themeCss.ts`; this module validates
 * user customisation and turns (theme + customisation) into the final stylesheet.
 */
import { BASE_CSS, THEME_CSS } from './themeCss'

export const THEME_IDS = ['minimal', 'technical', 'editorial', 'report'] as const
export type ThemeId = (typeof THEME_IDS)[number]
export const DEFAULT_THEME_ID: ThemeId = 'minimal'

export const TABLE_STYLES = ['rows', 'grid', 'banded', 'minimal'] as const
export const CODE_STYLES = ['light', 'tinted', 'dark'] as const
export const QUOTE_STYLES = ['bar', 'quote', 'boxed', 'indent'] as const
export type TableStyle = (typeof TABLE_STYLES)[number]
export type CodeStyle = (typeof CODE_STYLES)[number]
export type QuoteStyle = (typeof QUOTE_STYLES)[number]

/** Named font stacks. Only fonts that ship with the operating systems are referenced. */
export const FONT_STACKS = {
  sans: "'Segoe UI', system-ui, -apple-system, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif",
  humanist: "Calibri, Candara, 'Gill Sans', 'Trebuchet MS', 'Noto Sans', Arial, sans-serif",
  serif: "Georgia, 'Iowan Old Style', 'Noto Serif', 'Times New Roman', Times, serif",
  book: "'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', Georgia, serif",
  classic: "Cambria, 'Times New Roman', Times, 'Liberation Serif', serif",
  mono: "'Cascadia Code', 'Cascadia Mono', Consolas, 'SFMono-Regular', Menlo, 'Liberation Mono', monospace"
} as const
export type FontKey = keyof typeof FONT_STACKS

export const FONT_LABELS: Record<FontKey, string> = {
  sans: 'Sans-serif (Segoe UI)',
  humanist: 'Humanist sans (Calibri)',
  serif: 'Serif (Georgia)',
  book: 'Book serif (Palatino)',
  classic: 'Classic serif (Cambria)',
  mono: 'Monospace'
}

/** Appearance values a user may change. Every field is optional: unset means "the theme's own". */
export interface ThemeCustomization {
  /** A key of FONT_STACKS or `custom:Family Name`. */
  bodyFont?: string
  headingFont?: string
  bodyFontSize?: number
  /** Multiplier applied to the theme's heading sizes. */
  headingScale?: number
  lineHeight?: number
  /** Space between paragraphs, in em. */
  paragraphSpacing?: number
  /** Width of the text column, in CSS pixels. */
  contentWidth?: number
  textColor?: string
  linkColor?: string
  headingColor?: string
  pageBackground?: string
  accentColor?: string
  tableStyle?: TableStyle
  codeStyle?: CodeStyle
  blockquoteStyle?: QuoteStyle
}

export const CUSTOMIZATION_LIMITS = {
  bodyFontSize: { min: 10, max: 28 },
  headingScale: { min: 0.7, max: 1.6 },
  lineHeight: { min: 1.1, max: 2.4 },
  paragraphSpacing: { min: 0.2, max: 2.5 },
  contentWidth: { min: 420, max: 1400 }
} as const

export interface ResolvedTheme {
  id: ThemeId
  bodyFont: string
  headingFont: string
  bodyFontSize: number
  /** Heading sizes (h1…h6) in em, already multiplied by the heading scale. */
  headingSizes: number[]
  lineHeight: number
  paragraphSpacing: number
  contentWidth: number
  text: string
  link: string
  heading: string
  background: string
  accent: string
  tableStyle: TableStyle
  codeStyle: CodeStyle
  quoteStyle: QuoteStyle
  /** True when the page background is dark (diagrams, code and rules adapt to it). */
  dark: boolean
}

export interface DocumentThemeInfo {
  id: ThemeId
  name: string
  description: string
  /** The theme's own values; customisation is applied on top. */
  base: Omit<ResolvedTheme, 'id' | 'dark'> & { headingFontKey: FontKey; bodyFontKey: FontKey }
}

const ACCENT = '#10b981'

export const BUILTIN_THEMES: Record<ThemeId, DocumentThemeInfo> = {
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean, neutral and restrained. Suits general documents and notes.',
    base: {
      bodyFontKey: 'sans',
      headingFontKey: 'sans',
      bodyFont: FONT_STACKS.sans,
      headingFont: FONT_STACKS.sans,
      bodyFontSize: 16,
      headingSizes: [2, 1.5, 1.25, 1.05, 0.95, 0.9],
      lineHeight: 1.65,
      paragraphSpacing: 1,
      contentWidth: 780,
      text: '#1f2328',
      link: '#0a7d5a',
      heading: '#111418',
      background: '#ffffff',
      accent: ACCENT,
      tableStyle: 'rows',
      codeStyle: 'tinted',
      quoteStyle: 'bar'
    }
  },
  technical: {
    id: 'technical',
    name: 'Technical',
    description: 'Dense and structured for software documentation, code and tables.',
    base: {
      bodyFontKey: 'sans',
      headingFontKey: 'sans',
      bodyFont: FONT_STACKS.sans,
      headingFont: FONT_STACKS.sans,
      bodyFontSize: 15,
      headingSizes: [2.05, 1.5, 1.2, 1.02, 0.92, 0.85],
      lineHeight: 1.55,
      paragraphSpacing: 0.85,
      contentWidth: 920,
      text: '#24292f',
      link: '#0969da',
      heading: '#0b2239',
      background: '#ffffff',
      accent: '#0f766e',
      tableStyle: 'grid',
      codeStyle: 'dark',
      quoteStyle: 'boxed'
    }
  },
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    description: 'Book-like typography with comfortable long-form reading.',
    base: {
      bodyFontKey: 'serif',
      headingFontKey: 'book',
      bodyFont: FONT_STACKS.serif,
      headingFont: FONT_STACKS.book,
      bodyFontSize: 18,
      headingSizes: [2.6, 1.7, 1.3, 1.1, 1, 0.95],
      lineHeight: 1.75,
      paragraphSpacing: 1.1,
      contentWidth: 700,
      text: '#2b2724',
      link: '#8a3b12',
      heading: '#1c1815',
      background: '#fffdf9',
      accent: '#b45309',
      tableStyle: 'minimal',
      codeStyle: 'light',
      quoteStyle: 'quote'
    }
  },
  report: {
    id: 'report',
    name: 'Professional Report',
    description: 'Formal composition with numbered sections for reports and business documents.',
    base: {
      bodyFontKey: 'classic',
      headingFontKey: 'humanist',
      bodyFont: FONT_STACKS.classic,
      headingFont: FONT_STACKS.humanist,
      bodyFontSize: 15,
      headingSizes: [2.1, 1.45, 1.2, 1.05, 0.95, 0.9],
      lineHeight: 1.55,
      paragraphSpacing: 0.9,
      contentWidth: 840,
      text: '#1b1f24',
      link: '#1d4ed8',
      heading: '#10294a',
      background: '#ffffff',
      accent: '#1e3a8a',
      tableStyle: 'banded',
      codeStyle: 'light',
      quoteStyle: 'indent'
    }
  }
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------- validation of customisation

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const CUSTOM_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,47}$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!HEX_COLOR.test(trimmed)) return null
  const lower = trimmed.toLowerCase()
  return lower.length === 4
    ? `#${lower[1]}${lower[1]}${lower[2]}${lower[2]}${lower[3]}${lower[3]}`
    : lower
}

export function normalizeFont(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value in FONT_STACKS) return value
  if (value.startsWith('custom:') && CUSTOM_FAMILY.test(value.slice(7).trim())) {
    return `custom:${value.slice(7).trim()}`
  }
  return null
}

function ranged(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : undefined
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined
}

/** Keeps the valid fields of arbitrary input; invalid or unknown fields are dropped. */
export function sanitizeCustomization(input: unknown): ThemeCustomization {
  if (!isObject(input)) return {}
  const L = CUSTOMIZATION_LIMITS
  const out: ThemeCustomization = {}
  const set = <K extends keyof ThemeCustomization>(
    key: K,
    value: ThemeCustomization[K] | null | undefined
  ) => {
    if (value !== undefined && value !== null) out[key] = value
  }
  set('bodyFont', normalizeFont(input.bodyFont))
  set('headingFont', normalizeFont(input.headingFont))
  set('bodyFontSize', ranged(input.bodyFontSize, L.bodyFontSize.min, L.bodyFontSize.max))
  set('headingScale', ranged(input.headingScale, L.headingScale.min, L.headingScale.max))
  set('lineHeight', ranged(input.lineHeight, L.lineHeight.min, L.lineHeight.max))
  set(
    'paragraphSpacing',
    ranged(input.paragraphSpacing, L.paragraphSpacing.min, L.paragraphSpacing.max)
  )
  set('contentWidth', ranged(input.contentWidth, L.contentWidth.min, L.contentWidth.max))
  set('textColor', normalizeColor(input.textColor))
  set('linkColor', normalizeColor(input.linkColor))
  set('headingColor', normalizeColor(input.headingColor))
  set('pageBackground', normalizeColor(input.pageBackground))
  set('accentColor', normalizeColor(input.accentColor))
  set('tableStyle', oneOf(input.tableStyle, TABLE_STYLES))
  set('codeStyle', oneOf(input.codeStyle, CODE_STYLES))
  set('blockquoteStyle', oneOf(input.blockquoteStyle, QUOTE_STYLES))
  return out
}

// -------------------------------------------------------------------------------- colour maths

function channels(color: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number]
}

/** Relative luminance (WCAG) of a `#rrggbb` colour. */
export function luminance(color: string): number {
  const [r, g, b] = channels(color).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Linear blend: 0 returns `a`, 1 returns `b`. */
export function mixColors(a: string, b: string, t: number): string {
  const ca = channels(a)
  const cb = channels(b)
  const hex = ca.map((v, i) =>
    Math.round(v + (cb[i] - v) * t)
      .toString(16)
      .padStart(2, '0')
  )
  return `#${hex.join('')}`
}

// ------------------------------------------------------------------------------- resolution

function fontStack(key: string, fallback: string): string {
  if (key in FONT_STACKS) return FONT_STACKS[key as FontKey]
  const family = key.startsWith('custom:') ? key.slice(7) : ''
  // A custom family is quoted and followed by the theme's own stack as fallback.
  return family ? `'${family.replace(/'/g, '')}', ${fallback}` : fallback
}

export function resolveTheme(id: string, customization: ThemeCustomization = {}): ResolvedTheme {
  const themeId = isThemeId(id) ? id : DEFAULT_THEME_ID
  const base = BUILTIN_THEMES[themeId].base
  const c = sanitizeCustomization(customization)
  const background = c.pageBackground ?? base.background
  const scale = c.headingScale ?? 1
  return {
    id: themeId,
    bodyFont: c.bodyFont ? fontStack(c.bodyFont, base.bodyFont) : base.bodyFont,
    headingFont: c.headingFont ? fontStack(c.headingFont, base.headingFont) : base.headingFont,
    bodyFontSize: c.bodyFontSize ?? base.bodyFontSize,
    headingSizes: base.headingSizes.map((size) => Math.round(size * scale * 1000) / 1000),
    lineHeight: c.lineHeight ?? base.lineHeight,
    paragraphSpacing: c.paragraphSpacing ?? base.paragraphSpacing,
    contentWidth: c.contentWidth ?? base.contentWidth,
    text: c.textColor ?? (c.pageBackground && luminance(background) < 0.3 ? '#e6e8eb' : base.text),
    link: c.linkColor ?? (c.pageBackground && luminance(background) < 0.3 ? '#6ee7b7' : base.link),
    heading:
      c.headingColor ??
      (c.pageBackground && luminance(background) < 0.3 ? '#ffffff' : base.heading),
    background,
    accent: c.accentColor ?? base.accent,
    tableStyle: c.tableStyle ?? base.tableStyle,
    codeStyle: c.codeStyle ?? base.codeStyle,
    quoteStyle: c.blockquoteStyle ?? base.quoteStyle,
    dark: luminance(background) < 0.3
  }
}

/** Colour scheme of the Mermaid diagrams for a resolved theme. */
export function diagramVariant(theme: ResolvedTheme): 'light' | 'dark' {
  return theme.dark ? 'dark' : 'light'
}

export interface ThemeStyleOptions {
  /** Printable content height in CSS pixels, used to keep images and diagrams on one page. */
  pageContentHeightPx?: number
}

/** Attributes the stylesheet's variants select on (`<main class="markdown-body" …>`). */
export function themeAttributes(theme: ResolvedTheme): Record<string, string> {
  const darkCode = theme.codeStyle === 'dark' || theme.dark
  return {
    'data-theme': theme.id,
    'data-table': theme.tableStyle,
    'data-code': theme.codeStyle,
    'data-quote': theme.quoteStyle,
    'data-code-tone': darkCode ? 'dark' : 'light',
    'data-page': theme.dark ? 'dark' : 'light'
  }
}

export function themeVariables(theme: ResolvedTheme, options: ThemeStyleOptions = {}): string {
  const muted = mixColors(theme.text, theme.background, 0.38)
  const border = mixColors(theme.text, theme.background, theme.dark ? 0.78 : 0.82)
  const subtle = mixColors(theme.text, theme.background, theme.dark ? 0.9 : 0.955)
  const codeDark = theme.codeStyle === 'dark'
  const codeBg = codeDark
    ? theme.dark
      ? '#0b0d10'
      : '#14181d'
    : theme.codeStyle === 'tinted'
      ? subtle
      : theme.background
  const codeFg = codeDark ? '#e6edf3' : theme.text
  const h = theme.headingSizes
  const lines = [
    `color-scheme: ${theme.dark ? 'dark' : 'light'}`,
    `--ms-font-body: ${theme.bodyFont}`,
    `--ms-font-heading: ${theme.headingFont}`,
    `--ms-font-mono: ${FONT_STACKS.mono}`,
    `--ms-size: ${theme.bodyFontSize}px`,
    `--ms-leading: ${theme.lineHeight}`,
    `--ms-para: ${theme.paragraphSpacing}em`,
    `--ms-width: ${theme.contentWidth}px`,
    `--ms-text: ${theme.text}`,
    `--ms-muted: ${muted}`,
    `--ms-link: ${theme.link}`,
    `--ms-heading: ${theme.heading}`,
    `--ms-bg: ${theme.background}`,
    `--ms-accent: ${theme.accent}`,
    `--ms-on-accent: ${luminance(theme.accent) > 0.4 ? '#111111' : '#ffffff'}`,
    `--ms-border: ${border}`,
    `--ms-subtle: ${subtle}`,
    `--ms-code-bg: ${codeBg}`,
    `--ms-code-fg: ${codeFg}`,
    `--ms-code-border: ${codeDark ? 'transparent' : border}`,
    ...h.map((size, i) => `--ms-h${i + 1}: ${size}em`),
    `--ms-page-height: ${options.pageContentHeightPx ? `${Math.round(options.pageContentHeightPx)}px` : '1000px'}`
  ]
  return `:root{\n${lines.map((l) => `  ${l};`).join('\n')}\n}`
}

/** The complete stylesheet of a theme (structure + theme-specific composition). */
export function buildThemeStyles(theme: ResolvedTheme, options: ThemeStyleOptions = {}): string {
  return [themeVariables(theme, options), BASE_CSS, THEME_CSS[theme.id]].join('\n')
}
