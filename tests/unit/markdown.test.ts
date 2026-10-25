// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { localFileUrl, pathFromLocalFileUrl } from '@shared/ipc'
import { buildHtmlDocument, documentTitle, renderDocumentBody } from '../../src/renderer/src/markdown/document'
import { slugify } from '../../src/renderer/src/markdown/render'
import { resolveImageSource, resolveLocalPath } from '../../src/renderer/src/markdown/resolve'

const WORKSPACE = '/home/ana/atlas'
const context = { documentDirectory: WORKSPACE, workspaceRoot: WORKSPACE }
const readme = readFileSync(path.resolve(__dirname, '../fixtures/workspace/README.md'), 'utf8')
const unsafe = readFileSync(path.resolve(__dirname, '../fixtures/workspace/unsafe.md'), 'utf8')

function render(source: string, ctx = context): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderDocumentBody(source, ctx)
  return host
}

describe('Markdown rendering (GitHub Flavored Markdown)', () => {
  const html = render(readme)

  it('renders headings with GitHub-style ids', () => {
    expect(html.querySelector('h1')?.textContent).toBe('Project Atlas')
    expect(html.querySelector('h2#getting-started')).not.toBeNull()
    expect(html.querySelector('h2#roadmap')).not.toBeNull()
    expect(slugify('Hello, World! 2.0')).toBe('hello-world-20')
  })

  it('renders emphasis, links and autolinks', () => {
    expect(html.querySelector('strong')?.textContent).toBe('sample documentation set')
    expect(html.querySelector('em')?.textContent).toBe('realistic')
    expect(html.querySelector('a[href="docs/guide.md"]')).not.toBeNull()
    expect(html.querySelector('a[href="https://commonmark.org"]')).not.toBeNull()
  })

  it('renders tables with alignment', () => {
    const table = html.querySelector('table')!
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(table.querySelector('th:last-child')?.getAttribute('style')).toContain('text-align:right')
  })

  it('renders ordered lists, nested fenced code and highlighted code', () => {
    expect(html.querySelectorAll('ol > li')).toHaveLength(3)
    expect(html.querySelector('ol pre code.language-bash')?.textContent).toContain('npm install')
    const ts = html.querySelector('pre code.language-ts')!
    expect(ts.querySelector('.hljs-keyword')).not.toBeNull()
  })

  it('renders task lists, strikethrough, blockquotes and rules', () => {
    const items = html.querySelectorAll('ul.contains-task-list > li.task-list-item')
    expect(items).toHaveLength(3)
    const boxes = html.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox')
    expect([...boxes].map((b) => b.checked)).toEqual([true, false, false])
    expect([...boxes].every((b) => b.disabled)).toBe(true)
    expect(items[0].textContent?.trim()).toBe('Gateway authentication')
    expect(html.querySelector('s')?.textContent).toBe('Legacy exporter')
    expect(html.querySelector('blockquote strong')?.textContent).toBe('Note:')
    expect(html.querySelector('hr')).not.toBeNull()
  })

  it('preserves inline HTML and its styling', () => {
    const div = html.querySelector<HTMLDivElement>('#inline-html')!
    expect(div.textContent?.trim()).toBe('This is HTML inside Markdown.')
    expect(div.style.color).toBe('red')
    expect(div.style.fontSize).toBe('24px')
  })

  it('resolves local images relative to the document', () => {
    const img = html.querySelector('img')!
    expect(img.getAttribute('src')).toBe(localFileUrl(`${WORKSPACE}/assets/architecture.png`))
    expect(img.getAttribute('data-ms-src')).toBe('assets/architecture.png')
    expect(img.getAttribute('alt')).toBe('Architecture')

    const nested = render('![Shot](../assets/screenshot.jpg)', {
      documentDirectory: `${WORKSPACE}/docs`,
      workspaceRoot: WORKSPACE
    })
    expect(pathFromLocalFileUrl(nested.querySelector('img')!.getAttribute('src')!)).toBe(
      `${WORKSPACE}/assets/screenshot.jpg`
    )
  })

  it('decodes encoded and angle-bracket destinations to the real file name', () => {
    const img = render('![Team](<assets/Team Photo (2024).png>) ![C](assets/caf%C3%A9.png)').querySelectorAll('img')
    expect(pathFromLocalFileUrl(img[0].getAttribute('src')!)).toBe(`${WORKSPACE}/assets/Team Photo (2024).png`)
    expect(pathFromLocalFileUrl(img[1].getAttribute('src')!)).toBe(`${WORKSPACE}/assets/café.png`)
  })
})

describe('sanitisation of untrusted documents', () => {
  const html = render(unsafe)
  const markup = html.innerHTML

  it('removes scripts, frames, forms and event handlers', () => {
    expect(html.querySelector('script, iframe, form, button, object, embed')).toBeNull()
    expect(markup).not.toMatch(/onerror|onclick|onload/i)
    expect(markup).not.toMatch(/javascript:/i)
    expect(html.querySelector('input:not([type="hidden"])')).toBeNull()
  })

  it('keeps harmless formatting', () => {
    expect(html.querySelector('p[style]')?.getAttribute('style')).toContain('color: rgb(0, 128, 0)')
    expect(html.querySelector('a')?.textContent).toBe('click me')
  })

  it('drops unsupported image schemes but keeps web and data images', () => {
    expect(resolveImageSource('javascript:alert(1)', context)).toBeNull()
    expect(resolveImageSource('msfile://local/%2Fetc%2Fpasswd', context)).toBeNull()
    expect(resolveImageSource('https://img.shields.io/badge/x.svg', context)).toBe('https://img.shields.io/badge/x.svg')
    expect(resolveImageSource('data:image/png;base64,AAAA', context)).toBe('data:image/png;base64,AAAA')
    expect(resolveImageSource('data:text/html,<script>', context)).toBeNull()
  })
})

describe('link resolution', () => {
  it('treats a leading slash as the workspace root', () => {
    expect(resolveLocalPath('/docs/guide.md', { documentDirectory: `${WORKSPACE}/docs`, workspaceRoot: WORKSPACE })).toBe(
      `${WORKSPACE}/docs/guide.md`
    )
    expect(resolveLocalPath('../README.md#top', { documentDirectory: `${WORKSPACE}/docs`, workspaceRoot: WORKSPACE })).toBe(
      `${WORKSPACE}/README.md`
    )
    expect(resolveLocalPath('https://example.com', context)).toBeNull()
    expect(resolveLocalPath('#roadmap', context)).toBeNull()
  })
})

describe('standalone documents', () => {
  it('builds a complete HTML document with metadata, policy and stylesheet', () => {
    const doc = buildHtmlDocument({ title: 'A <b>title</b>', body: '<p>x</p>', purpose: 'export' })
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(doc).toContain('<meta charset="utf-8">')
    expect(doc).toContain('<title>A &#60;b&#62;title&#60;/b&#62;</title>')
    expect(doc).toContain("default-src 'none'")
    expect(doc).not.toContain('msfile:')
    expect(doc).toContain('.markdown-body')
    const parsed = new DOMParser().parseFromString(doc, 'text/html')
    expect(parsed.querySelector('main.markdown-body p')?.textContent).toBe('x')
  })

  it('derives the title from the first heading', () => {
    expect(documentTitle('intro\n# **Atlas** Guide #\n', 'README')).toBe('Atlas Guide')
    expect(documentTitle('no heading', 'README')).toBe('README')
  })
})
