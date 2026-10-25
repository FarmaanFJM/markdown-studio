import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { validatePdfOptions } from '@shared/export/pdf'
import type { EffectivePreset } from '@shared/export/presets'
import {
  presetDataFromSetup,
  setupFromPreset,
  settingsSetup,
  setupsEqual,
  type ExportSetup
} from '@shared/export/setup'
import { resolvePresentation, type CustomCssSetting } from '@shared/presentation/settings'
import { BUILTIN_THEMES, THEME_IDS, type ThemeId } from '@shared/presentation/theme'
import { api, errorMessage } from '../bridge'
import { Modal } from '../dialogs/Modal'
import { buildStandaloneHtml, type ExportSource } from '../markdown/exporters'
import { PdfPreview } from '../preview/PdfPreview'
import { cancelExport, runExport } from '../export/runExport'
import type { EditorDocument } from '../state/documents'
import { currentSetup, useExportSetup } from '../state/exportSetup'
import { renderPresentationFor, usePresentation } from '../state/presentation'
import { useSettings } from '../state/settings'
import { dialogs, notify } from '../state/ui'
import { AppearanceEditor } from './AppearanceEditor'
import { Field, SelectInput, Switch } from './fields'
import { PageSetup } from './PageSetup'

/** Shows what an HTML export would contain, built by the same code that writes the file. */
function HtmlExportPreview({ source, setup }: { source: ExportSource; setup: ExportSetup }) {
  const [state, setState] = useState<{ html: string | null; error: string | null; busy: boolean }>({
    html: null,
    error: null,
    busy: true
  })
  const key = JSON.stringify([setup.overrides, setup.html])
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, busy: true }))
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const presentation = await renderPresentationFor(setup.overrides)
          const built = await buildStandaloneHtml(source, presentation, setup.html)
          if (!cancelled) setState({ html: built.html, error: null, busy: false })
        } catch (error) {
          if (!cancelled) setState({ html: null, error: errorMessage(error), busy: false })
        }
      })()
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, source.source])
  return (
    <div className="export-html-preview" data-testid="export-html-preview">
      {state.busy && (
        <div className="preview-message overlay" role="status">
          <Loader2 size={14} className="spin" /> Preparing preview…
        </div>
      )}
      {state.error && <div className="preview-message error">{state.error}</div>}
      {state.html && (
        <iframe title="HTML export preview" sandbox="allow-same-origin" srcDoc={state.html} />
      )}
    </div>
  )
}

function presetLabel(preset: EffectivePreset): string {
  const suffix =
    preset.scope === 'workspace' ? ' · workspace' : preset.modified ? ' · modified' : ''
  return `${preset.name}${suffix}`
}

export function ExportDialog({
  doc,
  source,
  initialFormat,
  done
}: {
  doc: EditorDocument
  source: ExportSource
  initialFormat?: 'pdf' | 'html'
  done(): void
}) {
  const uid = useId()
  const documentSettings = useSettings((s) => s.settings.document)
  const presets = useExportSetup((s) => s.presets)
  const workspaceAvailable = useExportSetup((s) => s.workspacePresetsAvailable)
  const workspace = usePresentation((s) => s.workspace)
  const [presetId, setPresetId] = useState(() => useExportSetup.getState().presetId)
  const [draft, setDraft] = useState<ExportSetup>(() => {
    const active = currentSetup()
    return initialFormat ? { ...active, format: initialFormat } : active
  })
  const [exporting, setExporting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const closed = useRef(false)

  const preset = presets.find((p) => p.id === presetId) ?? null
  const baseline = useMemo(
    () => (preset ? setupFromPreset(preset, documentSettings) : settingsSetup(documentSettings)),
    [preset, documentSettings]
  )
  const dirty = !setupsEqual(draft, baseline)
  const pdfValidation = validatePdfOptions(draft.pdf)
  const valid = draft.format === 'html' || pdfValidation.ok

  const effective = useMemo(
    () => resolvePresentation(documentSettings, workspace, draft.overrides),
    [documentSettings, workspace, draft.overrides]
  )
  const documentTheme = resolvePresentation(documentSettings, workspace).themeId

  const choosePreset = (id: string) => {
    setPresetId(id)
    // Read the store, not the render's copy: presets may just have been changed or restored.
    const next = useExportSetup.getState().presets.find((p) => p.id === id)
    setDraft(next ? setupFromPreset(next, documentSettings) : settingsSetup(documentSettings))
    setFailure(null)
  }

  const update = (patch: Partial<ExportSetup>) => setDraft((d) => ({ ...d, ...patch }))
  const updateOverrides = (
    patch: Partial<ExportSetup['overrides']>,
    remove: (keyof ExportSetup['overrides'])[] = []
  ) =>
    setDraft((d) => {
      const overrides = { ...d.overrides, ...patch }
      for (const key of remove) delete overrides[key]
      return { ...d, overrides }
    })

  const chooseScope = async (): Promise<'global' | 'workspace' | null> => {
    if (!workspaceAvailable) return 'global'
    return (await dialogs.choice({
      title: 'Where should the preset be stored?',
      message: 'Workspace presets travel with the folder; global presets are available everywhere.',
      options: [
        { value: 'global', label: 'Global', primary: true },
        { value: 'workspace', label: 'This workspace' }
      ]
    })) as 'global' | 'workspace' | null
  }

  const saveAsNew = async (suggested: string) => {
    const name = await dialogs.prompt({
      title: 'Save export preset',
      label: 'Preset name',
      initialValue: suggested,
      confirmLabel: 'Save',
      validate: (value) => (value.trim() === '' ? 'Enter a name.' : null)
    })
    if (!name) return
    const scope = await chooseScope()
    if (!scope) return
    const saved = await useExportSetup.getState().savePreset(scope, {
      name: name.trim(),
      description: '',
      data: presetDataFromSetup(draft)
    })
    if (saved) {
      notify('success', `Saved preset “${saved.name}”.`)
      setPresetId(saved.id)
      useExportSetup.getState().choose(saved.id)
      setDraft(setupFromPreset(saved, documentSettings))
    }
  }

  const saveChanges = async () => {
    if (!preset) return
    const scope = preset.scope === 'workspace' ? 'workspace' : 'global'
    const saved = await useExportSetup.getState().savePreset(scope, {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      data: presetDataFromSetup(draft)
    })
    if (saved) {
      notify('success', `Saved “${saved.name}”.`)
      setDraft(setupFromPreset(saved, documentSettings))
    }
  }

  const rename = async () => {
    if (!preset || preset.builtIn) return
    const name = await dialogs.prompt({
      title: 'Rename preset',
      label: 'Preset name',
      initialValue: preset.name,
      confirmLabel: 'Rename',
      validate: (value) => (value.trim() === '' ? 'Enter a name.' : null)
    })
    if (!name || name.trim() === preset.name) return
    await useExportSetup
      .getState()
      .savePreset(preset.scope === 'workspace' ? 'workspace' : 'global', {
        id: preset.id,
        name: name.trim(),
        description: preset.description,
        data: preset.data
      })
  }

  const remove = async () => {
    if (!preset || preset.scope === 'built-in') return
    const restoring = preset.builtIn
    const ok = await dialogs.confirm({
      title: restoring ? 'Restore the built-in preset?' : 'Delete this preset?',
      message: restoring
        ? `“${preset.name}” returns to its original settings.`
        : `“${preset.name}” will be deleted. Documents are not affected.`,
      confirmLabel: restoring ? 'Restore' : 'Delete',
      danger: !restoring
    })
    if (!ok) return
    const done = await useExportSetup
      .getState()
      .deletePreset(preset.scope === 'workspace' ? 'workspace' : 'global', preset.id)
    if (done) choosePreset(restoring ? preset.id : '')
  }

  const startExport = async () => {
    if (!valid || exporting) return
    setExporting(true)
    setFailure(null)
    const outcome = await runExport(doc, source, draft)
    if (closed.current) return
    setExporting(false)
    if (outcome.status === 'saved') {
      useExportSetup.getState().choose(presetId)
      useExportSetup.getState().setDraft(dirty ? draft : null)
      closed.current = true
      done()
    } else if (outcome.status === 'failed') {
      setFailure(outcome.message ?? 'The export failed.')
    }
  }

  const close = () => {
    if (exporting) {
      cancelExport()
      return
    }
    closed.current = true
    done()
  }

  const themeOverride = draft.overrides.theme
  const customizing = draft.overrides.customization !== undefined
  const cssOverride = draft.overrides.customCss
  const cssMode: 'inherit' | 'none' | 'file' = !cssOverride
    ? 'inherit'
    : cssOverride.source === 'none'
      ? 'none'
      : 'file'

  const setCss = (mode: 'inherit' | 'none' | 'file', css?: CustomCssSetting) => {
    if (mode === 'inherit') updateOverrides({}, ['customCss'])
    else if (mode === 'none')
      updateOverrides({ customCss: { source: 'none', text: '', path: null } })
    else if (css) updateOverrides({ customCss: css })
  }

  const chooseCssFile = async () => {
    try {
      const file = await api.presentation.pickCss('global')
      if (file) setCss('file', { source: 'file', text: '', path: file.path })
    } catch (error) {
      notify('error', errorMessage(error))
    }
  }

  useEffect(() => {
    void useExportSetup.getState().loadPresets()
  }, [])

  const label = `${preset ? preset.name : 'Settings defaults'}${dirty ? ' (edited)' : ''}`
  const themeOptions = [
    {
      value: 'inherit',
      label: `Document theme (${BUILTIN_THEMES[documentTheme].name})`
    },
    ...THEME_IDS.map((id) => ({ value: id as string, label: BUILTIN_THEMES[id].name }))
  ]

  return (
    <Modal
      title="Export"
      size="xwide"
      className="export-modal"
      onCancel={close}
      footer={
        <>
          {failure && (
            <span className="export-failure" role="alert" data-testid="export-failure">
              <AlertCircle size={14} /> {failure}
            </span>
          )}
          <span className="toolbar-spacer" />
          <button type="button" className="button" data-testid="export-cancel" onClick={close}>
            {exporting ? 'Cancel export' : 'Close'}
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!valid || exporting}
            data-testid="export-run"
            onClick={() => void startExport()}
          >
            {exporting ? 'Exporting…' : draft.format === 'pdf' ? 'Export PDF…' : 'Export HTML…'}
          </button>
        </>
      }
    >
      <div className="export-dialog">
        <div className="export-form" data-testid="export-form">
          <Field label="Preset" htmlFor={`export-preset-${uid}`}>
            <SelectInput
              id={`export-preset-${uid}`}
              testId="export-preset"
              value={presetId}
              onChange={choosePreset}
              options={[
                { value: '', label: 'Settings defaults' },
                ...presets.map((p) => ({ value: p.id, label: presetLabel(p) }))
              ]}
            />
            {preset && <p className="setting-hint">{preset.description}</p>}
          </Field>
          <div className="button-row preset-actions">
            {preset && dirty && (
              <button
                type="button"
                className="button"
                data-testid="preset-save"
                onClick={() => void saveChanges()}
              >
                Save changes
              </button>
            )}
            <button
              type="button"
              className="button"
              data-testid="preset-save-as"
              onClick={() => void saveAsNew(preset ? `${preset.name} copy` : 'My preset')}
            >
              {preset ? 'Duplicate…' : 'Save as preset…'}
            </button>
            {preset && !preset.builtIn && (
              <button
                type="button"
                className="button"
                data-testid="preset-rename"
                onClick={() => void rename()}
              >
                Rename…
              </button>
            )}
            {preset && preset.scope !== 'built-in' && (
              <button
                type="button"
                className="button danger"
                data-testid="preset-delete"
                onClick={() => void remove()}
              >
                {preset.builtIn ? 'Restore default…' : 'Delete…'}
              </button>
            )}
            {dirty && (
              <button type="button" className="button" onClick={() => choosePreset(presetId)}>
                Discard edits
              </button>
            )}
          </div>

          <div className="segmented" role="radiogroup" aria-label="Output format">
            {(['pdf', 'html'] as const).map((format) => (
              <button
                key={format}
                type="button"
                role="radio"
                aria-checked={draft.format === format}
                className={draft.format === format ? 'active' : ''}
                data-testid={`export-format-${format}`}
                onClick={() => update({ format })}
              >
                {format === 'pdf' ? 'PDF' : 'HTML'}
              </button>
            ))}
          </div>

          <fieldset>
            <legend>Appearance</legend>
            <Field label="Document theme" htmlFor={`export-theme-${uid}`}>
              <SelectInput
                id={`export-theme-${uid}`}
                testId="export-theme"
                value={themeOverride ?? 'inherit'}
                options={themeOptions}
                onChange={(value) =>
                  value === 'inherit'
                    ? updateOverrides({}, ['theme'])
                    : updateOverrides({ theme: value as ThemeId })
                }
              />
            </Field>
            <Field label="Custom CSS" htmlFor={`export-css-${uid}`}>
              <SelectInput
                id={`export-css-${uid}`}
                testId="export-css"
                value={cssMode}
                options={[
                  { value: 'inherit', label: 'As in Settings' },
                  { value: 'none', label: 'None for this export' },
                  { value: 'file', label: 'Use a CSS file…' }
                ]}
                onChange={(mode) => {
                  if (mode === 'file') void chooseCssFile()
                  else setCss(mode)
                }}
              />
              {cssMode === 'file' && (
                <code className="css-path" title={cssOverride?.path ?? ''}>
                  {cssOverride?.path}
                </code>
              )}
            </Field>
            <div className="inline-row">
              <Switch
                id={`export-customize-${uid}`}
                checked={customizing}
                onChange={(on) =>
                  on
                    ? updateOverrides({ customization: { ...effective.customization } })
                    : updateOverrides({}, ['customization'])
                }
              />
              <label htmlFor={`export-customize-${uid}`}>
                Customise fonts and colours for this export
              </label>
            </div>
            {customizing && (
              <AppearanceEditor
                themeId={effective.themeId}
                value={draft.overrides.customization ?? {}}
                idPrefix="export"
                onChange={(customization) => updateOverrides({ customization })}
              />
            )}
          </fieldset>

          {draft.format === 'pdf' ? (
            <PageSetup value={draft.pdf} idPrefix="export" onChange={(pdf) => update({ pdf })} />
          ) : (
            <fieldset>
              <legend>HTML file</legend>
              <div className="inline-row">
                <Switch
                  id={`export-embed-${uid}`}
                  checked={draft.html.embedImages}
                  onChange={(embedImages) => update({ html: { ...draft.html, embedImages } })}
                />
                <label htmlFor={`export-embed-${uid}`}>Embed local images in the file</label>
              </div>
              <p className="setting-hint">
                The file contains the rendered document, its theme, equations and diagrams. It works
                offline and needs no JavaScript.
              </p>
            </fieldset>
          )}
        </div>
        <div className="export-preview" data-testid="export-preview">
          {draft.format === 'pdf' ? (
            valid ? (
              <PdfPreview setup={draft} label={label} />
            ) : (
              <div className="preview-message error" role="alert">
                Fix the page settings to see the preview.
              </div>
            )
          ) : (
            <HtmlExportPreview source={source} setup={draft} />
          )}
        </div>
      </div>
    </Modal>
  )
}
