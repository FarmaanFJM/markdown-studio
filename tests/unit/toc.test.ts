import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import {
  buildTocBlock,
  buildTocList,
  findTocRegion,
  TOC_END,
  TOC_START
} from '@shared/markdown/toc'
import { renderMarkdown } from '../../src/renderer/src/markdown/render'

const DOC = `# Project

## Installation

### Windows

### Linux

## Configuration
`

const options = { includeTopLevel: false, maxDepth: 6 }

describe('table of contents', () => {
  it('generates the specified nested list', () => {
    expect(buildTocList(analyzeDocument(DOC), options)).toEqual([
      '- [Installation](#installation)',
      '  - [Windows](#windows)',
      '  - [Linux](#linux)',
      '- [Configuration](#configuration)'
    ])
  })

  it('can include the document title', () => {
    expect(buildTocList(analyzeDocument(DOC), { ...options, includeTopLevel: true })[0]).toBe(
      '- [Project](#project)'
    )
  })

  it('respects the maximum depth', () => {
    const list = buildTocList(analyzeDocument(DOC), { ...options, maxDepth: 2 })
    expect(list).toEqual(['- [Installation](#installation)', '- [Configuration](#configuration)'])
  })

  it('uses unique anchors for duplicate headings, matching the preview', () => {
    const source = '# T\n\n## Usage\n\n## Usage\n\n## Usage\n'
    const list = buildTocList(analyzeDocument(source), options)
    expect(list).toEqual(['- [Usage](#usage)', '- [Usage](#usage-1)', '- [Usage](#usage-2)'])
    const html = renderMarkdown(source)
    for (const anchor of ['usage', 'usage-1', 'usage-2']) expect(html).toContain(`id="${anchor}"`)
  })

  it('every generated link targets a rendered heading', () => {
    const source = '# Doc\n\n## Hello, World! 2.0\n\n## Ünïcode Ünder\n\n### `code` & <b>html</b>\n'
    const html = renderMarkdown(source)
    for (const line of buildTocList(analyzeDocument(source), options)) {
      const id = /\(#([^)]+)\)/.exec(line)![1]
      expect(html).toContain(`id="${id}"`)
    }
  })

  it('never lists headings that are only text in code blocks', () => {
    const source = '# A\n\n```md\n## fake\n```\n\n## Real\n'
    expect(buildTocList(analyzeDocument(source), options)).toEqual(['- [Real](#real)'])
  })

  it('nests sensibly when levels are skipped', () => {
    const source = '# A\n\n### Deep\n\n## Back\n'
    expect(buildTocList(analyzeDocument(source), options)).toEqual([
      '- [Deep](#deep)',
      '- [Back](#back)'
    ])
  })

  it('honours omit markers and does not list its own title', () => {
    const source = `# A\n\n## Table of Contents\n\n${TOC_START}\n\n${TOC_END}\n\n## One\n\n## Two <!-- omit in toc -->\n`
    const analysis = analyzeDocument(source)
    const region = findTocRegion(analysis)
    expect(region).toEqual({ start: 4, end: 6 })
    expect(buildTocList(analysis, options, region as { start: number; end: number })).toEqual([
      '- [One](#one)'
    ])
  })

  it('escapes characters that would break link labels', () => {
    const list = buildTocList(analyzeDocument('# T\n\n## a [b] *c*\n'), options)
    expect(list[0]).toMatch(/^- \[a/)
    expect(list[0]).toContain('\\[b\\]')
  })

  it('finds the managed region only outside code, and flags a missing end marker', () => {
    const fenced = analyzeDocument('```\n' + TOC_START + '\n' + TOC_END + '\n```\n')
    expect(findTocRegion(fenced)).toBeNull()
    expect(findTocRegion(analyzeDocument(`${TOC_START}\n- x\n`))).toBe('broken')
    expect(findTocRegion(analyzeDocument('# nothing\n'))).toBeNull()
  })

  it('builds a block with markers and blank lines', () => {
    const block = buildTocBlock(analyzeDocument(DOC), options)
    expect(block[0]).toBe(TOC_START)
    expect(block[1]).toBe('')
    expect(block[block.length - 1]).toBe(TOC_END)
    expect(block[block.length - 2]).toBe('')
    expect(buildTocBlock(analyzeDocument('text'), options)).toContain('_No headings yet._')
  })
})
