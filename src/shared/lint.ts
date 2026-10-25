/**
 * Markdown style checks come from markdownlint (a well-maintained rule engine). This module holds
 * everything that does not need the engine itself: the rule configuration for Markdown Studio's
 * dialect, severities, and conversion of markdownlint "fix info" into text edits.
 */

export interface LintFixInfo {
  lineNumber?: number
  editColumn?: number
  deleteCount?: number
  insertText?: string
}

/** A markdownlint finding reduced to plain data (it crosses the worker boundary). */
export interface LintIssue {
  /** Rule id such as `MD012`. */
  rule: string
  /** Readable rule name such as `no-multiple-blanks`. */
  alias: string
  description: string
  detail: string | null
  /** 1-based line. */
  line: number
  /** 1-based column and length of the offending text, when the rule reports one. */
  range: [number, number] | null
  fix: LintFixInfo | null
}

/** Rules checked by default, with the names shown in the settings. */
export const LINT_RULES: { id: string; name: string }[] = [
  { id: 'MD001', name: 'Heading levels increase by one' },
  { id: 'MD003', name: 'Consistent heading style' },
  { id: 'MD004', name: 'Consistent bullet style' },
  { id: 'MD005', name: 'Consistent list indentation' },
  { id: 'MD007', name: 'Nested list indentation' },
  { id: 'MD009', name: 'No trailing spaces' },
  { id: 'MD010', name: 'No hard tabs' },
  { id: 'MD011', name: 'No reversed link syntax' },
  { id: 'MD012', name: 'No multiple blank lines' },
  { id: 'MD018', name: 'Space after # in headings' },
  { id: 'MD019', name: 'One space after # in headings' },
  { id: 'MD022', name: 'Blank lines around headings' },
  { id: 'MD023', name: 'Headings start at the line start' },
  { id: 'MD024', name: 'No duplicate sibling headings' },
  { id: 'MD025', name: 'Only one top-level heading' },
  { id: 'MD026', name: 'No trailing punctuation in headings' },
  { id: 'MD027', name: 'One space after > in quotes' },
  { id: 'MD028', name: 'No blank line inside quotes' },
  { id: 'MD029', name: 'Consistent numbered list prefixes' },
  { id: 'MD030', name: 'One space after list markers' },
  { id: 'MD031', name: 'Blank lines around code blocks' },
  { id: 'MD032', name: 'Blank lines around lists' },
  { id: 'MD035', name: 'Consistent horizontal rule style' },
  { id: 'MD037', name: 'No spaces inside emphasis markers' },
  { id: 'MD038', name: 'No spaces inside code spans' },
  { id: 'MD039', name: 'No spaces inside link text' },
  { id: 'MD042', name: 'No empty links' },
  { id: 'MD045', name: 'Images have alternative text' },
  { id: 'MD046', name: 'Consistent code block style' },
  { id: 'MD047', name: 'File ends with a single newline' },
  { id: 'MD048', name: 'Consistent code fence style' },
  { id: 'MD049', name: 'Consistent emphasis style' },
  { id: 'MD050', name: 'Consistent strong style' },
  { id: 'MD052', name: 'Reference links are defined' },
  { id: 'MD053', name: 'Reference definitions are used' },
  { id: 'MD055', name: 'Consistent table pipe style' },
  { id: 'MD056', name: 'Table rows have the right number of cells' },
  { id: 'MD058', name: 'Blank lines around tables' }
]

/** Rules that point at content that is probably broken; everything else is a style note. */
const WARNING_RULES = new Set(['MD011', 'MD042', 'MD052', 'MD056', 'MD018'])

export function lintSeverity(rule: string): 'warning' | 'info' {
  return WARNING_RULES.has(rule) ? 'warning' : 'info'
}

/**
 * markdownlint configuration: only the rules in `LINT_RULES` run, so rules that conflict with
 * this application (inline HTML, long lines, first-line heading, link fragments that the
 * application validates itself) or that nag about valid styles stay off.
 */
export function buildLintConfig(disabledRules: readonly string[]): Record<string, unknown> {
  const config: Record<string, unknown> = { default: false }
  const disabled = new Set(disabledRules.map((rule) => rule.toUpperCase()))
  for (const { id } of LINT_RULES) config[id] = !disabled.has(id)
  const tune = (rule: string, options: Record<string, unknown>) => {
    if (config[rule] === true) config[rule] = options
  }
  tune('MD009', { br_spaces: 2 })
  tune('MD010', { code_blocks: false })
  tune('MD024', { siblings_only: true })
  tune('MD029', { style: 'one_or_ordered' })
  tune('MD031', { list_items: false })
  tune('MD032', {})
  return config
}

export interface RangeEdit {
  /** 1-based, end exclusive. */
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  text: string
}

/** Converts markdownlint fix info to an edit over `lines`; null when the issue has no fix. */
export function fixToEdit(issue: LintIssue, lines: string[]): RangeEdit | null {
  const fix = issue.fix
  if (!fix) return null
  const line = fix.lineNumber ?? issue.line
  if (line < 1 || line > lines.length) return null

  if (fix.deleteCount === -1) {
    if (line < lines.length) {
      return { startLine: line, startColumn: 1, endLine: line + 1, endColumn: 1, text: '' }
    }
    if (line > 1) {
      return {
        startLine: line - 1,
        startColumn: lines[line - 2].length + 1,
        endLine: line,
        endColumn: lines[line - 1].length + 1,
        text: ''
      }
    }
    return { startLine: 1, startColumn: 1, endLine: 1, endColumn: lines[0].length + 1, text: '' }
  }

  const column = fix.editColumn ?? 1
  return {
    startLine: line,
    startColumn: column,
    endLine: line,
    endColumn: column + (fix.deleteCount ?? 0),
    text: fix.insertText ?? ''
  }
}

/** Applies all non-overlapping fixes to `text` at once. Everything else is left untouched. */
export function applyIssueFixes(text: string, issues: LintIssue[]): string {
  const lineStarts = [0]
  const lines: string[] = []
  let last = 0
  for (const match of text.matchAll(/\r\n|\r|\n/g)) {
    lines.push(text.slice(last, match.index))
    last = match.index + match[0].length
    lineStarts.push(last)
  }
  lines.push(text.slice(last))
  const eol = /\r\n|\r|\n/.exec(text)?.[0] ?? '\n'

  const offset = (line: number, column: number) =>
    Math.min(text.length, (lineStarts[line - 1] ?? text.length) + column - 1)
  const edits = issues
    .map((issue) => fixToEdit(issue, lines))
    .filter((edit): edit is RangeEdit => edit !== null)
    .map((edit) => ({
      from: offset(edit.startLine, edit.startColumn),
      to: offset(edit.endLine, edit.endColumn),
      text: edit.text.replace(/\r?\n/g, eol)
    }))
    .sort((a, b) => b.from - a.from || b.to - a.to)

  let result = text
  let boundary = Infinity
  for (const edit of edits) {
    if (edit.to > boundary) continue // overlaps a fix that was already applied
    result = result.slice(0, edit.from) + edit.text + result.slice(edit.to)
    boundary = edit.from
  }
  return result
}

/**
 * Repeatedly lints and applies fixes until nothing fixable remains (some fixes only become
 * possible after others), at most `rounds` times. Returns the final text.
 */
export async function fixAllText(
  text: string,
  lint: (text: string) => LintIssue[] | Promise<LintIssue[]>,
  rounds = 5
): Promise<string> {
  let current = text
  for (let round = 0; round < rounds; round++) {
    const fixable = (await lint(current)).filter((issue) => issue.fix !== null)
    if (fixable.length === 0) break
    const next = applyIssueFixes(current, fixable)
    if (next === current) break
    current = next
  }
  return current
}
