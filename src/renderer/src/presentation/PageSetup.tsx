import { useId, useState } from 'react'
import {
  fromMillimetres,
  minimumHeaderFooterMargin,
  PAGE_LIMITS,
  pageSizeMm,
  PLACEHOLDERS,
  previewHeaderFooter,
  toMillimetres,
  validatePdfOptions,
  type Align,
  type HeaderFooter,
  type LengthUnit,
  type Orientation,
  type PageSize,
  type PdfOptions
} from '@shared/export/pdf'
import { ColorInput, Field, NumberInput, SelectInput, Switch } from './fields'

const SIZE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: 'A4', label: 'A4 (210 × 297 mm)' },
  { value: 'A5', label: 'A5 (148 × 210 mm)' },
  { value: 'Letter', label: 'US Letter (8.5 × 11 in)' },
  { value: 'Legal', label: 'US Legal (8.5 × 14 in)' },
  { value: 'Custom', label: 'Custom size…' }
]
const ALIGN_OPTIONS: { value: Align; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' }
]
const UNIT_OPTIONS: { value: LengthUnit; label: string }[] = [
  { value: 'mm', label: 'Millimetres' },
  { value: 'cm', label: 'Centimetres' },
  { value: 'in', label: 'Inches' }
]

function HeaderFooterFields({
  kind,
  value,
  onChange,
  idPrefix,
  marginNeeded,
  marginOk
}: {
  kind: 'header' | 'footer'
  value: HeaderFooter
  onChange(next: HeaderFooter): void
  idPrefix: string
  marginNeeded: number
  marginOk: boolean
}) {
  const uid = useId()
  const label = kind === 'header' ? 'Header' : 'Footer'
  const sample = previewHeaderFooter(
    value.text,
    { title: 'Document title', file: 'notes.md', date: '2026-10-25' },
    2,
    8
  )
  return (
    <fieldset className="header-footer" data-testid={`${idPrefix}-${kind}`}>
      <legend>{label}</legend>
      <div className="inline-row">
        <Switch
          id={`${idPrefix}-${kind}-on-${uid}`}
          checked={value.enabled}
          onChange={(enabled) => onChange({ ...value, enabled })}
        />
        <label htmlFor={`${idPrefix}-${kind}-on-${uid}`}>Show {label.toLowerCase()}</label>
      </div>
      {value.enabled && (
        <>
          <Field
            label={`${label} text`}
            htmlFor={`${idPrefix}-${kind}-text-${uid}`}
            hint={`Preview: ${sample}`}
          >
            <input
              id={`${idPrefix}-${kind}-text-${uid}`}
              className="text-input"
              value={value.text}
              maxLength={PAGE_LIMITS.textLength}
              data-testid={`${idPrefix}-${kind}-text`}
              spellCheck={false}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
            />
          </Field>
          <Field label="Alignment" htmlFor={`${idPrefix}-${kind}-align-${uid}`}>
            <SelectInput
              id={`${idPrefix}-${kind}-align-${uid}`}
              value={value.align}
              options={ALIGN_OPTIONS}
              onChange={(align) => onChange({ ...value, align })}
            />
          </Field>
          {!marginOk && (
            <p className="field-error" role="alert">
              The {kind === 'header' ? 'top' : 'bottom'} margin must be at least {marginNeeded} mm
              for a {kind}.
            </p>
          )}
        </>
      )}
    </fieldset>
  )
}

/**
 * Page setup for PDF output: size, orientation, margins, headers and footers and the less common
 * controls behind an expandable section. Values are stored in millimetres; the unit selector
 * only changes how margins are shown. Invalid combinations are explained next to the controls.
 */
export function PageSetup({
  value,
  onChange,
  idPrefix
}: {
  value: PdfOptions
  onChange(next: PdfOptions): void
  idPrefix: string
}) {
  const uid = useId()
  const [unit, setUnit] = useState<LengthUnit>('mm')
  const validation = validatePdfOptions(value)
  const errors = validation.ok ? [] : validation.errors
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message ?? null
  const page = pageSizeMm(value)
  const needed = minimumHeaderFooterMargin(value.headerFooterPt)
  const marginInput = (side: 'top' | 'right' | 'bottom' | 'left', label: string) => (
    <Field
      label={label}
      htmlFor={`${idPrefix}-margin-${side}-${uid}`}
      error={errorFor(`margins.${side}`)}
    >
      <NumberInput
        id={`${idPrefix}-margin-${side}-${uid}`}
        testId={`${idPrefix}-margin-${side}`}
        value={fromMillimetres(value.margins[side], unit)}
        min={0}
        max={fromMillimetres(PAGE_LIMITS.marginMm.max, unit)}
        step={unit === 'in' ? 0.05 : unit === 'cm' ? 0.1 : 1}
        decimals={unit === 'mm' ? 1 : 2}
        suffix={unit}
        invalid={errorFor(`margins.${side}`) !== null}
        onChange={(n) =>
          onChange({ ...value, margins: { ...value.margins, [side]: toMillimetres(n, unit) } })
        }
      />
    </Field>
  )

  return (
    <div className="page-setup" data-testid={`${idPrefix}-page-setup`}>
      <div className="two-column">
        <Field label="Page size" htmlFor={`${idPrefix}-size-${uid}`}>
          <SelectInput
            id={`${idPrefix}-size-${uid}`}
            testId={`${idPrefix}-size`}
            value={value.pageSize}
            options={SIZE_OPTIONS}
            onChange={(pageSize) => onChange({ ...value, pageSize })}
          />
        </Field>
        <Field label="Orientation" htmlFor={`${idPrefix}-orientation-${uid}`}>
          <SelectInput<Orientation>
            id={`${idPrefix}-orientation-${uid}`}
            testId={`${idPrefix}-orientation`}
            value={value.orientation}
            options={[
              { value: 'portrait', label: 'Portrait' },
              { value: 'landscape', label: 'Landscape' }
            ]}
            onChange={(orientation) => onChange({ ...value, orientation })}
          />
        </Field>
      </div>
      {value.pageSize === 'Custom' && (
        <div className="two-column">
          <Field label="Width" htmlFor={`${idPrefix}-cw-${uid}`} error={errorFor('customWidthMm')}>
            <NumberInput
              id={`${idPrefix}-cw-${uid}`}
              testId={`${idPrefix}-custom-width`}
              value={value.customWidthMm}
              min={PAGE_LIMITS.customMm.min}
              max={PAGE_LIMITS.customMm.max}
              suffix="mm"
              onChange={(customWidthMm) => onChange({ ...value, customWidthMm })}
            />
          </Field>
          <Field
            label="Height"
            htmlFor={`${idPrefix}-ch-${uid}`}
            error={errorFor('customHeightMm')}
          >
            <NumberInput
              id={`${idPrefix}-ch-${uid}`}
              testId={`${idPrefix}-custom-height`}
              value={value.customHeightMm}
              min={PAGE_LIMITS.customMm.min}
              max={PAGE_LIMITS.customMm.max}
              suffix="mm"
              onChange={(customHeightMm) => onChange({ ...value, customHeightMm })}
            />
          </Field>
        </div>
      )}
      <p className="setting-hint" data-testid={`${idPrefix}-page-dimensions`}>
        Page: {Math.round(page.width * 10) / 10} × {Math.round(page.height * 10) / 10} mm
      </p>

      <fieldset>
        <legend>Margins</legend>
        <Field label="Unit" htmlFor={`${idPrefix}-unit-${uid}`}>
          <SelectInput<LengthUnit>
            id={`${idPrefix}-unit-${uid}`}
            value={unit}
            options={UNIT_OPTIONS}
            onChange={setUnit}
          />
        </Field>
        <div className="two-column">
          {marginInput('top', 'Top')}
          {marginInput('bottom', 'Bottom')}
          {marginInput('left', 'Left')}
          {marginInput('right', 'Right')}
        </div>
      </fieldset>

      <HeaderFooterFields
        kind="header"
        idPrefix={idPrefix}
        value={value.header}
        onChange={(header) => onChange({ ...value, header })}
        marginNeeded={needed}
        marginOk={value.margins.top >= needed}
      />
      <HeaderFooterFields
        kind="footer"
        idPrefix={idPrefix}
        value={value.footer}
        onChange={(footer) => onChange({ ...value, footer })}
        marginNeeded={needed}
        marginOk={value.margins.bottom >= needed}
      />
      <p className="setting-hint">
        Placeholders:{' '}
        {(Object.keys(PLACEHOLDERS) as (keyof typeof PLACEHOLDERS)[])
          .map((k) => `{${k}}`)
          .join(' ')}
        . Use \&#123; for a literal brace.
      </p>

      <details className="advanced" data-testid={`${idPrefix}-advanced`}>
        <summary>More page options</summary>
        <Field
          label="Scale"
          htmlFor={`${idPrefix}-scale-${uid}`}
          error={errorFor('scale')}
          hint="Shrinks or enlarges the content on each page."
        >
          <NumberInput
            id={`${idPrefix}-scale-${uid}`}
            testId={`${idPrefix}-scale`}
            value={Math.round(value.scale * 100)}
            min={PAGE_LIMITS.scale.min * 100}
            max={PAGE_LIMITS.scale.max * 100}
            decimals={0}
            suffix="%"
            onChange={(n) => onChange({ ...value, scale: n / 100 })}
          />
        </Field>
        <Field label="Header and footer size" htmlFor={`${idPrefix}-hfpt-${uid}`}>
          <NumberInput
            id={`${idPrefix}-hfpt-${uid}`}
            value={value.headerFooterPt}
            min={PAGE_LIMITS.fontPt.min}
            max={PAGE_LIMITS.fontPt.max}
            decimals={0}
            suffix="pt"
            onChange={(headerFooterPt) => onChange({ ...value, headerFooterPt })}
          />
        </Field>
        <div className="inline-row">
          <Switch
            id={`${idPrefix}-bg-${uid}`}
            checked={value.printBackground}
            onChange={(printBackground) => onChange({ ...value, printBackground })}
          />
          <label htmlFor={`${idPrefix}-bg-${uid}`}>Print backgrounds and colours</label>
        </div>
        {value.printBackground && (
          <Field
            label="Page colour"
            htmlFor={`${idPrefix}-pagecolor-${uid}`}
            error={errorFor('backgroundColor')}
            hint="Leave empty to use the theme's page colour."
          >
            <ColorInput
              id={`${idPrefix}-pagecolor-${uid}`}
              label="Page colour"
              value={value.backgroundColor ?? undefined}
              fallback="#ffffff"
              onChange={(backgroundColor) => onChange({ ...value, backgroundColor })}
              onClear={() => onChange({ ...value, backgroundColor: null })}
            />
          </Field>
        )}
      </details>
      {errors.length > 0 && (
        <ul className="field-error-list" role="alert" data-testid={`${idPrefix}-errors`}>
          {errors.map((error) => (
            <li key={`${error.field}-${error.message}`}>{error.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
