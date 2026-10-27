import { findSpaceRuns } from '@shared/markdown/quickFixes'
import { findTableProblems } from '@shared/markdown/tables'
import { findLinkProblems, type LinkProblem } from '@shared/markdown/linkProblems'
import { buildLintConfig, fixAllText, fixToEdit, lintSeverity, type LintIssue } from '@shared/lint'
import { basename, relativePath } from '@shared/paths'
import { analyzePublishing } from '@shared/publishing/analyze'
import { api } from '../bridge'
import { documentContext } from '../editor/markdown/context'
import { analysisFor } from '../editor/markdown/model'
import { getActiveEditor } from '../editor/models'
import {
  blockActionTitle,
  blockFormatAt,
  lineEditToTextEdit,
  tableRepairAt
} from '../editor/markdown/quickFixActions'
import { monaco } from '../editor/monaco'
import { activeDocument, useDocuments } from '../state/documents'
import { useProject } from '../state/project'
import { useWorkspace } from '../state/workspace'
import { documentPublishing } from '../publishing/documentPublishing'
import { loadPublicationBuild } from '../publishing/publicationSource'
import { renderDiagram } from '../markdown/diagrams'
import { diagramStyleFor } from '../markdown/diagramStyle'
import { checkMath } from '../markdown/math'
import { usePresentation } from '../state/presentation'
import { useSettings } from '../state/settings'
import { adaptiveDelay } from '../state/timing'
import { notify } from '../state/ui'
import { anchorsOfFile, workspaceFiles } from '../workspace'
import { lintText } from './lintClient'

type Editor = monaco.editor.IStandaloneCodeEditor

export const LINK_OWNER = 'markdown-studio-links'
export const TABLE_OWNER = 'markdown-studio-tables'
export const LINT_OWNER = 'markdown-studio-lint'
export const SPACES_OWNER = 'markdown-studio-spaces'
export const RENDER_OWNER = 'markdown-studio-render'
export const PUBLISHING_OWNER = 'markdown-studio-publishing'

/** Documents larger than this are not linted: the interface stays responsive on huge files. */
const MAX_LINT_CHARACTERS = 400_000
const TYPING_DELAY_MS = 600

interface Fix {
  title: string
  edit: { range: monaco.IRange; text: string }
}

interface StoredFix extends Fix {
  owner: string
}

/** Corrections offered as quick fixes, keyed by marker so they can be matched back. */
const fixes = new WeakMap<monaco.editor.ITextModel, Map<string, StoredFix>>()

/** Code actions receive plain marker data, so a marker is identified by its code and range. */
function markerKey(code: string, range: monaco.IRange): string {
  return `${code}|${range.startLineNumber}:${range.startColumn}-${range.endLineNumber}:${range.endColumn}`
}

function remember(model: monaco.editor.ITextModel, key: string, fix: StoredFix): void {
  let table = fixes.get(model)
  if (!table) {
    table = new Map()
    fixes.set(model, table)
  }
  table.set(key, fix)
}

function forget(model: monaco.editor.ITextModel, owner: string): void {
  const table = fixes.get(model)
  if (!table) return
  for (const [key, fix] of [...table]) if (fix.owner === owner) table.delete(key)
}

function setMarkers(
  model: monaco.editor.ITextModel,
  owner: string,
  entries: { marker: monaco.editor.IMarkerData; fix?: Fix }[]
): void {
  forget(model, owner)
  for (const { marker, fix } of entries) {
    if (fix) {
      remember(model, markerKey(String(marker.code), marker), { ...fix, owner })
    }
  }
  monaco.editor.setModelMarkers(
    model,
    owner,
    entries.map((e) => e.marker)
  )
}

function clear(model: monaco.editor.ITextModel, owner: string): void {
  forget(model, owner)
  monaco.editor.setModelMarkers(model, owner, [])
}

// --- Links ---------------------------------------------------------------------------------------

function linkMarkers(problems: LinkProblem[]) {
  return problems.map((problem) => {
    const range = {
      startLineNumber: problem.line + 1,
      startColumn: problem.column + 1,
      endLineNumber: problem.endLine + 1,
      endColumn: Math.max(problem.endColumn + 1, problem.column + 2)
    }
    return {
      marker: {
        ...range,
        severity: monaco.MarkerSeverity.Warning,
        message: problem.message,
        code: problem.code,
        source: 'Markdown Studio'
      },
      fix: problem.fix && {
        title: problem.fix.title,
        edit: { range, text: problem.fix.replacement }
      }
    }
  })
}

async function validateLinks(model: monaco.editor.ITextModel): Promise<LinkProblem[]> {
  const analysis = analysisFor(model)
  const context = documentContext(model)
  return findLinkProblems(analysis, context, {
    async stat(paths) {
      const states = paths.length > 0 ? await api.fs.statMany(paths) : []
      return new Map(paths.map((path, i) => [path, states[i]]))
    },
    async anchorsOf(path) {
      return (await anchorsOfFile(path))?.anchors ?? null
    },
    async filesNamed(name) {
      const wanted = name.toLowerCase()
      return (await workspaceFiles()).filter((file) => basename(file).toLowerCase() === wanted)
    }
  })
}

// --- Tables --------------------------------------------------------------------------------------

function tableMarkers(model: monaco.editor.ITextModel) {
  return findTableProblems(analysisFor(model)).map((problem) => {
    const range = {
      startLineNumber: problem.line + 1,
      startColumn: 1,
      endLineNumber: problem.line + 1,
      endColumn: model.getLineMaxColumn(problem.line + 1)
    }
    const repair = tableRepairAt(model, problem.line)
    return {
      marker: {
        ...range,
        severity: monaco.MarkerSeverity.Warning,
        message: problem.message,
        code: 'table',
        source: 'Markdown Studio'
      },
      fix: repair
        ? {
            title: 'Repair table: add the missing columns',
            edit: lineEditToTextEdit(model, repair)
          }
        : undefined
    }
  })
}

// --- Repeated spaces -------------------------------------------------------------------------------

/** Runs of spaces inside sentences: a faint hint (not counted as a problem) with a quick fix. */
function spaceMarkers(model: monaco.editor.ITextModel) {
  return findSpaceRuns(analysisFor(model)).map((run) => {
    const range = {
      startLineNumber: run.line + 1,
      startColumn: run.column + 1,
      endLineNumber: run.line + 1,
      endColumn: run.column + 1 + run.length
    }
    return {
      marker: {
        ...range,
        severity: monaco.MarkerSeverity.Hint,
        message: `${run.length} spaces in a row; one is enough.`,
        code: 'spaces',
        source: 'Markdown Studio'
      },
      fix: { title: 'Remove extra spaces', edit: { range, text: ' ' } }
    }
  })
}

// --- Style (markdownlint) --------------------------------------------------------------------------

function lintMarkers(model: monaco.editor.ITextModel, issues: LintIssue[]) {
  const lines: string[] = []
  for (let line = 1; line <= model.getLineCount(); line++) lines.push(model.getLineContent(line))
  return issues.map((issue) => {
    const max = model.getLineMaxColumn(Math.min(issue.line, model.getLineCount()))
    const startColumn = issue.range ? issue.range[0] : 1
    const endColumn = issue.range ? Math.min(max, issue.range[0] + issue.range[1]) : max
    const range = {
      startLineNumber: issue.line,
      startColumn,
      endLineNumber: issue.line,
      endColumn: Math.max(endColumn, startColumn)
    }
    const edit = fixToEdit(issue, lines)
    return {
      marker: {
        ...range,
        severity:
          lintSeverity(issue.rule) === 'warning'
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
        message: issue.detail ? `${issue.description} (${issue.detail})` : issue.description,
        code: issue.rule,
        source: 'markdownlint'
      },
      fix: edit
        ? {
            title: `Fix: ${issue.description}`,
            edit: {
              range: {
                startLineNumber: edit.startLine,
                startColumn: edit.startColumn,
                endLineNumber: edit.endLine,
                endColumn: edit.endColumn
              },
              text: edit.text.replace(/\n/g, model.getEOL())
            }
          }
        : undefined
    }
  })
}

// --- Rendering (math and diagrams) --------------------------------------------------------------

/** Documents with more equations than this are checked up to the limit, to keep typing smooth. */
const MAX_MATH_CHECKS = 400
const MAX_DIAGRAM_CHECKS = 60

function mathMarkers(model: monaco.editor.ITextModel) {
  const entries: { marker: monaco.editor.IMarkerData }[] = []
  for (const span of analysisFor(model).math.slice(0, MAX_MATH_CHECKS)) {
    const message = checkMath(span.tex, span.display)
    if (!message) continue
    entries.push({
      marker: {
        startLineNumber: span.line + 1,
        startColumn: span.column + 1,
        endLineNumber: span.endLine + 1,
        endColumn: Math.max(span.endColumn + 1, span.column + 2),
        severity: monaco.MarkerSeverity.Error,
        message: `Math cannot be rendered: ${message}`,
        code: 'math',
        source: 'Markdown Studio'
      }
    })
  }
  return entries
}

async function diagramMarkers(model: monaco.editor.ITextModel) {
  const presentation = usePresentation.getState().render
  const style = diagramStyleFor(presentation.theme)
  const entries: { marker: monaco.editor.IMarkerData }[] = []
  const fences = analysisFor(model)
    .fences.filter((fence) => /^mermaid\b/i.test(fence.info))
    .slice(0, MAX_DIAGRAM_CHECKS)
  for (const fence of fences) {
    if (fence.content.trim() === '') continue
    const outcome = await renderDiagram(fence.content, style)
    if (outcome.ok) continue
    const contentLines = fence.content.split('\n').length
    const inside = Math.min(outcome.line ?? 1, contentLines)
    // Line 1 of the diagram is the line after the opening fence marker.
    const line = Math.min(fence.start + 1 + inside, model.getLineCount())
    entries.push({
      marker: {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: model.getLineMaxColumn(line),
        severity: monaco.MarkerSeverity.Error,
        message: `Diagram cannot be drawn: ${outcome.message.split('\n')[0]}`,
        code: 'diagram',
        source: 'Markdown Studio'
      }
    })
  }
  return entries
}

// --- Publishing (identifiers, references, sources) ---------------------------------------------

/** Problems with labels, cross-references, citations and front matter of the document. */
async function publishingMarkers(model: monaco.editor.ITextModel) {
  const text = model.getValue()
  const publishing = documentPublishing(text)
  const entries: { marker: monaco.editor.IMarkerData }[] = []
  const add = (line: number, message: string, severity: monaco.MarkerSeverity, id?: string) => {
    const number = Math.min(Math.max(line + 1, 1), model.getLineCount())
    const content = model.getLineContent(number)
    const at = id ? content.indexOf(`@${id}`) : -1
    entries.push({
      marker: {
        startLineNumber: number,
        startColumn: at >= 0 ? at + 1 : 1,
        endLineNumber: number,
        endColumn: at >= 0 ? at + 2 + (id?.length ?? 0) : model.getLineMaxColumn(number),
        severity,
        message,
        code: 'publishing',
        source: 'Markdown Studio'
      }
    })
  }

  if (publishing.frontMatterError) {
    add(0, `Front matter: ${publishing.frontMatterError}`, monaco.MarkerSeverity.Warning)
  }
  for (const message of [...publishing.settingProblems, ...publishing.referenceProblems]) {
    add(0, `Front matter: ${message}`, monaco.MarkerSeverity.Warning)
  }

  const document = activeDocument()
  const publication = useProject.getState().publication
  const root = useWorkspace.getState().root
  const relative = document?.path && root && publication ? relativePath(root, document.path) : null
  if (publication && relative && publication.chapters.includes(relative.replace(/\\/g, '/'))) {
    // A chapter is checked against the whole publication, so references to other chapters work.
    const loaded = await loadPublicationBuild()
    for (const problem of loaded?.build.problems ?? []) {
      if (problem.file !== relative.replace(/\\/g, '/')) continue
      add(problem.line, problem.message, monaco.MarkerSeverity.Warning, problem.id)
    }
    return entries
  }
  const result = analyzePublishing(text, { ...publishing.options, cite: undefined })
  for (const problem of result.problems) {
    add(problem.line, problem.message, monaco.MarkerSeverity.Warning, problem.id)
  }
  const known = new Set(publishing.sources.map((s) => s.id))
  for (const cluster of result.clusters) {
    for (const item of cluster.items) {
      if (known.has(item.id)) continue
      add(
        cluster.line,
        `No source with the key "${item.id}". Add it under Manage Sources.`,
        monaco.MarkerSeverity.Warning,
        item.id
      )
    }
  }
  return entries
}

// --- Orchestration ---------------------------------------------------------------------------------

async function validate(editor: Editor): Promise<void> {
  const model = editor.getModel()
  if (!model || model.isDisposed()) return
  const version = model.getVersionId()
  const { diagnostics } = useSettings.getState().settings.markdown
  const current = () => !model.isDisposed() && model.getVersionId() === version

  if (diagnostics.tables) setMarkers(model, TABLE_OWNER, tableMarkers(model))
  else clear(model, TABLE_OWNER)

  const jobs: Promise<void>[] = []
  if (diagnostics.links) {
    jobs.push(
      validateLinks(model).then(
        (problems) => {
          if (current()) setMarkers(model, LINK_OWNER, linkMarkers(problems))
        },
        () => undefined
      )
    )
  } else {
    clear(model, LINK_OWNER)
  }

  if (diagnostics.links) {
    jobs.push(
      publishingMarkers(model).then(
        (entries) => {
          if (current()) setMarkers(model, PUBLISHING_OWNER, entries)
        },
        () => undefined
      )
    )
  } else {
    clear(model, PUBLISHING_OWNER)
  }

  const { math, diagrams } = usePresentation.getState().effective
  if (math) setMarkers(model, RENDER_OWNER, mathMarkers(model))
  else clear(model, RENDER_OWNER)
  if (diagrams) {
    jobs.push(
      diagramMarkers(model).then(
        (entries) => {
          if (!current()) return
          const keep = monaco.editor
            .getModelMarkers({ resource: model.uri, owner: RENDER_OWNER })
            .filter((m) => m.code === 'math')
            .map((marker) => ({ marker }))
          setMarkers(model, RENDER_OWNER, [...keep, ...entries])
        },
        () => undefined
      )
    )
  }

  if (diagnostics.lint && model.getValueLength() <= MAX_LINT_CHARACTERS) {
    setMarkers(model, SPACES_OWNER, spaceMarkers(model))
    jobs.push(
      lintText(model.getValue(), buildLintConfig(diagnostics.disabledRules)).then(
        (issues) => {
          if (current()) setMarkers(model, LINT_OWNER, lintMarkers(model, issues))
        },
        (error) => console.warn('Style checks are unavailable:', error) // keep the previous markers
      )
    )
  } else {
    clear(model, LINT_OWNER)
    clear(model, SPACES_OWNER)
  }
  await Promise.all(jobs)
}

/**
 * Keeps the active document's problem markers current: shortly after typing stops, when the
 * document or the workspace changes, and when the diagnostics settings change.
 */
export function installDiagnostics(editor: Editor): monaco.IDisposable {
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void validate(editor)
    }, delay)
  }

  const disposables: monaco.IDisposable[] = [
    editor.onDidChangeModel(() => schedule(0)),
    editor.onDidChangeModelContent(() =>
      schedule(adaptiveDelay(TYPING_DELAY_MS, editor.getModel()?.getValueLength() ?? 0))
    )
  ]
  const unsubscribeSettings = useSettings.subscribe((state, previous) => {
    if (state.settings.markdown.diagnostics !== previous.settings.markdown.diagnostics) schedule(0)
  })
  // A different theme, or switching math or diagrams, changes what can be rendered.
  const unsubscribePresentation = usePresentation.subscribe((state, previous) => {
    if (
      state.effective.math !== previous.effective.math ||
      state.effective.diagrams !== previous.effective.diagrams ||
      state.effective.theme !== previous.effective.theme
    ) {
      schedule(100)
    }
  })
  // Renamed or saved documents and changed files can fix or break links without any typing.
  const unsubscribeDocuments = useDocuments.subscribe((state, previous) => {
    const path = (s: typeof state) => s.documents.find((d) => d.id === s.activeId)?.path
    if (path(state) !== path(previous)) schedule(200)
  })
  const offWorkspace = api.workspace.onChanged(() => schedule(800))

  schedule(0)
  return {
    dispose() {
      if (timer) clearTimeout(timer)
      disposables.forEach((d) => d.dispose())
      unsubscribeSettings()
      unsubscribePresentation()
      unsubscribeDocuments()
      offWorkspace()
    }
  }
}

let providerRegistration: monaco.IDisposable | null = null

/**
 * "Format this block" offered at the cursor (table, heading, list or paragraph), only when the
 * block actually has something to tidy, so it never shows up as noise on tidy text.
 */
function blockActions(
  model: monaco.editor.ITextModel,
  range: monaco.Range
): monaco.languages.CodeAction[] {
  if (model.getValueLength() > MAX_LINT_CHARACTERS) return []
  const format = blockFormatAt(model, range.startLineNumber - 1)
  if (!format) return []
  return [
    {
      title: blockActionTitle(format),
      kind: 'refactor.rewrite',
      edit: {
        edits: [
          {
            resource: model.uri,
            versionId: model.getVersionId(),
            textEdit: lineEditToTextEdit(model, format)
          }
        ]
      }
    }
  ]
}

/** Quick fixes (Ctrl+.) for the corrections stored with the markers. */
export function registerQuickFixes(): monaco.IDisposable {
  providerRegistration?.dispose()
  providerRegistration = monaco.languages.registerCodeActionProvider('markdown', {
    provideCodeActions(model, range, context) {
      const table = fixes.get(model)
      const actions: monaco.languages.CodeAction[] = []
      for (const marker of context.markers) {
        const code = typeof marker.code === 'object' ? marker.code.value : marker.code
        const fix = table?.get(markerKey(String(code), marker))
        if (!fix) continue
        actions.push({
          title: fix.title,
          kind: 'quickfix',
          diagnostics: [marker],
          isPreferred: true,
          edit: {
            edits: [
              {
                resource: model.uri,
                versionId: model.getVersionId(),
                textEdit: fix.edit
              }
            ]
          }
        })
      }
      actions.push(...blockActions(model, range))
      return { actions, dispose() {} }
    }
  })
  return providerRegistration
}

/** Applies every automatic style correction in the active document as one undoable edit. */
export async function fixAllProblems(): Promise<void> {
  const editor = getActiveEditor()
  const model = editor?.getModel()
  if (!editor || !model) return void notify('info', 'Open a Markdown document first.')
  const { diagnostics } = useSettings.getState().settings.markdown
  if (model.getValueLength() > MAX_LINT_CHARACTERS) {
    return void notify('info', 'This document is too large for automatic fixes.')
  }
  const config = buildLintConfig(diagnostics.disabledRules)
  const original = model.getValue()
  let fixed: string
  try {
    fixed = await fixAllText(original, (text) => lintText(text, config))
  } catch {
    return void notify('error', 'The style checker is not available.')
  }
  if (fixed === original || model.getValue() !== original) {
    notify(
      'info',
      fixed === original
        ? 'There is nothing to fix automatically.'
        : 'The document changed; try again.'
    )
    return
  }
  // Replace only the span that differs, so unrelated text and its decorations stay untouched.
  let head = 0
  while (head < original.length && original[head] === fixed[head]) head++
  let tail = 0
  while (
    tail < original.length - head &&
    tail < fixed.length - head &&
    original[original.length - 1 - tail] === fixed[fixed.length - 1 - tail]
  ) {
    tail++
  }
  const start = model.getPositionAt(head)
  const end = model.getPositionAt(original.length - tail)
  editor.pushUndoStop()
  editor.executeEdits('markdown-studio', [
    {
      range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
      text: fixed.slice(head, fixed.length - tail)
    }
  ])
  editor.pushUndoStop()
  editor.focus()
  notify('success', 'Style problems fixed.')
}
