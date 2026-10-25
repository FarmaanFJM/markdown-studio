import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import {
  closestAnchor,
  editDistance,
  findLinkProblems,
  type LinkEnvironment
} from '@shared/markdown/linkProblems'
import type { EntryState } from '@shared/ipc'

const ROOT = '/work/atlas'
const context = { documentDirectory: `${ROOT}/docs`, workspaceRoot: ROOT }

function environment(
  existing: Record<string, EntryState | string[]>,
  extra: { names?: Record<string, string[]> } = {}
): LinkEnvironment {
  return {
    async stat(paths) {
      return new Map(
        paths.map((p) => {
          const entry = existing[p]
          return [p, Array.isArray(entry) ? 'file' : ((entry as EntryState) ?? 'missing')] as const
        })
      )
    },
    async anchorsOf(path) {
      const entry = existing[path]
      return Array.isArray(entry) ? new Set(entry) : null
    },
    async filesNamed(name) {
      return extra.names?.[name.toLowerCase()] ?? []
    }
  }
}

const check = (source: string, env: LinkEnvironment) =>
  findLinkProblems(analyzeDocument(source), context, env)

describe('link validation', () => {
  it('flags missing files and images with the path as written', async () => {
    const problems = await check(
      'See [guide](guide.md) and ![logo](../assets/logo.png).',
      environment({ [`${ROOT}/docs/guide.md`]: 'file' })
    )
    expect(problems.map((p) => [p.code, p.message])).toEqual([
      ['missing-image', 'Image not found: ../assets/logo.png']
    ])
    const source = 'See [guide](guide.md) and ![logo](../assets/logo.png).'
    expect(problems[0]).toMatchObject({ line: 0, column: source.indexOf('../assets') })
  })

  it('does not warn about valid links, web URLs, mail links or folders', async () => {
    const source = [
      '[a](guide.md) [b](https://example.com/x) [c](mailto:me@x.dev) [d](../assets/)',
      '![e](../assets/pic.png) [f](#top) [g](<my notes.md>) [h](//cdn.example.com/x.js)'
    ].join('\n')
    const problems = await check(
      source,
      environment({
        [`${ROOT}/docs/guide.md`]: 'file',
        [`${ROOT}/assets`]: 'directory',
        [`${ROOT}/assets/pic.png`]: 'file',
        [`${ROOT}/docs/my notes.md`]: 'file'
      })
    )
    expect(problems).toEqual([])
  })

  it('reports nothing for paths the application may not look at', async () => {
    const problems = await check(
      '[x](../../elsewhere/a.md)',
      environment({ [`/work/elsewhere/a.md`]: 'unknown' })
    )
    expect(problems).toEqual([])
  })

  it('resolves root-relative and percent-encoded paths like the preview', async () => {
    const problems = await check(
      '[a](/docs/guide.md) [b](my%20notes.md) [c](/missing.md)',
      environment({
        [`${ROOT}/docs/guide.md`]: 'file',
        [`${ROOT}/docs/my notes.md`]: 'file'
      })
    )
    expect(problems.map((p) => p.message)).toEqual(['File not found: /missing.md'])
  })

  it('checks heading anchors in this document and in linked documents', async () => {
    const source =
      '# Intro\n\n## Setup Steps\n\n[a](#setup-steps) [b](#setup-step) [c](guide.md#usage) [d](guide.md#usge)\n<a name="legacy"></a> [e](#legacy)'
    const problems = await check(
      source,
      environment({ [`${ROOT}/docs/guide.md`]: ['usage', 'install'] })
    )
    expect(problems.map((p) => [p.code, p.message])).toEqual([
      ['missing-anchor', 'No heading with the anchor #setup-step in this document.'],
      ['missing-anchor', 'No heading with the anchor #usge in guide.md.']
    ])
    expect(problems[0].fix).toEqual({
      title: 'Change to #setup-steps',
      replacement: '#setup-steps'
    })
    expect(problems[1].fix?.replacement).toBe('guide.md#usage')
  })

  it('treats anchors case-sensitively like the preview but suggests the right case', async () => {
    const problems = await check('# Install\n\n[x](#Install)', environment({}))
    expect(problems).toHaveLength(1)
    expect(problems[0].fix?.replacement).toBe('#install')
  })

  it('offers a fix only when exactly one file with that name exists', async () => {
    const source = '[a](old/guide.md) [b](old/readme.md)'
    const problems = await check(
      source,
      environment(
        {},
        {
          names: {
            'guide.md': [`${ROOT}/docs/guide.md`],
            'readme.md': [`${ROOT}/README.md`, `${ROOT}/other/README.md`]
          }
        }
      )
    )
    expect(problems[0].fix).toEqual({ title: 'Change to "guide.md"', replacement: 'guide.md' })
    expect(problems[1].fix).toBeUndefined()
  })

  it('keeps root-relative style and fragments when fixing', async () => {
    const problems = await check(
      '[a](/old/guide.md#start)',
      environment({}, { names: { 'guide.md': [`${ROOT}/docs/guide.md`] } })
    )
    expect(problems[0].fix?.replacement).toBe('/docs/guide.md#start')
  })

  it('ignores code blocks and commented-out HTML', async () => {
    const source = '```md\n[a](nothing.md)\n```\n\n<!-- <img src="gone.png"> -->\n\n`[b](nope.md)`'
    expect(await check(source, environment({}))).toEqual([])
  })

  it('checks HTML images and links', async () => {
    const problems = await check(
      '<img src="missing.png" alt="x">\n\n<a href="gone.md">g</a>',
      environment({})
    )
    expect(problems.map((p) => p.message)).toEqual([
      'Image not found: missing.png',
      'File not found: gone.md'
    ])
  })
})

describe('anchor suggestions', () => {
  it('computes edit distances and picks only an obvious match', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(closestAnchor('instalation', ['installation', 'usage'])).toBe('installation')
    expect(closestAnchor('abc', ['abd'])).toBeNull()
    expect(closestAnchor('configuraton', ['configuration', 'configurations'])).toBe('configuration')
    // Two equally close candidates are ambiguous, so nothing is suggested.
    expect(closestAnchor('setupp', ['setup1', 'setup2'])).toBeNull()
  })
})
