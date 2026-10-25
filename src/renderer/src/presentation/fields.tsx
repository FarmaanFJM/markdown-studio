import { useEffect, useId, useState, type ReactNode } from 'react'

/** A labelled form row used by the presentation and export forms. */
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor
}: {
  label: string
  hint?: string
  error?: string | null
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      <div className="field-control">{children}</div>
      {hint && !error && <p className="setting-hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function SelectInput<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
  testId
}: {
  id: string
  value: T
  options: { value: T; label: string }[]
  onChange(value: T): void
  disabled?: boolean
  testId?: string
}) {
  return (
    <select
      id={id}
      className="select"
      value={value}
      disabled={disabled}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/**
 * A number field that accepts typing freely and commits valid values on blur or Enter. Invalid
 * text is reported next to the field instead of being applied.
 */
export function NumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  decimals = 2,
  onChange,
  suffix,
  disabled,
  invalid,
  testId
}: {
  id: string
  value: number
  min: number
  max: number
  step?: number
  decimals?: number
  onChange(value: number): void
  suffix?: string
  disabled?: boolean
  invalid?: boolean
  testId?: string
}) {
  const format = (n: number) => String(Math.round(n * 10 ** decimals) / 10 ** decimals)
  const [text, setText] = useState(format(value))
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  useEffect(() => {
    setText(format(value))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = () => {
    const parsed = Number(text.replace(',', '.'))
    if (text.trim() === '' || !Number.isFinite(parsed)) {
      setError('Enter a number.')
      return
    }
    if (parsed < min || parsed > max) {
      setError(`Use a value between ${format(min)} and ${format(max)}.`)
      return
    }
    setError(null)
    if (parsed !== value) onChange(parsed)
  }

  return (
    <span className="num-field">
      <input
        id={id}
        className="text-input"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text}
        disabled={disabled}
        data-testid={testId}
        aria-invalid={invalid || error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {suffix && <span className="unit">{suffix}</span>}
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}

/** A colour field: native picker plus a hex box, with an optional "use the theme's colour". */
export function ColorInput({
  id,
  value,
  fallback,
  onChange,
  onClear,
  label,
  testId
}: {
  id: string
  value: string | undefined
  /** The colour shown when unset (the theme's own). */
  fallback: string
  onChange(value: string): void
  onClear?(): void
  label: string
  testId?: string
}) {
  const [text, setText] = useState(value ?? '')
  useEffect(() => setText(value ?? ''), [value])
  const valid = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)
  return (
    <span className="color-input">
      <input
        type="color"
        aria-label={`${label} picker`}
        value={value ?? fallback}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId ? `${testId}-picker` : undefined}
      />
      <input
        id={id}
        className="text-input hex"
        value={text}
        placeholder={fallback}
        spellCheck={false}
        maxLength={7}
        aria-invalid={text !== '' && !valid}
        data-testid={testId}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === '' && value !== undefined) onClear?.()
          else if (valid && text.toLowerCase() !== value) onChange(text)
          else if (!valid) setText(value ?? '')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      {value !== undefined && onClear && (
        <button type="button" className="link-button" onClick={onClear}>
          Use theme
        </button>
      )}
    </span>
  )
}

export function Switch({
  id,
  checked,
  onChange,
  disabled
}: {
  id: string
  checked: boolean
  onChange(value: boolean): void
  disabled?: boolean
}) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="switch"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}
