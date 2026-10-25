import { monaco } from './monaco'

interface ModelEntry {
  model: monaco.editor.ITextModel
  viewState: monaco.editor.ICodeEditorViewState | null
}

/**
 * Monaco text models, one per open document. Each model owns its own undo stack, so tabs keep
 * independent history; models are kept outside React state because they are mutable objects.
 */
const entries = new Map<string, ModelEntry>()

export const documentModels = {
  create(id: string, content: string): monaco.editor.ITextModel {
    const uri = monaco.Uri.from({ scheme: 'inmemory', path: `/document-${id}.md` })
    const model = monaco.editor.createModel(content, 'markdown', uri)
    // Files with line breaks keep theirs. Text without any (new documents) would otherwise get
    // the platform default; use LF everywhere so documents behave the same on every system.
    if (!/[\r\n]/.test(content)) model.setEOL(monaco.editor.EndOfLineSequence.LF)
    entries.set(id, { model, viewState: null })
    return model
  },
  get(id: string | null): monaco.editor.ITextModel | null {
    return id ? (entries.get(id)?.model ?? null) : null
  },
  /** The id of the document that owns a model, or null for foreign models. */
  idOf(model: monaco.editor.ITextModel): string | null {
    for (const [id, entry] of entries) if (entry.model === model) return id
    return null
  },
  getViewState(id: string): monaco.editor.ICodeEditorViewState | null {
    return entries.get(id)?.viewState ?? null
  },
  setViewState(id: string, state: monaco.editor.ICodeEditorViewState | null): void {
    const entry = entries.get(id)
    if (entry) entry.viewState = state
  },
  dispose(id: string): void {
    entries.get(id)?.model.dispose()
    entries.delete(id)
  }
}

/** The single editor instance, registered by the editor component. */
let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null

export function setActiveEditor(editor: monaco.editor.IStandaloneCodeEditor | null): void {
  activeEditor = editor
}

export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return activeEditor
}

/** Runs a built-in Monaco action (find, replace, undo, ...) on the editor. */
export function runEditorAction(actionId: string): boolean {
  const editor = activeEditor
  if (!editor || !editor.getModel()) return false
  editor.focus()
  const action = editor.getAction(actionId)
  if (action) {
    void action.run()
    return true
  }
  editor.trigger('markdown-studio', actionId, null)
  return true
}
