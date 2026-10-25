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
