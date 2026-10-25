import { analyzeDocument } from '@shared/markdown/analysis'
import { buildTocBlock, findTocRegion } from '@shared/markdown/toc'
import { basename, dirname, relativePath } from '@shared/paths'
import {
  expandTemplate,
  templateToSnippet,
  titleFromName,
  type Template,
  type TemplateScope
} from '@shared/templates'
import {
  localReferences,
  makeWorkspaceRelative,
  prepareAssetsForDocument
} from '@shared/templateAssets'
import { api, errorMessage } from '../bridge'
import { requireEditor } from '../editor/markdown/commands'
import { documentContext } from '../editor/markdown/context'
import { insertSnippetText } from '../editor/markdown/insert'
import { documentModels, getActiveEditor } from '../editor/models'
import { monaco } from '../editor/monaco'
import { Modal } from '../dialogs/Modal'
import { targetDirectory } from '../explorer/target'
import { activeDocument, documentName, newDocument, openDocument } from '../state/documents'
import { useSettings } from '../state/settings'
import { dialogs, notify } from '../state/ui'
import { useWorkspace } from '../state/workspace'
import { NewDocumentDialog, type NewDocumentValues } from './NewDocumentDialog'
import { TemplateForm, draftFrom, type TemplateDraft } from './TemplateForm'
import { TemplatesDialog, type TemplateChoice, type TemplatesPurpose } from './TemplatesDialog'
import { refreshTemplates, saveTemplate, useTemplates, type TemplateEntry } from './store'

/** Marks the cursor position while the text goes through later transformations. */
const CURSOR_MARK = ''

function positionOf(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split('\n')
  return { line: before.length, column: before[before.length - 1].length + 1 }
}

async function showCursor(id: string, position: { line: number; column: number }): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const editor = getActiveEditor()
    const model = documentModels.get(id)
    if (editor && model && editor.getModel() === model) {
      const target = new monaco.Position(position.line, position.column)
      editor.setPosition(target)
      editor.revealPositionInCenter(target)
      editor.focus()
      return
    }
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

/** Fills a managed table of contents in the new text, if the template has one. */
function fillTableOfContents(text: string): string {
  const analysis = analyzeDocument(text)
  const region = findTocRegion(analysis)
  if (!region || region === 'broken') return text
  const { includeTopLevel, maxDepth } = useSettings.getState().settings.markdown.toc
  const block = buildTocBlock(analysis, { includeTopLevel, maxDepth }, region)
  return [
    ...analysis.lines.slice(0, region.start),
    ...block,
    ...analysis.lines.slice(region.end + 1)
  ].join('\n')
}

interface Prepared {
  text: string
  cursor: { line: number; column: number } | null
}

/** Template body to final document text: variables, table of contents, then local references. */
function prepareDocument(
  template: Template,
  values: { title: string; author: string },
  directory: string | null
): Prepared {
  const expanded = expandTemplate(template.body, values)
  let text = expanded.text
  if (expanded.cursorOffset !== null) {
    text = text.slice(0, expanded.cursorOffset) + CURSOR_MARK + text.slice(expanded.cursorOffset)
  }
  text = fillTableOfContents(text)
  const root = useWorkspace.getState().root
  if (directory) {
    text = prepareAssetsForDocument(text, {
      documentDirectory: directory,
      workspaceRoot: root
    }).text
  }
  const mark = text.indexOf(CURSOR_MARK)
  if (mark < 0) return { text, cursor: null }
  text = text.replace(CURSOR_MARK, '')
  return { text, cursor: positionOf(text, mark) }
}

async function missingReferences(template: Template, directory: string | null): Promise<string[]> {
  const local = localReferences(template.body)
  if (local.length === 0) return []
  if (!directory) {
    return [
      `${local.length} local file reference${local.length === 1 ? '' : 's'} (they resolve relative to where you save the document)`
    ]
  }
  const root = useWorkspace.getState().root
  const { targets } = prepareAssetsForDocument(template.body, {
    documentDirectory: directory,
    workspaceRoot: root
  })
  const states = await api.fs.statMany(targets.map((t) => t.path))
  return targets.filter((_, i) => states[i] === 'missing').map((t) => t.value)
}

/** Creates a document from a template: asks for the values it needs, then writes the file. */
export async function createFromTemplate(template: Template): Promise<void> {
  const root = useWorkspace.getState().root
  const directory = root ? targetDirectory(root) : null
  const defaultAuthor = useSettings.getState().settings.templates.author
  let createdId: string | null = null
  let cursor: Prepared['cursor'] = null

  const created = await dialogs.custom<boolean>((done) => (
    <NewDocumentDialog
      template={template}
      folderLabel={
        directory ? (root && relativePath(root, directory)) || basename(root ?? '') || '.' : null
      }
      defaultAuthor={defaultAuthor}
      findMissingFiles={() => missingReferences(template, directory)}
      onDone={(ok) => done(ok)}
      submit={async (values: NewDocumentValues) => {
        const prepared = prepareDocument(template, values, directory)
        if (values.author && values.author !== defaultAuthor) {
          useSettings.getState().update({ templates: { author: values.author } })
        }
        if (directory) {
          let path: string
          try {
            path = await api.fs.createFile(directory, values.fileName)
          } catch (error) {
            return errorMessage(error) // an existing file is never overwritten
          }
          try {
            await api.fs.writeText(path, prepared.text, false)
          } catch (error) {
            await api.fs.deletePermanently(path).catch(() => undefined)
            return `Could not write the document: ${errorMessage(error)}`
          }
          const workspace = useWorkspace.getState()
          workspace.expand(directory)
          await workspace.refresh([directory])
          workspace.select(path)
          createdId = await openDocument(path)
        } else {
          createdId = newDocument()
          documentModels.get(createdId)?.setValue(prepared.text)
        }
        cursor = prepared.cursor
        return null
      }}
    />
  ))
  if (created && createdId) {
    await showCursor(createdId, cursor ?? { line: 1, column: 1 })
  }
}

/** Inserts a saved snippet at the cursor with Monaco's snippet engine. */
export function insertSavedSnippet(entry: TemplateEntry): void {
  const editor = requireEditor()
  if (!editor) return
  const doc = activeDocument()
  const title = doc?.path ? titleFromName(basename(doc.path)) : ''
  const author = useSettings.getState().settings.templates.author
  const snippet = templateToSnippet(entry.template.body, { title, author })
  insertSnippetText(editor, snippet, { block: entry.template.body.includes('\n') })
}

async function chooseTemplate(purpose: TemplatesPurpose): Promise<TemplateChoice | null> {
  await refreshTemplates()
  return dialogs.custom<TemplateChoice>((done) => (
    <TemplatesDialog purpose={purpose} onDone={done} />
  ))
}

async function applyChoice(choice: TemplateChoice | null): Promise<void> {
  if (!choice) {
    getActiveEditor()?.focus()
    return
  }
  if (choice.action === 'create') await createFromTemplate(choice.entry.template)
  else insertSavedSnippet(choice.entry)
}

export const templateCommands = {
  newDocument: async () => applyChoice(await chooseTemplate('create')),
  manage: async () => applyChoice(await chooseTemplate('manage')),
  insertSnippet: async () => applyChoice(await chooseTemplate('insert')),
  saveDocument: () => saveActiveAsTemplate('document'),
  saveSelection: () => saveActiveAsTemplate('selection')
}

function SaveTemplateDialog(props: {
  draft: TemplateDraft
  workspaceAvailable: boolean
  onDone(draft: TemplateDraft | null): void
}) {
  return (
    <Modal title="Save as Template" size="wide" footer={null} onCancel={() => props.onDone(null)}>
      <TemplateForm
        draft={props.draft}
        editing={false}
        workspaceAvailable={props.workspaceAvailable}
        onSave={props.onDone}
        onCancel={() => props.onDone(null)}
      />
    </Modal>
  )
}

/**
 * Saves the active document, or its selection, as a template or snippet. Local file references
 * cannot travel with a template, so the user decides what happens to them.
 */
async function saveActiveAsTemplate(source: 'document' | 'selection'): Promise<void> {
  const editor = requireEditor()
  const doc = activeDocument()
  const model = editor?.getModel()
  if (!editor || !doc || !model) return
  const selection = editor.getSelection()
  const selected = selection && !selection.isEmpty() ? model.getValueInRange(selection) : ''
  if (source === 'selection' && !selected) {
    notify('info', 'Select some Markdown first.')
    return
  }
  const body = (source === 'selection' ? selected : model.getValue()).replace(/\r\n?/g, '\n')

  await refreshTemplates()
  const { workspaceAvailable } = useTemplates.getState()
  const scope: TemplateScope = workspaceAvailable ? 'workspace' : 'global'
  const draft = await dialogs.custom<TemplateDraft>((done) => (
    <SaveTemplateDialog
      draft={{
        ...draftFrom(
          {
            name: source === 'selection' ? '' : titleFromName(documentName(doc)),
            kind: source === 'selection' ? 'snippet' : 'document',
            body
          },
          scope
        )
      }}
      workspaceAvailable={workspaceAvailable}
      onDone={done}
    />
  ))
  if (!draft) {
    editor.focus()
    return
  }

  let finalBody = draft.body
  const references = localReferences(finalBody)
  if (references.length > 0) {
    const context = documentContext(model)
    const root = useWorkspace.getState().root
    const canRebase = draft.scope === 'workspace' && root !== null
    const choice = await dialogs.choice({
      title: 'Local Files in This Template',
      message: `The content refers to ${references.length} local file${references.length === 1 ? '' : 's'}. A template cannot carry files with it.`,
      items: references.map((r) => r.reference.value),
      detail: canRebase
        ? 'Workspace-relative paths (such as /assets/logo.png) are adjusted for each new document in this folder, so they keep working wherever the document is created.'
        : 'References stay exactly as written and are resolved relative to each new document; they will be reported as problems where the files do not exist.',
      options: [
        ...(canRebase
          ? [{ value: 'rebase', label: 'Make paths workspace-relative', primary: true }]
          : []),
        { value: 'keep', label: 'Keep as written', primary: !canRebase }
      ]
    })
    if (!choice) {
      editor.focus()
      return
    }
    if (choice === 'rebase' && root) {
      finalBody = makeWorkspaceRelative(finalBody, {
        documentDirectory: context.documentDirectory ?? (doc.path ? dirname(doc.path) : root),
        workspaceRoot: root
      }).text
    }
  }

  const saved = await saveTemplate(draft.scope, { ...draft, body: finalBody })
  if (saved) {
    notify(
      'success',
      `Saved "${saved.name}" as a ${saved.kind === 'snippet' ? 'snippet' : 'template'}.`,
      {
        label: 'Manage',
        run: () => void templateCommands.manage()
      }
    )
  }
  editor.focus()
}
