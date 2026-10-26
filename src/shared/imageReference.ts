import { basename, relativePath, stripExtension } from './paths'

/**
 * Builds readable alt text from an image file name:
 * `architecture-diagram_v2.png` becomes `Architecture diagram v2`.
 */
export function altTextFromFileName(fileName: string): string {
  const stem = stripExtension(basename(fileName))
  const words = stem
    .replace(/[_\-.+]+/g, ' ')
    .replace(/[[\]()<>{}*`#!\\|]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  if (!words) return 'Image'
  return words.charAt(0).toLocaleUpperCase() + words.slice(1)
}

/** Escapes characters that would otherwise be interpreted as Markdown inside `![...]`. */
export function escapeAltText(text: string): string {
  return text.replace(/[\\[\]*_`<>!]/g, (ch) => `\\${ch}`)
}

/**
 * Formats a relative path as a CommonMark link destination.
 *
 * `%` is always encoded so a file that literally contains `%20` keeps its name. Destinations
 * containing whitespace or parentheses use the `<...>` form, which CommonMark, GitHub and
 * markdown-it all support and which keeps the file name readable.
 */
export function formatLinkDestination(path: string): string {
  const encoded = path.replace(/%/g, '%25').replace(/</g, '%3C').replace(/>/g, '%3E')
  if (/[\s()]/.test(encoded) || encoded.length === 0) {
    return `<${encoded.replace(/\n/g, '%0A')}>`
  }
  return encoded
}

export interface ImageReference {
  text: string
  /** Offset of the alt text within `text`, so the editor can select it for immediate editing. */
  altOffset: number
  altLength: number
}

export function buildImageReference(altText: string, destination: string): ImageReference {
  const alt = escapeAltText(altText)
  return {
    text: `![${alt}](${formatLinkDestination(destination)})`,
    altOffset: 2,
    altLength: alt.length
  }
}

/**
 * Computes the image path relative to the directory that contains the Markdown document.
 * Returns `null` when no relative path exists (for example, a different Windows drive).
 */
export function imagePathForDocument(documentDirectory: string, imagePath: string): string | null {
  return relativePath(documentDirectory, imagePath)
}

export function imageReferenceForFile(
  documentDirectory: string,
  imagePath: string
): ImageReference | null {
  const relative = imagePathForDocument(documentDirectory, imagePath)
  if (relative === null) return null
  return buildImageReference(altTextFromFileName(imagePath), relative)
}

export interface ImagePlacement {
  /** Insert at the end of the line instead of at the drop position. */
  atLineEnd: boolean
  /** Text to insert: every reference on its own line, with a leading line break when needed. */
  text: string
  /** Offset within `text` at which the first reference starts. */
  firstOffset: number
}

/**
 * Decides where image references go when they are dropped, pasted or inserted at `line`.
 *
 * On a blank line they are inserted where they were dropped. On a line that already has content
 * (a paragraph, heading, list item, quote or another image) they go on a new line underneath,
 * never into the middle of the text. A new line below a list item is indented to the item's
 * text and one below a quote keeps the quote marker, so the image stays inside the item or quote.
 */
export function placeImageReferences(line: string, references: readonly string[]): ImagePlacement {
  if (line.trim() === '') {
    return { atLineEnd: false, text: references.join('\n'), firstOffset: 0 }
  }
  const quote = /^\s*(?:>[ \t]?)+/.exec(line)?.[0]
  const list = quote ? null : /^(\s*)(?:[-*+]|\d{1,9}[.)])([ \t]+)/.exec(line)
  const prefix = quote ?? (list ? ' '.repeat(list[0].length) : '')
  const lead = `\n${prefix}`
  return {
    atLineEnd: true,
    text: lead + references.join(lead),
    firstOffset: lead.length
  }
}
