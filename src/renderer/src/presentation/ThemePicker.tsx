import { BUILTIN_THEMES, resolveTheme, THEME_IDS, type ThemeId } from '@shared/presentation/theme'

/** A grid of the document themes, each drawn in its own typography so they can be compared. */
export function ThemePicker({
  value,
  onChange,
  name,
  allowInherit,
  inheritLabel
}: {
  value: ThemeId | 'inherit'
  onChange(value: ThemeId | 'inherit'): void
  name: string
  allowInherit?: boolean
  inheritLabel?: string
}) {
  return (
    <div className="theme-picker" role="radiogroup" aria-label="Document theme">
      {allowInherit && (
        <label className={`theme-card inherit${value === 'inherit' ? ' selected' : ''}`}>
          <input
            type="radio"
            name={name}
            checked={value === 'inherit'}
            onChange={() => onChange('inherit')}
            data-testid="theme-inherit"
          />
          <span className="theme-card-name">{inheritLabel ?? 'Document theme'}</span>
          <span className="theme-card-desc">Use the theme chosen in Settings.</span>
        </label>
      )}
      {THEME_IDS.map((id) => {
        const info = BUILTIN_THEMES[id]
        const theme = resolveTheme(id)
        return (
          <label
            key={id}
            className={`theme-card${value === id ? ' selected' : ''}`}
            data-testid={`theme-card-${id}`}
          >
            <input
              type="radio"
              name={name}
              checked={value === id}
              onChange={() => onChange(id)}
              data-testid={`theme-${id}`}
            />
            <span
              className="theme-sample"
              aria-hidden="true"
              style={{
                background: theme.background,
                color: theme.text,
                fontFamily: theme.bodyFont,
                borderColor: theme.accent
              }}
            >
              <span
                className="theme-sample-title"
                style={{ color: theme.heading, fontFamily: theme.headingFont }}
              >
                Aa
              </span>
              <span className="theme-sample-line" style={{ background: theme.text }} />
              <span className="theme-sample-line short" style={{ background: theme.text }} />
              <span className="theme-sample-accent" style={{ background: theme.accent }} />
            </span>
            <span className="theme-card-name">{info.name}</span>
            <span className="theme-card-desc">{info.description}</span>
          </label>
        )
      })}
    </div>
  )
}
