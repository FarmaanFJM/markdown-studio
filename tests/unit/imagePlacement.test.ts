import { describe, expect, it } from 'vitest'
import { placeImageReferences } from '@shared/imageReference'

const IMG = '![Diagram](assets/diagram.png)'

describe('where dropped images go', () => {
  it('inserts at the drop point on an empty line', () => {
    expect(placeImageReferences('', [IMG])).toEqual({ atLineEnd: false, text: IMG, firstOffset: 0 })
    expect(placeImageReferences('   ', [IMG]).atLineEnd).toBe(false)
  })

  it('moves to a new line below a paragraph', () => {
    const placement = placeImageReferences('Some paragraph text', [IMG])
    expect(placement).toEqual({ atLineEnd: true, text: `\n${IMG}`, firstOffset: 1 })
  })

  it('adds no blank line', () => {
    expect(placeImageReferences('Text', [IMG]).text.startsWith('\n\n')).toBe(false)
  })

  it('goes below a heading', () => {
    expect(placeImageReferences('## Results', [IMG]).text).toBe(`\n${IMG}`)
  })

  it('stays inside a list item by indenting to its text', () => {
    expect(placeImageReferences('- item', [IMG]).text).toBe(`\n  ${IMG}`)
    expect(placeImageReferences('  * nested', [IMG]).text).toBe(`\n    ${IMG}`)
    expect(placeImageReferences('12. numbered', [IMG]).text).toBe(`\n    ${IMG}`)
    expect(placeImageReferences('- [ ] task', [IMG]).text).toBe(`\n  ${IMG}`)
  })

  it('keeps the quote marker in a blockquote', () => {
    expect(placeImageReferences('> quoted', [IMG]).text).toBe(`\n> ${IMG}`)
    expect(placeImageReferences('> > deep', [IMG]).text).toBe(`\n> > ${IMG}`)
  })

  it('goes below an existing image', () => {
    expect(placeImageReferences('![A](a.png)', [IMG]).text).toBe(`\n${IMG}`)
  })

  it('puts several images on their own lines', () => {
    const placement = placeImageReferences('Text', [IMG, '![B](b.png)'])
    expect(placement.text).toBe(`\n${IMG}\n![B](b.png)`)
    expect(placeImageReferences('', [IMG, '![B](b.png)']).text).toBe(`${IMG}\n![B](b.png)`)
  })

  it('indents every image of a drop into a list item', () => {
    expect(placeImageReferences('- item', ['![A](a.png)', '![B](b.png)']).text).toBe(
      '\n  ![A](a.png)\n  ![B](b.png)'
    )
  })

  it('does not treat a thematic break as a list', () => {
    expect(placeImageReferences('---', [IMG]).text).toBe(`\n${IMG}`)
  })
})
