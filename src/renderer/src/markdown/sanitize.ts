import DOMPurify, { type Config } from 'dompurify'
import { sanitizeStyleAttribute, sanitizeStylesheet } from '@shared/presentation/css'

/**
 * Sanitisation for rendered Markdown.
 *
 * Markdown documents are treated as untrusted: they may come from anywhere. Formatting HTML
 * (including inline `style` attributes and `<style>` blocks) is preserved, but everything that
 * can execute code, load active content or submit data is removed. The preview additionally runs
 * inside a sandboxed iframe without script permission, so this is one of two independent layers.
 */
const CONFIG: Config = {
  FORBID_TAGS: [
    'script',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'applet',
    'portal',
    'form',
    'button',
    'textarea',
    'select',
    'option',
    'base',
    'link',
    'meta',
    'noscript',
    'template'
  ],
  FORBID_ATTR: ['srcset', 'action', 'formaction', 'ping', 'autofocus'],
  // KaTeX writes an accessible MathML copy of every equation; DOMPurify keeps MathML except
  // these two wrappers by default.
  ADD_TAGS: ['semantics', 'annotation'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // Heading ids such as "title" or "images" are also names of `document` properties, which
  // DOMPurify's DOM-clobbering protection would silently strip, breaking `#title` links. The
  // sanitised HTML is only ever placed in script-free documents (the preview frame and exports),
  // and the application reads those with methods, never with `document[name]`.
  SANITIZE_DOM: false,
  FORCE_BODY: true
}

export interface SanitizeOptions {
  /** Maps an image source to a loadable URL; returning null removes the source. */
  resolveImage: (src: string) => string | null
}

const purifier = DOMPurify(window)
let activeOptions: SanitizeOptions | null = null

// CSS inside Markdown HTML follows the same policy as custom CSS: nothing may load a file or a
// web address. Offending declarations and rules are dropped, the rest is kept.
purifier.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'style') {
    const element = node as Element
    element.textContent = sanitizeStylesheet(element.textContent ?? '')
  }
})

purifier.addHook('afterSanitizeAttributes', (node) => {
  const element = node as Element
  const style = element.getAttribute('style')
  if (style !== null) {
    const cleaned = sanitizeStyleAttribute(style)
    if (cleaned) element.setAttribute('style', cleaned)
    else element.removeAttribute('style')
  }
  switch (element.tagName) {
    case 'IMG': {
      const original = element.getAttribute('src')
      if (original === null) break
      const resolved = activeOptions?.resolveImage(original) ?? null
      // Keep the author's reference so exports can fall back to it.
      element.setAttribute('data-ms-src', original)
      if (resolved) element.setAttribute('src', resolved)
      else element.removeAttribute('src')
      break
    }
    case 'INPUT':
      // Only read-only task-list checkboxes have a purpose in a document.
      if ((element.getAttribute('type') ?? '').toLowerCase() !== 'checkbox') {
        element.setAttribute('type', 'hidden')
      }
      element.setAttribute('disabled', '')
      element.removeAttribute('name')
      break
    case 'A':
      element.setAttribute('rel', 'noopener noreferrer')
      element.removeAttribute('target')
      break
  }
})

export function sanitizeHtml(html: string, options: SanitizeOptions): string {
  activeOptions = options
  try {
    return purifier.sanitize(html, CONFIG) as string
  } finally {
    activeOptions = null
  }
}
