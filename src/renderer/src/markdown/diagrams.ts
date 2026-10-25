import { hashText } from '@shared/markdown/blocks'
import type { DiagramRenderResult, DiagramVariant } from '@shared/diagram'
import { api } from '../bridge'
import { sanitizeSvg } from './svg'

/**
 * Client side of the diagram pipeline.
 *
 * Mermaid itself runs in an isolated window (see `DiagramService`). This module asks it for SVG,
 * sanitises the answer, caches it by content and presentation settings, and fills the diagram
 * placeholders the Markdown renderer produced. Unchanged diagrams are never drawn twice, edits
 * are debounced, and answers for text that has since changed are discarded.
 */
export interface DiagramStyle {
  variant: DiagramVariant
  fontFamily: string
  accent: string
}

export type DiagramOutcome =
  { ok: true; svg: string } | { ok: false; message: string; line: number | null }

const CACHE_ENTRIES = 160
const CACHE_CHARS = 12_000_000
const PREVIEW_DEBOUNCE_MS = 350

const cache = new Map<string, DiagramOutcome>()
let cachedChars = 0
const inFlight = new Map<string, Promise<DiagramOutcome>>()
let requestCounter = 0

export function diagramBaseId(source: string): string {
  return `ms-mmd-${hashText(source)}`
}

function styleKey(style: DiagramStyle): string {
  return `${style.variant}|${hashText(style.fontFamily)}|${style.accent}`
}

export function diagramKey(source: string, style: DiagramStyle): string {
  return `${diagramBaseId(source)}|${styleKey(style)}`
}

function remember(key: string, outcome: DiagramOutcome): void {
  const previous = cache.get(key)
  if (previous?.ok) cachedChars -= previous.svg.length
  cache.delete(key)
  cache.set(key, outcome)
  if (outcome.ok) cachedChars += outcome.svg.length
  while (cache.size > CACHE_ENTRIES || cachedChars > CACHE_CHARS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    const dropped = cache.get(oldest)
    if (dropped?.ok) cachedChars -= dropped.svg.length
    cache.delete(oldest)
  }
}

export function cachedDiagram(source: string, style: DiagramStyle): DiagramOutcome | undefined {
  const key = diagramKey(source, style)
  const hit = cache.get(key)
  if (hit) {
    // Refresh recency.
    cache.delete(key)
    cache.set(key, hit)
  }
  return hit
}

export function clearDiagramCache(): void {
  cache.clear()
  cachedChars = 0
}

export function diagramCacheSize(): number {
  return cache.size
}

function toOutcome(result: DiagramRenderResult): DiagramOutcome {
  if (!result.ok) return { ok: false, message: result.message, line: result.line }
  const svg = sanitizeSvg(result.svg)
  return svg
    ? { ok: true, svg }
    : { ok: false, message: 'The diagram produced no displayable output.', line: null }
}

/** Draws one diagram (or returns the cached drawing). Concurrent equal requests share a call. */
export function renderDiagram(
  source: string,
  style: DiagramStyle,
  requestId?: { value: string }
): Promise<DiagramOutcome> {
  const key = diagramKey(source, style)
  const hit = cachedDiagram(source, style)
  if (hit) return Promise.resolve(hit)
  const pending = inFlight.get(key)
  if (pending) return pending
  const id = `d${++requestCounter}`
  if (requestId) requestId.value = id
  const promise = api.diagram
    .render({
      id,
      source,
      variant: style.variant,
      fontFamily: style.fontFamily,
      accent: style.accent,
      svgId: diagramBaseId(source)
    })
    .then(toOutcome)
    .catch((error: unknown): DiagramOutcome => ({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      line: null
    }))
    .then((outcome) => {
      remember(key, outcome)
      return outcome
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

// ----------------------------------------------------------------------- DOM hydration

export interface DiagramProblem {
  /** 1-based line of the fence's opening marker in the document, or 0. */
  fenceLine: number
  /** 1-based line inside the diagram, when known. */
  diagramLine: number | null
  message: string
}

export interface HydrationSummary {
  total: number
  problems: DiagramProblem[]
}

function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

function clearGenerated(figure: Element): void {
  figure
    .querySelectorAll(
      ':scope > .ms-diagram-svg, :scope > .ms-diagram-error, :scope > .ms-diagram-status'
    )
    .forEach((n) => n.remove())
}

function describe(source: string): string {
  const first = source.split('\n').find((line) => line.trim() !== '') ?? ''
  return `Diagram: ${first.trim().slice(0, 60)}`
}

function applyOutcome(
  figure: Element,
  source: string,
  baseId: string,
  occurrence: number,
  outcome: DiagramOutcome
): DiagramProblem | null {
  clearGenerated(figure)
  const fenceLine = Number(figure.getAttribute('data-ms-line')) || 0
  if (outcome.ok) {
    figure.setAttribute('data-ms-state', 'ready')
    const holder = figure.ownerDocument.createElement('div')
    holder.className = 'ms-diagram-svg'
    holder.setAttribute('role', 'img')
    holder.setAttribute('aria-label', describe(source))
    // Equal diagrams get distinct element ids so the document never contains duplicates.
    holder.innerHTML =
      occurrence > 0 ? outcome.svg.split(baseId).join(`${baseId}-${occurrence + 1}`) : outcome.svg
    figure.insertBefore(holder, figure.firstChild)
    return null
  }
  figure.setAttribute('data-ms-state', 'error')
  const where =
    outcome.line !== null
      ? ` (line ${outcome.line} of the diagram${fenceLine ? `, line ${fenceLine + outcome.line} of the document` : ''})`
      : fenceLine
        ? ` (diagram starting at line ${fenceLine})`
        : ''
  const box = figure.ownerDocument.createElement('div')
  box.className = 'ms-diagram-error'
  box.setAttribute('role', 'note')
  box.innerHTML = `<strong>Diagram error${escapeText(where)}</strong><pre>${escapeText(outcome.message)}</pre>`
  figure.insertBefore(box, figure.firstChild)
  return {
    fenceLine,
    diagramLine: outcome.line,
    message: outcome.message.split('\n')[0]
  }
}

function placeholdersIn(root: ParentNode): { figure: Element; source: string }[] {
  return [...root.querySelectorAll('figure.ms-diagram')].map((figure) => ({
    figure,
    // The placeholder keeps the exact fenced text; nothing else is trusted.
    source: figure.querySelector('.ms-diagram-source code')?.textContent ?? ''
  }))
}

export interface Hydration {
  done: Promise<HydrationSummary>
  cancel(): void
}

/**
 * Fills the diagram placeholders under `root`. Cached drawings are applied synchronously;
 * others show a status line and are drawn in the background (after a short pause while editing,
 * at once for exports). `cancel()` discards everything still outstanding.
 */
export function hydrateDiagrams(
  root: ParentNode,
  style: DiagramStyle,
  options: { immediate: boolean }
): Hydration {
  const items = placeholdersIn(root)
  const occurrences = new Map<string, number>()
  const timers: ReturnType<typeof setTimeout>[] = []
  const requested: { value: string }[] = []
  let cancelled = false
  const problems: DiagramProblem[] = []
  const work: Promise<void>[] = []

  for (const { figure, source } of items) {
    const baseId = diagramBaseId(source)
    const occurrence = occurrences.get(baseId) ?? 0
    occurrences.set(baseId, occurrence + 1)

    const hit = cachedDiagram(source, style)
    if (hit) {
      const problem = applyOutcome(figure, source, baseId, occurrence, hit)
      if (problem) problems.push(problem)
      continue
    }

    figure.setAttribute('data-ms-state', 'pending')
    clearGenerated(figure)
    const status = figure.ownerDocument.createElement('p')
    status.className = 'ms-diagram-status'
    status.setAttribute('role', 'status')
    status.textContent = 'Rendering diagram…'
    figure.appendChild(status)

    work.push(
      new Promise<void>((resolve) => {
        const start = () => {
          if (cancelled) return resolve()
          const id = { value: '' }
          requested.push(id)
          void renderDiagram(source, style, id).then((outcome) => {
            // Text that was replaced while this drew is not touched.
            if (!cancelled && figure.isConnected !== false) {
              const problem = applyOutcome(figure, source, baseId, occurrence, outcome)
              if (problem) problems.push(problem)
            }
            resolve()
          })
        }
        if (options.immediate) start()
        else timers.push(setTimeout(start, PREVIEW_DEBOUNCE_MS))
      })
    )
  }

  return {
    done: Promise.all(work).then(() => ({ total: items.length, problems })),
    cancel() {
      cancelled = true
      timers.forEach(clearTimeout)
      const ids = requested.map((r) => r.value).filter(Boolean)
      if (ids.length > 0) void api.diagram.cancel(ids).catch(() => undefined)
    }
  }
}

/** Problems of diagrams that are already drawn, without drawing anything (for tests). */
export function summarizeDiagrams(root: ParentNode): number {
  return root.querySelectorAll('figure.ms-diagram[data-ms-state="ready"]').length
}
