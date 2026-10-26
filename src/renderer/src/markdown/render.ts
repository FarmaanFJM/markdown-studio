import type { MarkdownIt } from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import { createApplicationMarkdownIt } from '@shared/markdown/plugins'
import type { PublishingEnv, PublishingOptions, PublishingResult } from '@shared/publishing/types'
import { renderMath } from './math'

/** Unforgeable per-session marker: documents cannot reference math slots themselves. */
const SLOT_NONCE = crypto.randomUUID().replace(/-/g, '')
const SLOT_PATTERN = new RegExp(`<span data-ms-math="${SLOT_NONCE}:(\\d+)"></span>`, 'g')

type RenderEnv = { mathSlots: string[] } & PublishingEnv

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
    // Equations are rendered (and sanitised) once and cached; the document only carries a slot,
    // so sanitising a document with hundreds of equations stays cheap.
    math: features.math
      ? {
          render: (tex, display, env) => {
            const slots = (env as RenderEnv | undefined)?.mathSlots
            if (!slots) return renderMath(tex, display)
            return `<span data-ms-math="${SLOT_NONCE}:${slots.push(renderMath(tex, display)) - 1}"></span>`
          }
        }
      : false,
    diagrams: features.diagrams
  })
}

const instances = new Map<string, MarkdownIt>()

export interface RenderedMarkdown {
  /** HTML with equations replaced by slots. Sanitise it, then call `fillMathSlots`. */
  html: string
  slots: string[]
  /** Labels, headings, citations and problems found while rendering. */
  publishing: PublishingResult | undefined
}

/** Converts Markdown to HTML whose equations are slots for already-sanitised markup. */
export function renderMarkdownSlots(
  source: string,
  features: RenderFeatures = ALL_FEATURES,
  publishing: PublishingOptions = {}
): RenderedMarkdown {
  const key = `${features.math}|${features.diagrams}`
  let renderer = instances.get(key)
  if (!renderer) {
    renderer = createMarkdownRenderer(features)
    instances.set(key, renderer)
  }
  const env: RenderEnv = { mathSlots: [], ms: { ...publishing } }
  const html = renderer.render(source, env as never)
  return { html, slots: env.mathSlots, publishing: env.ms?.result }
}

/** Puts the (separately sanitised) equation markup back into sanitised document HTML. */
export function fillMathSlots(html: string, slots: string[]): string {
  if (slots.length === 0) return html
  return html.replace(SLOT_PATTERN, (_whole, index: string) => slots[Number(index)] ?? '')
}

/**
 * Converts Markdown to HTML with equations in place. The document text is unsanitised: always
 * pass it through `sanitizeHtml` (as `renderDocumentBody` does); only equation markup in the
 * result has already been sanitised.
 */
export function renderMarkdown(source: string, features: RenderFeatures = ALL_FEATURES): string {
  const { html, slots } = renderMarkdownSlots(source, features)
  return fillMathSlots(html, slots)
}
