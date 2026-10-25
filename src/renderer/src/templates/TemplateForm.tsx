import { useState } from 'react'
import {
  TEMPLATE_LIMITS,
  TEMPLATE_VARIABLES,
  type StoredTemplate,
  type TemplateKind,
  type TemplateScope
} from '@shared/templates'

export interface TemplateDraft {
  id: string
  name: string
  description: string
  kind: TemplateKind
  body: string
  scope: TemplateScope
}

interface Props {
  draft: TemplateDraft
  /** Editing an existing template: its scope cannot change. */
  editing: boolean
  workspaceAvailable: boolean
  onSave(draft: TemplateDraft): void
  onCancel(): void
}

export function draftFrom(template: Partial<StoredTemplate>, scope: TemplateScope): TemplateDraft {
  return {
    id: template.id ?? '',
    name: template.name ?? '',
    description: template.description ?? '',
    kind: template.kind ?? 'document',
    body: template.body ?? '',
    scope
  }
}

/** The form for creating or editing a template or snippet. */
export function TemplateForm({
  draft: initial,
  editing,
  workspaceAvailable,
  onSave,
  onCancel
}: Props) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setError(null)
  }

  const submit = () => {
    if (!draft.name.trim()) return setError('Give the template a name.')
    if (draft.scope === 'workspace' && !workspaceAvailable) {
      return setError('Open a folder to save a template for it.')
    }
    onSave({ ...draft, name: draft.name.trim() })
  }

  return (
    <form
      className="template-form"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          submit()
        }
      }}
    >
      <div className="form-row">
        <label className="field-label" htmlFor="template-name">
          Name
        </label>
        <input
          id="template-name"
          className="text-input wide"
          value={draft.name}
          maxLength={TEMPLATE_LIMITS.nameLength}
          data-autofocus
          aria-invalid={error !== null && !draft.name.trim()}
          onChange={(event) => set('name', event.target.value)}
        />
      </div>
      <div className="form-row">
        <label className="field-label" htmlFor="template-description">
          Description
        </label>
        <input
          id="template-description"
          className="text-input wide"
          value={draft.description}
          maxLength={TEMPLATE_LIMITS.descriptionLength}
          onChange={(event) => set('description', event.target.value)}
        />
      </div>
      <div className="form-grid">
        <div className="form-row">
          <label className="field-label" htmlFor="template-kind">
            Type
          </label>
          <select
            id="template-kind"
            className="select wide"
            value={draft.kind}
            onChange={(event) => set('kind', event.target.value as TemplateKind)}
          >
            <option value="document">Document template (creates a file)</option>
            <option value="snippet">Snippet (inserted at the cursor)</option>
          </select>
        </div>
        <div className="form-row">
          <label className="field-label" htmlFor="template-scope">
            Available in
          </label>
          <select
            id="template-scope"
            className="select wide"
            value={draft.scope}
            disabled={editing}
            onChange={(event) => set('scope', event.target.value as TemplateScope)}
          >
            <option value="global">All folders (global)</option>
            <option value="workspace" disabled={!workspaceAvailable}>
              This folder only
            </option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <label className="field-label" htmlFor="template-body">
          Content
        </label>
        <textarea
          id="template-body"
          className="template-body"
          value={draft.body}
          spellCheck={false}
          rows={12}
          onChange={(event) => set('body', event.target.value)}
        />
        <p className="muted template-variables">
          Placeholders:{' '}
          {Object.keys(TEMPLATE_VARIABLES).map((name) => (
            <code key={name} title={TEMPLATE_VARIABLES[name as keyof typeof TEMPLATE_VARIABLES]}>
              {`{{${name}}}`}
            </code>
          ))}
        </p>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer form-footer">
        <button type="submit" className="button primary" data-testid="template-save">
          {editing ? 'Save Changes' : 'Save Template'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
