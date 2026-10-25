import { lint } from 'markdownlint/sync'
import type { LintIssue } from '@shared/lint'

/**
 * Runs markdownlint away from the interface thread. Requests carry the document text and the
 * rule configuration; answers carry plain issue data.
 */
export interface LintRequest {
  id: number
  text: string
  config: Record<string, unknown>
}

export type LintResponse = { id: number; issues: LintIssue[] } | { id: number; failure: string }

self.onmessage = (event: MessageEvent<LintRequest>) => {
  const { id, text, config } = event.data
  try {
    const results = lint({ strings: { document: text }, config })
    const issues: LintIssue[] = results.document.map((result) => ({
      rule: result.ruleNames[0],
      alias: result.ruleNames[1] ?? result.ruleNames[0],
      description: result.ruleDescription,
      detail: result.errorDetail,
      line: result.lineNumber,
      range: result.errorRange ? [result.errorRange[0], result.errorRange[1]] : null,
      fix: result.fixInfo
        ? {
            lineNumber: result.fixInfo.lineNumber,
            editColumn: result.fixInfo.editColumn,
            deleteCount: result.fixInfo.deleteCount,
            insertText: result.fixInfo.insertText
          }
        : null
    }))
    ;(self as unknown as Worker).postMessage({ id, issues } satisfies LintResponse)
  } catch (error) {
    ;(self as unknown as Worker).postMessage({
      id,
      failure: error instanceof Error ? error.message : String(error)
    } satisfies LintResponse)
  }
}
