/** Documents up to this size use the base delay unchanged. */
const FREE_CHARACTERS = 50_000
const MAX_EXTRA_MS = 1500

/**
 * A debounce delay that grows with the size of the document. Re-rendering the preview,
 * re-parsing for the outline and revalidating links all cost time in proportion to the document,
 * so in a very large document they wait for a longer pause in typing; ordinary documents are
 * unaffected.
 */
export function adaptiveDelay(baseMs: number, characters: number): number {
  return baseMs + Math.min(MAX_EXTRA_MS, Math.max(0, characters - FREE_CHARACTERS) / 500)
}
