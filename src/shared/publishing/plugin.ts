/**
 * The publishing extensions of the shared markdown-it configuration. The syntax is a subset of
 * Pandoc/Quarto, so the same files stay readable (and buildable) elsewhere:
 *
 * - front matter between `---` fences at the top of the file (hidden in the output)
 * - attributes on headings and images: `# Title {#sec-intro}`, `![Caption](a.png){#fig-a}`
 * - table captions: a paragraph `: Caption {#tbl-a}` right after a table (blank line between)
 * - cross-references `@fig-a`, `@tbl-a`, `@sec-a`
 * - citations `[@key]`, `[see @a, p. 3; @b]`, `[-@key]`, `@key`
 * - generated blocks: `[TOC]`, `[LOF]`, `[LOT]` and `::: {#refs}` + `:::` for the bibliography
 *
 * Numbering and cross-reference resolution are pure functions of the token stream (plus the
 * options in `env.ms`), so preview, PDF and HTML export always agree.
 */
import type { MarkdownIt, Token } from 'markdown-it'
import { escapeHtml } from '../markdown/blocks'
import { startsWithNumber } from '../markdown/headingNumbers'
import {
  captionNames,
  LABEL_ID,
  LABEL_PREFIX,
  startOfDocument,
  type CitationCluster,
  type CitationItem,
  type HeadingEntry,
  type Label,
  type LabelKind,
  type NumberingStart,
  type PublishingEnv,
  type PublishingProblem,
  type PublishingResult
} from './types'

// ---------------------------------------------------------------- front matter (block rule)

const FM_OPEN = /^---[ \t]*$/
const FM_CLOSE = /^(?:---|\.\.\.)[ \t]*$/

function frontMatterRule(
  state: {
    src: string
    bMarks: number[]
    eMarks: number[]
    tShift: number[]
    sCount: number[]
    lineMax: number
    line: number
    push: (t: string, tag: string, n: number) => Token
  },
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  if (startLine !== 0 || state.sCount[0] - 0 !== 0) return false
  const line = (n: number) =>
    state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]).replace(/^\ufeff/, '')
  if (!FM_OPEN.test(line(0))) return false
  let close = -1
  for (let n = 1; n < endLine; n++) {
    if (FM_CLOSE.test(line(n))) {
      close = n
      break
    }
  }
  if (close < 0) return false
  if (silent) return true
  const token = state.push('front_matter', '', 0)
  token.map = [0, close + 1]
  token.content = state.src.slice(state.bMarks[1], state.bMarks[close])
  token.hidden = true
  state.line = close + 1
  return true
}

// ---------------------------------------------------------------------- attribute blocks

export interface Attributes {
  id?: string
  classes: string[]
  pairs: Record<string, string>
}

const ATTR_BLOCK = /^\{([^{}\n]*)\}/

/** Parses the inside of `{#id .class key=value key="v"}`; null when it is not an attribute list. */
export function parseAttributes(text: string): Attributes | null {
  const out: Attributes = { classes: [], pairs: {} }
  const pattern =
    /\s*(?:#([^\s{}.#=]+)|\.([^\s{}.#=]+)|([A-Za-z][\w-]*)=(?:"([^"]*)"|([^\s"{}]+)))/y
  let pos = 0
  text = text.trim()
  if (text === '') return null
  while (pos < text.length) {
    pattern.lastIndex = pos
    const m = pattern.exec(text)
    if (!m) return null
    if (m[1] !== undefined) out.id = m[1]
    else if (m[2] !== undefined) out.classes.push(m[2])
    else out.pairs[m[3]] = m[4] ?? m[5] ?? ''
    pos = pattern.lastIndex
  }
  return out
}

interface Meta {
  attrs?: Attributes
  /** Id usable as a label target (valid characters). */
  labelId?: string
  figure?: { caption: string; id: string; full: boolean }
  tableCaption?: { caption: string; id?: string; full: boolean }
  /** A table small enough to keep on one page. */
  short?: boolean
  /** Resolved at render time. */
  numberText?: string
}

function metaOf(token: Token): Meta {
  if (!token.meta || typeof token.meta !== 'object') token.meta = {}
  return token.meta as Meta
}

// ----------------------------------------------------------------------- citation parsing

const KEY = '[A-Za-z0-9_](?:[A-Za-z0-9_]|[:.#$%&+?<>~/-](?=[A-Za-z0-9_]))*'
const KEY_AT_START = new RegExp(`^(${KEY})`)
const CROSSREF = /^(fig|tbl|sec)-/

export function isCrossRefId(id: string): boolean {
  return CROSSREF.test(id)
}

function parseClusterItem(raw: string): CitationItem | null {
  const m = new RegExp(`^\\s*([^@;\\[\\]]*?)(-)?@(${KEY})(.*)$`, 's').exec(raw)
  if (!m) return null
  const suffix = m[4].replace(/^\s*,?\s*/, '').trim()
  return { id: m[3], prefix: m[1].trim(), suffix, suppressAuthor: m[2] === '-' }
}

function citeRule(
  state: {
    src: string
    pos: number
    posMax: number
    push: (t: string, tag: string, n: number) => Token
  },
  silent: boolean
): boolean {
  const start = state.pos
  const ch = state.src.charCodeAt(start)
  if (ch === 0x5b /* [ */) {
    const end = state.src.indexOf(']', start + 1)
    if (end < 0 || end >= state.posMax) return false
    const inner = state.src.slice(start + 1, end)
    if (!inner.includes('@')) return false
    const next = state.src.charCodeAt(end + 1)
    if (next === 0x28 /* ( */ || next === 0x5b /* [ */ || next === 0x3a /* : */) return false
    const items: CitationItem[] = []
    for (const part of inner.split(';')) {
      const item = parseClusterItem(part)
      if (!item) return false
      items.push(item)
    }
    if (!silent) {
      const token = state.push('cite', '', 0)
      token.meta = { items, narrative: false }
      token.content = state.src.slice(start, end + 1)
    }
    state.pos = end + 1
    return true
  }
  if (ch === 0x40 /* @ */ || (ch === 0x2d && state.src.charCodeAt(start + 1) === 0x40)) {
    // `-@key` outside brackets is not citation syntax; only `@key` is.
    if (ch !== 0x40) return false
    if (start > 0 && /[\p{L}\p{N}_]/u.test(state.src[start - 1])) return false
    const m = KEY_AT_START.exec(state.src.slice(start + 1, state.posMax))
    if (!m) return false
    if (!silent) {
      const token = state.push('cite', '', 0)
      token.meta = {
        items: [{ id: m[1], prefix: '', suffix: '', suppressAuthor: false }],
        narrative: true
      }
      token.content = `@${m[1]}`
    }
    state.pos = start + 1 + m[1].length
    return true
  }
  return false
}

/**
 * Captions are rendered with their own environment: `renderInline` runs the core rules again,
 * which would otherwise overwrite the results of the document being rendered. Math slots are
 * shared so equations in captions are filled in like any other.
 */
function captionEnv(env: unknown): Record<string, unknown> {
  const slots = (env as { mathSlots?: string[] } | undefined)?.mathSlots
  return slots ? { mathSlots: slots } : {}
}

// ------------------------------------------------------------------------------ the plugin

interface Options {
  /** Names of the heading levels etc. for `renderInline`; not needed by callers. */
  none?: never
}

interface Collected {
  labels: Label[]
  headings: HeadingEntry[]
  problems: PublishingProblem[]
  end: NumberingStart
  base: number
}

function lineOf(token: Token | undefined): number {
  return token?.map ? token.map[0] : 0
}

function headingTextOf(inline: Token | undefined): string {
  if (!inline?.children) return inline?.content ?? ''
  return inline.children
    .filter((c) => c.type === 'text' || c.type === 'code_inline')
    .map((c) => c.content)
    .join('')
}

/** Tables with at most this many rows (header included) are not split across pages. */
const SHORT_TABLE_ROWS = 20

export function publishingPlugin(md: MarkdownIt, _options: Options = {}): void {
  void _options
  md.block.ruler.before('hr', 'front_matter', frontMatterRule as never, {
    alt: []
  })
  md.renderer.rules.front_matter = () => ''
  md.inline.ruler.before('link', 'ms_cite', citeRule as never)

  // ---- attributes, figures and table captions -------------------------------------------
  md.core.ruler.after('inline', 'ms_attrs', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.type === 'heading_open') {
        const inline = tokens[i + 1]
        const last = inline?.children?.[inline.children.length - 1]
        if (last?.type === 'text') {
          const m = /\s*\{([^{}\n]*)\}\s*$/.exec(last.content)
          const attrs = m ? parseAttributes(m[1]) : null
          if (m && attrs && (attrs.id || attrs.classes.length > 0)) {
            last.content = last.content.slice(0, m.index)
            const meta = metaOf(token)
            meta.attrs = attrs
            if (attrs.id) {
              token.attrSet('id', attrs.id)
              if (LABEL_ID.test(attrs.id)) meta.labelId = attrs.id
            }
          }
        }
      } else if (token.type === 'inline' && token.children) {
        const children = token.children
        for (let c = 0; c < children.length; c++) {
          const child = children[c]
          if (child.type !== 'image') continue
          const next = children[c + 1]
          if (next?.type !== 'text') continue
          const m = ATTR_BLOCK.exec(next.content)
          const attrs = m ? parseAttributes(m[1]) : null
          if (!m || !attrs) continue
          next.content = next.content.slice(m[0].length)
          const meta = metaOf(child)
          meta.attrs = attrs
          if (attrs.id) meta.labelId = attrs.id
          const width = attrs.pairs.width
          if (width && /^\d{1,4}(?:\.\d+)?(?:%|px)?$/.test(width)) {
            child.attrSet('width', /^\d+$/.test(width) ? width : width)
          }
        }
        // Drop text tokens emptied by removing the attribute block.
        token.children = children.filter((c) => !(c.type === 'text' && c.content === ''))
      } else if (token.type === 'table_close') {
        const open = tokens[i + 1]
        const inline = tokens[i + 2]
        const close = tokens[i + 3]
        if (
          open?.type === 'paragraph_open' &&
          inline?.type === 'inline' &&
          close?.type === 'paragraph_close'
        ) {
          const m = /^:\s+(.*?)(?:\s*\{([^{}\n]*)\})?\s*$/s.exec(inline.content)
          if (m) {
            const attrs = m[2] ? parseAttributes(m[2]) : null
            // Walk back to the table_open this caption belongs to.
            let depth = 0
            for (let j = i; j >= 0; j--) {
              if (tokens[j].type === 'table_close') depth++
              else if (tokens[j].type === 'table_open' && --depth === 0) {
                metaOf(tokens[j]).tableCaption = {
                  caption: m[1],
                  id: attrs?.id,
                  full: attrs?.classes.includes('full-width') ?? false
                }
                break
              }
            }
            tokens.splice(i + 1, 3)
          }
        }
      }
    }
    // A paragraph holding only a labelled image is a figure.
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (tokens[i].type !== 'paragraph_open' || tokens[i + 2].type !== 'paragraph_close') continue
      const inline = tokens[i + 1]
      const kids = (inline.children ?? []).filter(
        (c) => !(c.type === 'text' && c.content.trim() === '')
      )
      if (kids.length === 1 && kids[0].type === 'image' && metaOf(kids[0]).labelId) {
        const meta = metaOf(tokens[i])
        meta.figure = {
          caption: kids[0].content,
          id: metaOf(kids[0]).labelId!,
          full: metaOf(kids[0]).attrs?.classes.includes('full-width') ?? false
        }
        metaOf(tokens[i + 2]).figure = meta.figure
        if (tokens[i].attrGet('id') === null) tokens[i].attrSet('id', meta.figure.id)
      }
    }
  })

  // ---- numbering, references, TOC, citations --------------------------------------------
  md.core.ruler.push('ms_publish', (state) => {
    const env = (state.env ?? {}) as PublishingEnv
    const opts = env.ms ?? {}
    const names = captionNames(opts.lang)
    const tokens = state.tokens
    const collected = collect(tokens, opts, md)
    const labelMap = new Map<string, Label>()
    for (const label of opts.labels?.values() ?? []) labelMap.set(label.id, label)
    for (const label of collected.labels) if (!opts.labels) labelMap.set(label.id, label)
    const problems = collected.problems
    const prefix = opts.idPrefix ?? ''

    // Short tables are kept on one page (with their caption); long ones may continue.
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'table_open') continue
      let rows = 0
      for (let j = i + 1; j < tokens.length && tokens[j].type !== 'table_close'; j++) {
        if (tokens[j].type === 'tr_open') rows++
      }
      if (rows <= SHORT_TABLE_ROWS) metaOf(tokens[i]).short = true
    }

    // Inject numbers into headings and caption labels into figures/tables.
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.type === 'heading_open') {
        const number = metaOf(token).numberText
        if (number) {
          const span = new state.Token('html_inline', '', 0)
          span.content = `<span class="ms-secnum">${escapeHtml(number)}</span> `
          tokens[i + 1].children?.unshift(span)
        }
      }
    }

    // Cross-references: rewrite `cite` tokens whose ids look like labels into `xref` tokens.
    const clusters: CitationCluster[] = []
    const citeTokens: Token[] = []
    let blockLine = 0
    for (const token of tokens) {
      if (token.type === 'inline' && token.children) {
        blockLine = lineOf(token)
        for (let c = 0; c < token.children.length; c++) {
          const child = token.children[c]
          if (child.type !== 'cite') continue
          const items = (child.meta as { items: CitationItem[] }).items
          if (items.every((it) => isCrossRefId(it.id))) {
            const parts = items.map((it) => {
              const label = labelMap.get(it.id)
              const wanted = it.id.slice(0, 3) as LabelKind
              if (!label || label.kind !== wanted) {
                problems.push({
                  kind: 'missing-target',
                  id: it.id,
                  line: blockLine,
                  message: `No ${wanted === 'fig' ? 'figure' : wanted === 'tbl' ? 'table' : 'section'} has the identifier "${it.id}".`
                })
                return `<span class="ms-xref ms-xref-missing" title="Unknown reference: ${escapeHtml(it.id)}">?@${escapeHtml(it.id)}</span>`
              }
              const word =
                label.kind === 'fig'
                  ? names.figure
                  : label.kind === 'tbl'
                    ? names.table
                    : names.section
              const text = label.number ? `${word}\u00a0${label.number}` : `“${label.text}”`
              const href = `#${escapeHtml(label.id)}`
              return `<a class="ms-xref" href="${href}">${escapeHtml(text)}</a>`
            })
            child.type = 'xref'
            child.content = parts.join('; ')
          } else {
            const cluster: CitationCluster = {
              items,
              narrative: Boolean((child.meta as { narrative: boolean }).narrative),
              line: blockLine
            }
            clusters.push(cluster)
            citeTokens.push(child)
          }
        }
      }
    }

    // Citations: one provider call for the whole document keeps disambiguation consistent.
    let bibliography: string[] = []
    if (clusters.length > 0 && opts.cite) {
      const result = opts.cite(clusters)
      citeTokens.forEach((token, index) => {
        token.content = result.html[index] ?? ''
        metaOf(token).numberText = 'done'
      })
      bibliography = result.bibliography
      for (const key of result.missing) {
        const at = clusters.find((cl) => cl.items.some((it) => it.id === key))
        problems.push({
          kind: 'missing-source',
          id: key,
          line: at?.line ?? 0,
          message: `No source with the key "${key}". Add it under Sources.`
        })
      }
    } else {
      for (const token of citeTokens) token.content = token.content ?? ''
    }

    // Generated blocks.
    const toc = opts.toc
    let bibliographyPlaced = false
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.type !== 'paragraph_open' || tokens[i + 2]?.type !== 'paragraph_close') continue
      const inline = tokens[i + 1]
      if (inline.type !== 'inline') continue
      const text = inline.content.trim()
      let html: string | null = null
      if (text === '[TOC]')
        html = tocHtml(
          collected.headings,
          toc?.depth ?? 3,
          names.contents,
          opts.numberSections === true
        )
      else if (text === '[LOF]')
        html = listHtml(collected.labels, 'fig', names.figures, names.figure)
      else if (text === '[LOT]') html = listHtml(collected.labels, 'tbl', names.tables, names.table)
      else if (/^:::\s*\{#refs\}\s*\n:::$/.test(text)) {
        html = bibliographyHtml(bibliography, names.references)
        bibliographyPlaced = true
      }
      if (html !== null) {
        const raw = new state.Token('html_block', '', 0)
        raw.content = html
        raw.map = token.map
        tokens.splice(i, 3, raw)
      }
    }
    if (
      toc?.enabled &&
      !tokens.some((t) => t.type === 'html_block' && t.content.includes('class="ms-toc"'))
    ) {
      const raw = new state.Token('html_block', '', 0)
      raw.content = tocHtml(
        collected.headings,
        toc.depth,
        names.contents,
        opts.numberSections === true
      )
      // After the title (a leading level-1 heading), else at the very top.
      let at = 0
      while (at < tokens.length && tokens[at].type === 'front_matter') at++
      if (tokens[at]?.type === 'heading_open' && tokens[at].tag === 'h1') at += 3
      tokens.splice(at, 0, raw)
    }
    if (!bibliographyPlaced && bibliography.length > 0 && opts.bibliographyAtEnd !== false) {
      const raw = new state.Token('html_block', '', 0)
      raw.content = bibliographyHtml(bibliography, names.references)
      tokens.push(raw)
    }

    // Keep generated heading ids unique across chapters and make in-chapter links follow.
    if (prefix) {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        if (token.type === 'inline' && token.children) {
          for (const child of token.children) {
            if (child.type !== 'link_open') continue
            const href = String(child.attrGet('href') ?? '')
            if (!href.startsWith('#')) continue
            let fragment = href.slice(1)
            try {
              fragment = decodeURIComponent(fragment)
            } catch {
              // keep as written
            }
            if (!labelMap.has(fragment))
              child.attrSet('href', `#${encodeURIComponent(prefix + fragment)}`)
          }
        }
      }
    }

    const result: PublishingResult = {
      labels: collected.labels,
      headings: collected.headings,
      problems,
      clusters,
      end: collected.end,
      baseLevel: collected.base
    }
    env.ms = { ...opts, result }
    ;(state.env as PublishingEnv) = env
  })

  // ---- rendering of the new token types -------------------------------------------------
  md.renderer.rules.cite = (tokens, index) => {
    const token = tokens[index]
    const meta = token.meta as { numberText?: string }
    if (meta.numberText === 'done') return token.content
    return `<span class="ms-cite ms-cite-unresolved">${escapeHtml(token.content)}</span>`
  }
  md.renderer.rules.xref = (tokens, index) => tokens[index].content

  const defaultParagraphOpen = md.renderer.rules.paragraph_open
  md.renderer.rules.paragraph_open = (tokens, index, options, env, self) => {
    const figure = (tokens[index].meta as Meta | null)?.figure
    if (figure)
      return `<figure class="ms-figure${figure.full ? ' ms-full-width' : ''}" id="${escapeHtml(figure.id)}">\n`
    return defaultParagraphOpen
      ? defaultParagraphOpen(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options)
  }
  const defaultParagraphClose = md.renderer.rules.paragraph_close
  md.renderer.rules.paragraph_close = (tokens, index, options, env, self) => {
    const meta = tokens[index].meta as (Meta & { figureLabel?: string }) | null
    const figure = meta?.figure
    if (figure) {
      const label = meta?.numberText ?? ''
      const caption = md.renderInline(figure.caption, captionEnv(env))
      return `<figcaption>${label ? `<span class="ms-caption-label">${escapeHtml(label)}</span> ` : ''}${caption}</figcaption>\n</figure>\n`
    }
    return defaultParagraphClose
      ? defaultParagraphClose(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options)
  }
  const defaultTableOpen = md.renderer.rules.table_open
  md.renderer.rules.table_open = (tokens, index, options, env, self) => {
    const meta = tokens[index].meta as Meta | null
    const caption = meta?.tableCaption
    if (!caption) {
      return defaultTableOpen
        ? defaultTableOpen(tokens, index, options, env, self)
        : self.renderToken(tokens, index, options)
    }
    const id = caption.id && LABEL_ID.test(caption.id) ? ` id="${escapeHtml(caption.id)}"` : ''
    const label = meta?.numberText
      ? `<span class="ms-caption-label">${escapeHtml(meta.numberText)}</span> `
      : ''
    return `<table class="ms-table${meta?.short ? ' ms-table-short' : ''}${caption.full ? ' ms-full-width' : ''}"${id}>\n<caption>${label}${md.renderInline(caption.caption, captionEnv(env))}</caption>\n`
  }
}

// ------------------------------------------------------------------------------ numbering

function collect(
  tokens: Token[],
  opts: NonNullable<PublishingEnv['ms']>,
  md: MarkdownIt
): Collected {
  void md
  const names = captionNames(opts.lang)
  const start = opts.start ?? startOfDocument()
  const counters = {
    chapter: start.chapter,
    headings: [...start.headings],
    figures: start.figures,
    tables: start.tables,
    titlePending: start.chapterTitlePending
  }
  const labels: Label[] = []
  const headings: HeadingEntry[] = []
  const problems: PublishingProblem[] = []
  const seen = new Map<string, Label>()
  const file = ''

  const headingTokens = tokens.filter((t) => t.type === 'heading_open')
  let base = opts.baseLevel ?? 0
  if (base === 0) {
    const levels = headingTokens.map((t) => Number(t.tag.slice(1)))
    const h1 = levels.filter((l) => l === 1).length
    base = levels[0] === 1 && h1 === 1 && levels.length > 1 ? 2 : 1
  }

  const add = (label: Label) => {
    const earlier = seen.get(label.id) ?? opts.labels?.get(label.id)
    if (
      earlier &&
      !(
        opts.labels &&
        opts.labels.get(label.id)?.line === label.line &&
        opts.labels.get(label.id)?.chapter === label.chapter
      )
    ) {
      problems.push({
        kind: 'duplicate-id',
        id: label.id,
        line: label.line,
        message: `The identifier "${label.id}" is used more than once${earlier.file ? ` (also in ${earlier.file})` : ''}. References will point to the first one.`
      })
      return
    }
    seen.set(label.id, label)
    labels.push(label)
  }

  const prefixed = (n: number) =>
    opts.chapterNumbers && counters.chapter > 0 ? `${counters.chapter}.${n}` : String(n)

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const meta = (token.meta ?? {}) as Meta
    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1))
      const inline = tokens[i + 1]
      const text = headingTextOf(inline)
      const attrs = meta.attrs
      const unnumbered =
        attrs?.classes.includes('unnumbered') || attrs?.classes.includes('unlisted')
      let number = ''
      if (opts.numberSections && !unnumbered && level >= base) {
        if (level === 1 && counters.titlePending) {
          counters.titlePending = false
        } else {
          counters.headings[level - 1]++
          for (let d = level; d < 6; d++) counters.headings[d] = 0
          if (level === 1) {
            counters.figures = opts.chapterNumbers ? 0 : counters.figures
            counters.tables = opts.chapterNumbers ? 0 : counters.tables
          }
        }
        number = counters.headings.slice(base - 1, level).join('.')
      } else if (level === 1 && counters.titlePending) {
        counters.titlePending = false
      }
      const id = String(token.attrGet('id') ?? '')
      if (meta.labelId && /^sec-/.test(meta.labelId)) {
        add({
          id: meta.labelId,
          kind: 'sec',
          number,
          text,
          chapter: counters.chapter,
          line: lineOf(token),
          file
        })
      } else if (attrs?.id && /^(?:fig|tbl)-/.test(attrs.id)) {
        problems.push({
          kind: 'invalid-id',
          id: attrs.id,
          line: lineOf(token),
          message: `"${attrs.id}" is a ${attrs.id.startsWith('fig') ? 'figure' : 'table'} identifier but it is on a heading. Use "sec-…" for sections.`
        })
      }
      // A heading the author numbered by hand with the same number is not numbered twice.
      const written = number !== '' && startsWithNumber(text, number)
      if (number && !written) metaOf(token).numberText = number
      headings.push({ level, id, text, number: written ? '' : number, line: lineOf(token) })
    } else if (token.type === 'paragraph_open' && meta.figure) {
      counters.figures++
      const number = prefixed(counters.figures)
      const label = `${names.figure}\u00a0${number}:`
      meta.numberText = label
      const id = meta.figure.id
      if (!id.startsWith(LABEL_PREFIX.fig)) {
        problems.push({
          kind: 'invalid-id',
          id,
          line: lineOf(token),
          message: `Figure identifiers start with "fig-" (found "${id}"), otherwise @-references cannot find them.`
        })
      } else {
        add({
          id,
          kind: 'fig',
          number,
          text: meta.figure.caption,
          chapter: counters.chapter,
          line: lineOf(token),
          file
        })
      }
      // Mirror onto the closing token so the caption can be rendered there.
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'paragraph_close') {
          metaOf(tokens[j]).numberText = label
          break
        }
      }
    } else if (token.type === 'table_open' && meta.tableCaption) {
      const caption = meta.tableCaption
      if (caption.id) {
        if (!caption.id.startsWith(LABEL_PREFIX.tbl) || !LABEL_ID.test(caption.id)) {
          problems.push({
            kind: 'invalid-id',
            id: caption.id,
            line: lineOf(token),
            message: `Table identifiers start with "tbl-" (found "${caption.id}").`
          })
        } else {
          counters.tables++
          const number = prefixed(counters.tables)
          meta.numberText = `${names.table}\u00a0${number}:`
          add({
            id: caption.id,
            kind: 'tbl',
            number,
            text: caption.caption,
            chapter: counters.chapter,
            line: lineOf(token),
            file
          })
        }
      }
    } else if (token.type === 'inline' && token.children) {
      for (const child of token.children) {
        if (child.type === 'image' && (child.meta as Meta | null)?.labelId) {
          const parent = tokens[i - 1]
          if (
            !parent ||
            parent.type !== 'paragraph_open' ||
            !(parent.meta as Meta | null)?.figure
          ) {
            problems.push({
              kind: 'misplaced',
              id: (child.meta as Meta).labelId,
              line: lineOf(token),
              message:
                'A labelled image must be alone in its paragraph to become a numbered figure.'
            })
          }
        }
      }
    }
  }
  const end: NumberingStart = {
    chapter: counters.chapter,
    headings: counters.headings,
    figures: counters.figures,
    tables: counters.tables,
    chapterTitlePending: false
  }
  return { labels, headings, problems, end, base }
}

// -------------------------------------------------------------------------- generated HTML

function tocHtml(
  headings: HeadingEntry[],
  depth: number,
  title: string,
  numbered: boolean,
  skipTitle?: boolean
): string {
  const levels = headings.map((h) => h.level)
  // The document title (a single leading level-1 heading) is not part of its own contents.
  const skipFirst =
    skipTitle ??
    (levels[0] === 1 && levels.filter((l) => l === 1).length === 1 && headings.length > 1)
  const listed = headings.filter((h, i) => h.id && h.level <= depth && !(skipFirst && i === 0))
  if (listed.length === 0) return ''
  const min = Math.min(...listed.map((h) => h.level))
  let html = `<nav class="ms-toc" aria-label="${escapeHtml(title)}">\n<p class="ms-toc-title">${escapeHtml(title)}</p>\n`
  let depthNow = 0
  let needsClose = false
  for (const h of listed) {
    const target = Math.max(h.level, min) - min + 1
    if (target > depthNow) {
      while (depthNow < target) {
        html += '<ul>'
        depthNow++
      }
    } else {
      if (needsClose) html += '</li>'
      while (depthNow > target) {
        html += '</ul></li>'
        depthNow--
      }
    }
    const number =
      numbered && h.number ? `<span class="ms-secnum">${escapeHtml(h.number)}</span> ` : ''
    html += `<li class="ms-toc-l${target}"><a href="#${escapeHtml(encodeURIComponent(h.id))}">${number}${escapeHtml(h.text)}</a>`
    needsClose = true
  }
  if (needsClose) html += '</li>'
  while (depthNow > 1) {
    html += '</ul></li>'
    depthNow--
  }
  return `${html}</ul>\n</nav>\n`
}

export function tocMarkup(
  headings: HeadingEntry[],
  depth: number,
  title: string,
  numbered: boolean,
  skipTitle?: boolean
): string {
  return tocHtml(headings, depth, title, numbered, skipTitle)
}

function listHtml(labels: Label[], kind: LabelKind, title: string, word: string): string {
  const own = labels.filter((l) => l.kind === kind)
  if (own.length === 0) return ''
  const items = own
    .map(
      (l) =>
        `<li><a href="#${escapeHtml(l.id)}">${escapeHtml(`${word}\u00a0${l.number}`)}: ${escapeHtml(l.text)}</a></li>`
    )
    .join('')
  return `<nav class="ms-list ms-list-${kind}" aria-label="${escapeHtml(title)}">\n<p class="ms-toc-title">${escapeHtml(title)}</p>\n<ul>${items}</ul>\n</nav>\n`
}

export function listMarkup(labels: Label[], kind: LabelKind, title: string, word: string): string {
  return listHtml(labels, kind, title, word)
}

function bibliographyHtml(entries: string[], title: string): string {
  if (entries.length === 0) return ''
  return `<section class="ms-bibliography" aria-label="${escapeHtml(title)}">\n<h2 class="ms-bibliography-title">${escapeHtml(title)}</h2>\n<div class="csl-bib-body">\n${entries.join('')}</div>\n</section>\n`
}

export function bibliographyMarkup(entries: string[], title: string): string {
  return bibliographyHtml(entries, title)
}
