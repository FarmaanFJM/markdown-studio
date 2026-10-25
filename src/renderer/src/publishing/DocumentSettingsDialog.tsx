import { useId, useState } from 'react'
import { splitFrontMatter } from '@shared/publishing/frontMatter'
import {
  readDocumentSettings,
  type DocumentSettingsData
} from '@shared/publishing/documentSettings'
import type { PublicationLayout } from '@shared/publishing/project'
import { Modal } from '../dialogs/Modal'
import { Field, SelectInput, Switch } from '../presentation/fields'
import { LayoutEditor } from './LayoutEditor'

export const LANGUAGES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' }
]

/** Editing dialog for the settings stored in a document's front matter. */
export function DocumentSettingsDialog({
  text,
  onDone
}: {
  text: string
  onDone(result: DocumentSettingsData | null): void
}) {
  const uid = useId()
  const fm = splitFrontMatter(text)
  const [settings, setSettings] = useState<DocumentSettingsData>(
    () => readDocumentSettings(fm.data).settings
  )
  const patch = (next: Partial<DocumentSettingsData>) => setSettings((s) => ({ ...s, ...next }))
  const layout: PublicationLayout = {
    theme: settings.theme,
    columns: settings.columns,
    page: settings.page,
    header: settings.header,
    footer: settings.footer
  }

  return (
    <Modal
      title="Document Settings"
      size="wide"
      className="publishing-modal"
      onCancel={() => onDone(null)}
      footer={
        <>
          <button type="button" className="button" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            data-testid="document-settings-apply"
            disabled={fm.error !== null}
            onClick={() => onDone(settings)}
          >
            Apply
          </button>
        </>
      }
    >
      <p className="setting-hint">
        These settings are saved at the top of this Markdown file (YAML front matter), so they
        travel with the document. Other Markdown tools ignore the Markdown Studio part.
      </p>
      {fm.error && (
        <p className="field-error" role="alert">
          The front matter of this file cannot be edited here: {fm.error} Fix it in the source
          first.
        </p>
      )}
      <fieldset className="layout-group">
        <legend>Document</legend>
        <Field label="Title" htmlFor={`${uid}-title`}>
          <input
            id={`${uid}-title`}
            className="text-input"
            data-testid="doc-title"
            data-autofocus
            value={settings.title ?? ''}
            onChange={(e) => patch({ title: e.target.value || undefined })}
          />
        </Field>
        <Field label="Author" htmlFor={`${uid}-author`}>
          <input
            id={`${uid}-author`}
            className="text-input"
            data-testid="doc-author"
            value={settings.author ?? ''}
            onChange={(e) => patch({ author: e.target.value || undefined })}
          />
        </Field>
        <Field label="Date" htmlFor={`${uid}-date`}>
          <input
            id={`${uid}-date`}
            className="text-input"
            data-testid="doc-date"
            value={settings.date ?? ''}
            placeholder="2026-10-28"
            onChange={(e) => patch({ date: e.target.value || undefined })}
          />
        </Field>
        <Field
          label="Language"
          htmlFor={`${uid}-lang`}
          hint="Sets caption words (Figure / Figuur) and citation terms."
        >
          <SelectInput
            id={`${uid}-lang`}
            testId="doc-lang"
            value={settings.lang ?? 'en'}
            options={LANGUAGES}
            onChange={(lang) => patch({ lang })}
          />
        </Field>
      </fieldset>
      <fieldset className="layout-group">
        <legend>Structure</legend>
        <Field
          label="Automatic table of contents"
          htmlFor={`${uid}-toc`}
          hint="Shown after the title. Place [TOC] in the text to choose another position."
        >
          <Switch
            id={`${uid}-toc`}
            checked={settings.toc?.enabled === true}
            onChange={(enabled) => patch({ toc: { enabled, depth: settings.toc?.depth ?? 3 } })}
          />
        </Field>
        {settings.toc?.enabled && (
          <Field label="Contents depth" htmlFor={`${uid}-depth`}>
            <SelectInput<'1' | '2' | '3' | '4' | '5' | '6'>
              id={`${uid}-depth`}
              testId="doc-toc-depth"
              value={String(settings.toc.depth) as '3'}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({
                value: String(n) as '1',
                label: `Headings up to level ${n}`
              }))}
              onChange={(depth) => patch({ toc: { enabled: true, depth: Number(depth) } })}
            />
          </Field>
        )}
        <Field
          label="Number sections"
          htmlFor={`${uid}-numbers`}
          hint="1, 1.1, 1.2 … in the preview and exports. {.unnumbered} skips a heading."
        >
          <Switch
            id={`${uid}-numbers`}
            checked={settings.numberSections === true}
            onChange={(numberSections) => patch({ numberSections })}
          />
        </Field>
      </fieldset>
      <LayoutEditor
        value={layout}
        onChange={(next) =>
          setSettings((s) => ({
            ...s,
            theme: next.theme,
            columns: next.columns,
            page: next.page,
            header: next.header,
            footer: next.footer
          }))
        }
      />
    </Modal>
  )
}
