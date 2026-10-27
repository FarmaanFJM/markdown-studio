// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { placeImageReferences } from '@shared/imageReference'
import { renderDocumentBody } from '../../src/renderer/src/markdown/document'

const IMG = '![Health UI screenshot](assets/health-ui.png)'
const IMG2 = '![Second](assets/two.png)'

/** Applies a drop on `lineIndex` of `source` the way the editor does. */
function drop(source: string, lineIndex: number, references = [IMG]): string {
  const lines = source.split('\n')
  const placement = placeImageReferences(lines[lineIndex], references, {
    previous: lines[lineIndex - 1] ?? null,
    next: lines[lineIndex + 1] ?? null
  })
  lines[lineIndex] = placement.atLineEnd ? lines[lineIndex] + placement.text : placement.text
  return lines.join('\n')
}

function html(source: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderDocumentBody(source, { documentDirectory: null, workspaceRoot: null })
  return host
}

/** No paragraph may hold both an image and other content: every image is a block of its own. */
function imagesAreBlocks(host: HTMLElement): boolean {
  return [...host.querySelectorAll('img')].every((img) => {
    const parent = img.parentElement!
    return (
      parent.tagName !== 'P' || parent.textContent!.trim() === '' || parent.children.length === 1
    )
  })
}

describe('placing dropped images', () => {
  it('puts the image in its own paragraph after text', () => {
    const result = drop('This paragraph describes the health UI.', 0)
    expect(result).toBe(`This paragraph describes the health UI.\n\n${IMG}`)
    const host = html(result)
    expect(host.querySelectorAll('p')).toHaveLength(2)
    expect(host.querySelector('p')!.textContent).toBe('This paragraph describes the health UI.')
    expect(imagesAreBlocks(host)).toBe(true)
  })

  it('does not merge with the text that follows', () => {
    const result = drop('First.\nSecond line of the same paragraph.', 0)
    expect(result).toBe(`First.\n\n${IMG}\n\nSecond line of the same paragraph.`)
    expect(imagesAreBlocks(html(result))).toBe(true)
  })

  it('adds no blank line after the image when nothing follows or a blank line does', () => {
    expect(drop('Text', 0)).toBe(`Text\n\n${IMG}`)
    expect(drop('Text\n\nNext paragraph', 0)).toBe(`Text\n\n${IMG}\n\nNext paragraph`)
  })

  it('works after a heading', () => {
    const result = drop('## Results\nText', 0)
    expect(result).toBe(`## Results\n\n${IMG}\n\nText`)
    const host = html(result)
    expect(host.querySelector('h2')!.textContent).toBe('Results')
    expect(imagesAreBlocks(host)).toBe(true)
  })

  it('keeps the image inside a list item', () => {
    const result = drop('- first\n- second', 0)
    expect(result).toBe(`- first\n\n  ${IMG}\n- second`)
    const host = html(result)
    expect(host.querySelectorAll('ul > li')).toHaveLength(2)
    expect(host.querySelector('li img')).not.toBeNull()
    expect(imagesAreBlocks(host)).toBe(true)
  })

  it('keeps the image inside a numbered list item', () => {
    const result = drop('1. first\n2. second', 0)
    expect(result).toBe(`1. first\n\n   ${IMG}\n2. second`)
    expect(html(result).querySelectorAll('ol > li')).toHaveLength(2)
    expect(html(result).querySelector('ol li img')).not.toBeNull()
  })

  it('keeps the image inside a blockquote', () => {
    const result = drop('> a quote\n> continues', 0)
    expect(result).toBe(`> a quote\n>\n> ${IMG}\n>\n> continues`)
    const host = html(result)
    expect(host.querySelectorAll('blockquote')).toHaveLength(1)
    expect(host.querySelector('blockquote img')).not.toBeNull()
    expect(imagesAreBlocks(host)).toBe(true)
  })

  it('does not let text after a quote join the image by lazy continuation', () => {
    const result = drop('> a quote\nplain', 0)
    expect(result).toBe(`> a quote\n>\n> ${IMG}\n\nplain`)
    expect(imagesAreBlocks(html(result))).toBe(true)
  })

  it('goes below an existing image as another block', () => {
    const result = drop('![Old](old.png)', 0)
    expect(result).toBe(`![Old](old.png)\n\n${IMG}`)
    expect(html(result).querySelectorAll('img')).toHaveLength(2)
    expect(imagesAreBlocks(html(result))).toBe(true)
  })

  it('on a blank line adds only the separation that is missing', () => {
    // Either blank line between two paragraphs gives the same, correctly spaced result.
    const expected = `Text\n\n${IMG}\n\nMore`
    expect(drop('Text\n\n\nMore', 1)).toBe(expected)
    expect(drop('Text\n\n\nMore', 2)).toBe(expected)
    expect(imagesAreBlocks(html(expected))).toBe(true)
    // Blank first line of a document, and an empty document.
    expect(drop('\nText', 0)).toBe(`${IMG}\n\nText`)
    expect(drop('', 0)).toBe(IMG)
  })

  it('does not add a blank line between a heading and an image dropped on the blank line below it', () => {
    expect(drop('## Overview\n\nText', 1)).toBe(`## Overview\n${IMG}\n\nText`)
  })

  it('separates consecutive images into blocks', () => {
    const result = drop('Text', 0, [IMG, IMG2])
    expect(result).toBe(`Text\n\n${IMG}\n\n${IMG2}`)
    const host = html(result)
    expect(host.querySelectorAll('p img')).toHaveLength(2)
    expect(imagesAreBlocks(host)).toBe(true)
    expect(drop('', 0, [IMG, IMG2])).toBe(`${IMG}\n\n${IMG2}`)
  })

  it('indents every image of a drop into a list item', () => {
    expect(drop('- item', 0, [IMG, IMG2])).toBe(`- item\n\n  ${IMG}\n\n  ${IMG2}`)
  })

  it('reports where the first image and the end of the last one are', () => {
    const placement = placeImageReferences('Text', [IMG, IMG2], { previous: null, next: 'More' })
    expect(placement.text.slice(placement.firstOffset, placement.firstOffset + IMG.length)).toBe(
      IMG
    )
    expect(placement.text.slice(0, placement.endOffset).endsWith(IMG2)).toBe(true)
  })

  it('does not treat a thematic break as a list', () => {
    expect(drop('---', 0)).toBe(`---\n\n${IMG}`)
  })
})
