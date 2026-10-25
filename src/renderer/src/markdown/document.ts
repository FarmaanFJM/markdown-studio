import { DOCUMENT_CSP, EXPORT_CSP } from '@shared/ipc'
import documentCss from './document.css?raw'
import { renderMarkdown } from './render'
import { resolveImageSource, type DocumentContext } from './resolve'
import { sanitizeHtml } from './sanitize'

export { documentCss }

export const GENERATOR = 'Markdown Studio'

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/**
 * Renders Markdown into sanitised HTML for the document body.
 * This single function feeds the HTML preview, the PDF pipeline and HTML export.
 */
export function renderDocumentBody(source: string, context: DocumentContext): string {
  return sanitizeHtml(renderMarkdown(source), {
    resolveImage: (src) => resolveImageSource(src, context)
  })
}

export interface DocumentShell {
  title: string
  body: string
  /** `preview` documents may load local images; `export` documents must be self-contained. */
  purpose: 'preview' | 'export'
}

/** Wraps a rendered body in a complete, standalone HTML document with the document stylesheet. */
export function buildHtmlDocument({ title, body, purpose }: DocumentShell): string {
  const csp = purpose === 'export' ? EXPORT_CSP : DOCUMENT_CSP
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${GENERATOR}">
<title>${escapeHtml(title)}</title>
<style>
${documentCss}
</style>
</head>
<body>
<main class="markdown-body">
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
