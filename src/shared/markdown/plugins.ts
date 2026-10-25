import createMarkdownIt, { type MarkdownIt, type Token } from 'markdown-it'
import { SlugAllocator } from './slug'

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
    state.tokens.forEach((token, index) => {
      if (token.type !== 'heading_open' || token.attrGet('id')) return
      token.attrSet('id', slugs.next(inlineText(state.tokens[index + 1])))
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
  return md
}
