/**
 * Citation formatting. The engine is citeproc-js running the bundled APA 7th edition style
 * (CSL style "apa", the Style Variant Builder output of the citation-style-language project)
 * with the bundled CSL locales. One call formats every citation of a document together, which
 * is what makes disambiguation ("Smith, 2020a" / "2020b") and the bibliography consistent.
 */
import { plugins } from '@citation-js/core'
import '@citation-js/plugin-csl'
import CSL, { type CslEngineLike } from './cslEngine'
import { escapeHtml } from '../markdown/blocks'
import {
  cslLocale,
  type CitationCluster,
  type CitationProvider,
  type CitationResult
} from './types'
import type { Source } from './sources'

/** Which style and edition the application formats with. Shown in the user interface. */
export const CITATION_STYLE = { id: 'apa', name: 'APA Style 7th edition' } as const

interface CslConfig {
  styles: { get(id: string): string | undefined }
  locales: { get(id: string): string | undefined; has(id: string): boolean }
}

function config(): CslConfig {
  return plugins.config.get('@csl') as unknown as CslConfig
}

const engines = new Map<string, CslEngineLike>()
let holder: { items: Map<string, Source> } = { items: new Map() }

function engineFor(locale: string): CslEngineLike {
  let engine = engines.get(locale)
  if (!engine) {
    const csl = config()
    const style = csl.styles.get(CITATION_STYLE.id)
    if (!style) throw new Error('The APA style is not available.')
    engine = new CSL.Engine(
      {
        retrieveLocale: (lang) => csl.locales.get(lang) ?? csl.locales.get('en-US') ?? false,
        retrieveItem: (id) => holder.items.get(id)
      },
      style,
      locale,
      true
    )
    engine.setOutputFormat('html')
    engine.opt.development_extensions.wrap_url_and_doi = false
    engines.set(locale, engine)
  }
  return engine
}

const LOCATORS: [RegExp, string][] = [
  [/^(?:pp?|pages?)\.?\s*(.+)$/i, 'page'],
  [/^(?:chap|chapter|ch)\.?\s*(.+)$/i, 'chapter'],
  [/^(?:sec|section)\.?\s*(.+)$/i, 'section'],
  [/^(?:para|paragraph)\.?\s*(.+)$/i, 'paragraph'],
  [/^(?:fig|figure)\.?\s*(.+)$/i, 'figure'],
  [/^(?:vol|volume)\.?\s*(.+)$/i, 'volume']
]

/** Splits "p. 33, emphasis added" into a locator and the remaining suffix. */
function splitSuffix(suffix: string): { label?: string; locator?: string; suffix?: string } {
  const [head, ...rest] = suffix.split(/,\s*/)
  for (const [pattern, label] of LOCATORS) {
    const m = pattern.exec(head.trim())
    if (m)
      return {
        label,
        locator: m[1].trim(),
        ...(rest.length > 0 ? { suffix: `, ${rest.join(', ')}` } : {})
      }
  }
  return suffix ? { suffix: ` ${suffix}`.replace(/^ ,/, ',') } : {}
}

function missingMarker(id: string): string {
  return `<span class="ms-cite ms-cite-missing" title="No source with the key ${escapeHtml(id)}. Add it under Sources.">(${escapeHtml(id)}?)</span>`
}

/** Stable text used to decide whether the provider can be reused. */
function fingerprint(sources: readonly Source[]): string {
  return JSON.stringify(sources)
}

let lastFingerprint = ''

/**
 * A provider bound to a set of sources. Calling it formats the given clusters in order and
 * returns the bibliography of everything cited.
 */
export function createCitationProvider(
  sources: readonly Source[],
  lang: string | undefined
): CitationProvider {
  const locale = cslLocale(lang)
  const byId = new Map(sources.map((s) => [s.id, s]))
  return (clusters: CitationCluster[]): CitationResult => {
    const print = fingerprint(sources)
    if (print !== lastFingerprint) {
      // New data: engines keep per-item caches, so start them afresh.
      engines.clear()
      lastFingerprint = print
    }
    holder = { items: byId }
    const missing = new Set<string>()
    const requests: unknown[] = []
    const slots: { cluster: CitationCluster; index: number | null; present: number[] }[] = []
    clusters.forEach((cluster, index) => {
      const present: number[] = []
      const items = cluster.items.flatMap((item, itemIndex) => {
        if (!byId.has(item.id)) {
          missing.add(item.id)
          return []
        }
        present.push(itemIndex)
        return [
          {
            id: item.id,
            ...(item.prefix ? { prefix: `${item.prefix} ` } : {}),
            ...splitSuffix(item.suffix),
            ...(item.suppressAuthor ? { 'suppress-author': true } : {})
          }
        ]
      })
      if (items.length === 0) {
        slots.push({ cluster, index: null, present })
        return
      }
      slots.push({ cluster, index: requests.length, present })
      requests.push({
        citationID: `c${index}`,
        citationItems: items,
        properties: { noteIndex: 0, ...(cluster.narrative ? { mode: 'composite' } : {}) }
      })
    })

    const engine = engineFor(locale)
    const formatted = requests.length > 0 ? engine.rebuildProcessorState(requests, 'html', []) : []
    const html = slots.map((slot) => {
      const absent = slot.cluster.items.filter((_, i) => !slot.present.includes(i))
      const markers = absent.map((item) => missingMarker(item.id)).join(' ')
      if (slot.index === null) return markers
      const text = formatted[slot.index]?.[2] ?? ''
      return `<span class="ms-cite">${text}</span>${markers ? ` ${markers}` : ''}`
    })

    let bibliography: string[] = []
    if (requests.length > 0) {
      const made = engine.makeBibliography()
      if (made) bibliography = made[1].map((entry) => entry.trim()).map((entry) => `${entry}\n`)
    }
    return { html, bibliography, missing: [...missing] }
  }
}
