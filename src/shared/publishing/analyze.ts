import { createApplicationMarkdownIt } from '../markdown/plugins'
import { slugify } from '../markdown/slug'
import {
  LABEL_PREFIX,
  type LabelKind,
  type PublishingEnv,
  type PublishingOptions,
  type PublishingResult
} from './types'

const parser = createApplicationMarkdownIt()

/**
 * Parses a document with the shared pipeline (without rendering) and returns its labels,
 * headings, citations and problems. This is what editor diagnostics, pickers and the
 * publication builder read, so they always agree with the preview.
 */
export function analyzePublishing(text: string, options: PublishingOptions = {}): PublishingResult {
  const env: PublishingEnv = { ms: { ...options } }
  parser.parse(text, env as never)
  return env.ms!.result!
}

/** A readable identifier such as `fig-health-bars`, unique among `taken`. */
export function suggestLabelId(
  kind: LabelKind,
  caption: string,
  taken: ReadonlySet<string>
): string {
  const slug = slugify(caption.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
    .replace(/-$/, '')
  const base = `${LABEL_PREFIX[kind]}${slug && slug !== 'section' ? slug : 'item'}`
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
