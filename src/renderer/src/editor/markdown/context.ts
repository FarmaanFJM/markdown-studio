import { dirname } from '@shared/paths'
import type { DocumentContext } from '@shared/markdown/resolve'
import { getDocument } from '../../state/documents'
import { useWorkspace } from '../../state/workspace'
import { documentModels } from '../models'
import type { monaco } from '../monaco'

/** Where a model's document lives, for resolving its relative links the way the preview does. */
export function documentContext(model: monaco.editor.ITextModel): DocumentContext {
  const id = documentModels.idOf(model)
  const doc = id ? getDocument(id) : null
  return {
    documentDirectory: doc?.path ? dirname(doc.path) : null,
    workspaceRoot: useWorkspace.getState().root
  }
}

export function documentPath(model: monaco.editor.ITextModel): string | null {
  const id = documentModels.idOf(model)
  return (id ? getDocument(id)?.path : null) ?? null
}
