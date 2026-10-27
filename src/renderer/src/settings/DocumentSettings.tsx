import { useState, type ReactNode } from 'react'
import { basename } from '@shared/paths'
import {
  hasWorkspaceOverrides,
  resolvePresentation,
  type CustomCssSetting,
  type WorkspacePresentation
} from '@shared/presentation/settings'
import { BUILTIN_THEMES, type ThemeCustomization, type ThemeId } from '@shared/presentation/theme'
import { AppearanceEditor } from '../presentation/AppearanceEditor'
import { CssSettings } from '../presentation/CssSettings'
import { openExportDialog } from '../presentation/openExportDialog'
import { PageSetup } from '../presentation/PageSetup'
import { PresetManager } from '../presentation/PresetManager'
import { Field, SelectInput, Switch } from '../presentation/fields'
import { ThemePicker } from '../presentation/ThemePicker'
import { useExportSetup } from '../state/exportSetup'
import { usePresentation } from '../state/presentation'
import { useSettings } from '../state/settings'
import { dialogs } from '../state/ui'
import { useWorkspace } from '../state/workspace'

type Scope = 'global' | 'workspace'

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange(value: boolean): void
}) {
  return (
    <div className="setting-row">
      <div className="setting-line">
        <label htmlFor={id}>{label}</label>
        <div className="setting-control">
          <Switch id={id} checked={checked} onChange={onChange} />
        </div>
      </div>
      {hint && <p className="setting-hint">{hint}</p>}
    </div>
  )
}

function overrideSummary(overrides: WorkspacePresentation): string {
  const parts: string[] = []
  if (overrides.theme) parts.push(`theme ${BUILTIN_THEMES[overrides.theme].name}`)
  if (overrides.customization) parts.push('fonts and colours')
  if (overrides.customCss) parts.push('custom CSS')
  if (overrides.math) parts.push(`math ${overrides.math.enabled ? 'on' : 'off'}`)
  if (overrides.diagrams) parts.push(`diagrams ${overrides.diagrams.enabled ? 'on' : 'off'}`)
  return parts.join(', ')
}

export interface DocumentSettingsSections {
  appearance: ReactNode
  rendering: ReactNode
  pdf: ReactNode
  html: ReactNode
  presets: ReactNode
}

/** Settings for how documents look and how they are published, as separately placeable parts. */
export function useDocumentSettingsSections(): DocumentSettingsSections {
  const settings = useSettings((s) => s.settings.document)
  const update = useSettings((s) => s.update)
  const root = useWorkspace((s) => s.root)
  const workspace = usePresentation((s) => s.workspace)
  const css = usePresentation((s) => s.css)
  const setWorkspace = usePresentation((s) => s.setWorkspace)
  const presets = useExportSetup((s) => s.presets)
  const [scope, setScope] = useState<Scope>('global')
  const editingWorkspace = scope === 'workspace' && root !== null

  // The values shown in the controls: the scope being edited, as resolved.
  const resolved = resolvePresentation(settings, editingWorkspace ? workspace : null)
  const themeId: ThemeId = editingWorkspace ? (workspace?.theme ?? settings.theme) : settings.theme
  const customization: ThemeCustomization = editingWorkspace
    ? (workspace?.customization ?? settings.customization)
    : settings.customization
  const customCss: CustomCssSetting = editingWorkspace
    ? (workspace?.customCss ?? settings.customCss)
    : settings.customCss
  const mathOn = editingWorkspace
    ? (workspace?.math?.enabled ?? settings.math.enabled)
    : settings.math.enabled
  const diagramsOn = editingWorkspace
    ? (workspace?.diagrams?.enabled ?? settings.diagrams.enabled)
    : settings.diagrams.enabled

  const patchWorkspace = (patch: WorkspacePresentation) =>
    void setWorkspace({ ...(workspace ?? {}), ...patch })
  const setTheme = (id: ThemeId) =>
    editingWorkspace ? patchWorkspace({ theme: id }) : update({ document: { theme: id } })
  const setCustomization = (next: ThemeCustomization) =>
    editingWorkspace
      ? patchWorkspace({ customization: next })
      : // Settings patches merge, so fields removed from the object are sent as null.
        update({
          document: {
            customization: {
              ...Object.fromEntries(
                Object.keys(customization)
                  .filter((k) => !(k in next))
                  .map((k) => [k, null])
              ),
              ...next
            }
          } as never
        })
  const setCss = (next: CustomCssSetting) =>
    editingWorkspace
      ? patchWorkspace({ customCss: next })
      : update({ document: { customCss: next } })
  const setMath = (enabled: boolean) =>
    editingWorkspace
      ? patchWorkspace({ math: { enabled } })
      : update({ document: { math: { enabled } } })
  const setDiagrams = (enabled: boolean) =>
    editingWorkspace
      ? patchWorkspace({ diagrams: { enabled } })
      : update({ document: { diagrams: { enabled } } })

  const overridden = (key: keyof WorkspacePresentation) =>
    editingWorkspace && workspace?.[key] !== undefined
  const folderName = root ? basename(root) : ''

  return {
    appearance: (
      <>
        <h3 className="settings-section" id="settings-document-appearance" tabIndex={-1}>
          Document Appearance
        </h3>
        <p className="setting-hint section-note">
          How rendered documents look in the preview, PDF and HTML export. This is separate from the
          application theme above, and it never changes your Markdown.
        </p>
        {hasWorkspaceOverrides(workspace) && workspace && (
          <div className="override-banner" role="status" data-testid="workspace-override-banner">
            <strong>Workspace override active</strong> for “{folderName}”:{' '}
            {overrideSummary(workspace)}.
            <div className="button-row">
              <button type="button" className="button" onClick={() => setScope('workspace')}>
                Edit
              </button>
              <button
                type="button"
                className="button"
                data-testid="clear-workspace-override"
                onClick={() => void setWorkspace(null)}
              >
                Clear override
              </button>
            </div>
          </div>
        )}
        <div className="segmented" role="radiogroup" aria-label="Apply appearance to">
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'global'}
            className={scope === 'global' ? 'active' : ''}
            data-testid="scope-global"
            onClick={() => setScope('global')}
          >
            Application default
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'workspace'}
            className={scope === 'workspace' ? 'active' : ''}
            disabled={root === null}
            title={root === null ? 'Open a folder to set workspace-specific appearance' : undefined}
            data-testid="scope-workspace"
            onClick={() => setScope('workspace')}
          >
            This workspace
          </button>
        </div>
        {editingWorkspace && (
          <p className="setting-hint" data-testid="scope-hint">
            Changes apply only to “{folderName}” and are stored in its .markdown-studio folder.
            Anything you do not change keeps the application default.
          </p>
        )}
        <ThemePicker
          value={themeId}
          onChange={(id) => id !== 'inherit' && setTheme(id)}
          name="document-theme"
        />
        {overridden('theme') && (
          <p className="setting-hint">
            Theme overridden by this workspace (default: {BUILTIN_THEMES[settings.theme].name}).
          </p>
        )}
        <details className="advanced" data-testid="appearance-details">
          <summary>
            Fonts, colours and blocks
            {Object.keys(customization).length > 0
              ? ` (${Object.keys(customization).length} customised)`
              : ''}
          </summary>
          <AppearanceEditor
            themeId={themeId}
            value={customization}
            onChange={setCustomization}
            idPrefix="settings"
          />
        </details>
        <details className="advanced" data-testid="css-details">
          <summary>
            Custom CSS
            {customCss.source !== 'none'
              ? ` (${customCss.source === 'file' ? 'file' : 'written'})`
              : ''}
          </summary>
          <p className="setting-hint">
            Your CSS is applied after the theme, to documents only — never to Markdown Studio
            itself. Remote files, @import and local file references are not allowed.
          </p>
          <CssSettings
            value={customCss}
            onChange={setCss}
            result={editingWorkspace ? css : css}
            scope={editingWorkspace ? 'workspace' : 'global'}
            idPrefix="settings"
          />
        </details>
        <p className="setting-hint" data-testid="effective-summary">
          Effective for this document:{' '}
          {BUILTIN_THEMES[resolvePresentation(settings, workspace).themeId].name}
          {workspace?.theme ? ' (from workspace)' : ''}.
        </p>
        {editingWorkspace && hasWorkspaceOverrides(workspace) && (
          <p className="setting-hint">
            {resolved.origin.theme === 'workspace' ? 'Theme comes from the workspace.' : ''}
          </p>
        )}
      </>
    ),
    rendering: (
      <>
        <h3 className="settings-section">Mathematical Notation</h3>
        <SwitchRow
          id="setting-math"
          label="Render math"
          hint={`Shows $…$, $$…$$, \\(…\\) and \\[…\\] as typeset equations (KaTeX, bundled). The Markdown stays as written.${overridden('math') ? ' Overridden by this workspace.' : ''}`}
          checked={mathOn}
          onChange={setMath}
        />

        <h3 className="settings-section">Diagrams</h3>
        <SwitchRow
          id="setting-diagrams"
          label="Render Mermaid diagrams"
          hint={`Fenced blocks tagged “mermaid” become diagrams, drawn in an isolated, script-free sandbox and embedded as static SVG. Diagrams up to 50,000 characters.${overridden('diagrams') ? ' Overridden by this workspace.' : ''}`}
          checked={diagramsOn}
          onChange={setDiagrams}
        />
      </>
    ),
    pdf: (
      <>
        <h3 className="settings-section">PDF Export</h3>
        <p className="setting-hint section-note">
          Default page setup. The Export dialog starts from these values or from a preset.
        </p>
        <PageSetup
          value={settings.pdf}
          idPrefix="settings-pdf"
          onChange={(pdf) => update({ document: { pdf } })}
        />
      </>
    ),
    html: (
      <>
        <h3 className="settings-section">HTML Export</h3>
        <SwitchRow
          id="setting-html-embed"
          label="Embed local images"
          hint="Images are stored inside the HTML file so it works anywhere, offline. Equations and diagrams are always embedded."
          checked={settings.html.embedImages}
          onChange={(embedImages) => update({ document: { html: { embedImages } } })}
        />
      </>
    ),
    presets: (
      <>
        <h3 className="settings-section">Export Presets</h3>
        <div className="setting-row">
          <Field
            label="Default preset"
            htmlFor="setting-export-preset"
            hint="Used by the PDF preview and “Export with Current Preset”."
          >
            <SelectInput
              id="setting-export-preset"
              testId="setting-export-preset"
              value={settings.exportPreset}
              options={[
                { value: '', label: 'Settings defaults' },
                ...presets.map((p) => ({ value: p.id, label: p.name }))
              ]}
              onChange={(id) => useExportSetup.getState().choose(id)}
            />
          </Field>
          <div className="button-row">
            <button
              type="button"
              className="button"
              data-testid="manage-presets"
              onClick={() =>
                void dialogs.custom<null>((done) => (
                  <PresetManager
                    done={() => done(null)}
                    onEdit={(id) => {
                      done(null)
                      void openExportDialog(undefined, id)
                    }}
                  />
                ))
              }
            >
              Manage presets…
            </button>
          </div>
        </div>
      </>
    )
  }
}
