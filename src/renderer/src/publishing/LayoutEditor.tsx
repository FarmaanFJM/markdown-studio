import { useId } from 'react'
import {
  PAGE_SIZES,
  PLACEHOLDERS,
  type Align,
  type Orientation,
  type PageSize
} from '@shared/export/pdf'
import { BUILTIN_THEMES, THEME_IDS, type ThemeId } from '@shared/presentation/theme'
import { COLUMN_LIMITS, type DocumentHeaderFooter } from '@shared/publishing/documentSettings'
import type { PublicationLayout } from '@shared/publishing/project'
import { Field, NumberInput, SelectInput } from '../presentation/fields'

const SIZE_LABELS: Record<PageSize, string> = {
  A4: 'A4 (210 × 297 mm)',
  A5: 'A5 (148 × 210 mm)',
  Letter: 'US Letter',
  Legal: 'US Legal',
  Custom: 'Custom size'
}

const DEFAULT_MARGINS = { top: 20, right: 20, bottom: 20, left: 20 }

type HeaderMode = 'inherit' | 'off' | 'custom'

function modeOf(value: DocumentHeaderFooter | undefined): HeaderMode {
  if (!value) return 'inherit'
  return value.enabled === false ? 'off' : 'custom'
}

const FOOTER_PRESETS: { value: string; label: string }[] = [
  { value: 'Page {page} of {pages}', label: 'Page 3 of 12' },
  { value: '{page}', label: '3' },
  { value: '{title} — {page}', label: 'Title — 3' }
]

function HeaderFooterEditor({
  kind,
  value,
  onChange
}: {
  kind: 'header' | 'footer'
  value: DocumentHeaderFooter | undefined
  onChange(next: DocumentHeaderFooter | undefined): void
}) {
  const uid = useId()
  const mode = modeOf(value)
  const label = kind === 'header' ? 'Header' : 'Footer'
  const defaultText = kind === 'header' ? '{title}' : 'Page {page} of {pages}'
  return (
    <fieldset className="layout-group">
      <legend>{label}</legend>
      <Field label={`${label} text`} htmlFor={`${uid}-mode`}>
        <SelectInput<HeaderMode>
          id={`${uid}-mode`}
          testId={`layout-${kind}-mode`}
          value={mode}
          options={[
            { value: 'inherit', label: 'Use the export preset' },
            { value: 'off', label: 'None' },
            { value: 'custom', label: 'Custom text' }
          ]}
          onChange={(next) => {
            if (next === 'inherit') onChange(undefined)
            else if (next === 'off') onChange({ enabled: false })
            else onChange({ enabled: true, text: value?.text ?? defaultText, align: value?.align })
          }}
        />
      </Field>
      {mode === 'custom' && (
        <>
          {kind === 'footer' && (
            <Field label="Page numbers" htmlFor={`${uid}-numbers`}>
              <SelectInput
                id={`${uid}-numbers`}
                testId="layout-footer-numbers"
                value={FOOTER_PRESETS.some((p) => p.value === value?.text) ? value!.text! : ''}
                options={[{ value: '', label: 'Custom text below' }, ...FOOTER_PRESETS]}
                onChange={(text) => text && onChange({ ...value, enabled: true, text })}
              />
            </Field>
          )}
          <Field
            label="Text"
            htmlFor={`${uid}-text`}
            hint={`Placeholders: ${Object.keys(PLACEHOLDERS)
              .map((p) => `{${p}}`)
              .join(' ')}`}
          >
            <input
              id={`${uid}-text`}
              className="text-input"
              data-testid={`layout-${kind}-text`}
              value={value?.text ?? ''}
              maxLength={200}
              onChange={(e) => onChange({ ...value, enabled: true, text: e.target.value })}
            />
          </Field>
          <Field label="Alignment" htmlFor={`${uid}-align`}>
            <SelectInput<Align>
              id={`${uid}-align`}
              value={value?.align ?? (kind === 'footer' ? 'center' : 'left')}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Centre' },
                { value: 'right', label: 'Right' }
              ]}
              onChange={(align) => onChange({ ...value, enabled: true, align })}
            />
          </Field>
        </>
      )}
    </fieldset>
  )
}

/**
 * Theme, columns, page and header/footer choices. The same editor serves a document (stored in
 * its front matter) and a publication (stored with the project), so both accept the same values.
 */
export function LayoutEditor({
  value,
  onChange
}: {
  value: PublicationLayout
  onChange(next: PublicationLayout): void
}) {
  const uid = useId()
  const set = (patch: Partial<PublicationLayout>) => {
    const next: PublicationLayout = { ...value, ...patch }
    for (const key of Object.keys(next) as (keyof PublicationLayout)[]) {
      if (next[key] === undefined) delete next[key]
    }
    onChange(next)
  }
  const columns = value.columns?.count === 2 ? 2 : 1
  const page = value.page
  const margins = { ...DEFAULT_MARGINS, ...(page?.margins ?? {}) }
  const setPage = (patch: Partial<NonNullable<typeof page>>) =>
    set({
      page: { pageSize: 'A4', orientation: 'portrait', margins: DEFAULT_MARGINS, ...page, ...patch }
    })

  return (
    <div className="layout-editor" data-testid="layout-editor">
      <fieldset className="layout-group">
        <legend>Appearance</legend>
        <Field
          label="Theme"
          htmlFor={`${uid}-theme`}
          hint="Overrides the theme from Settings for this document or publication."
        >
          <SelectInput<ThemeId | ''>
            id={`${uid}-theme`}
            testId="layout-theme"
            value={value.theme ?? ''}
            options={[
              { value: '', label: 'Use the theme from Settings' },
              ...THEME_IDS.map((id) => ({ value: id, label: BUILTIN_THEMES[id].name }))
            ]}
            onChange={(theme) => set({ theme: theme === '' ? undefined : theme })}
          />
        </Field>
      </fieldset>

      <fieldset className="layout-group">
        <legend>Columns</legend>
        <Field
          label="Text columns"
          htmlFor={`${uid}-columns`}
          hint="Applies to the whole document. Headings, contents and items marked {.full-width} span both columns."
        >
          <SelectInput<'1' | '2'>
            id={`${uid}-columns`}
            testId="layout-columns"
            value={String(columns) as '1' | '2'}
            options={[
              { value: '1', label: 'One column' },
              { value: '2', label: 'Two columns' }
            ]}
            onChange={(count) =>
              set({
                columns:
                  count === '2'
                    ? { count: 2, gapMm: value.columns?.gapMm ?? COLUMN_LIMITS.defaultGapMm }
                    : undefined
              })
            }
          />
        </Field>
        {columns === 2 && (
          <Field label="Gap between columns" htmlFor={`${uid}-gap`}>
            <NumberInput
              id={`${uid}-gap`}
              testId="layout-column-gap"
              value={value.columns?.gapMm ?? COLUMN_LIMITS.defaultGapMm}
              min={COLUMN_LIMITS.gapMm.min}
              max={COLUMN_LIMITS.gapMm.max}
              suffix="mm"
              onChange={(gapMm) => set({ columns: { count: 2, gapMm } })}
            />
          </Field>
        )}
      </fieldset>

      <fieldset className="layout-group">
        <legend>Page</legend>
        <Field
          label="Page size"
          htmlFor={`${uid}-size`}
          hint="Choose “Use the export preset” to leave size and margins to the export settings."
        >
          <SelectInput<PageSize | ''>
            id={`${uid}-size`}
            testId="layout-page-size"
            value={page?.pageSize ?? ''}
            options={[
              { value: '', label: 'Use the export preset' },
              ...PAGE_SIZES.map((size) => ({ value: size, label: SIZE_LABELS[size] }))
            ]}
            onChange={(size) =>
              size === '' ? set({ page: undefined }) : setPage({ pageSize: size })
            }
          />
        </Field>
        {page && (
          <>
            <Field label="Orientation" htmlFor={`${uid}-orientation`}>
              <SelectInput<Orientation>
                id={`${uid}-orientation`}
                testId="layout-page-orientation"
                value={page.orientation ?? 'portrait'}
                options={[
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' }
                ]}
                onChange={(orientation) => setPage({ orientation })}
              />
            </Field>
            {page.pageSize === 'Custom' && (
              <div className="layout-margins">
                <Field label="Width" htmlFor={`${uid}-width`}>
                  <NumberInput
                    id={`${uid}-width`}
                    value={page.customWidthMm ?? 210}
                    min={50}
                    max={1200}
                    suffix="mm"
                    onChange={(customWidthMm) => setPage({ customWidthMm })}
                  />
                </Field>
                <Field label="Height" htmlFor={`${uid}-height`}>
                  <NumberInput
                    id={`${uid}-height`}
                    value={page.customHeightMm ?? 297}
                    min={50}
                    max={1200}
                    suffix="mm"
                    onChange={(customHeightMm) => setPage({ customHeightMm })}
                  />
                </Field>
              </div>
            )}
            <div className="layout-margins">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <Field
                  key={side}
                  label={`${side[0].toUpperCase()}${side.slice(1)} margin`}
                  htmlFor={`${uid}-m-${side}`}
                >
                  <NumberInput
                    id={`${uid}-m-${side}`}
                    testId={`layout-margin-${side}`}
                    value={margins[side]}
                    min={0}
                    max={100}
                    suffix="mm"
                    onChange={(n) => setPage({ margins: { ...margins, [side]: n } })}
                  />
                </Field>
              ))}
            </div>
          </>
        )}
      </fieldset>

      <HeaderFooterEditor
        kind="header"
        value={value.header}
        onChange={(header) => set({ header })}
      />
      <HeaderFooterEditor
        kind="footer"
        value={value.footer}
        onChange={(footer) => set({ footer })}
      />
    </div>
  )
}
