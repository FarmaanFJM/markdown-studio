import { useEffect, useState } from 'react'
import { LINT_RULES } from '@shared/lint'
import { LIMITS, normalizeAssetDirectory } from '@shared/settings'
import { useSettings } from '../state/settings'

export function Toggle({
  id,
  checked,
  onChange
}: {
  id: string
  checked: boolean
  onChange(value: boolean): void
}) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="switch"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}

export function Row({
  label,
  htmlFor,
  hint,
  children
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="setting-row">
      <div className="setting-line">
        <label htmlFor={htmlFor}>{label}</label>
        <div className="setting-control">{children}</div>
      </div>
      {hint && <p className="setting-hint">{hint}</p>}
    </div>
  )
}

export function AssetDirectoryInput() {
  const stored = useSettings((s) => s.settings.assets.directory)
  const update = useSettings((s) => s.update)
  const [value, setValue] = useState(stored)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setValue(stored), [stored])

  const commit = () => {
    const normalized = normalizeAssetDirectory(value)
    if (!normalized) {
      setError('Use a relative folder inside the project, such as "assets" or "docs/images".')
      return
    }
    setError(null)
    setValue(normalized)
    if (normalized !== stored) update({ assets: { directory: normalized } })
  }

  return (
    <div className="stacked">
      <input
        id="setting-assets"
        className="text-input"
        value={value}
        spellCheck={false}
        aria-invalid={error !== null}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

export function AuthorInput() {
  const stored = useSettings((s) => s.settings.templates.author)
  const update = useSettings((s) => s.update)
  const [value, setValue] = useState(stored)
  useEffect(() => setValue(stored), [stored])
  const commit = () => {
    if (value.trim() !== stored) update({ templates: { author: value.trim() } })
  }
  return (
    <input
      id="setting-author"
      className="text-input"
      value={value}
      maxLength={LIMITS.authorLength}
      placeholder="Not set"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}

export function StyleRules() {
  const disabled = useSettings((s) => s.settings.markdown.diagnostics.disabledRules)
  const update = useSettings((s) => s.update)
  const toggle = (id: string, enabled: boolean) =>
    update({
      markdown: {
        diagnostics: {
          disabledRules: enabled ? disabled.filter((r) => r !== id) : [...disabled, id]
        }
      }
    })
  return (
    <details className="rule-list" data-testid="style-rules">
      <summary>
        Style rules ({LINT_RULES.length - disabled.length} of {LINT_RULES.length} on)
      </summary>
      <ul>
        {LINT_RULES.map((rule) => (
          <li key={rule.id}>
            <label>
              <input
                type="checkbox"
                checked={!disabled.includes(rule.id)}
                onChange={(e) => toggle(rule.id, e.target.checked)}
              />
              <span className="rule-id">{rule.id}</span> {rule.name}
            </label>
          </li>
        ))}
      </ul>
    </details>
  )
}
