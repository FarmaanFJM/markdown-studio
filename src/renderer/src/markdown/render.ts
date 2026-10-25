import createMarkdownIt, { type MarkdownIt, type Token } from 'markdown-it'
import hljs from 'highlight.js/lib/common'

/** GitHub-style heading slug: lower case, punctuation removed, spaces become hyphens. */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
  return slug || 'section'
}

function inlineText(token: Token | undefined): string {
  if (!token?.children) return token?.content ?? ''
  return token.children
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('')
}

/** Adds `id` attributes to headings so in-document links such as `#installation` work. */
function headingIds(md: MarkdownIt): void {
  md.core.ruler.push('heading_ids', (state) => {
    const used = new Map<string, number>()
    state.tokens.forEach((token, index) => {
      if (token.type !== 'heading_open' || token.attrGet('id')) return
      const base = slugify(inlineText(state.tokens[index + 1]))
      const count = used.get(base) ?? 0
      used.set(base, count + 1)
      token.attrSet('id', count === 0 ? base : `${base}-${count}`)
    })
  })
}

const TASK_PATTERN = /^\[([ xX])\](?=\s|$)/

/** GitHub Flavored Markdown task lists: `- [ ] todo` and `- [x] done`. */
function taskLists(md: MarkdownIt): void {
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
  const md = createMarkdownIt({
    html: true, // Markdown documents may contain inline and block HTML; it is sanitised later.
    linkify: true,
    typographer: false,
    breaks: false,
    highlight
  })
  md.use(headingIds)
  md.use(taskLists)
  return md
}

let shared: MarkdownIt | null = null

/** Converts Markdown to (unsanitised) HTML. Always pass the result through `sanitizeHtml`. */
export function renderMarkdown(source: string): string {
  shared ??= createMarkdownRenderer()
  return shared.render(source)
}
