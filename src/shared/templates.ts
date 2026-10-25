/**
 * Template and custom-snippet model, variable expansion and validation.
 *
 * Templates are plain Markdown with a small set of placeholders. They are data, never code:
 * nothing in a template is evaluated or executed, and unknown placeholders stay literal.
 */

export type TemplateScope = 'global' | 'workspace'
export type TemplateKind = 'document' | 'snippet'

export interface Template {
  /** Stable identifier; also the file name (`<id>.json`) of stored templates. */
  id: string
  name: string
  description: string
  /** `document` templates create files; `snippet` templates are inserted at the cursor. */
  kind: TemplateKind
  body: string
  createdAt: string
  updatedAt: string
}

export interface StoredTemplate extends Template {
  scope: TemplateScope
}

export interface BuiltInTemplate extends Template {
  builtIn: true
}

export const TEMPLATE_LIMITS = {
  nameLength: 80,
  descriptionLength: 240,
  bodyBytes: 512 * 1024
} as const

/** Placeholders understood in template bodies. */
export const TEMPLATE_VARIABLES = {
  title: 'The document title you enter when creating the document.',
  date: "Today's date as YYYY-MM-DD.",
  datetime: 'Today’s date and the current time as YYYY-MM-DD HH:mm.',
  author: 'The author name you enter when creating the document. Never filled in automatically.',
  cursor: 'Where the cursor is placed in the new document. Removed from the text.'
} as const

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES

const VARIABLE_PATTERN = /(\\?)\{\{\s*([A-Za-z]+)\s*\}\}/g

function isVariable(name: string): name is TemplateVariable {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_VARIABLES, name)
}

/** Variables referenced by a body (escaped `\{{x}}` and unknown names are not counted). */
export function usedVariables(body: string): Set<TemplateVariable> {
  const used = new Set<TemplateVariable>()
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    if (!match[1] && isVariable(match[2])) used.add(match[2])
  }
  return used
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

export function formatDate(now: Date): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function formatDateTime(now: Date): string {
  return `${formatDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export interface TemplateValues {
  title: string
  author: string
}

export interface ExpandedTemplate {
  text: string
  /** Offset of the `{{cursor}}` placeholder in `text`, or null when the template has none. */
  cursorOffset: number | null
}

/**
 * Replaces placeholders in one pass: substituted values are never scanned again, so a title
 * containing `{{author}}` stays literal. `\{{title}}` produces the text `{{title}}`. A line whose
 * placeholder expanded to nothing loses the trailing space left behind.
 */
export function expandTemplate(
  body: string,
  values: TemplateValues,
  now: Date = new Date()
): ExpandedTemplate {
  const lines = body.split('\n')
  const out: string[] = []
  let cursorLine = -1
  let cursorColumn = 0

  lines.forEach((line, index) => {
    let result = ''
    let last = 0
    let emptied = false
    for (const match of line.matchAll(VARIABLE_PATTERN)) {
      result += line.slice(last, match.index)
      last = match.index + match[0].length
      const [whole, escape, name] = match
      if (escape) {
        result += whole.slice(1)
      } else if (!isVariable(name)) {
        result += whole
      } else if (name === 'cursor') {
        if (cursorLine < 0) {
          cursorLine = index
          cursorColumn = result.length
        }
      } else {
        const value =
          name === 'title'
            ? values.title
            : name === 'author'
              ? values.author
              : name === 'date'
                ? formatDate(now)
                : formatDateTime(now)
        if (value === '') emptied = true
        result += value
      }
    }
    result += line.slice(last)
    out.push(emptied ? result.trimEnd() : result)
  })

  const text = out.join('\n')
  let cursorOffset: number | null = null
  if (cursorLine >= 0) {
    cursorOffset = out.slice(0, cursorLine).reduce((sum, line) => sum + line.length + 1, 0)
    cursorOffset += Math.min(cursorColumn, out[cursorLine].length)
  }
  return { text, cursorOffset }
}

/**
 * Converts a snippet body into Monaco snippet syntax for insertion at the cursor. Literal `$`,
 * `\` and `}` are escaped; `{{cursor}}` becomes the final tab stop; `{{date}}` and
 * `{{datetime}}` are filled in; `{{title}}` and `{{author}}` use the given values or become
 * editable placeholders when unknown.
 */
export function templateToSnippet(
  body: string,
  values: { title?: string; author?: string },
  now: Date = new Date()
): string {
  let result = ''
  let last = 0
  const escapeLiteral = (text: string) => text.replace(/[\\$}]/g, (ch) => `\\${ch}`)
  let stop = 0
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    result += escapeLiteral(body.slice(last, match.index))
    last = match.index + match[0].length
    const [whole, escape, name] = match
    if (escape) {
      result += escapeLiteral(whole.slice(1))
    } else if (!isVariable(name)) {
      result += escapeLiteral(whole)
    } else if (name === 'cursor') {
      result += '$0'
    } else if (name === 'date') {
      result += formatDate(now)
    } else if (name === 'datetime') {
      result += formatDateTime(now)
    } else {
      const value = name === 'title' ? values.title : values.author
      result += value ? escapeLiteral(value) : `\${${++stop}:${name}}`
    }
  }
  return result + escapeLiteral(body.slice(last))
}

/** A readable file or document title: `my-notes_v2` becomes `My notes v2`. */
export function titleFromName(name: string): string {
  const words = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return words ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : ''
}

/** A file-name-safe version of a title: `Q3 report: draft` becomes `Q3 report draft`. */
export function fileNameFromTitle(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex -- control characters are never valid in names
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim()
  return cleaned.slice(0, 80) || 'Untitled'
}

export function makeTemplateId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'template'
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  return id
}

export type TemplateValidation = { ok: true; template: Template } | { ok: false; error: string }

function cleanLine(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, max)
    : ''
}

/** Validates data read from disk or received over IPC. Anything unusable is rejected. */
export function validateTemplate(input: unknown): TemplateValidation {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Invalid template.' }
  const t = input as Record<string, unknown>
  const name = cleanLine(t.name, TEMPLATE_LIMITS.nameLength)
  if (!name) return { ok: false, error: 'A template needs a name.' }
  if (typeof t.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(t.id)) {
    return { ok: false, error: 'Invalid template id.' }
  }
  if (typeof t.body !== 'string') return { ok: false, error: 'A template needs content.' }
  if (new TextEncoder().encode(t.body).length > TEMPLATE_LIMITS.bodyBytes) {
    return { ok: false, error: 'The template is too large.' }
  }
  const kind: TemplateKind = t.kind === 'snippet' ? 'snippet' : 'document'
  const now = new Date().toISOString()
  return {
    ok: true,
    template: {
      id: t.id,
      name,
      description: cleanLine(t.description, TEMPLATE_LIMITS.descriptionLength),
      kind,
      body: t.body.replace(/\r\n?/g, '\n'),
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : now,
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : now
    }
  }
}
