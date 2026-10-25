/**
 * Commands of the Phase 3 publishing features: document themes, math and diagram switches,
 * insertions and workspace appearance. Registered next to the Phase 2 commands so the palette,
 * menus, shortcuts and completion items all start the same code.
 */
import { BUILTIN_THEMES, THEME_IDS } from '@shared/presentation/theme'
import { markdownCommands } from '../editor/markdown/commands'
import { usePresentation } from '../state/presentation'
import { useSettings } from '../state/settings'
import { notify } from '../state/ui'
import { commands } from './commands'
import { registerCommands } from './registry'

export function openDocumentSettings(): void {
  commands.showSettings()
  setTimeout(() => {
    const section = document.getElementById('settings-document-appearance')
    section?.scrollIntoView({ block: 'start' })
    section?.querySelector<HTMLElement>('button, input, select')?.focus()
  }, 50)
}

function setTheme(id: (typeof THEME_IDS)[number]): void {
  useSettings.getState().update({ document: { theme: id } })
  const workspace = usePresentation.getState().workspace
  if (workspace?.theme && workspace.theme !== id) {
    notify(
      'info',
      `Theme set for the application, but this workspace uses ${BUILTIN_THEMES[workspace.theme].name}. Clear the workspace override to see it.`
    )
  } else {
    notify('success', `Document theme: ${BUILTIN_THEMES[id].name}.`)
  }
}

registerCommands([
  ...THEME_IDS.map((id) => ({
    id: `document.theme.${id}`,
    title: `Document Theme: ${BUILTIN_THEMES[id].name}`,
    category: 'Document' as const,
    run: () => setTheme(id),
    keywords: `appearance style preview export ${BUILTIN_THEMES[id].description}`
  })),
  {
    id: 'document.appearance',
    title: 'Document Appearance Settings…',
    category: 'Document',
    run: openDocumentSettings,
    keywords: 'theme fonts colours css style'
  },
  {
    id: 'document.toggleMath',
    title: 'Toggle Math Rendering',
    category: 'Document',
    run: () => {
      const enabled = !useSettings.getState().settings.document.math.enabled
      useSettings.getState().update({ document: { math: { enabled } } })
      notify('info', `Math rendering ${enabled ? 'on' : 'off'}. The Markdown is unchanged.`)
    },
    keywords: 'katex latex equations'
  },
  {
    id: 'document.toggleDiagrams',
    title: 'Toggle Diagram Rendering',
    category: 'Document',
    run: () => {
      const enabled = !useSettings.getState().settings.document.diagrams.enabled
      useSettings.getState().update({ document: { diagrams: { enabled } } })
      notify('info', `Diagram rendering ${enabled ? 'on' : 'off'}. The Markdown is unchanged.`)
    },
    keywords: 'mermaid flowchart'
  },
  {
    id: 'document.clearWorkspaceOverride',
    title: 'Clear Workspace Appearance Override',
    category: 'Document',
    run: async () => {
      if (!usePresentation.getState().workspace) {
        notify('info', 'This workspace has no appearance override.')
        return
      }
      await usePresentation.getState().setWorkspace(null)
      notify('success', 'Workspace appearance override cleared.')
    },
    keywords: 'folder project theme reset'
  },
  {
    id: 'insert.mathInline',
    title: 'Insert Inline Math',
    category: 'Insert',
    run: () => markdownCommands.insertSnippet('mathInline'),
    needsDocument: true,
    keywords: 'equation formula latex katex'
  },
  {
    id: 'insert.mathBlock',
    title: 'Insert Display Equation',
    category: 'Insert',
    run: () => markdownCommands.insertSnippet('mathBlock'),
    needsDocument: true,
    keywords: 'equation formula latex katex math block'
  },
  {
    id: 'insert.mermaid',
    title: 'Insert Mermaid Flowchart',
    category: 'Insert',
    run: () => markdownCommands.insertSnippet('mermaidFlowchart'),
    needsDocument: true,
    keywords: 'diagram chart graph'
  },
  {
    id: 'insert.mermaidSequence',
    title: 'Insert Mermaid Sequence Diagram',
    category: 'Insert',
    run: () => markdownCommands.insertSnippet('mermaidSequence'),
    needsDocument: true,
    keywords: 'diagram uml'
  },
  {
    id: 'insert.pageBreak',
    title: 'Insert Page Break',
    category: 'Insert',
    run: () => markdownCommands.insertSnippet('pageBreak'),
    needsDocument: true,
    keywords: 'pdf print new page'
  }
])
