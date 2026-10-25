/**
 * Monaco is bundled locally (no CDN) with only the editor features and the languages that
 * Markdown documents commonly embed in fenced code blocks.
 */
import 'monaco-editor/features/register.all'
import 'monaco-editor/languages/definitions/markdown/register'
import 'monaco-editor/languages/definitions/html/register'
import 'monaco-editor/languages/definitions/css/register'
import 'monaco-editor/languages/definitions/javascript/register'
import 'monaco-editor/languages/definitions/typescript/register'
import 'monaco-editor/languages/definitions/python/register'
import 'monaco-editor/languages/definitions/shell/register'
import 'monaco-editor/languages/definitions/powershell/register'
import 'monaco-editor/languages/definitions/yaml/register'
import 'monaco-editor/languages/definitions/xml/register'
import 'monaco-editor/languages/definitions/sql/register'
import 'monaco-editor/languages/definitions/csharp/register'
import 'monaco-editor/languages/definitions/java/register'
import 'monaco-editor/languages/definitions/cpp/register'
import 'monaco-editor/languages/definitions/go/register'
import 'monaco-editor/languages/definitions/rust/register'
import * as monaco from 'monaco-editor/editor/editor.api'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import type { ThemeName } from '@shared/settings'

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker()
}

monaco.editor.defineTheme('markdown-studio-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword.md', foreground: '2BD9A1', fontStyle: 'bold' },
    { token: 'strong.md', fontStyle: 'bold' },
    { token: 'emphasis.md', fontStyle: 'italic' },
    { token: 'string.link.md', foreground: '7CB7FF' },
    { token: 'variable.md', foreground: 'E5C07B' },
    { token: 'variable.source.md', foreground: 'D7DAE0' },
    { token: 'meta.separator.md', foreground: '6B7177' },
    { token: 'comment.md', foreground: '6B7177' },
    { token: 'tag.md', foreground: '6FD3B5' },
    { token: 'attribute.name.html.md', foreground: '9CDCFE' },
    { token: 'string.html.md', foreground: 'CE9178' }
  ],
  colors: {
    'editor.background': '#0F1112',
    'editor.foreground': '#E3E6E8',
    'editorLineNumber.foreground': '#454B51',
    'editorLineNumber.activeForeground': '#A9AFB5',
    'editorCursor.foreground': '#2BD9A1',
    'editor.lineHighlightBackground': '#16191B',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#10B98140',
    'editor.inactiveSelectionBackground': '#10B98122',
    'editor.findMatchBackground': '#10B98166',
    'editor.findMatchHighlightBackground': '#10B98130',
    'editorWidget.background': '#1A1D20',
    'editorWidget.border': '#2B2E31',
    'editorSuggestWidget.background': '#1A1D20',
    'input.background': '#0F1112',
    'input.border': '#2B2E31',
    focusBorder: '#10B98199',
    'scrollbarSlider.background': '#FFFFFF12',
    'scrollbarSlider.hoverBackground': '#FFFFFF20',
    'scrollbarSlider.activeBackground': '#FFFFFF2A',
    'minimap.background': '#0F1112',
    'editorGutter.background': '#0F1112',
    'editorIndentGuide.background1': '#1E2124',
    'editorWhitespace.foreground': '#3A3F44'
  }
})

monaco.editor.defineTheme('markdown-studio-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword.md', foreground: '06875F', fontStyle: 'bold' },
    { token: 'strong.md', fontStyle: 'bold' },
    { token: 'emphasis.md', fontStyle: 'italic' },
    { token: 'string.link.md', foreground: '0B63C4' },
    { token: 'variable.md', foreground: '9A5B00' },
    { token: 'tag.md', foreground: '0B7A5C' }
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editorLineNumber.foreground': '#A4AAB0',
    'editorLineNumber.activeForeground': '#3A3F44',
    'editorCursor.foreground': '#06875F',
    'editor.lineHighlightBackground': '#F4F6F6',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#10B98138',
    'editor.inactiveSelectionBackground': '#10B9811E',
    focusBorder: '#0A9D6E99'
  }
})

export function monacoTheme(theme: ThemeName): string {
  return theme === 'light' ? 'markdown-studio-light' : 'markdown-studio-dark'
}

export { monaco }
