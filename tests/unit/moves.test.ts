import { describe, expect, it } from 'vitest'
import {
  applyUpdate,
  planReferenceUpdates,
  remapPath,
  type MarkdownSnapshot
} from '@shared/markdown/moves'

const ROOT = '/work/atlas'

const files = (record: Record<string, string>): MarkdownSnapshot[] =>
  Object.entries(record).map(([path, content]) => ({ path: `${ROOT}/${path}`, content }))

function run(record: Record<string, string>, from: string, to: string): Record<string, string> {
  const plan = planReferenceUpdates(
    files(record),
    { from: `${ROOT}/${from}`, to: `${ROOT}/${to}` },
    ROOT
  )
  const result: Record<string, string> = {}
  for (const update of plan.updates) {
    const original = record[update.path.slice(ROOT.length + 1)]
    result[update.newPath.slice(ROOT.length + 1)] = applyUpdate(original, update)
  }
  return result
}

describe('remapping paths', () => {
  it('maps files inside a moved folder and leaves others alone', () => {
    const op = { from: `${ROOT}/docs`, to: `${ROOT}/manual` }
    expect(remapPath(`${ROOT}/docs/a/b.md`, op)).toBe(`${ROOT}/manual/a/b.md`)
    expect(remapPath(`${ROOT}/docs`, op)).toBe(`${ROOT}/manual`)
    expect(remapPath(`${ROOT}/docs2/a.md`, op)).toBeNull()
  })
})

describe('renaming a referenced file', () => {
  it('updates links and images that point at it, with every other character untouched', () => {
    const result = run(
      {
        'README.md':
          'Intro ![Diagram](assets/architecture.png "Title") and [link](assets/architecture.png#x).\r\nTrailing text\r\n',
        'docs/guide.md': '![Again](../assets/architecture.png)\n![Other](../assets/other.png)\n',
        'assets/architecture.png': ''
      },
      'assets/architecture.png',
      'assets/system-architecture.png'
    )
    expect(result['README.md']).toBe(
      'Intro ![Diagram](assets/system-architecture.png "Title") and [link](assets/system-architecture.png#x).\r\nTrailing text\r\n'
    )
    expect(result['docs/guide.md']).toBe(
      '![Again](../assets/system-architecture.png)\n![Other](../assets/other.png)\n'
    )
  })

  it('handles reference definitions, HTML images, spaces and encoded names', () => {
    const result = run(
      {
        'a.md':
          '[ref]: pics/old.png\n\n<img src="pics/old.png" alt="x">\n\n![s](<pics/old.png>) ![e](pics/old.png)\n'
      },
      'pics/old.png',
      'pics/new name.png'
    )
    expect(result['a.md']).toBe(
      '[ref]: <pics/new name.png>\n\n<img src="pics/new name.png" alt="x">\n\n![s](<pics/new name.png>) ![e](<pics/new name.png>)\n'
    )
  })

  it('keeps percent-encoded style and root-relative style', () => {
    const result = run(
      {
        'a.md': '![x](my%20pic.png) ![y](/my%20pic.png)\n',
        'my pic.png': ''
      },
      'my pic.png',
      'photo.png'
    )
    expect(result['a.md']).toBe('![x](photo.png) ![y](/photo.png)\n')
  })

  it('ignores code, web URLs, anchors, other files and mentions in plain text', () => {
    const record = {
      'a.md': [
        '`![x](docs/old.md)`',
        '',
        '```',
        '[b](docs/old.md)',
        '```',
        '',
        '[web](https://example.com/docs/old.md) [anchor](#old) [other](docs/older.md)',
        '',
        'The file docs/old.md is mentioned here.'
      ].join('\n')
    }
    const plan = planReferenceUpdates(
      files(record),
      { from: `${ROOT}/docs/old.md`, to: `${ROOT}/docs/new.md` },
      ROOT
    )
    expect(plan.updates).toEqual([])
  })

  it('keeps fragments and queries', () => {
    const result = run(
      { 'a.md': '[x](docs/old.md#section) [y](docs/old.md?raw=1)\n' },
      'docs/old.md',
      'docs/new.md'
    )
    expect(result['a.md']).toBe('[x](docs/new.md#section) [y](docs/new.md?raw=1)\n')
  })
})

describe('moving files and folders', () => {
  it('rewrites references to every file inside a moved folder', () => {
    const result = run(
      {
        'README.md': '[g](docs/guide.md) ![i](docs/img/a.png)\n',
        'docs/guide.md': '![i](img/a.png) [back](../README.md)\n',
        'docs/img/a.png': ''
      },
      'docs',
      'manual/docs'
    )
    expect(result['README.md']).toBe('[g](manual/docs/guide.md) ![i](manual/docs/img/a.png)\n')
    // Links among the moved files stay valid; the one reaching outside the folder is adjusted.
    expect(result['manual/docs/guide.md']).toBe('![i](img/a.png) [back](../../README.md)\n')
  })

  it('adjusts a moved document\u2019s own relative links', () => {
    const result = run(
      {
        'notes.md': '![x](assets/pic.png) [g](docs/guide.md) [web](https://x.dev) [t](#top)\n'
      },
      'notes.md',
      'archive/2026/notes.md'
    )
    expect(result['archive/2026/notes.md']).toBe(
      '![x](../../assets/pic.png) [g](../../docs/guide.md) [web](https://x.dev) [t](#top)\n'
    )
  })

  it('does not touch root-relative links of a moved document, but follows moved targets', () => {
    const record = { 'notes.md': '![x](/assets/pic.png)\n', 'assets/pic.png': '' }
    expect(run(record, 'notes.md', 'deep/er/notes.md')).toEqual({})
    expect(run(record, 'assets', 'media')['notes.md']).toBe('![x](/media/pic.png)\n')
  })

  it('counts references and lists the changes for review', () => {
    const plan = planReferenceUpdates(
      files({ 'a.md': '[x](old.md)\n\n[y](old.md)\n', 'b.md': '[z](old.md)\n' }),
      { from: `${ROOT}/old.md`, to: `${ROOT}/new.md` },
      ROOT
    )
    expect(plan.total).toBe(3)
    expect(plan.updates.map((u) => [u.path, u.changes.map((c) => c.line)])).toEqual([
      [`${ROOT}/a.md`, [1, 3]],
      [`${ROOT}/b.md`, [1]]
    ])
    expect(plan.updates[0].changes[0]).toEqual({ line: 1, before: '[x](old.md)', after: 'new.md' })
  })

  it('does nothing when nothing refers to the item', () => {
    const plan = planReferenceUpdates(
      files({ 'a.md': '[x](other.md)\n' }),
      { from: `${ROOT}/old.md`, to: `${ROOT}/new.md` },
      ROOT
    )
    expect(plan).toEqual({ updates: [], unresolved: [], total: 0 })
  })
})

describe('Windows paths', () => {
  it('compares case-insensitively and keeps drive roots', () => {
    const root = 'C:/Users/Ana/Atlas'
    const plan = planReferenceUpdates(
      [{ path: `${root}/README.md`, content: '![d](Assets/Diagram.PNG)\n' }],
      { from: `${root}/assets/diagram.png`, to: `${root}/assets/system.png` },
      root
    )
    expect(plan.total).toBe(1)
    expect(applyUpdate('![d](Assets/Diagram.PNG)\n', plan.updates[0])).toBe(
      '![d](assets/system.png)\n'
    )
  })
})
