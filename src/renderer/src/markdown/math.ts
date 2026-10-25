import katex from 'katex'
import { escapeHtml } from '@shared/markdown/blocks'

/**
 * Mathematical notation, rendered by KaTeX (bundled; no network).
 *
 * `trust` stays off, so commands that could load URLs or run attributes (`\href`, `\includegraphics`,
 * `\htmlClass`...) are rejected as parse errors, and `maxExpand` stops macro bombs. The HTML that
 * comes out is still sanitised with the rest of the document.
 */
const CACHE_LIMIT = 3000
const cache = new Map<string, string>()

export interface MathError {
  message: string
}

function plainMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/^KaTeX parse error:\s*/, '')
    .split('\n')[0]
    .slice(0, 300)
}

function options(display: boolean): katex.KatexOptions {
  return {
    displayMode: display,
    throwOnError: true,
    trust: false,
    strict: 'ignore',
    maxExpand: 1000,
    maxSize: 100,
    output: 'htmlAndMathml'
  }
}

/** Returns the error message when `tex` cannot be rendered, otherwise null. */
export function checkMath(tex: string, display = false): string | null {
  try {
    katex.renderToString(tex, options(display))
    return null
  } catch (error) {
    return plainMessage(error)
  }
}

/** Renders TeX to HTML; invalid input produces a visible, explained error element. */
export function renderMath(tex: string, display: boolean): string {
  const key = `${display ? 'D' : 'I'}${tex}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  let html: string
  try {
    html = katex.renderToString(tex, options(display))
  } catch (error) {
    const message = plainMessage(error)
    html =
      `<span class="ms-math-error" role="note" title="${escapeHtml(message)}">` +
      `<strong>Math error:</strong> ${escapeHtml(message)} <code>${escapeHtml(tex.trim().slice(0, 120))}</code></span>`
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  cache.set(key, html)
  return html
}
