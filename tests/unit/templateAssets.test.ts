import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@shared/markdown/analysis'
import {
  applyReplacements,
  extractReferences,
  renderDestination,
  replacementFor
} from '@shared/markdown/references'
import {
  localReferences,
  makeWorkspaceRelative,
  prepareAssetsForDocument
} from '@shared/templateAssets'

const ROOT = '/home/ana/atlas'

describe('rewriting destinations', () => {
  const ref = (source: string) => extractReferences(analyzeDocument(source))[0]

  it('keeps the written style', () => {
    expect(renderDestination(ref('![a](x.png)'), 'my dir/x.png', '')).toBe('<my dir/x.png>')
    expect(renderDestination(ref('![a](<x y.png>)'), 'p q/z.png', '')).toBe('<p q/z.png>')
    expect(renderDestination(ref('![a](my%20x.png)'), 'a b/c d.png', '')).toBe('a%20b/c%20d.png')
    expect(renderDestination(ref('[a](x.md#top)'), 'docs/x.md', '#top')).toBe('docs/x.md#top')
    expect(renderDestination(ref('[a](x.md)'), '100%.md', '')).toBe('100%25.md')
    expect(renderDestination(ref('<img src="a.png">'), 'a&b.png', '')).toBe('a&amp;b.png')
  })

  it('applies replacements without touching anything else, including CRLF', () => {
    const source = 'one\r\nsee ![a](old.png) and [b](old.png#x)\r\nlast'
    const refs = extractReferences(analyzeDocument(source))
    const result = applyReplacements(source, [
      replacementFor(refs[0], 'new/pic.png'),
      replacementFor(refs[1], 'new/pic.png#x')
    ])
    expect(result).toBe('one\r\nsee ![a](new/pic.png) and [b](new/pic.png#x)\r\nlast')
  })
})

describe('local references in templates', () => {
  const body = [
    '![Logo](assets/logo.png)',
    '[Guide](docs/guide.md#start) [Web](https://example.com) [Mail](mailto:a@b.c) [Top](#top)',
    '```',
    '![ignored](code.png)',
    '```'
  ].join('\n')

  it('finds only local file references', () => {
    expect(localReferences(body).map((r) => r.path)).toEqual(['assets/logo.png', 'docs/guide.md'])
  })

  it('makes references workspace-relative from the document they were written in', () => {
    const result = makeWorkspaceRelative(body, {
      documentDirectory: `${ROOT}/notes`,
      workspaceRoot: ROOT
    })
    expect(result.changed).toBe(2)
    expect(result.text).toContain('![Logo](/notes/assets/logo.png)')
    expect(result.text).toContain('[Guide](/notes/docs/guide.md#start)')
    expect(result.text).toContain('![ignored](code.png)')
  })

  it('leaves references that point outside the workspace alone', () => {
    const result = makeWorkspaceRelative('![x](../../outside/a.png)', {
      documentDirectory: `${ROOT}/notes`,
      workspaceRoot: ROOT
    })
    expect(result.changed).toBe(0)
  })

  it('re-points workspace-relative references for a new document in any folder', () => {
    const rooted = '![Logo](/assets/logo.png)\n[Guide](/docs/guide.md#start)'
    const prepared = prepareAssetsForDocument(rooted, {
      documentDirectory: `${ROOT}/docs/deep/er`,
      workspaceRoot: ROOT
    })
    expect(prepared.text).toBe('![Logo](../../../assets/logo.png)\n[Guide](../../guide.md#start)')
    expect(prepared.targets.map((t) => t.path)).toEqual([
      `${ROOT}/assets/logo.png`,
      `${ROOT}/docs/guide.md`
    ])
  })

  it('reports plain relative references against the new location instead of guessing', () => {
    const prepared = prepareAssetsForDocument('![x](images/a.png)', {
      documentDirectory: `${ROOT}/docs`,
      workspaceRoot: ROOT
    })
    expect(prepared.text).toBe('![x](images/a.png)')
    expect(prepared.targets).toEqual([{ value: 'images/a.png', path: `${ROOT}/docs/images/a.png` }])
  })

  it('does not rewrite anything without a workspace', () => {
    const prepared = prepareAssetsForDocument('![x](/assets/a.png)', {
      documentDirectory: '/tmp/docs',
      workspaceRoot: null
    })
    expect(prepared.text).toBe('![x](/assets/a.png)')
  })
})
