import { describe, expect, it } from 'vitest'
import createMarkdownIt from 'markdown-it'
import {
  altTextFromFileName,
  buildImageReference,
  formatLinkDestination,
  imageReferenceForFile
} from '@shared/imageReference'

const md = createMarkdownIt()

/** Renders a reference with a CommonMark parser and returns the decoded image source and alt. */
function parseImage(markdown: string): { src: string; alt: string } {
  const tokens = md.parseInline(markdown, {})[0].children ?? []
  const image = tokens.find((t) => t.type === 'image')
  if (!image) throw new Error(`No image parsed from ${markdown}`)
  return {
    src: decodeURIComponent(image.attrGet('src') ?? ''),
    alt: md.renderer.renderInlineAsText(image.children ?? [], {}, {})
  }
}

describe('alt text', () => {
  it('derives readable alt text from file names', () => {
    expect(altTextFromFileName('architecture.png')).toBe('Architecture')
    expect(altTextFromFileName('assets/system-overview_v2.jpg')).toBe('System overview v2')
    expect(altTextFromFileName('myScreenShot.png')).toBe('My Screen Shot')
    expect(altTextFromFileName('naïve-café.png')).toBe('Naïve café')
    expect(altTextFromFileName('diagram [v2] (final).png')).toBe('Diagram v2 final')
    expect(altTextFromFileName('___.png')).toBe('Image')
  })
})

describe('image references', () => {
  it('builds the reference from the spec example', () => {
    const ref = imageReferenceForFile('/MyProject', '/MyProject/assets/architecture.png')
    expect(ref?.text).toBe('![Architecture](assets/architecture.png)')
    expect(ref?.text.slice(ref.altOffset, ref.altOffset + ref.altLength)).toBe('Architecture')
  })

  it('uses ../ for documents in nested folders', () => {
    const ref = imageReferenceForFile('/MyProject/docs/guides', '/MyProject/assets/a.png')
    expect(ref?.text).toBe('![A](../../assets/a.png)')
  })

  it('handles Windows paths', () => {
    const ref = imageReferenceForFile('C:\\Users\\Ana\\Atlas\\docs', 'C:\\Users\\Ana\\Atlas\\assets\\shot.png')
    expect(ref?.text).toBe('![Shot](../assets/shot.png)')
  })

  it('uses angle brackets for names with spaces and parentheses', () => {
    expect(formatLinkDestination('assets/Team Photo (2024).png')).toBe('<assets/Team Photo (2024).png>')
    expect(formatLinkDestination('assets/plain.png')).toBe('assets/plain.png')
  })

  const awkwardNames = [
    'assets/Team Photo (2024).png',
    'assets/naïve-café_überblick.png',
    'assets/diagram [v2].png',
    'assets/100% done.png',
    'assets/a%20b.png',
    'assets/emoji 🎉.png',
    'assets/under_score*star.png',
    'assets/<angle>.png'
  ]

  for (const name of awkwardNames) {
    it(`round-trips "${name}" through a CommonMark parser`, () => {
      const ref = buildImageReference(altTextFromFileName(name), name)
      const parsed = parseImage(ref.text)
      expect(parsed.src).toBe(name)
      expect(parsed.alt).toBe(altTextFromFileName(name))
    })
  }

  it('escapes Markdown-sensitive characters in alt text', () => {
    const ref = buildImageReference('a [b] *c* _d_', 'x.png')
    expect(ref.text).toBe('![a \\[b\\] \\*c\\* \\_d\\_](x.png)')
    expect(parseImage(ref.text).alt).toBe('a [b] *c* _d_')
  })

  it('returns null when no relative path exists', () => {
    expect(imageReferenceForFile('C:/docs', 'D:/img/a.png')).toBeNull()
  })
})
