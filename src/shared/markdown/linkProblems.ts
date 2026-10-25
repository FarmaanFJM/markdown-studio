import type { DocumentAnalysis } from './analysis'
import { documentAnchors } from './analysis'
import {
  classifyReference,
  extractReferences,
  renderDestination,
  type DocReference
} from './references'
import { resolveLocalPath, safeDecode, type DocumentContext } from './resolve'
import type { EntryState } from '../ipc'
import { basename, dirname, isPathInside, relativePath } from '../paths'

export type LinkProblemCode = 'missing-file' | 'missing-image' | 'missing-anchor'

export interface LinkProblem {
  code: LinkProblemCode
  message: string
  /** 0-based range of the destination in the document. */
  line: number
  column: number
  endLine: number
  endColumn: number
  /** A reliable correction: replacing the destination with `replacement`. */
  fix?: { title: string; replacement: string }
}

/** How the checker looks at the outside world; injected so the logic is testable. */
export interface LinkEnvironment {
  /** Existence of absolute paths. */
  stat(paths: string[]): Promise<Map<string, EntryState>>
  /** Link targets of another Markdown file, or null when it cannot be read. */
  anchorsOf(path: string): Promise<Set<string> | null>
  /** Files in the workspace whose name matches, ignoring case (used to suggest a new path). */
  filesNamed(name: string): Promise<string[]>
}

const MAX_TARGETS = 2000

export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = row
  }
  return previous[b.length]
}

/** The one anchor that is clearly what the author meant, or null when it is not obvious. */
export function closestAnchor(wanted: string, anchors: Iterable<string>): string | null {
  const lower = wanted.toLowerCase()
  const candidates = [...anchors]
  const sameLetters = candidates.filter((a) => a.toLowerCase() === lower)
  if (sameLetters.length === 1) return sameLetters[0]
  if (wanted.length < 4) return null
  let best: string | null = null
  let bestDistance = Infinity
  let tie = false
  for (const candidate of candidates) {
    const distance = editDistance(lower, candidate.toLowerCase())
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
      tie = false
    } else if (distance === bestDistance) {
      tie = true
    }
  }
  return best !== null && bestDistance <= 2 && !tie ? best : null
}

function display(reference: DocReference): string {
  const value = reference.value.split(/[?#]/)[0]
  return safeDecode(value)
}

function position(reference: DocReference) {
  return {
    line: reference.line,
    column: reference.column,
    endLine: reference.endLine,
    endColumn: reference.endColumn
  }
}

const isRootRelative = (value: string) => /^\/(?!\/)/.test(value)

/**
 * Finds links and images whose local targets do not exist, and heading anchors that are not
 * defined. Targets are resolved exactly as the preview resolves them; web URLs are never
 * checked, and paths outside the areas the application may read are not reported.
 */
export async function findLinkProblems(
  analysis: DocumentAnalysis,
  context: DocumentContext,
  io: LinkEnvironment
): Promise<LinkProblem[]> {
  const problems: LinkProblem[] = []
  const references = extractReferences(analysis)
  const ownAnchors = documentAnchors(analysis)

  interface Checked {
    reference: DocReference
    target: ReturnType<typeof classifyReference> & { type: 'local' }
    absolute: string
  }
  const local: Checked[] = []

  for (const reference of references) {
    const target = classifyReference(reference.value)
    if (target.type === 'anchor') {
      const fragment = safeDecode(target.fragment)
      if (!fragment || fragment.toLowerCase() === 'top' || ownAnchors.has(fragment)) continue
      const closest = closestAnchor(fragment, ownAnchors)
      problems.push({
        code: 'missing-anchor',
        message: `No heading with the anchor #${fragment} in this document.`,
        ...position(reference),
        fix: closest
          ? {
              title: `Change to #${closest}`,
              replacement: renderDestination(reference, '', `#${closest}`)
            }
          : undefined
      })
    } else if (target.type === 'local') {
      const absolute = resolveLocalPath(reference.value, context)
      if (absolute) local.push({ reference, target, absolute })
    }
  }

  const paths = [...new Set(local.map((l) => l.absolute))].slice(0, MAX_TARGETS)
  const states = await io.stat(paths)
  const anchorCache = new Map<string, Promise<Set<string> | null>>()
  const anchorsOf = (path: string) => {
    let cached = anchorCache.get(path)
    if (!cached) {
      cached = io.anchorsOf(path)
      anchorCache.set(path, cached)
    }
    return cached
  }

  for (const { reference, target, absolute } of local) {
    const state = states.get(absolute)
    const isImage = reference.kind === 'image' || reference.kind === 'html-img'
    if (state === 'missing') {
      const written = display(reference)
      const problem: LinkProblem = {
        code: isImage ? 'missing-image' : 'missing-file',
        message: isImage ? `Image not found: ${written}` : `File not found: ${written}`,
        ...position(reference)
      }
      const matches = (await io.filesNamed(basename(absolute))).filter((file) => file !== absolute)
      if (matches.length === 1) {
        const rooted = isRootRelative(reference.value) && context.workspaceRoot
        const newPath = rooted
          ? `/${relativePath(context.workspaceRoot!, matches[0])}`
          : relativePath(
              context.documentDirectory ?? context.workspaceRoot ?? dirname(matches[0]),
              matches[0]
            )
        if (newPath && !(rooted && !isPathInside(context.workspaceRoot!, matches[0]))) {
          problem.fix = {
            title: `Change to "${newPath}"`,
            replacement: renderDestination(reference, newPath, target.suffix)
          }
        }
      }
      problems.push(problem)
    } else if (state === 'file' && target.fragment) {
      const fragment = safeDecode(target.fragment)
      if (!fragment || fragment.toLowerCase() === 'top' || !/\.(md|markdown)$/i.test(absolute))
        continue
      const anchors = await anchorsOf(absolute)
      if (anchors === null || anchors.has(fragment)) continue
      const closest = closestAnchor(fragment, anchors)
      problems.push({
        code: 'missing-anchor',
        message: `No heading with the anchor #${fragment} in ${display(reference)}.`,
        ...position(reference),
        fix: closest
          ? {
              title: `Change to #${closest}`,
              replacement: renderDestination(
                reference,
                target.path ? safeDecode(target.path) : '',
                `#${closest}`
              )
            }
          : undefined
      })
    }
  }

  return problems.sort((a, b) => a.line - b.line || a.column - b.column)
}
