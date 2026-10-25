import {
  fenceOpeningAt,
  isInCodeBlock,
  isInsideFenceContent,
  tableAtLine
} from '@shared/markdown/analysis'
import { isImagePath, isMarkdownPath } from '@shared/fileTypes'
import { formatLinkDestination } from '@shared/imageReference'
import { baseDirectory, resolveLocalPath, safeDecode } from '@shared/markdown/resolve'
import {
  BUILT_IN_SNIPPETS,
  MERMAID_STARTERS,
  snippetPreview,
  type SnippetDefinition
} from '@shared/markdown/snippets'
import { templateToSnippet, titleFromName } from '@shared/templates'
import { basename, relativePath } from '@shared/paths'
import { getActiveEditor } from '../models'
import { monaco } from '../monaco'
import { useSettings } from '../../state/settings'
import { anchorsOfFile, listDirectory, workspaceFiles } from '../../workspace'
import { documentContext, documentPath } from './context'
import { getCustomSnippets } from './customSnippets'
import { analysisFor } from './model'
import { RUN_COMMAND_ID, runCommandById } from './runners'

type CompletionItem = monaco.languages.CompletionItem
type Range = monaco.IRange

const { CompletionItemKind, CompletionItemInsertTextRule, CompletionTriggerKind } = monaco.languages

const FENCE_LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'go',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'markdown',
  'mermaid',
  'php',
  'powershell',
  'python',
  'ruby',
  'rust',
  'shell',
  'sql',
  'swift',
  'text',
  'typescript',
  'xml',
  'yaml'
]

/** What typing a marker such as `##` or `-` should match, so block snippets are found by syntax. */
const SYNTAX_HINTS: Record<string, string> = {
  heading1: '#',
  heading2: '##',
  heading3: '###',
  heading4: '####',
  heading5: '#####',
  heading6: '######',
  bulletList: '- *',
  orderedList: '1.',
  taskList: '- [ ] [] todo',
  blockquote: '>',
  codeBlock: '```',
  horizontalRule: '---',
  table: '|',
  details: '<details>'
}

const orderOf = (index: number) => String(index).padStart(3, '0')

function inlinePreview(body: string): string {
  const flat = snippetPreview(body).split('\n')[0]
  return flat.length > 36 ? `${flat.slice(0, 35)}…` : flat
}

function previewDocs(text: string): monaco.IMarkdownString {
  return { value: '```markdown\n' + text + '\n```' }
}

function snippetItem(
  definition: SnippetDefinition,
  range: Range,
  sortPrefix: string,
  index: number,
  filterPrefix = ''
): CompletionItem {
  return {
    label: { label: definition.label, description: inlinePreview(definition.body) },
    kind: CompletionItemKind.Snippet,
    detail: definition.detail,
    documentation: previewDocs(snippetPreview(definition.body)),
    insertText: definition.body,
    insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    filterText: `${filterPrefix}${SYNTAX_HINTS[definition.id] ?? ''} ${definition.label} ${definition.keywords.join(' ')}`,
    sortText: `${sortPrefix}${orderOf(index)}`
  }
}

function commandItem(
  label: string,
  detail: string,
  commandId: string,
  range: Range,
  sortText: string,
  filter = ''
): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Function,
    detail,
    insertText: '',
    range,
    filterText: `${filter}${label}`,
    sortText,
    command: { id: RUN_COMMAND_ID, title: label, arguments: [commandId] }
  }
}

function customSnippetItems(range: Range, sortPrefix: string, filterPrefix = ''): CompletionItem[] {
  const editor = getActiveEditor()
  const model = editor?.getModel()
  const title = model ? titleFromName(basename(documentPath(model) ?? '')) : ''
  const author = useSettings.getState().settings.templates.author
  return getCustomSnippets().map((snippet, index) => ({
    label: { label: snippet.name, description: 'Saved snippet' },
    kind: CompletionItemKind.Snippet,
    detail: snippet.description || 'Saved snippet',
    documentation: previewDocs(snippet.body),
    insertText: templateToSnippet(snippet.body, { title, author }),
    insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    filterText: `${filterPrefix}${snippet.name} snippet ${snippet.description}`,
    sortText: `${sortPrefix}${orderOf(index)}`
  }))
}

// --- Link destinations -------------------------------------------------------------------------

interface DestinationContext {
  image: boolean
  wrapped: boolean
  /** The destination typed so far, without a leading `<`. */
  typed: string
  /** 1-based columns of the whole destination token (replaced when a suggestion is accepted). */
  startColumn: number
  endColumn: number
}

const DESTINATION_BEFORE = /(!?)\[(?:[^\]\\]|\\.)*\]\([ \t]*(<[^>]*|[^)\s<>]*)$/

function destinationAt(lineText: string, column: number): DestinationContext | null {
  const before = lineText.slice(0, column - 1)
  const match = DESTINATION_BEFORE.exec(before)
  if (!match) return null
  const token = match[2]
  const wrapped = token.startsWith('<')
  const after = lineText.slice(column - 1)
  const tail = (wrapped ? /^[^>]*>?/ : /^[^)\s>]*/).exec(after)![0]
  return {
    image: match[1] === '!',
    wrapped,
    typed: wrapped ? token.slice(1) : token,
    startColumn: column - token.length,
    endColumn: column + tail.length
  }
}

function pathItem(
  label: string,
  kind: monaco.languages.CompletionItemKind,
  detail: string,
  insertText: string,
  range: Range,
  sortText: string,
  options: { directory?: boolean; filterText?: string; snippet?: boolean } = {}
): CompletionItem {
  return {
    label,
    kind,
    detail,
    insertText,
    insertTextRules: options.snippet ? CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    range,
    filterText: options.filterText ?? label,
    sortText,
    command: options.directory
      ? { id: 'editor.action.triggerSuggest', title: 'Continue the path' }
      : undefined
  }
}

const escapeSnippet = (text: string) => text.replace(/[\\$}]/g, (ch) => `\\${ch}`)

async function pathSuggestions(
  model: monaco.editor.ITextModel,
  destination: DestinationContext,
  range: Range
): Promise<CompletionItem[]> {
  const context = documentContext(model)
  const base = baseDirectory(context)
  if (!base) return []
  const typed = safeDecode(destination.typed).replace(/\\/g, '/')
  const slash = typed.lastIndexOf('/')
  const directoryPart = typed.slice(0, slash + 1)
  const directory = resolveLocalPath(directoryPart || './', context)
  if (!directory) return []

  const items: CompletionItem[] = []
  const seen = new Set<string>()
  const entries = await listDirectory(directory)
  for (const entry of entries) {
    if (entry.name.startsWith('.') && !typed.slice(slash + 1).startsWith('.')) continue
    if (entry.kind === 'file' && destination.image && !isImagePath(entry.path)) continue
    seen.add(entry.path)
    const written = directoryPart + entry.name
    if (entry.kind === 'directory') {
      const formatted = formatLinkDestination(`${written}/`)
      const wrapped = formatted.startsWith('<')
      items.push(
        pathItem(
          `${entry.name}/`,
          CompletionItemKind.Folder,
          'Folder',
          // The cursor stays inside `<...>` so the path can be continued.
          wrapped ? `${escapeSnippet(formatted.slice(0, -1))}$0>` : escapeSnippet(formatted),
          range,
          `0${entry.name.toLowerCase()}`,
          { directory: true, snippet: wrapped, filterText: `${directoryPart}${entry.name}/` }
        )
      )
    } else {
      items.push(
        pathItem(
          entry.name,
          CompletionItemKind.File,
          isImagePath(entry.path)
            ? 'Image'
            : isMarkdownPath(entry.path)
              ? 'Markdown document'
              : 'File',
          formatLinkDestination(written),
          range,
          `1${entry.name.toLowerCase()}`,
          { filterText: `${directoryPart}${entry.name}` }
        )
      )
    }
  }

  // With nothing typed about the folder, also offer matching files from the whole workspace.
  if (!directoryPart && context.workspaceRoot) {
    const documentDirectory = base
    const wanted = destination.image
      ? isImagePath
      : (p: string) => isMarkdownPath(p) || isImagePath(p)
    const files = (await workspaceFiles()).filter((file) => wanted(file) && !seen.has(file))
    for (const file of files.slice(0, 400)) {
      const relative = relativePath(documentDirectory, file)
      if (!relative) continue
      items.push(
        pathItem(
          relative,
          CompletionItemKind.File,
          destination.image ? 'Image in workspace' : 'In workspace',
          formatLinkDestination(relative),
          range,
          `2${relative.toLowerCase()}`
        )
      )
    }
  }
  return items
}

async function anchorSuggestions(
  model: monaco.editor.ITextModel,
  destination: DestinationContext,
  fragmentStart: number,
  pathPart: string
): Promise<CompletionItem[]> {
  const range: Range = {
    startLineNumber: 0,
    endLineNumber: 0,
    startColumn: fragmentStart,
    endColumn: destination.endColumn
  }
  let headings: { text: string; id: string }[] | null
  if (!pathPart) {
    headings = analysisFor(model).headings
  } else {
    const target = resolveLocalPath(safeDecode(pathPart), documentContext(model))
    headings =
      target && isMarkdownPath(target) ? ((await anchorsOfFile(target))?.headings ?? null) : null
  }
  return (headings ?? [])
    .filter((heading) => heading.id)
    .map((heading, index) => ({
      label: heading.text || heading.id,
      kind: CompletionItemKind.Reference,
      detail: `#${heading.id}`,
      insertText: heading.id,
      range,
      filterText: `${heading.id} ${heading.text}`,
      sortText: orderOf(index)
    }))
}

// --- Provider --------------------------------------------------------------------------------

function withLine(items: CompletionItem[], line: number): CompletionItem[] {
  for (const item of items) {
    const range = item.range as Range
    if (range.startLineNumber === 0) {
      item.range = { ...range, startLineNumber: line, endLineNumber: line }
    }
  }
  return items
}

async function provide(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  context: monaco.languages.CompletionContext
): Promise<monaco.languages.CompletionList> {
  const none = { suggestions: [] }
  const explicit = context.triggerKind === CompletionTriggerKind.Invoke
  if (!explicit && !useSettings.getState().settings.markdown.autoSuggest) return none

  const analysis = analysisFor(model)
  const line0 = position.lineNumber - 1
  const lineText = model.getLineContent(position.lineNumber)
  const before = lineText.slice(0, position.column - 1)
  const lineRange = (startColumn: number): Range => ({
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn,
    endColumn: position.column
  })

  // Link and image destinations: paths and heading anchors (also inside code spans' neighbours).
  const destination = destinationAt(lineText, position.column)
  if (destination && !isInCodeBlock(analysis, line0)) {
    const hash = destination.typed.indexOf('#')
    if (hash >= 0) {
      const fragmentStart = destination.startColumn + (destination.wrapped ? 1 : 0) + hash + 1
      const items = await anchorSuggestions(
        model,
        destination,
        fragmentStart,
        destination.typed.slice(0, hash)
      )
      return { suggestions: withLine(items, position.lineNumber) }
    }
    // A selected placeholder (for example "path" from the link snippet) is replaced as a whole.
    const editor = getActiveEditor()
    const selection = editor?.getModel() === model ? editor?.getSelection() : null
    let range: Range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: destination.startColumn,
      endColumn: destination.endColumn
    }
    let effective = destination
    if (
      selection &&
      !selection.isEmpty() &&
      selection.startLineNumber === selection.endLineNumber
    ) {
      range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: selection.startColumn,
        endColumn: selection.endColumn
      }
      effective = { ...destination, typed: '' }
    }
    return { suggestions: await pathSuggestions(model, effective, range) }
  }
  if (!explicit && context.triggerCharacter !== '/') return none

  if (isInsideFenceContent(analysis, line0) || isInCodeBlock(analysis, line0)) {
    // Language names right after the opening fence; nothing inside code.
    const opening = fenceOpeningAt(analysis, line0)
    const match = /^[ \t>]*(`{3,}|~{3,})([\w+#.-]*)$/.exec(before)
    if (opening && match) {
      const range = lineRange(position.column - match[2].length)
      return {
        suggestions: FENCE_LANGUAGES.map((language, index) => ({
          label: language,
          kind: CompletionItemKind.Keyword,
          detail: 'Code block language',
          insertText: language,
          range,
          sortText: orderOf(index)
        }))
      }
    }
    // An empty mermaid block offers diagram starters (on request only, never while typing).
    const fence = analysis.fences.find(
      (f) => line0 > f.start && line0 < (f.closed ? f.end - 1 : f.end)
    )
    if (fence && /^mermaid\b/i.test(fence.info)) {
      const previousEmpty = analysis.lines
        .slice(fence.start + 1, line0)
        .every((text) => text.trim() === '')
      const typed = /^(\s*)([\w-]*)$/.exec(before)
      if (previousEmpty && typed) {
        const range = lineRange(typed[1].length + 1)
        return {
          suggestions: MERMAID_STARTERS.map((starter, index) => ({
            label: starter.label,
            kind: CompletionItemKind.Snippet,
            detail: starter.detail,
            documentation: previewDocs(snippetPreview(starter.body)),
            insertText: starter.body,
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: orderOf(index)
          }))
        }
      }
    }
    return none
  }

  // Slash commands: a lone "/word" on an otherwise empty line that starts a block.
  const slash = /^([ \t]*)\/([\w-]*)$/.exec(before)
  if (slash) {
    const previousBlank = line0 === 0 || model.getLineContent(line0).trim() === ''
    const inTable = tableAtLine(analysis, line0) !== null
    if (!previousBlank || inTable || lineText.slice(position.column - 1).trim() !== '') return none
    const range = lineRange(slash[1].length + 1)
    const items: CompletionItem[] = BUILT_IN_SNIPPETS.filter((s) => s.slash).map((def, index) =>
      snippetItem(def, range, '0', index, '/')
    )
    items.push(
      commandItem(
        'Table of contents',
        'Insert or update a contents list',
        'toc.insert',
        range,
        '1000',
        '/'
      ),
      commandItem(
        'Table (visual editor)',
        'Design a table in a grid',
        'table.insert',
        range,
        '1001',
        '/'
      ),
      commandItem(
        'Document from template…',
        'Create a new file from a template',
        'template.newDocument',
        range,
        '1002',
        '/'
      ),
      ...customSnippetItems(range, '2', '/')
    )
    return { suggestions: items }
  }
  if (!explicit) return none

  // Table rows: table actions first.
  const items: CompletionItem[] = []
  const inTable = tableAtLine(analysis, line0) !== null
  const caret = lineRange(position.column)
  if (inTable) {
    items.push(
      commandItem('Format table', 'Align the columns of this table', 'table.format', caret, '0000'),
      commandItem('Insert row below', 'Add an empty row', 'table.insertRowBelow', caret, '0001'),
      commandItem(
        'Insert column right',
        'Add an empty column',
        'table.insertColumnRight',
        caret,
        '0002'
      ),
      commandItem(
        'Edit table visually…',
        'Open the table in a grid editor',
        'table.editVisually',
        caret,
        '0003'
      )
    )
  }

  // Start of a line: block constructs. Elsewhere: inline constructs.
  const fragment = /^([ \t]*)(\S*)$/.exec(before)
  const atLineStart = fragment !== null && !inTable
  const blockRange = lineRange(fragment ? fragment[1].length + 1 : position.column)
  const inlineWord = model.getWordUntilPosition(position)
  const inlineRange = lineRange(inlineWord.startColumn)

  BUILT_IN_SNIPPETS.forEach((definition, index) => {
    const block = definition.kind === 'block'
    if (atLineStart) {
      items.push(snippetItem(definition, blockRange, block ? '1' : '2', index))
    } else if (!block) {
      items.push(snippetItem(definition, inlineRange, '1', index))
    }
  })
  items.push(...customSnippetItems(atLineStart ? blockRange : inlineRange, '3'))
  return { suggestions: items }
}

let registered: monaco.IDisposable[] = []

/** Registers the Markdown completion provider and the command used by command items. */
export function registerCompletions(): monaco.IDisposable {
  disposeCompletions()
  registered = [
    monaco.editor.registerCommand(RUN_COMMAND_ID, (_accessor, id: string) => {
      runCommandById(id)
    }),
    monaco.languages.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['/', '(', '#'],
      provideCompletionItems: provide
    })
  ]
  return { dispose: disposeCompletions }
}

function disposeCompletions(): void {
  for (const d of registered) d.dispose()
  registered = []
}
