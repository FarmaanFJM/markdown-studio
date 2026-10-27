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
import { DARK_THEME, LIGHT_THEME } from './editorThemes'

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker()
}

monaco.editor.defineTheme('markdown-studio-dark', DARK_THEME)
monaco.editor.defineTheme('markdown-studio-light', LIGHT_THEME)

export function monacoTheme(theme: ThemeName): string {
  return theme === 'light' ? 'markdown-studio-light' : 'markdown-studio-dark'
}

export { monaco }
