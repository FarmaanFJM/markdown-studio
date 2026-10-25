import type { DocumentAnalysis, Heading } from './analysis'
import { isInCodeBlock } from './analysis'

export const TOC_START = '<!-- markdown-studio:toc:start -->'
export const TOC_END = '<!-- markdown-studio:toc:end -->'

export interface TocOptions {
  /** Include the document title (a leading level-1 heading) in the list. */
  includeTopLevel: boolean
  /** Deepest heading level listed (1-6). */
  maxDepth: number
}

export const DEFAULT_TOC_OPTIONS: TocOptions = { includeTopLevel: false, maxDepth: 6 }

const TOC_TITLE = /^(?:table of contents|contents|toc)$/i

function escapeLabel(text: string): string {
  return text.replace(/[\\`*_[\]<>|]/g, (ch) => `\\${ch}`)
}

export interface TocRegion {
  /** Lines holding the start and end markers (0-based, inclusive). */
  start: number
  end: number
}

/**
 * Finds the managed table of contents. Markers inside code blocks are ignored. Returns `'broken'`
 * when a start marker has no end marker, so callers can refuse instead of replacing text.
 */
export function findTocRegion(analysis: DocumentAnalysis): TocRegion | 'broken' | null {
  let start = -1
  for (let line = 0; line < analysis.lines.length; line++) {
    if (isInCodeBlock(analysis, line)) continue
    const text = analysis.lines[line].trim()
    if (start < 0 && text === TOC_START) start = line
    else if (start >= 0 && text === TOC_END) return { start, end: line }
  }
  return start >= 0 ? 'broken' : null
}

function listedHeadings(analysis: DocumentAnalysis, options: TocOptions, region: TocRegion | null) {
  const listed: Heading[] = []
  analysis.headings.forEach((heading, index) => {
    if (heading.omitFromToc || !heading.id) return
    if (heading.level > options.maxDepth) return
    if (!options.includeTopLevel && index === 0 && heading.level === 1) return
    // A "Table of Contents" heading directly above the managed list should not list itself.
    if (region && heading.endLine <= region.start && region.start - heading.endLine <= 1) {
      if (TOC_TITLE.test(heading.text)) return
    }
    listed.push(heading)
  })
  return listed
}

/** The list lines for the document's headings, nested by outline depth. */
export function buildTocList(
  analysis: DocumentAnalysis,
  options: TocOptions,
  region: TocRegion | null = null
): string[] {
  const lines: string[] = []
  const stack: number[] = []
  for (const heading of listedHeadings(analysis, options, region)) {
    while (stack.length > 0 && stack[stack.length - 1] >= heading.level) stack.pop()
    lines.push(`${'  '.repeat(stack.length)}- [${escapeLabel(heading.text)}](#${heading.id})`)
    stack.push(heading.level)
  }
  return lines
}

/** The complete managed block: markers around the list, separated by blank lines. */
export function buildTocBlock(
  analysis: DocumentAnalysis,
  options: TocOptions,
  region: TocRegion | null = null
): string[] {
  const list = buildTocList(analysis, options, region)
  return [TOC_START, '', ...(list.length > 0 ? list : ['_No headings yet._']), '', TOC_END]
}
