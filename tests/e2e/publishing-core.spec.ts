import { expect, test } from '@playwright/test'
import {
  closeApp,
  createSandbox,
  inPreview,
  launchWithWorkspace,
  openFromTree,
  seedDocuments
} from './helpers'

const REPORT = `---
title: Health UI
lang: en
number-sections: true
toc: true
---

# Health UI

## Introduction {#sec-intro}

Health bars are discussed by @smith2020 and [@smith2020, p. 4]. See @fig-bar and @tbl-games in @sec-intro.

![Health bar in Game A](assets/bar.png){#fig-bar}

| Game | Style |
| ---- | ----- |
| A    | Bar   |

: Compared games {#tbl-games}

## Missing things

See @fig-nowhere and [@ghost2000].
`

test('captions, numbering, cross-references, contents and citations render in the preview', async () => {
  const sandbox = createSandbox()
  seedDocuments(sandbox, { 'report.md': REPORT })
  const { app, page } = await launchWithWorkspace(sandbox)
  try {
    await openFromTree(page, 'report.md')
    await expect
      .poll(() => inPreview(page, (doc) => doc.querySelectorAll('figure.ms-figure').length))
      .toBe(1)
    const facts = await inPreview(page, (doc) => ({
      figcaption: doc.querySelector('figcaption')?.textContent ?? '',
      caption: doc.querySelector('table caption')?.textContent ?? '',
      xrefs: [...doc.querySelectorAll('a.ms-xref')].map((a) => a.textContent),
      missingRef: doc.querySelectorAll('.ms-xref-missing').length,
      missingCite: doc.querySelectorAll('.ms-cite-missing').length,
      toc: [...doc.querySelectorAll('nav.ms-toc a')].map((a) => a.textContent),
      secnum: [...doc.querySelectorAll('h2 .ms-secnum')].map((a) => a.textContent),
      frontMatterShown: doc.body.textContent?.includes('lang: en') ?? false
    }))
    expect(facts.figcaption).toContain('Figure')
    expect(facts.figcaption).toContain('Health bar in Game A')
    expect(facts.caption).toContain('Table')
    expect(facts.xrefs.join('|')).toContain('Figure')
    expect(facts.missingRef).toBe(1)
    expect(facts.missingCite).toBeGreaterThan(0)
    expect(facts.toc.length).toBeGreaterThan(1)
    expect(facts.secnum).toEqual(['1', '2'])
    expect(facts.frontMatterShown).toBe(false)
  } finally {
    await closeApp(app)
  }
})
