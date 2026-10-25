import type { MarkdownIt } from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import { createApplicationMarkdownIt } from '@shared/markdown/plugins'
import { renderMath } from './math'

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

/** Switches for the optional render extensions. */
export interface RenderFeatures {
  math: boolean
  diagrams: boolean
}

export const ALL_FEATURES: RenderFeatures = { math: true, diagrams: true }

export function createMarkdownRenderer(features: RenderFeatures = ALL_FEATURES): MarkdownIt {
  return createApplicationMarkdownIt({
    highlight,
    linkify: true,
    math: features.math ? { render: renderMath } : false,
    diagrams: features.diagrams
  })
}

const instances = new Map<string, MarkdownIt>()

/** Converts Markdown to (unsanitised) HTML. Always pass the result through `sanitizeHtml`. */
export function renderMarkdown(source: string, features: RenderFeatures = ALL_FEATURES): string {
  const key = `${features.math}|${features.diagrams}`
  let renderer = instances.get(key)
  if (!renderer) {
    renderer = createMarkdownRenderer(features)
    instances.set(key, renderer)
  }
  return renderer.render(source)
}
