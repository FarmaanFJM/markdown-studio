import { validateCustomCss, type CssProblem } from '@shared/presentation/css'
import type { CustomCssSetting } from '@shared/presentation/settings'
import { api, errorMessage } from '../bridge'

export interface CssResult {
  status: 'none' | 'ok' | 'error'
  /** The validated, normalised CSS that is applied (empty unless `status` is `ok`). */
  css: string
  problems: CssProblem[]
  /** Why a file could not be read. */
  message?: string
  path?: string
  mtimeMs?: number
}

export const NO_CSS: CssResult = { status: 'none', css: '', problems: [] }

/**
 * Turns a custom-CSS setting into CSS that may be applied. Inline text is validated directly,
 * files are read through the main process (which decides whether this file may be read) and
 * then validated. Rejected CSS is never applied; the problems are returned for display.
 */
export async function resolveCustomCss(setting: CustomCssSetting): Promise<CssResult> {
  if (setting.source === 'none') return NO_CSS
  let text = setting.text
  let path: string | undefined
  let mtimeMs: number | undefined
  if (setting.source === 'file') {
    if (!setting.path) return NO_CSS
    try {
      const file = await api.presentation.readCss(setting.path)
      text = file.text
      path = file.path
      mtimeMs = file.mtimeMs
    } catch (error) {
      return {
        status: 'error',
        css: '',
        problems: [],
        message: errorMessage(error),
        path: setting.path
      }
    }
  }
  if (text.trim() === '') return { ...NO_CSS, path, mtimeMs }
  const checked = validateCustomCss(text)
  return checked.ok
    ? { status: 'ok', css: checked.css, problems: [], path, mtimeMs }
    : { status: 'error', css: '', problems: checked.problems, path, mtimeMs }
}
