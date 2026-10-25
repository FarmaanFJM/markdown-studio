import type { MarkdownIt, Token } from 'markdown-it'
import type { StateBlock, StateInline } from 'markdown-it'

/**
 * Mathematical notation for markdown-it: `$x$`, `$$x$$`, `\(x\)` and `\[x\]`.
 *
 * Parsing and rendering are separate. This module only recognises math and produces
 * `math_inline` / `math_block` tokens; the host supplies `render` (KaTeX in the application).
 * Because the editor tooling parses with the same plugin, `$` characters inside math never
 * confuse link, table or outline analysis.
 *
 * The rules are deliberately conservative, following Pandoc:
 *   - an opening `$` must be followed by a non-space character and a closing `$` preceded by one,
 *     and the closing `$` must not be followed by a digit, so `costs $5 and $10` is not math;
 *   - `\$` is an escaped dollar (markdown-it's own escape rule runs on it);
 *   - math never starts inside code spans or fenced/indented code, because those are consumed
 *     by earlier rules;
 *   - `\( … \)` and `\[ … \]` are math only when the closing delimiter exists.
 */
export interface MathOptions {
  /** Renders TeX to an HTML string. Must escape its own output. */
  render?: (tex: string, display: boolean) => string
}

const DOLLAR = 0x24
const BACKSLASH = 0x5c
const BACKTICK = 0x60

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}
function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const start = state.pos
  const first = src.charCodeAt(start)
  let contentStart: number
  let contentEnd = -1
  let end = -1
  let display = false

  if (first === BACKSLASH) {
    // \( … \)
    if (src.charCodeAt(start + 1) !== 0x28) return false
    contentStart = start + 2
    for (let i = contentStart; i < state.posMax - 1; i++) {
      const code = src.charCodeAt(i)
      if (code === BACKSLASH) {
        if (src.charCodeAt(i + 1) === 0x29) {
          contentEnd = i
          end = i + 2
          break
        }
        i++ // skip the escaped character
      }
    }
  } else if (first === DOLLAR) {
    if (src.charCodeAt(start + 1) === DOLLAR) {
      // $$ … $$ inside a paragraph
      display = true
      contentStart = start + 2
      for (let i = contentStart; i < state.posMax - 1; i++) {
        const code = src.charCodeAt(i)
        if (code === BACKSLASH) {
          i++
        } else if (code === DOLLAR && src.charCodeAt(i + 1) === DOLLAR) {
          contentEnd = i
          end = i + 2
          break
        }
      }
    } else {
      contentStart = start + 1
      if (contentStart >= state.posMax || isSpace(src.charCodeAt(contentStart))) return false
      for (let i = contentStart; i < state.posMax; i++) {
        const code = src.charCodeAt(i)
        if (code === BACKSLASH) {
          i++
        } else if (code === DOLLAR) {
          const before = src.charCodeAt(i - 1)
          const after = i + 1 < state.posMax ? src.charCodeAt(i + 1) : 0
          if (i === contentStart || isSpace(before) || isDigit(after) || after === DOLLAR) {
            // Not a valid closer: either the expression is not math or the dollar belongs to
            // the next number ("$5-$10"). Stop looking; this is not math.
            return false
          }
          contentEnd = i
          end = i + 1
          break
        }
      }
    }
  } else {
    return false
  }

  if (end < 0) return false
  const tex = src.slice(contentStart, contentEnd)
  // A backtick inside would mean the "math" swallowed a code span: treat as ordinary text.
  if (tex.trim() === '' || tex.includes('`') || src.charCodeAt(contentStart - 1) === BACKTICK) {
    return false
  }
  if (!silent) {
    const token = state.push('math_inline', 'span', 0)
    token.content = tex
    token.markup = first === BACKSLASH ? '\\(' : display ? '$$' : '$'
    token.meta = { display }
  }
  state.pos = end
  return true
}

function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false
  const first = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  const lineText = state.src.slice(first, max)

  let open: '$$' | '\\['
  let close: string
  if (lineText.startsWith('$$')) {
    open = '$$'
    close = '$$'
  } else if (lineText.startsWith('\\[')) {
    open = '\\['
    close = '\\]'
  } else {
    return false
  }

  const afterOpen = lineText.slice(2)
  let content = ''
  let nextLine = startLine + 1
  let closed = false

  const trimmedEnd = afterOpen.trimEnd()
  if (trimmedEnd.endsWith(close) && trimmedEnd.length >= close.length) {
    // Everything on one line: $$ x $$
    content = trimmedEnd.slice(0, -close.length)
    closed = true
  } else {
    const parts: string[] = [afterOpen]
    for (let line = startLine + 1; line < endLine; line++) {
      const lineStart = state.bMarks[line] + state.tShift[line]
      const lineMax = state.eMarks[line]
      // A line that is less indented than the block ends it (list items, quotes).
      if (state.sCount[line] < state.blkIndent && lineStart < lineMax) break
      const text = state.src.slice(lineStart, lineMax)
      nextLine = line + 1
      const trimmed = text.trimEnd()
      if (trimmed.endsWith(close)) {
        parts.push(trimmed.slice(0, -close.length))
        closed = true
        break
      }
      parts.push(text)
    }
    content = parts.join('\n')
  }

  if (!closed) return false
  // Text after the closing delimiter on the same line is not supported; the single-line form
  // above already required the delimiter to be last.
  if (content.trim() === '') return false
  if (silent) return true

  state.line = nextLine
  const token = state.push('math_block', 'div', 0)
  token.block = true
  token.content = content.replace(/^\n+|\n+$/g, '')
  token.map = [startLine, nextLine]
  token.markup = open
  return true
}

export function mathPlugin(md: MarkdownIt, options: MathOptions = {}): void {
  const render =
    options.render ??
    ((tex: string, display: boolean) =>
      `<code class="ms-math-source" data-display="${display}">${escapeHtml(tex)}</code>`)

  // Before `escape`, so that `\(` is seen before it is turned into a literal parenthesis.
  md.inline.ruler.before('escape', 'math_inline', mathInline)
  md.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  })

  md.renderer.rules.math_inline = (tokens: Token[], index: number) => {
    const token = tokens[index]
    return render(token.content, Boolean(token.meta?.display))
  }
  md.renderer.rules.math_block = (tokens: Token[], index: number) => {
    const token = tokens[index]
    const line = token.map ? ` data-ms-line="${token.map[0] + 1}"` : ''
    return `<div class="ms-math-block"${line}>${render(token.content, true)}</div>\n`
  }
}
