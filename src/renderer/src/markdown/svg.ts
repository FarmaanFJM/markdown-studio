import DOMPurify from 'dompurify'
import { analyzeCss, sanitizeStyleAttribute } from '@shared/presentation/css'

/**
 * Sanitiser for diagram SVG.
 *
 * Mermaid output is generated from untrusted text, so it is treated as untrusted too. Scripts,
 * event handlers, frames, external references and `<image>`/`<use>` pointing outside the
 * document are removed; style rules go through the shared CSS policy (references may only point to
 * elements inside the same SVG, `url(#id)`).
 */
const purifier = DOMPurify(window)

const LOCAL_REFERENCE = /^\s*url\(\s*(['"]?)#[A-Za-z0-9_:.-]+\1\s*\)\s*$/

purifier.addHook('afterSanitizeAttributes', (node) => {
  const element = node as Element
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase()
    if (name === 'style') {
      const cleaned = sanitizeStyleAttribute(attribute.value, { fragmentUrls: true })
      if (cleaned) element.setAttribute('style', cleaned)
      else element.removeAttribute('style')
      continue
    }
    if (name === 'href' || name === 'xlink:href') {
      // Only same-document references are meaningful inside a diagram.
      if (!attribute.value.trim().startsWith('#')) element.removeAttribute(attribute.name)
      continue
    }
    // Presentation attributes such as fill, filter and marker-end may use url(): local only.
    if (/url\s*\(/i.test(attribute.value)) {
      const parts = attribute.value.match(/url\(\s*['"]?[^)]*\)/gi) ?? []
      if (!parts.every((part) => LOCAL_REFERENCE.test(part)))
        element.removeAttribute(attribute.name)
    }
  }
})

purifier.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'style') {
    const element = node as Element
    const analysis = analyzeCss(element.textContent ?? '', 'stylesheet', { fragmentUrls: true })
    element.textContent = analysis.css
  }
})

/** Returns safe SVG markup, or null when nothing usable remains. */
export function sanitizeSvg(svg: string): string | null {
  const clean = purifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject', 'style'],
    FORBID_TAGS: [
      'script',
      'iframe',
      'frame',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'link',
      'meta',
      'base',
      'img',
      'image',
      'video',
      'audio',
      'animate',
      'animateMotion',
      'animateTransform',
      'set'
    ],
    FORBID_ATTR: ['srcset', 'action', 'formaction', 'ping', 'autofocus'],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    ALLOW_UNKNOWN_PROTOCOLS: false,
    RETURN_TRUSTED_TYPE: false
  }) as string
  return /<svg[\s>]/i.test(clean) ? clean : null
}
