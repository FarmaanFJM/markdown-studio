import type { MarkdownIt, Token } from 'markdown-it'

/** Language identifier of fenced blocks that are rendered as diagrams. */
export const DIAGRAM_LANGUAGE = 'mermaid'

/** Result of the stable hash used for diagram cache keys and element ids. */
export function hashText(text: string): string {
  // FNV-1a over UTF-16 code units, twice with different seeds for 64 bits of spread.
  let a = 0x811c9dc5
  let b = 0x01000193 ^ text.length
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193)
    b = Math.imul(b ^ code, 0x85ebca6b) ^ (b >>> 13)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

export interface DiagramFenceOptions {
  /** When false, mermaid blocks are ordinary code blocks. */
  diagrams?: boolean
}

export function isDiagramFence(token: Token): boolean {
  return token.info.trim().split(/\s+/)[0].toLowerCase() === DIAGRAM_LANGUAGE
}

/**
 * Mermaid fences become placeholders carrying the exact source. The renderer replaces a
 * placeholder with an SVG; until then (and whenever rendering is unavailable) the source stays
 * visible and selectable, so no document content is ever lost.
 */
export function diagramFences(md: MarkdownIt, options: DiagramFenceOptions = {}): void {
  if (options.diagrams === false) return
  const original = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, index, opts, env, self) => {
    const token = tokens[index]
    if (!isDiagramFence(token)) {
      return original
        ? original(tokens, index, opts, env, self)
        : self.renderToken(tokens, index, opts)
    }
    const source = token.content.replace(/\n$/, '')
    const line = token.map ? token.map[0] + 1 : 0
    return (
      `<figure class="ms-diagram" data-ms-diagram="${hashText(source)}" data-ms-line="${line}">` +
      `<pre class="ms-diagram-source"><code class="language-mermaid">${escapeHtml(source)}</code></pre>` +
      `</figure>\n`
    )
  }
}

const PAGE_BREAK = /^<!--\s*page-?break\s*-->\s*$/i

/**
 * `<!-- pagebreak -->` on its own line starts a new printed page. In the HTML preview and in
 * exported HTML it is an invisible separator; in the PDF it forces a page break.
 */
export function pageBreaks(md: MarkdownIt): void {
  md.core.ruler.push('page_breaks', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'html_block' && PAGE_BREAK.test(token.content.trim())) {
        token.type = 'page_break'
        token.content = ''
      }
    }
  })
  md.renderer.rules.page_break = () =>
    '<div class="ms-page-break" role="separator" aria-hidden="true"></div>\n'
}
