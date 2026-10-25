/**
 * The CSS security policy.
 *
 * Custom document CSS, `<style>` blocks and `style` attributes inside Markdown, and the styles
 * Mermaid embeds in its diagrams all pass through this module. It uses a real CSS parser
 * (css-tree) and a deliberate allow/deny policy instead of string replacement:
 *
 * - no `@import`, `@namespace` or any at-rule outside a small allow-list;
 * - `url()` only with `data:` image and font payloads, so CSS can neither read local files nor
 *   contact a server;
 * - no functions that load resources by string (`image-set()`, `image()`, `src()` ...), no
 *   legacy script hooks (`expression()`, `behavior`, `-moz-binding`);
 * - escaped function and at-rule names are rejected, because `u\72l(...)` is still `url(...)`;
 * - the result is serialised from the syntax tree, with `<` escaped, so the text can never
 *   close the surrounding `<style>` element.
 *
 * `analyzeCss` removes everything that violates the policy and reports it. `validateCustomCss`
 * is the strict variant used for user-authored CSS: any violation rejects the stylesheet and
 * the problems are shown to the user.
 */
import * as csstree from 'css-tree'

export const CSS_LIMITS = {
  /** Maximum size of user CSS in UTF-16 units. */
  bytes: 256 * 1024,
  /** Maximum number of problems reported. */
  problems: 25
} as const

export interface CssProblem {
  message: string
  /** 1-based; 0 when unknown. */
  line: number
  column: number
}

export interface CssAnalysis {
  /** Policy-compliant CSS serialised from the syntax tree. */
  css: string
  problems: CssProblem[]
}

export type CssValidation =
  { ok: true; css: string } | { ok: false; problems: CssProblem[]; css: '' }

const ALLOWED_AT_RULES = new Set([
  'media',
  'supports',
  'page',
  'font-face',
  'keyframes',
  '-webkit-keyframes',
  'layer',
  'container',
  'counter-style',
  'property',
  'scope',
  'starting-style'
])

/** Functions that can load a resource from a string or a URL, or run legacy script. */
const FORBIDDEN_FUNCTIONS = new Set([
  'expression',
  'element',
  '-moz-element',
  'image',
  'image-set',
  '-webkit-image-set',
  'src',
  'cross-fade',
  '-webkit-cross-fade',
  'paint',
  'attr-url'
])

const FORBIDDEN_PROPERTIES = new Set(['behavior', '-moz-binding', '-ms-behavior'])

const SAFE_DATA_URL =
  /^data:(?:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml)|font\/(?:woff2?|ttf|otf)|application\/(?:font-woff2?|x-font-(?:woff2?|ttf|otf)|vnd\.ms-fontobject))[;,]/i

export function isSafeDataUrl(value: string): boolean {
  return SAFE_DATA_URL.test(value.trim())
}

function problem(message: string, loc?: { start?: { line: number; column: number } }): CssProblem {
  return { message, line: loc?.start?.line ?? 0, column: loc?.start?.column ?? 0 }
}

type Located = csstree.CssNode & { loc?: { start: { line: number; column: number } } | null }
type Slot = { item: csstree.ListItem<csstree.CssNode>; list: csstree.List<csstree.CssNode> }

/** Unparsed text (custom property values, Raw nodes) is scanned for forbidden calls. */
function scanTokens(text: string, report: (message: string) => void): void {
  csstree.tokenize(text, (type, start, end) => {
    const raw = text.slice(start, end)
    if (type === csstree.tokenTypes.Url || type === csstree.tokenTypes.BadUrl) {
      report('url() is not allowed in this position.')
    } else if (type === csstree.tokenTypes.Function) {
      const name = raw.slice(0, -1)
      if (name.includes('\\')) report('Escaped function names are not allowed.')
      else if (name.toLowerCase() === 'url' || FORBIDDEN_FUNCTIONS.has(name.toLowerCase())) {
        report(`${name}() is not allowed.`)
      }
    } else if (type === csstree.tokenTypes.AtKeyword && raw.includes('\\')) {
      report('Escaped at-rule names are not allowed.')
    }
  })
}

function checkUrl(value: string): string | null {
  if (isSafeDataUrl(value)) return null
  if (/^\s*data:/i.test(value)) return 'Only image and font data: URLs are allowed in url().'
  return 'url() may only reference embedded data: images or fonts, not files or web addresses.'
}

/** Walks the tree, reports violations and removes the offending declarations and rules. */
function enforce(ast: csstree.CssNode): CssProblem[] {
  const problems: CssProblem[] = []
  const removals = new Map<csstree.ListItem<csstree.CssNode>, Slot['list']>()
  let declaration: Slot | null = null

  csstree.walk(ast, {
    enter(node: csstree.CssNode, item: csstree.ListItem<csstree.CssNode>, list: Slot['list']) {
      const flag = (message: string) => {
        if (problems.length < CSS_LIMITS.problems) {
          problems.push(problem(message, (node as Located).loc ?? undefined))
        }
        // A forbidden value takes its whole declaration with it; otherwise the node itself goes.
        const target = declaration ?? (item && list ? { item, list } : null)
        if (target) removals.set(target.item, target.list)
      }
      switch (node.type) {
        case 'Declaration': {
          if (item && list) declaration = { item, list }
          if (FORBIDDEN_PROPERTIES.has(node.property.toLowerCase())) {
            flag(`The property "${node.property}" is not allowed.`)
          }
          if (node.value.type === 'Raw' && !node.property.startsWith('--')) {
            flag(`The value of "${node.property}" could not be parsed.`)
          }
          break
        }
        case 'Atrule': {
          const name = node.name.toLowerCase()
          if (node.name.includes('\\')) {
            flag('Escaped at-rule names are not allowed.')
          } else if (!ALLOWED_AT_RULES.has(name)) {
            flag(
              name === 'import'
                ? '@import is not allowed: custom CSS cannot load other stylesheets.'
                : `@${node.name} is not allowed in document CSS.`
            )
          }
          break
        }
        case 'Url': {
          const message = checkUrl(node.value)
          if (message) flag(message)
          break
        }
        case 'Function': {
          const name = node.name.toLowerCase()
          if (node.name.includes('\\')) flag('Escaped function names are not allowed.')
          else if (name === 'url' || FORBIDDEN_FUNCTIONS.has(name))
            flag(`${node.name}() is not allowed.`)
          break
        }
        case 'Raw': {
          scanTokens(node.value, flag)
          if (!declaration) flag('This part of the CSS could not be parsed and was ignored.')
          break
        }
      }
    },
    leave(node: csstree.CssNode) {
      if (node.type === 'Declaration') declaration = null
    }
  })

  for (const [item, list] of removals) list.remove(item)
  return problems
}

function parseOptions(problems: CssProblem[]) {
  return {
    positions: true,
    parseCustomProperty: true,
    parseValue: true,
    onParseError: (error: Error & { line?: number; column?: number }) => {
      if (problems.length < CSS_LIMITS.problems) {
        problems.push({
          message: `CSS syntax error: ${error.message.replace(/\s+/g, ' ')}`,
          line: error.line ?? 0,
          column: error.column ?? 0
        })
      }
    }
  }
}

/** Escapes `<` so a string or identifier can never close the surrounding `<style>` element. */
function neutralise(css: string): string {
  return css.replace(/</g, '\\3c ')
}

/**
 * Removes everything the policy forbids and reports it. `declarations` analyses the contents of
 * a `style` attribute instead of a whole stylesheet.
 */
export function analyzeCss(
  text: string,
  context: 'stylesheet' | 'declarations' = 'stylesheet'
): CssAnalysis {
  if (text.length > CSS_LIMITS.bytes) {
    return {
      css: '',
      problems: [problem(`The CSS is larger than ${CSS_LIMITS.bytes / 1024} KB.`)]
    }
  }
  const syntaxProblems: CssProblem[] = []
  let ast: csstree.CssNode
  try {
    ast = csstree.parse(text, {
      ...parseOptions(syntaxProblems),
      context: context === 'declarations' ? 'declarationList' : 'stylesheet'
    })
  } catch (error) {
    return { css: '', problems: [problem(`CSS could not be parsed: ${(error as Error).message}`)] }
  }
  const problems = enforce(ast)

  // Token-level pass over the original text: catches escaped function names that the parser
  // folds into ordinary-looking nodes.
  const tokenProblems: CssProblem[] = []
  scanEscapes(text, (message) => tokenProblems.push(problem(message)))
  if (tokenProblems.length > 0) {
    return {
      css: '',
      problems: [...syntaxProblems, ...problems, ...tokenProblems].slice(0, CSS_LIMITS.problems)
    }
  }

  let css = csstree.generate(ast)
  css = neutralise(css)
  return { css, problems: [...syntaxProblems, ...problems].slice(0, CSS_LIMITS.problems) }
}

function scanEscapes(text: string, report: (message: string) => void): void {
  let reported = false
  csstree.tokenize(text, (type, start, end) => {
    if (reported) return
    if (type === csstree.tokenTypes.Function || type === csstree.tokenTypes.AtKeyword) {
      if (text.slice(start, end).includes('\\')) {
        reported = true
        report('Escaped function and at-rule names are not allowed.')
      }
    } else if (type === csstree.tokenTypes.BadUrl) {
      reported = true
      report('Malformed url() is not allowed.')
    }
  })
}

/**
 * Strict validation for user-authored CSS: the stylesheet is accepted only when it contains
 * nothing the policy removes. The returned CSS is the normalised serialisation.
 */
export function validateCustomCss(text: string): CssValidation {
  const analysis = analyzeCss(text, 'stylesheet')
  if (analysis.problems.length > 0) return { ok: false, problems: analysis.problems, css: '' }
  return { ok: true, css: analysis.css }
}

/** For `style="..."` attributes of Markdown HTML: offending declarations are dropped. */
export function sanitizeStyleAttribute(value: string): string {
  return analyzeCss(value, 'declarations').css
}

/** For `<style>` blocks of Markdown HTML and Mermaid output: offending rules are dropped. */
export function sanitizeStylesheet(text: string): string {
  return analyzeCss(text, 'stylesheet').css
}

export function formatCssProblem(item: CssProblem): string {
  return item.line > 0 ? `Line ${item.line}, column ${item.column}: ${item.message}` : item.message
}
