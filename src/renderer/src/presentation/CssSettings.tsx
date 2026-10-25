import { useEffect, useId, useRef, useState } from 'react'
import { formatCssProblem } from '@shared/presentation/css'
import type { CssSource, CustomCssSetting } from '@shared/presentation/settings'
import { api, errorMessage } from '../bridge'
import { dialogs, notify } from '../state/ui'
import type { CssResult } from './customCss'

const SOURCES: { value: CssSource; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'inline', label: 'Write CSS here' },
  { value: 'file', label: 'Use a CSS file' }
]

/** Problems of rejected CSS, listed with their position. */
export function CssProblems({ result }: { result: CssResult }) {
  if (result.status === 'ok') {
    return (
      <p className="css-status ok" role="status" data-testid="css-status">
        Custom CSS is valid and applied to documents only (never to the application).
      </p>
    )
  }
  if (result.status !== 'error') return null
  return (
    <div className="css-status error" role="alert" data-testid="css-status">
      <strong>This CSS was rejected and is not applied.</strong>
      {result.message && <p>{result.message}</p>}
      {result.problems.length > 0 && (
        <ul data-testid="css-problems">
          {result.problems.slice(0, 8).map((problem, index) => (
            <li key={index}>{formatCssProblem(problem)}</li>
          ))}
          {result.problems.length > 8 && <li>…and {result.problems.length - 8} more.</li>}
        </ul>
      )}
    </div>
  )
}

/**
 * Chooses and edits the custom document CSS. It is the third layer on top of the built-in theme
 * and works on documents only. CSS typed here is kept even while it is rejected, so no edit is
 * ever lost; it is applied only once it passes validation.
 */
export function CssSettings({
  value,
  onChange,
  result,
  scope,
  idPrefix,
  allowInherit
}: {
  value: CustomCssSetting
  onChange(next: CustomCssSetting): void
  result: CssResult
  scope: 'global' | 'workspace'
  idPrefix: string
  allowInherit?: boolean
}) {
  const uid = useId()
  const [draft, setDraft] = useState(value.text)
  // "Use a CSS file" is shown as soon as it is chosen, before a file has been picked.
  const [pendingFile, setPendingFile] = useState(false)
  const source: CssSource = pendingFile && value.source === 'none' ? 'file' : value.source
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(value)
  latest.current = value
  useEffect(() => setDraft(value.text), [value.text])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const commitText = (text: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (text !== latest.current.text) onChange({ ...latest.current, text })
  }

  const pick = async () => {
    try {
      const file = await api.presentation.pickCss(scope)
      if (file) {
        setPendingFile(false)
        onChange({ ...value, source: 'file', path: file.path })
      }
    } catch (error) {
      notify('error', errorMessage(error))
    }
  }

  const copyIntoEditor = async () => {
    if (!value.path) return
    if (value.text.trim() !== '') {
      const ok = await dialogs.confirm({
        title: 'Replace the written CSS?',
        message: 'The CSS in the editor will be replaced by the contents of the file.',
        confirmLabel: 'Replace',
        danger: true
      })
      if (!ok) return
    }
    try {
      const file = await api.presentation.readCss(value.path)
      onChange({ ...value, source: 'inline', text: file.text })
    } catch (error) {
      notify('error', errorMessage(error))
    }
  }

  return (
    <div className="css-settings" data-testid={`${idPrefix}-css`}>
      <div className="segmented" role="radiogroup" aria-label="Custom CSS source">
        {SOURCES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={source === option.value}
            className={source === option.value ? 'active' : ''}
            data-testid={`${idPrefix}-css-${option.value}`}
            onClick={() => {
              if (option.value === 'file' && !value.path) {
                setPendingFile(true)
                if (value.source !== 'none') onChange({ ...value, source: 'none' })
                return
              }
              setPendingFile(false)
              onChange({ ...value, source: option.value })
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {allowInherit && (
        <p className="setting-hint">
          Settings and workspace CSS are used unless you choose another source.
        </p>
      )}
      {source === 'inline' && (
        <div className="stacked">
          <label htmlFor={`${idPrefix}-css-text-${uid}`} className="visually-hidden">
            Custom CSS
          </label>
          <textarea
            id={`${idPrefix}-css-text-${uid}`}
            className="css-editor"
            spellCheck={false}
            rows={9}
            placeholder={
              '/* Applies to rendered documents only */\nh1 { letter-spacing: 0.02em; }\nblockquote { border-color: #0a7d5a; }'
            }
            value={draft}
            data-testid={`${idPrefix}-css-text`}
            onChange={(e) => {
              setDraft(e.target.value)
              if (timer.current) clearTimeout(timer.current)
              const text = e.target.value
              timer.current = setTimeout(() => commitText(text), 450)
            }}
            onBlur={() => commitText(draft)}
          />
        </div>
      )}
      {source === 'file' && (
        <div className="css-file">
          <code className="css-path" data-testid={`${idPrefix}-css-path`} title={value.path ?? ''}>
            {value.path ?? 'No file chosen'}
          </code>
          <div className="button-row">
            <button
              type="button"
              className="button"
              data-testid={`${idPrefix}-css-choose`}
              onClick={() => void pick()}
            >
              Choose CSS File…
            </button>
            {value.path && (
              <button type="button" className="button" onClick={() => void copyIntoEditor()}>
                Copy into editor
              </button>
            )}
          </div>
          <p className="setting-hint">
            The file is read, never modified. Changes made in another program are picked up when
            this window is focused again.
          </p>
        </div>
      )}
      <CssProblems result={result} />
    </div>
  )
}
