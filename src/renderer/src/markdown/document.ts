import { DOCUMENT_CSP, EXPORT_CSP } from '@shared/ipc'
import {
  buildThemeStyles,
  resolveTheme,
  themeAttributes,
  type ResolvedTheme
} from '@shared/presentation/theme'
import type { DocumentColumns } from '@shared/publishing/documentSettings'
import type { PublishingOptions, PublishingResult } from '@shared/publishing/types'
import { katexStylesheet } from './katexCss'
import { ALL_FEATURES, fillMathSlots, renderMarkdownSlots } from './render'
import { resolveImageSource, type DocumentContext } from './resolve'
import { sanitizeHtml } from './sanitize'

export const GENERATOR = 'Markdown Studio'

/**
 * Everything that shapes how a document looks and which render extensions run. It is resolved
 * once from settings, workspace overrides and export choices (see `state/presentation.ts`) and
 * then used identically by the HTML preview, the PDF preview, HTML export and PDF export.
 */
export interface RenderPresentation {
  theme: ResolvedTheme
  /** Validated, normalised custom CSS ('' when none or rejected). */
  customCss: string
  math: boolean
  diagrams: boolean
  /** Printable page height in CSS pixels (PDF only), used to keep images on one page. */
  pageContentHeightPx?: number
  /** PDF page colour override. */
  pageBackground?: string | null
  /** Two-column layout of the whole document, or null for one column. */
  columns?: DocumentColumns | null
  /** Headings carry generated numbers, so the theme's own heading counters step aside. */
  numberedSections?: boolean
}

export const DEFAULT_PRESENTATION: RenderPresentation = {
  theme: resolveTheme('minimal'),
  customCss: '',
  math: true,
  diagrams: true
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/**
 * Renders Markdown into sanitised HTML for the document body.
 * This single function feeds the HTML preview, the PDF pipeline and HTML export. Diagrams are
 * left as placeholders carrying their source; `hydrateDiagrams` fills them in.
 */
export function renderDocumentBody(
  source: string,
  context: DocumentContext,
  presentation: Pick<RenderPresentation, 'math' | 'diagrams'> = ALL_FEATURES,
  publishing?: PublishingOptions
): string {
  return renderDocumentBodyDetailed(source, context, presentation, publishing).html
}

/** Like `renderDocumentBody`, and also returns what the publishing layer found. */
export function renderDocumentBodyDetailed(
  source: string,
  context: DocumentContext,
  presentation: Pick<RenderPresentation, 'math' | 'diagrams'> = ALL_FEATURES,
  publishing?: PublishingOptions
): { html: string; publishing: PublishingResult | undefined } {
  const rendered = renderMarkdownSlots(source, presentation, publishing)
  const clean = sanitizeHtml(rendered.html, {
    resolveImage: (src) => resolveImageSource(src, context)
  })
  return { html: fillMathSlots(clean, rendered.slots), publishing: rendered.publishing }
}

export interface DocumentShell {
  title: string
  body: string
  /** `preview` documents may load local images; `export` documents must be self-contained. */
  purpose: 'preview' | 'export'
  presentation?: RenderPresentation
  /** Include the math stylesheet even if the body has no equations (the live preview shell). */
  forceMathStyles?: boolean
}

export function themeStyleText(presentation: RenderPresentation): string {
  return buildThemeStyles(presentation.theme, {
    pageContentHeightPx: presentation.pageContentHeightPx
  })
}

export function mainAttributeMap(presentation: RenderPresentation): Record<string, string> {
  const attributes: Record<string, string> = { ...themeAttributes(presentation.theme) }
  if (presentation.columns && presentation.columns.count === 2) {
    attributes['data-columns'] = '2'
    attributes.style = `--ms-col-gap: ${presentation.columns.gapMm}mm`
  }
  if (presentation.numberedSections) attributes['data-numbered'] = 'true'
  return attributes
}

export function mainAttributes(presentation: RenderPresentation): string {
  return Object.entries(mainAttributeMap(presentation))
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(' ')
}

/** Wraps a rendered body in a complete, standalone HTML document with the document stylesheet. */
export function buildHtmlDocument({
  title,
  body,
  purpose,
  presentation = DEFAULT_PRESENTATION,
  forceMathStyles = false
}: DocumentShell): string {
  const csp = purpose === 'export' ? EXPORT_CSP : DOCUMENT_CSP
  const needsMath = presentation.math && (forceMathStyles || body.includes('class="katex'))
  const background = presentation.pageBackground
    ? `\nhtml, body { background: ${presentation.pageBackground} !important; }`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${GENERATOR}">
<title>${escapeHtml(title)}</title>
<style id="ms-theme">
${themeStyleText(presentation)}${background}
</style>
${needsMath ? `<style id="ms-math">\n${katexStylesheet()}\n</style>\n` : ''}<style id="ms-custom-css">
${presentation.customCss}
</style>
</head>
<body>
<main class="markdown-body" ${mainAttributes(presentation)}>
${body}
</main>
</body>
</html>
`
}

/** Title for a generated document: its first heading, otherwise the file name. */
export function documentTitle(source: string, fallback: string): string {
  const heading = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m.exec(source)
  return heading ? heading[1].replace(/[*_`]/g, '') : fallback
}
