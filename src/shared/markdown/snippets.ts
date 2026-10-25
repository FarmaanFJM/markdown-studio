/**
 * Built-in Markdown snippets. They are written in Monaco's snippet syntax and are the single
 * source for IntelliSense items, slash commands, the command palette and the toolbar, so every
 * entry point inserts exactly the same Markdown.
 */

export interface SnippetDefinition {
  id: string
  label: string
  detail: string
  /** Block snippets start on their own line; inline snippets are inserted at the cursor. */
  kind: 'block' | 'inline'
  /** Monaco snippet text: `${1:placeholder}`, `$0` for the final cursor position. */
  body: string
  keywords: string[]
  /** Offered in the slash-command menu. */
  slash: boolean
}

const FENCE = '```'

export const BUILT_IN_SNIPPETS: SnippetDefinition[] = [
  ...[1, 2, 3, 4, 5, 6].map((level): SnippetDefinition => ({
    id: `heading${level}`,
    label: `Heading ${level}`,
    detail: level === 1 ? 'Document title' : `Level ${level} heading`,
    kind: 'block',
    body: `${'#'.repeat(level)} \${1:Heading}`,
    keywords: ['heading', 'title', `h${level}`],
    slash: level <= 3
  })),
  {
    id: 'bulletList',
    label: 'Bulleted list',
    detail: 'Unordered list',
    kind: 'block',
    body: '- ${1:Item}',
    keywords: ['list', 'bullet', 'unordered', 'ul'],
    slash: true
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    detail: 'Ordered list',
    kind: 'block',
    body: '1. ${1:Item}',
    keywords: ['list', 'numbered', 'ordered', 'ol'],
    slash: true
  },
  {
    id: 'taskList',
    label: 'Task list',
    detail: 'Checklist with checkboxes',
    kind: 'block',
    body: '- [ ] ${1:Task}',
    keywords: ['task', 'todo', 'checklist', 'checkbox'],
    slash: true
  },
  {
    id: 'blockquote',
    label: 'Blockquote',
    detail: 'Quoted text',
    kind: 'block',
    body: '> ${1:Quote}',
    keywords: ['quote', 'blockquote', 'callout'],
    slash: true
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    detail: 'Fenced code with optional language',
    kind: 'block',
    body: `${FENCE}\${2:}\n\${1:}\n${FENCE}`,
    keywords: ['code', 'fence', 'fenced', 'snippet', 'pre'],
    slash: true
  },
  {
    id: 'horizontalRule',
    label: 'Horizontal rule',
    detail: 'Thematic break',
    kind: 'block',
    body: '---\n$0',
    keywords: ['rule', 'divider', 'hr', 'line', 'separator'],
    slash: true
  },
  {
    id: 'table',
    label: 'Table',
    detail: '3 columns, 1 row',
    kind: 'block',
    body: '| ${1:Column 1} | ${2:Column 2} | ${3:Column 3} |\n| --- | --- | --- |\n| ${4:Cell} | ${5:Cell} | ${6:Cell} |',
    keywords: ['table', 'grid', 'columns', 'rows'],
    slash: true
  },
  {
    id: 'image',
    label: 'Image',
    detail: 'Image with alt text',
    kind: 'inline',
    body: '![${1:alt text}](${2:path})',
    keywords: ['image', 'picture', 'img', 'photo'],
    slash: true
  },
  {
    id: 'link',
    label: 'Link',
    detail: 'Hyperlink',
    kind: 'inline',
    body: '[${1:link text}](${2:url})',
    keywords: ['link', 'url', 'hyperlink', 'href'],
    slash: false
  },
  {
    id: 'details',
    label: 'Collapsible section',
    detail: 'HTML details and summary',
    kind: 'block',
    body: '<details>\n<summary>${1:Summary}</summary>\n\n${2:Content}\n\n</details>',
    keywords: ['details', 'summary', 'collapse', 'accordion', 'spoiler'],
    slash: true
  },
  {
    id: 'mathInline',
    label: 'Inline math',
    detail: 'Equation in a sentence: $E = mc^2$',
    kind: 'inline',
    body: '\\$${1:E = mc^2}\\$',
    keywords: ['math', 'equation', 'formula', 'latex', 'katex', 'inline'],
    slash: false
  },
  {
    id: 'mathBlock',
    label: 'Display equation',
    detail: 'Centred equation between $$ lines',
    kind: 'block',
    body: '\\$\\$\n${1:\\\\int_{0}^{\\\\infty} e^{-x^2}\\\\,dx = \\\\frac{\\\\sqrt{\\\\pi}}{2}}\n\\$\\$',
    keywords: ['math', 'equation', 'formula', 'latex', 'katex', 'display', 'block'],
    slash: true
  },
  {
    id: 'mermaidFlowchart',
    label: 'Mermaid flowchart',
    detail: 'Diagram rendered in the preview and exports',
    kind: 'block',
    body: `${FENCE}mermaid\nflowchart TD\n    A[\${1:Start}] --> B{\${2:Decision}}\n    B -->|Yes| C[\${3:Result}]\n    B -->|No| D[\${4:Other}]\n${FENCE}`,
    keywords: ['mermaid', 'diagram', 'flowchart', 'chart', 'graph'],
    slash: true
  },
  {
    id: 'mermaidSequence',
    label: 'Mermaid sequence diagram',
    detail: 'Messages between participants',
    kind: 'block',
    body: `${FENCE}mermaid\nsequenceDiagram\n    participant \${1:Client}\n    participant \${2:Server}\n    \${1:Client}->>\${2:Server}: \${3:Request}\n    \${2:Server}-->>\${1:Client}: \${4:Response}\n${FENCE}`,
    keywords: ['mermaid', 'diagram', 'sequence', 'uml'],
    slash: true
  },
  {
    id: 'pageBreak',
    label: 'Page break',
    detail: 'Starts a new page in PDF export',
    kind: 'block',
    body: '<!-- pagebreak -->\n$0',
    keywords: ['page', 'break', 'pdf', 'print', 'newpage'],
    slash: true
  },
  {
    id: 'bold',
    label: 'Bold',
    detail: 'Strong emphasis',
    kind: 'inline',
    body: '**${1:bold text}**',
    keywords: ['bold', 'strong'],
    slash: false
  },
  {
    id: 'italic',
    label: 'Italic',
    detail: 'Emphasis',
    kind: 'inline',
    body: '*${1:italic text}*',
    keywords: ['italic', 'emphasis', 'em'],
    slash: false
  },
  {
    id: 'strikethrough',
    label: 'Strikethrough',
    detail: 'Crossed-out text',
    kind: 'inline',
    body: '~~${1:text}~~',
    keywords: ['strikethrough', 'strike', 'delete'],
    slash: false
  },
  {
    id: 'inlineCode',
    label: 'Inline code',
    detail: 'Code within a sentence',
    kind: 'inline',
    body: '`${1:code}`',
    keywords: ['code', 'inline', 'monospace'],
    slash: false
  },
  {
    id: 'sectionInstallation',
    label: 'Section: Installation',
    detail: 'Installation heading with steps',
    kind: 'block',
    body: `## Installation\n\n1. \${1:Clone the repository.}\n2. \${2:Install the dependencies.}\n3. \${3:Run the application.}`,
    keywords: ['section', 'installation', 'install', 'setup'],
    slash: false
  },
  {
    id: 'sectionUsage',
    label: 'Section: Usage',
    detail: 'Usage heading with an example',
    kind: 'block',
    body: `## Usage\n\n${FENCE}\n\${1:command}\n${FENCE}`,
    keywords: ['section', 'usage', 'example'],
    slash: false
  },
  {
    id: 'sectionContributing',
    label: 'Section: Contributing',
    detail: 'Contributing heading',
    kind: 'block',
    body: '## Contributing\n\n${1:Describe how others can contribute.}',
    keywords: ['section', 'contributing', 'contribute'],
    slash: false
  },
  {
    id: 'sectionLicense',
    label: 'Section: License',
    detail: 'License heading',
    kind: 'block',
    body: '## License\n\n${1:Released under the MIT License.}',
    keywords: ['section', 'license', 'licence'],
    slash: false
  },
  {
    id: 'changelogEntry',
    label: 'Changelog entry',
    detail: 'Version heading with change groups',
    kind: 'block',
    body: '## [${1:1.0.0}] - ${2:YYYY-MM-DD}\n\n### Added\n\n- ${3:New feature}\n\n### Fixed\n\n- ${4:Bug fix}',
    keywords: ['changelog', 'release', 'version', 'section'],
    slash: false
  }
]

export function findSnippet(id: string): SnippetDefinition | undefined {
  return BUILT_IN_SNIPPETS.find((snippet) => snippet.id === id)
}

/** Plain Markdown a snippet will insert, with placeholders replaced by their default text. */
export function snippetPreview(body: string): string {
  return body
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}|\$\d+/g, '')
    .replace(/\\([$}\\])/g, '$1')
}

/** Escapes literal text so Monaco's snippet parser inserts it unchanged. */
export function escapeSnippetText(text: string): string {
  return text.replace(/[\\$}]/g, (ch) => `\\${ch}`)
}

/** Starting points offered inside an empty `mermaid` block. Plain text, not snippets. */
export const MERMAID_STARTERS: { label: string; detail: string; body: string }[] = [
  {
    label: 'flowchart TD',
    detail: 'Flowchart, top to bottom',
    body: 'flowchart TD\n    A[${1:Start}] --> B{${2:Decision}}\n    B -->|Yes| C[${3:Done}]\n    B -->|No| D[${4:Retry}]'
  },
  {
    label: 'flowchart LR',
    detail: 'Flowchart, left to right',
    body: 'flowchart LR\n    A[${1:Input}] --> B[${2:Process}] --> C[${3:Output}]'
  },
  {
    label: 'sequenceDiagram',
    detail: 'Sequence diagram',
    body: 'sequenceDiagram\n    Alice->>Bob: ${1:Hello}\n    Bob-->>Alice: ${2:Hi}'
  },
  {
    label: 'classDiagram',
    detail: 'Class diagram',
    body: 'classDiagram\n    class ${1:Animal} {\n        +String name\n        +speak() void\n    }\n    ${1:Animal} <|-- ${2:Dog}'
  },
  {
    label: 'stateDiagram-v2',
    detail: 'State diagram',
    body: 'stateDiagram-v2\n    [*] --> ${1:Idle}\n    ${1:Idle} --> ${2:Running}: start\n    ${2:Running} --> [*]'
  },
  {
    label: 'erDiagram',
    detail: 'Entity-relationship diagram',
    body: 'erDiagram\n    ${1:CUSTOMER} ||--o{ ${2:ORDER} : places\n    ${2:ORDER} ||--|{ LINE_ITEM : contains'
  },
  {
    label: 'gantt',
    detail: 'Gantt chart',
    body: 'gantt\n    title ${1:Plan}\n    dateFormat YYYY-MM-DD\n    section ${2:Phase}\n    ${3:Task} :a1, 2026-01-01, 7d'
  },
  {
    label: 'pie',
    detail: 'Pie chart',
    body: 'pie title ${1:Share}\n    "${2:A}" : 40\n    "${3:B}" : 60'
  }
]
