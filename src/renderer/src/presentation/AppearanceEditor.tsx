import { useId } from 'react'
import {
  BUILTIN_THEMES,
  CODE_STYLES,
  CUSTOMIZATION_LIMITS,
  FONT_LABELS,
  FONT_STACKS,
  QUOTE_STYLES,
  resolveTheme,
  TABLE_STYLES,
  type FontKey,
  type ThemeCustomization,
  type ThemeId
} from '@shared/presentation/theme'
import { ColorInput, Field, NumberInput, SelectInput } from './fields'

const FONT_OPTIONS = [
  { value: '', label: "Theme's own font" },
  ...(Object.keys(FONT_STACKS) as FontKey[]).map((key) => ({
    value: key,
    label: FONT_LABELS[key]
  })),
  { value: 'custom', label: 'Custom family…' }
]

function FontField({
  id,
  label,
  value,
  onChange
}: {
  id: string
  label: string
  value: string | undefined
  onChange(value: string | undefined): void
}) {
  const custom = value?.startsWith('custom:') ?? false
  const selected = custom ? 'custom' : (value ?? '')
  return (
    <Field label={label} htmlFor={id}>
      <SelectInput
        id={id}
        value={selected}
        options={FONT_OPTIONS}
        testId={id}
        onChange={(next) => {
          if (next === '') onChange(undefined)
          else if (next === 'custom') onChange('custom:')
          else onChange(next)
        }}
      />
      {custom && (
        <input
          className="text-input"
          aria-label={`${label}: family name`}
          placeholder="Installed font family, for example Inter"
          value={value!.slice(7)}
          spellCheck={false}
          maxLength={48}
          onChange={(e) => onChange(`custom:${e.target.value}`)}
        />
      )}
    </Field>
  )
}

function optionList<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({ value, label: labels[value] }))
}

const TABLE_LABELS = {
  rows: 'Horizontal rules',
  grid: 'Full grid',
  banded: 'Banded with header colour',
  minimal: 'Minimal (top and bottom rules)'
} as const
const CODE_LABELS = {
  light: 'Light with border',
  tinted: 'Tinted background',
  dark: 'Dark'
} as const
const QUOTE_LABELS = {
  bar: 'Side bar',
  quote: 'Large quotation mark',
  boxed: 'Boxed callout',
  indent: 'Indented italic'
} as const

/**
 * Controls for every customisable property of a document theme. Unset values show the theme's
 * own value as placeholder, so what you see is always what the document will use.
 */
export function AppearanceEditor({
  themeId,
  value,
  onChange,
  idPrefix
}: {
  themeId: ThemeId
  value: ThemeCustomization
  onChange(next: ThemeCustomization): void
  idPrefix: string
}) {
  const uid = useId()
  const base = resolveTheme(themeId)
  const effective = resolveTheme(themeId, value)
  const L = CUSTOMIZATION_LIMITS
  const set = <K extends keyof ThemeCustomization>(
    key: K,
    v: ThemeCustomization[K] | undefined
  ) => {
    const next = { ...value }
    if (v === undefined) delete next[key]
    else next[key] = v
    onChange(next)
  }
  const id = (name: string) => `${idPrefix}-${name}-${uid}`
  const hasOverrides = Object.keys(value).length > 0

  return (
    <div className="appearance-editor" data-testid={`${idPrefix}-appearance`}>
      <fieldset>
        <legend>Typography</legend>
        <FontField
          id={`${idPrefix}-bodyFont`}
          label="Body font"
          value={value.bodyFont}
          onChange={(v) => set('bodyFont', v)}
        />
        <Field label="Body font size" htmlFor={id('size')}>
          <NumberInput
            id={id('size')}
            value={value.bodyFontSize ?? base.bodyFontSize}
            min={L.bodyFontSize.min}
            max={L.bodyFontSize.max}
            decimals={1}
            suffix="px"
            onChange={(v) => set('bodyFontSize', v)}
          />
        </Field>
        <FontField
          id={`${idPrefix}-headingFont`}
          label="Heading font"
          value={value.headingFont}
          onChange={(v) => set('headingFont', v)}
        />
        <Field
          label="Heading scale"
          htmlFor={id('scale')}
          hint="Multiplies every heading size of the theme."
        >
          <NumberInput
            id={id('scale')}
            value={value.headingScale ?? 1}
            min={L.headingScale.min}
            max={L.headingScale.max}
            step={0.05}
            suffix="×"
            onChange={(v) => set('headingScale', v)}
          />
        </Field>
        <Field label="Line height" htmlFor={id('leading')}>
          <NumberInput
            id={id('leading')}
            value={value.lineHeight ?? base.lineHeight}
            min={L.lineHeight.min}
            max={L.lineHeight.max}
            step={0.05}
            onChange={(v) => set('lineHeight', v)}
          />
        </Field>
        <Field label="Paragraph spacing" htmlFor={id('para')}>
          <NumberInput
            id={id('para')}
            value={value.paragraphSpacing ?? base.paragraphSpacing}
            min={L.paragraphSpacing.min}
            max={L.paragraphSpacing.max}
            step={0.05}
            suffix="em"
            onChange={(v) => set('paragraphSpacing', v)}
          />
        </Field>
        <Field label="Content width" htmlFor={id('width')}>
          <NumberInput
            id={id('width')}
            value={value.contentWidth ?? base.contentWidth}
            min={L.contentWidth.min}
            max={L.contentWidth.max}
            step={10}
            decimals={0}
            suffix="px"
            onChange={(v) => set('contentWidth', v)}
          />
        </Field>
      </fieldset>
      <fieldset>
        <legend>Colours</legend>
        <Field label="Text (page foreground)" htmlFor={id('text')}>
          <ColorInput
            id={id('text')}
            label="Text colour"
            value={value.textColor}
            fallback={effective.text}
            onChange={(v) => set('textColor', v)}
            onClear={() => set('textColor', undefined)}
          />
        </Field>
        <Field label="Page background" htmlFor={id('bg')}>
          <ColorInput
            id={id('bg')}
            label="Page background"
            value={value.pageBackground}
            fallback={effective.background}
            onChange={(v) => set('pageBackground', v)}
            onClear={() => set('pageBackground', undefined)}
          />
        </Field>
        <Field label="Headings" htmlFor={id('heading')}>
          <ColorInput
            id={id('heading')}
            label="Heading colour"
            value={value.headingColor}
            fallback={effective.heading}
            onChange={(v) => set('headingColor', v)}
            onClear={() => set('headingColor', undefined)}
          />
        </Field>
        <Field label="Links" htmlFor={id('link')}>
          <ColorInput
            id={id('link')}
            label="Link colour"
            value={value.linkColor}
            fallback={effective.link}
            onChange={(v) => set('linkColor', v)}
            onClear={() => set('linkColor', undefined)}
          />
        </Field>
        <Field
          label="Accent"
          htmlFor={id('accent')}
          hint="Used for rules, quote bars, list markers and diagram outlines."
        >
          <ColorInput
            id={id('accent')}
            label="Accent colour"
            value={value.accentColor}
            fallback={effective.accent}
            onChange={(v) => set('accentColor', v)}
            onClear={() => set('accentColor', undefined)}
            testId={`${idPrefix}-accent`}
          />
        </Field>
      </fieldset>
      <fieldset>
        <legend>Blocks</legend>
        <Field label="Tables" htmlFor={id('table')}>
          <SelectInput
            id={id('table')}
            value={value.tableStyle ?? base.tableStyle}
            options={optionList(TABLE_STYLES, TABLE_LABELS)}
            onChange={(v) => set('tableStyle', v)}
          />
        </Field>
        <Field label="Code blocks" htmlFor={id('code')}>
          <SelectInput
            id={id('code')}
            value={value.codeStyle ?? base.codeStyle}
            options={optionList(CODE_STYLES, CODE_LABELS)}
            onChange={(v) => set('codeStyle', v)}
          />
        </Field>
        <Field label="Block quotes" htmlFor={id('quote')}>
          <SelectInput
            id={id('quote')}
            value={value.blockquoteStyle ?? base.quoteStyle}
            options={optionList(QUOTE_STYLES, QUOTE_LABELS)}
            onChange={(v) => set('blockquoteStyle', v)}
          />
        </Field>
      </fieldset>
      <div className="appearance-footer">
        <span className="setting-hint">
          Based on {BUILTIN_THEMES[themeId].name}.{' '}
          {hasOverrides ? `${Object.keys(value).length} customised.` : 'Nothing customised.'}
        </span>
        <button
          type="button"
          className="button"
          disabled={!hasOverrides}
          data-testid={`${idPrefix}-reset-appearance`}
          onClick={() => onChange({})}
        >
          Reset customisation
        </button>
      </div>
    </div>
  )
}
