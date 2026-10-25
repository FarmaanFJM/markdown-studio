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
  )
]

export function findBuiltInTemplate(id: string): BuiltInTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id)
}
