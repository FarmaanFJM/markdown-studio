import { useEffect, useRef } from 'react'
import { useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'
import { notify } from '../state/ui'
import {
  dataTransferHasDroppable,
  insertImages,
  pasteImages,
  sourcesFromDataTransfer
} from './imageDrop'
import { documentModels, setActiveEditor } from './models'
import { installCopilotSync } from '../ai/copilotSync'
import { registerInlineSuggestions } from '../ai/inline'
import { installDiagnostics, registerQuickFixes } from '../diagnostics/manager'
import { registerCompletions } from './markdown/completions'
import { installContextMenu } from './markdown/contextMenu'
import { installSmartEditing } from './markdown/smartEditing'
import { monaco, monacoTheme } from './monaco'

const EDITOR_FONT =
  "'Cascadia Code', 'Cascadia Mono', Consolas, 'SF Mono', Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace"

/**
 * The Monaco source editor. A single editor instance swaps between per-document models and
 * remembers each document's scroll position, selection and folding state.
 */
export function MarkdownEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const shownIdRef = useRef<string | null>(null)
  const activeId = useDocuments((s) => s.activeId)
  const { fontSize, wordWrap, minimap } = useSettings((s) => s.settings.editor)
  const theme = useSettings((s) => s.settings.theme)

  useEffect(() => {
    const container = containerRef.current!
    const settings = useSettings.getState().settings
    const editor = monaco.editor.create(container, {
      model: null,
      theme: monacoTheme(settings.theme),
      automaticLayout: true,
      fontFamily: EDITOR_FONT,
      fontSize: settings.editor.fontSize,
      wordWrap: settings.editor.wordWrap ? 'on' : 'off',
      minimap: { enabled: settings.editor.minimap, renderCharacters: false, maxColumn: 100 },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 12, bottom: 12 },
      renderLineHighlight: 'line',
      renderWhitespace: 'selection',
      // Markdown suggestions appear on request (Ctrl+Space) and after trigger characters such as
      // "/" and "](" only; typing prose never opens a menu, and word-based suggestions are noise.
      quickSuggestions: false,
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'off',
      snippetSuggestions: 'inline',
      acceptSuggestionOnEnter: 'on',
      suggest: { showStatusBar: true, insertMode: 'replace', preview: false },
      // Image drops are handled by Markdown Studio, which writes proper Markdown references.
      dropIntoEditor: { enabled: false },
      pasteAs: { enabled: false },
      links: false,
      occurrencesHighlight: 'off',
      bracketPairColorization: { enabled: false },
      guides: { indentation: false },
      stickyScroll: { enabled: false },
      unicodeHighlight: { ambiguousCharacters: false, nonBasicASCII: false },
      fixedOverflowWidgets: true,
      // The shadow-DOM menu cannot see the theme variables Monaco defines on its editor element,
      // which left the context menu without a background. In the page it inherits them.
      useShadowDOM: false,
      ariaLabel: 'Markdown source editor'
    })
    editorRef.current = editor
    setActiveEditor(editor)
    const features = [
      registerCompletions(),
      registerQuickFixes(),
      installSmartEditing(editor),
      installContextMenu(editor),
      installDiagnostics(editor),
      registerInlineSuggestions(() => editorRef.current),
      installCopilotSync(() => editorRef.current)
    ]

    editor.onDidChangeCursorSelection(({ selection }) => {
      const model = editor.getModel()
      useDocuments.setState({
        cursor: {
          line: selection.positionLineNumber,
          column: selection.positionColumn,
          selectedCharacters: model ? model.getValueLengthInRange(selection) : 0
        }
      })
    })

    // Drop indicator and image drops. Capture phase runs before Monaco's own text drag handling.
    const caret = editor.createDecorationsCollection()
    const positionAt = (event: DragEvent) =>
      editor.getTargetAtClientPoint(event.clientX, event.clientY)?.position ?? null
    const onDragOver = (event: DragEvent) => {
      if (!dataTransferHasDroppable(event.dataTransfer) || !editor.getModel()) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer!.dropEffect = 'copy'
      const position = positionAt(event)
      caret.set(
        position
          ? [
              {
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column
                ),
                options: { beforeContentClassName: 'drop-caret' }
              }
            ]
          : []
      )
    }
    const onDragLeave = (event: DragEvent) => {
      if (!container.contains(event.relatedTarget as Node | null)) caret.clear()
    }
    const onDrop = (event: DragEvent) => {
      caret.clear()
      if (!dataTransferHasDroppable(event.dataTransfer) || !editor.getModel()) return
      event.preventDefault()
      event.stopPropagation()
      const position = positionAt(event)
      // DataTransfer contents are only readable synchronously, during the event.
      const sources = sourcesFromDataTransfer(event.dataTransfer!)
      if (sources.length === 0) {
        notify(
          'error',
          'Only files from disk can be dropped here. Save the image to a folder first.'
        )
        return
      }
      void insertImages(editor, sources, position)
    }
    // Pasting an image (screenshot, copied picture, copied image files) saves it in the project.
    const onPaste = (event: ClipboardEvent) => {
      if (pasteImages(editor, event.clipboardData)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    container.addEventListener('paste', onPaste, true)
    container.addEventListener('dragover', onDragOver, true)
    container.addEventListener('dragleave', onDragLeave, true)
    container.addEventListener('drop', onDrop, true)

    return () => {
      container.removeEventListener('paste', onPaste, true)
      container.removeEventListener('dragover', onDragOver, true)
      container.removeEventListener('dragleave', onDragLeave, true)
      container.removeEventListener('drop', onDrop, true)
      features.forEach((feature) => feature.dispose())
      const shown = shownIdRef.current
      if (shown) documentModels.setViewState(shown, editor.saveViewState())
      setActiveEditor(null)
      editor.setModel(null)
      editor.dispose()
      editorRef.current = null
      shownIdRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const previous = shownIdRef.current
    if (previous === activeId) return
    if (previous && documentModels.get(previous)) {
      documentModels.setViewState(previous, editor.saveViewState())
    }
    const model = documentModels.get(activeId)
    editor.setModel(model)
    shownIdRef.current = model ? activeId : null
    if (model && activeId) {
      const viewState = documentModels.getViewState(activeId)
      if (viewState) editor.restoreViewState(viewState)
      editor.focus()
    }
  }, [activeId])

  useEffect(() => {
    editorRef.current?.updateOptions({
      fontSize,
      wordWrap: wordWrap ? 'on' : 'off',
      minimap: { enabled: minimap, renderCharacters: false, maxColumn: 100 }
    })
  }, [fontSize, wordWrap, minimap])

  useEffect(() => {
    monaco.editor.setTheme(monacoTheme(theme))
  }, [theme])

  return <div ref={containerRef} className="monaco-host" data-testid="editor" />
}
