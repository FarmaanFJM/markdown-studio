import type { MarkdownIt } from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import { createApplicationMarkdownIt } from '@shared/markdown/plugins'

export { slugify } from '@shared/markdown/slug'

function highlight(code: string, language: string): string {
  const name = language.trim().toLowerCase()
  if (name && hljs.getLanguage(name)) {
    try {
      return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
    } catch {
      // Fall through to markdown-it's own escaping.
    }
  }
  return ''
}

export function createMarkdownRenderer(): MarkdownIt {
  return createApplicationMarkdownIt({ highlight, linkify: true })
}

let shared: MarkdownIt | null = null

/** Converts Markdown to (unsanitised) HTML. Always pass the result through `sanitizeHtml`. */
export function renderMarkdown(source: string): string {
  shared ??= createMarkdownRenderer()
  return shared.render(source)
}
