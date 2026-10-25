import { buildTocBlock, findTocRegion, TOC_END, TOC_START } from '@shared/markdown/toc'
import { escapeSnippetText } from '@shared/markdown/snippets'
import { requireEditor } from '../editor/markdown/commands'
import { insertSnippetText } from '../editor/markdown/insert'
import { analysisFor } from '../editor/markdown/model'
import { monaco } from '../editor/monaco'
import { useSettings } from '../state/settings'
import { notify } from '../state/ui'

const SOURCE = 'markdown-studio'

function tocOptions() {
  const { includeTopLevel, maxDepth } = useSettings.getState().settings.markdown.toc
  return { includeTopLevel, maxDepth }
}

/**
 * Regenerates the managed table of contents (the lines between the start and end markers) and
 * leaves every other line of the document exactly as it was.
 */
export function updateTableOfContents(options: { quiet?: boolean } = {}): boolean {
  const editor = requireEditor()
  if (!editor) return false
  const model = editor.getModel()!
  const analysis = analysisFor(model)
  const region = findTocRegion(analysis)

  if (region === 'broken') {
    notify('error', `Found ${TOC_START} but no ${TOC_END}. Add the end marker, then update again.`)
    return false
  }
  if (!region) {
    notify(
      'info',
      'This document has no generated table of contents. Use "Insert Table of Contents".'
    )
    return false
  }

  const block = buildTocBlock(analysis, tocOptions(), region)
  const current = analysis.lines.slice(region.start, region.end + 1)
  if (block.length === current.length && block.every((line, i) => line === current[i])) {
    if (!options.quiet) notify('info', 'The table of contents is already up to date.')
    return true
  }
  editor.pushUndoStop()
  editor.executeEdits(SOURCE, [
    {
      range: new monaco.Range(
        region.start + 1,
        1,
        region.end + 1,
        model.getLineMaxColumn(region.end + 1)
      ),
      text: block.join(model.getEOL())
    }
  ])
  editor.pushUndoStop()
  editor.focus()
  if (!options.quiet) notify('success', 'Table of contents updated.')
  return true
}

/** Inserts a table of contents at the cursor, or refreshes the one the document already has. */
export function insertTableOfContents(): void {
  const editor = requireEditor()
  if (!editor) return
  const analysis = analysisFor(editor.getModel()!)
  const region = findTocRegion(analysis)
  if (region) {
    updateTableOfContents()
    return
  }
  insertSnippetText(editor, escapeSnippetText(buildTocBlock(analysis, tocOptions()).join('\n')), {
    block: true
  })
}
