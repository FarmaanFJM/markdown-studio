import type { BuiltInTemplate } from './templates'

const STAMP = '2026-01-01T00:00:00.000Z'

function template(id: string, name: string, description: string, body: string): BuiltInTemplate {
  return {
    id,
    name,
    description,
    kind: 'document',
    body,
    createdAt: STAMP,
    updatedAt: STAMP,
    builtIn: true
  }
}

const TOC = `<!-- markdown-studio:toc:start -->

<!-- markdown-studio:toc:end -->`

/** The curated templates shipped with Markdown Studio. They work offline and need no assets. */
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  template('blank', 'Blank document', 'An empty Markdown document.', ''),
  template(
    'readme',
    'README',
    'Project overview with installation, usage and contribution sections.',
    `# {{title}}

> {{cursor}}A short description of what this project does and who it is for.

## Features

- First feature
- Second feature
- Third feature

## Getting started

### Prerequisites

List what needs to be installed first.

### Installation

\`\`\`bash
# Commands that set the project up
\`\`\`

## Usage

Show the most common way to use the project.

\`\`\`bash
# Example command
\`\`\`

## Contributing

Explain how to report issues and propose changes.

## License

State the license that applies to this project.
`
  ),
  template(
    'technical-documentation',
    'Technical documentation',
    'Structured design or reference document with a generated table of contents.',
    `# {{title}}

- **Author:** {{author}}
- **Date:** {{date}}
- **Status:** Draft

## Table of contents

${TOC}

## Overview

{{cursor}}Summarise the purpose and scope of this document.

## Architecture

Describe the main components and how they interact.

| Component | Responsibility | Notes |
| --------- | -------------- | ----- |
|           |                |       |

## Details

### Configuration

### Interfaces

## Troubleshooting

| Symptom | Cause | Resolution |
| ------- | ----- | ---------- |
|         |       |            |

## References

- Reference one
- Reference two
`
  ),
  template(
    'project-notes',
    'Project notes',
    'Running notes with goals, decisions, open questions and next steps.',
    `# {{title}}

**Started:** {{date}}

## Goals

- {{cursor}}First goal

## Status

Where things stand today.

## Decisions

| Date | Decision | Reason |
| ---- | -------- | ------ |
|      |          |        |

## Open questions

- [ ] Question one

## Next steps

- [ ] First step
- [ ] Second step

## Notes
`
  ),
  template(
    'meeting-notes',
    'Meeting notes',
    'Agenda, discussion, decisions and action items.',
    `# {{title}}

- **Date:** {{datetime}}
- **Facilitator:** {{author}}
- **Attendees:** Names

## Agenda

1. {{cursor}}First topic
2. Second topic
3. Third topic

## Discussion

## Decisions

- Decision one

## Action items

| Owner | Task | Due |
| ----- | ---- | --- |
|       |      |     |
`
  ),
  template(
    'report',
    'Report',
    'Formal report with summary, findings and recommendations.',
    `# {{title}}

**Prepared by:** {{author}}
**Date:** {{date}}

## Executive summary

{{cursor}}Summarise the purpose, the main findings and the recommended action in a few sentences.

## Introduction

### Background

### Objectives

## Method

Describe how the information was gathered and analysed.

## Findings

### Finding one

### Finding two

## Recommendations

1. First recommendation
2. Second recommendation

## Conclusion

## Appendix
`
  ),
  template(
    'research-report',
    'Research report',
    'Report with research question, method, findings, discussion, conclusion and a generated reference list (APA).',
    `---
lang: en
number-sections: true
toc: true
---

# {{title}}

- **Author:** {{author}}
- **Date:** {{date}}

## Summary

{{cursor}}Summarise the research question, how you investigated it, the main findings and the conclusion in a few sentences. Write this last.

## Introduction

### Background

Explain why this topic matters and what is already known. Cite sources with **Insert → Citation…** (Ctrl+Shift+C).

### Research question

State the main question and, if needed, the sub-questions.

## Method

Describe how you collected and analysed your information: what you looked at, why, and how you compared it.

## Findings

Describe what you found. Add a screenshot or figure with **Insert → Figure with Caption…** (Ctrl+Shift+F) and refer to it from the text with **Insert → Cross-reference…** (Ctrl+Shift+R).

| Item | Observation | Notes |
| ---- | ----------- | ----- |
|      |             |       |

: Describe what this table compares {#tbl-findings}

## Discussion

Interpret the findings. What do they mean for the research question? What are the limits of this research?

## Conclusion

Answer the research question directly.

## References

::: {#refs}
:::

## Appendix

Material that supports the report but does not belong in the main text.
`
  ),
  template(
    'research-report-nl',
    'Onderzoeksverslag (Nederlands)',
    'Onderzoeksverslag in het Nederlands met onderzoeksvraag, methode, bevindingen, conclusie en bronnenlijst (APA).',
    `---
lang: nl
number-sections: true
toc: true
---

# {{title}}

- **Auteur:** {{author}}
- **Datum:** {{date}}

## Samenvatting

{{cursor}}Vat de onderzoeksvraag, de aanpak, de belangrijkste bevindingen en de conclusie samen in enkele zinnen. Schrijf dit als laatste.

## Inleiding

### Achtergrond

Leg uit waarom dit onderwerp belangrijk is en wat er al bekend is. Verwijs naar bronnen met **Invoegen → Citation…** (Ctrl+Shift+C).

### Onderzoeksvraag

Formuleer de hoofdvraag en eventueel de deelvragen.

## Methode

Beschrijf hoe je informatie hebt verzameld en geanalyseerd: wat je hebt bekeken, waarom en hoe je het hebt vergeleken.

## Bevindingen

Beschrijf wat je hebt gevonden. Voeg een screenshot of figuur toe met **Invoegen → Figure with Caption…** (Ctrl+Shift+F) en verwijs ernaar met **Invoegen → Cross-reference…** (Ctrl+Shift+R).

| Onderdeel | Observatie | Opmerkingen |
| --------- | ---------- | ----------- |
|           |            |             |

: Beschrijf wat deze tabel vergelijkt {#tbl-bevindingen}

## Discussie

Interpreteer de bevindingen. Wat betekenen ze voor de onderzoeksvraag? Wat zijn de beperkingen van dit onderzoek?

## Conclusie

Beantwoord de onderzoeksvraag direct.

## Bronnen

::: {#refs}
:::

## Bijlagen

Materiaal dat het verslag ondersteunt maar niet in de hoofdtekst thuishoort.
`
  ),
  template(
    'health-ui-research',
    'Health UI research (Playful Tech)',
    'Research on health UI in games: game analyses with screenshots, a comparison table, conclusions, sources and links to Figma designs.',
    `---
lang: en
number-sections: true
toc: true
---

# {{title}}

- **Author:** {{author}}
- **Guild:** Playful Tech
- **Date:** {{date}}

## Research question

{{cursor}}Write the question about health UI in games that this research answers, and what you want to be able to decide at the end.

## Scope and method

- **Games analysed:** list the games you chose and why.
- **What you looked at:** the health UI elements per game: display, placement, feedback, states.
- **Criteria for comparison:** list the criteria you compare the games on (for example readability, feedback, space used).
- **How you collected evidence:** where the screenshots and notes come from.

## Game analyses

Copy the block below for every game you analyse. Add screenshots with **Insert → Figure with Caption…** or paste them straight into the text (Ctrl+V); a figure caption gets a number automatically.

### Game: name the first game

**Platform and version:** state what you played.

#### Health UI elements

| Element | Description | Observation |
| ------- | ----------- | ----------- |
|         |             |             |

: Health UI elements of this game {#tbl-game-one-elements}

#### Screenshots

Add the screenshots of this game here and describe what each one shows.

#### Notes

What works well, what does not, and why.

### Game: name the second game

**Platform and version:** state what you played.

#### Health UI elements

| Element | Description | Observation |
| ------- | ----------- | ----------- |
|         |             |             |

: Health UI elements of this game {#tbl-game-two-elements}

#### Screenshots

Add the screenshots of this game here and describe what each one shows.

#### Notes

What works well, what does not, and why.

## Comparison

Compare the games on your criteria. Add one column for every criterion and one row for every game.

| Game | Criterion 1 | Criterion 2 | Criterion 3 |
| ---- | ----------- | ----------- | ----------- |
|      |             |             |             |

: Comparison of health UI between the games {#tbl-health-ui-comparison}

Refer to the table in the text with **Insert → Cross-reference…**.

## Conclusions

Base every conclusion on the analyses above.

- Conclusion one
- Conclusion two

### Design principles

State the principles you take from the research.

## Design ideas

Describe each idea, which finding it is based on, and link the design in Figma.

| Idea | Based on | Figma link |
| ---- | -------- | ---------- |
|      |          |            |

: Design ideas and their Figma designs {#tbl-design-ideas}

## Sources

::: {#refs}
:::

## Appendix

### Screenshot log

| Game | File | What it shows | Date taken |
| ---- | ---- | ------------- | ---------- |
|      |      |               |            |
`
  ),
  template(
    'two-column-article',
    'Two-column article',
    'Short article laid out in two columns with a full-width title, figure and bibliography.',
    `---
lang: en
number-sections: false
studio:
  columns:
    count: 2
    gap: 8
  page:
    size: A4
    orientation: portrait
    margins:
      top: 20
      right: 18
      bottom: 20
      left: 18
  footer:
    text: 'Page {page} of {pages}'
    align: center
---

# {{title}}

**{{author}}** — {{date}}

## Abstract

{{cursor}}Summarise the article in a few sentences.

## Introduction

Text flows from the first column into the second and continues on the next page. Headings, the table of contents and anything marked \`{.full-width}\` span both columns.

## Method

Describe the method.

## Results

Add a figure that spans both columns by putting \`.full-width\` in its attributes, for example \`![Caption](assets/figure.png){#fig-results .full-width}\`.

## Discussion

Interpret the results.

## References

::: {#refs}
:::
`
  )
]

export function findBuiltInTemplate(id: string): BuiltInTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id)
}
