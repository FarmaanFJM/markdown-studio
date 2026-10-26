import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')
const FILES = [
  'README.md',
  'CHANGELOG.md',
  ...readdirSync(path.join(ROOT, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`)
]

/** GitHub's heading anchor: lower-case, punctuation removed, spaces to hyphens. */
function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}

function headings(markdown: string): Set<string> {
  const found = new Set<string>()
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const match = !fenced && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (match) found.add(slug(match[1]))
  }
  return found
}

function links(markdown: string): string[] {
  const out: string[] = []
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    const text = line.replace(/`[^`]*`/g, '')
    for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) out.push(m[1])
  }
  return out
}

describe('documentation links', () => {
  it.each(FILES)('%s: relative links and anchors resolve', (file) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8')
    for (const target of links(source)) {
      if (/^(https?:|mailto:)/.test(target)) continue
      const [pathPart, anchor] = target.split('#')
      const resolved = pathPart
        ? path.resolve(path.dirname(path.join(ROOT, file)), pathPart)
        : path.join(ROOT, file)
      expect(existsSync(resolved), `${file} links to ${target}`).toBe(true)
      if (anchor && resolved.endsWith('.md')) {
        expect(headings(readFileSync(resolved, 'utf8')), `${file} → ${target}`).toContain(anchor)
      }
    }
  })

  it('does not describe removed or unimplemented behaviour as current', () => {
    const all = FILES.filter((f) => f !== 'CHANGELOG.md' && !f.includes('ROADMAP'))
      .map((f) => readFileSync(path.join(ROOT, f), 'utf8'))
      .join('\n')
    // Bold is Ctrl+B now; the old mapping must not survive in the guides.
    expect(all).not.toMatch(/Bold[^\n|]*Ctrl<\/kbd>\+<kbd>Shift<\/kbd>\+<kbd>B/)
    expect(all).not.toContain('Source only')
  })
})
