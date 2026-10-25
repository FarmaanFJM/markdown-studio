/**
 * Final safety check of an exported document.
 *
 * The export pipeline already sanitises everything it inserts; this audit verifies the finished
 * HTML independently, so a regression anywhere upstream shows up as a refused export instead of
 * an unsafe file. It also reports things a reader cannot rely on offline.
 */
import { analyzeCss } from '@shared/presentation/css'

export interface AuditResult {
  /** Reasons the document must not be exported. */
  violations: string[]
  /** `http(s)` images that stay remote because they cannot be embedded. */
  remoteImages: string[]
  /** Links to local files that will not resolve once the HTML is moved elsewhere. */
  unresolvedLinks: string[]
  /** Same-document links whose target heading does not exist. */
  brokenAnchors: string[]
}

const FORBIDDEN_ELEMENTS =
  'script, iframe, frame, frameset, object, embed, applet, base, form, link, portal, noscript'
const URL_ATTRIBUTES = [
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
  'data',
  'poster',
  'srcset'
]
const ACTIVE_SCHEME = /^\s*(?:javascript|vbscript|data:text\/html|data:application\/xhtml)/i

export function auditExportedHtml(html: string): AuditResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const violations: string[] = []
  const add = (message: string) => {
    if (!violations.includes(message)) violations.push(message)
  }

  doc
    .querySelectorAll(FORBIDDEN_ELEMENTS)
    .forEach((el) => add(`Contains a <${el.localName}> element.`))
  doc.querySelectorAll('meta[http-equiv]').forEach((el) => {
    if ((el.getAttribute('http-equiv') ?? '').toLowerCase() !== 'content-security-policy') {
      add('Contains a meta http-equiv directive.')
    }
  })
  doc.querySelectorAll('*').forEach((el) => {
    for (const attribute of [...el.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on')) add(`Contains an event handler attribute (${name}).`)
      if (URL_ATTRIBUTES.includes(name) && ACTIVE_SCHEME.test(attribute.value)) {
        add(`Contains an active URL in ${name}.`)
      }
      if (name === 'style') {
        const css = analyzeCss(attribute.value, 'declarations')
        if (css.problems.length > 0) add('Contains an inline style that loads external resources.')
      }
    }
  })
  doc.querySelectorAll('style').forEach((el) => {
    const css = analyzeCss(el.textContent ?? '', 'stylesheet', { fragmentUrls: true, unlimited: true })
    if (css.problems.length > 0)
      add(`A stylesheet breaks the CSS policy: ${css.problems[0].message}`)
  })
  // <use>, <image> and similar may only point inside the document.
  doc.querySelectorAll('use, image, feImage, a').forEach((el) => {
    const target = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? ''
    if (el.namespaceURI?.includes('svg') && target && !target.startsWith('#')) {
      add(`An SVG element references an external resource (${el.localName}).`)
    }
  })

  const ids = new Set([...doc.querySelectorAll('[id]')].map((el) => el.id))
  const remoteImages: string[] = []
  const unresolvedLinks: string[] = []
  const brokenAnchors: string[] = []

  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (/^(?:https?:)?\/\//i.test(src)) remoteImages.push(src)
    else if (src.startsWith('msfile:'))
      add('An image still points to the application’s private file protocol.')
    else if (src && !src.startsWith('data:')) unresolvedLinks.push(src)
  })
  doc.querySelectorAll('a[href]').forEach((a) => {
    if (a.namespaceURI?.includes('svg')) return
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith('#')) {
      const target = decodeURIComponent(href.slice(1))
      if (target && !ids.has(target) && !doc.getElementsByName(target).length)
        brokenAnchors.push(href)
    } else if (!/^(?:https?:|mailto:|tel:)/i.test(href)) {
      unresolvedLinks.push(href)
    }
  })

  const unique = (items: string[]) => [...new Set(items)]
  return {
    violations,
    remoteImages: unique(remoteImages),
    unresolvedLinks: unique(unresolvedLinks),
    brokenAnchors: unique(brokenAnchors)
  }
}
