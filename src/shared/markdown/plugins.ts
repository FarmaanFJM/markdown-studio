import createMarkdownIt, { type MarkdownIt, type Token } from 'markdown-it'
import { diagramFences, pageBreaks } from './blocks'
import { mathPlugin, type MathOptions } from './math'
import { publishingPlugin } from '../publishing/plugin'
import type { PublishingEnv } from '../publishing/types'
import { SlugAllocator } from './slug'
import { manualHeadingNumber } from './headingNumbers'

/** Plain text of an inline token (text and code spans only), used for heading ids and labels. */
export function inlineText(token: Token | undefined): string {
  if (!token?.children) return token?.content ?? ''
  return token.children
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('')
}

/** Adds `id` attributes to headings so in-document links such as `#installation` work. */
export function headingIds(md: MarkdownIt): void {
  md.core.ruler.push('heading_ids', (state) => {
    const slugs = new SlugAllocator()
    // Chapters of one publication get distinct prefixes so ids stay unique after merging.
    const prefix = (state.env as PublishingEnv | undefined)?.ms?.idPrefix ?? ''
    state.tokens.forEach((token, index) => {
      if (token.type !== 'heading_open' || token.attrGet('id')) return
      token.attrSet('id', prefix + slugs.next(inlineText(state.tokens[index + 1])))
    })
  })
}

/**
 * Marks headings the author already numbered by hand (`## 1. Introduction`, `### 4.1 Comparison`)
 * with the class `manual-number`, so a theme that numbers headings itself (Professional Report)
 * does not print the number twice. Mirroring the theme's counters, the heading also carries the
 * counter value it stands for, so headings without a typed number keep counting from it.
 *
 * A level-2 heading counts as numbered when it starts with `N.`; a level-3 heading when it starts
 * with `M.N` and `M` is the number of the section it sits in.
 */
export function headingNumbers(md: MarkdownIt): void {
  md.core.ruler.push('heading_numbers', (state) => {
    let section = 0
    let subsection = 0
    state.tokens.forEach((token, index) => {
      if (token.type !== 'heading_open') return
      const level = Number(token.tag.slice(1))
      if (level !== 2 && level !== 3) return
      const found = manualHeadingNumber(inlineText(state.tokens[index + 1]))
      if (level === 2) {
        if (found && found.parts.length === 1) {
          section = found.parts[0]
          subsection = 0
          token.attrJoin('class', 'manual-number')
          token.attrSet('style', `counter-set: report-h2 ${section} report-h3 0`)
        } else {
          section++
          subsection = 0
        }
      } else if (found && found.parts.length === 2 && found.parts[0] === section) {
        subsection = found.parts[1]
        token.attrJoin('class', 'manual-number')
        token.attrSet('style', `counter-set: report-h3 ${subsection}`)
      } else {
        subsection++
      }
    })
  })
}

const TASK_PATTERN = /^\[([ xX])\](?=\s|$)/

/** GitHub Flavored Markdown task lists: `- [ ] todo` and `- [x] done`. */
export function taskLists(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'task_lists', (state) => {
    const tokens = state.tokens
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i]
      if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open') continue
      const item = tokens[i - 2]
      if (item.type !== 'list_item_open') continue
      const first = inline.children?.[0]
      const match = first?.type === 'text' ? TASK_PATTERN.exec(first.content) : null
      if (!first || !match) continue

      first.content = first.content.slice(match[0].length).replace(/^\s/, '')
      const checkbox = new state.Token('html_inline', '', 0)
      checkbox.content = `<input type="checkbox" class="task-list-item-checkbox" disabled${
        match[1] === ' ' ? '' : ' checked'
      }> `
      inline.children!.unshift(checkbox)
      item.attrJoin('class', 'task-list-item')

      for (let j = i - 3; j >= 0; j--) {
        const candidate = tokens[j]
        if (candidate.level === item.level - 1 && candidate.type.endsWith('_list_open')) {
          if (!String(candidate.attrGet('class') ?? '').includes('contains-task-list')) {
            candidate.attrJoin('class', 'contains-task-list')
          }
          break
        }
      }
    }
  })
}

export interface MarkdownItOptions {
  highlight?: (code: string, language: string) => string
  linkify?: boolean
  /**
   * Mathematical notation. Parsing is always on for the editor tooling; the preview and the
   * exports pass `false` when the user switched math rendering off.
   */
  math?: MathOptions | false
  /** Render `mermaid` fences as diagram placeholders (default) or as plain code. */
  diagrams?: boolean
}

/**
 * The one markdown-it configuration of the application. The preview, the PDF and HTML export
 * and every editing feature (outline, tables, links, diagnostics) parse with it, so they cannot
 * disagree about what a document contains.
 */
export function createApplicationMarkdownIt(options: MarkdownItOptions = {}): MarkdownIt {
  const md = createMarkdownIt({
    html: true, // Markdown documents may contain inline and block HTML; it is sanitised later.
    linkify: options.linkify ?? true,
    typographer: false,
    breaks: false,
    highlight: options.highlight
  })
  md.use(headingIds)
  md.use(taskLists)
  md.use(headingNumbers)
  if (options.math !== false) md.use(mathPlugin, options.math ?? {})
  md.use(diagramFences, { diagrams: options.diagrams })
  md.use(pageBreaks)
  md.use(publishingPlugin)
  return md
}
