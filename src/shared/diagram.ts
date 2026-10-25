/** Contract between the application and the isolated Mermaid renderer. */
import { normalizeColor } from './presentation/theme'

export const DIAGRAM_LIMITS = {
  /** Mermaid's own default `maxTextSize`. */
  sourceChars: 50_000,
  idLength: 64,
  fontFamilyLength: 300,
  /** Longest a single diagram may take before it is reported as failed. */
  timeoutMs: 20_000
} as const

export type DiagramVariant = 'light' | 'dark'

export interface DiagramRenderRequest {
  /** Caller's identifier; only used to match the answer and to cancel. */
  id: string
  source: string
  variant: DiagramVariant
  /** CSS font-family list used inside the diagram. */
  fontFamily: string
  /** Document accent colour (`#rrggbb`). */
  accent: string
  /** Text and page colours, so diagrams sit naturally on the document page. */
  text: string
  background: string
  /**
   * Stable SVG element id prefix. Equal sources always produce equal ids, which keeps exports
   * reproducible and styles of different diagrams from colliding.
   */
  svgId: string
}

export type DiagramRenderResult =
  | { id: string; ok: true; svg: string }
  | {
      id: string
      ok: false
      message: string
      /** 1-based line inside the diagram source, when Mermaid reported one. */
      line: number | null
    }

const SAFE_FONT_FAMILY = /^[A-Za-z0-9 ,'"_\-.]+$/
const SVG_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

export type DiagramRequestValidation =
  { ok: true; request: DiagramRenderRequest } | { ok: false; error: string }

export function validateDiagramRequest(input: unknown): DiagramRequestValidation {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Invalid request.' }
  const v = input as Record<string, unknown>
  if (typeof v.id !== 'string' || v.id.length === 0 || v.id.length > DIAGRAM_LIMITS.idLength) {
    return { ok: false, error: 'Invalid request id.' }
  }
  if (typeof v.source !== 'string' || v.source.trim() === '') {
    return { ok: false, error: 'The diagram is empty.' }
  }
  if (v.source.length > DIAGRAM_LIMITS.sourceChars) {
    return {
      ok: false,
      error: `The diagram is larger than the limit of ${DIAGRAM_LIMITS.sourceChars.toLocaleString('en-US')} characters.`
    }
  }
  if (v.variant !== 'light' && v.variant !== 'dark') return { ok: false, error: 'Invalid variant.' }
  if (
    typeof v.fontFamily !== 'string' ||
    v.fontFamily.length > DIAGRAM_LIMITS.fontFamilyLength ||
    !SAFE_FONT_FAMILY.test(v.fontFamily)
  ) {
    return { ok: false, error: 'Invalid font.' }
  }
  const accent = normalizeColor(v.accent)
  const text = normalizeColor(v.text)
  const background = normalizeColor(v.background)
  if (!accent || !text || !background) return { ok: false, error: 'Invalid colour.' }
  if (typeof v.svgId !== 'string' || !SVG_ID.test(v.svgId))
    return { ok: false, error: 'Invalid id.' }
  return {
    ok: true,
    request: {
      id: v.id,
      source: v.source,
      variant: v.variant,
      fontFamily: v.fontFamily,
      accent,
      text,
      background,
      svgId: v.svgId
    }
  }
}
