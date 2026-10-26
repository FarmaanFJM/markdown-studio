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
  /** Text to insert, including the line breaks that make every reference a block of its own. */
  text: string
  /** Offset within `text` at which the first reference starts. */
  firstOffset: number
  /** Offset within `text` just after the last reference. */
  endOffset: number
}

export interface ImageNeighbours {
  /** The line above the drop line, or null at the start of the document. */
  previous: string | null
  /** The line below the drop line, or null at the end of the document. */
  next: string | null
}

const isBlank = (line: string | null): boolean => line === null || line.trim() === ''

/**
 * Decides where image references go when they are dropped, pasted or inserted at `line`, and what
 * line breaks they need. A single line break would leave the image in the same paragraph as the
 * text above it, so every reference becomes a separate block:
 *
 * - On a line with content (paragraph, heading, list item, quote, image) the images go underneath
 *   after one blank line, and one blank line follows them when text comes next.
 * - A list item keeps the image inside the item (indented to its text) and a quote keeps its `>`.
 * - On a blank line they go where they were dropped; a blank line is added above only when the
 *   line above is text (not a heading), and below only when the line below has content.
 *
 * No more blank lines are added than that, so spacing that is already right is left alone.
 */
export function placeImageReferences(
  line: string,
  references: readonly string[],
  neighbours: ImageNeighbours = { previous: null, next: null }
): ImagePlacement {
  if (isBlank(line)) {
    // A heading ends its own block, so an image on the line below it is already separate.
    const lead =
      isBlank(neighbours.previous) || /^ {0,3}#{1,6}(?:\s|$)/.test(neighbours.previous as string)
        ? ''
        : '\n'
    const trail = isBlank(neighbours.next) ? '' : '\n'
    return {
      atLineEnd: false,
      text: lead + references.join('\n\n') + trail,
      firstOffset: lead.length,
      endOffset: lead.length + references.join('\n\n').length
    }
  }

  const quote = /^\s*(?:>[ \t]?)+/.exec(line)?.[0]
  const list = quote ? null : /^(\s*)(?:[-*+]|\d{1,9}[.)])([ \t]+)/.exec(line)
  const prefix = quote ?? (list ? ' '.repeat(list[0].length) : '')
  // Between blocks of a quote the quote continues on an empty `>` line.
  const lead = `\n${quote ? quote.trimEnd() : ''}\n${prefix}`
  let trail = ''
  if (!isBlank(neighbours.next)) {
    const next = neighbours.next as string
    if (quote) trail = /^\s*>/.test(next) ? `\n${quote.trimEnd()}` : '\n'
    // The next list item starts its own block; anything else would join the image's paragraph.
    else if (!(list && /^\s*(?:[-*+]|\d{1,9}[.)])[ \t]/.test(next))) trail = '\n'
  }
  return {
    atLineEnd: true,
    text: lead + references.join(lead) + trail,
    firstOffset: lead.length,
    endOffset: lead.length + references.join(lead).length
  }
}
