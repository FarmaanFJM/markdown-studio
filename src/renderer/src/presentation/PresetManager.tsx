import { useState } from 'react'
import type { EffectivePreset } from '@shared/export/presets'
import { Modal } from '../dialogs/Modal'
import { useExportSetup } from '../state/exportSetup'
import { dialogs, notify } from '../state/ui'

function describe(preset: EffectivePreset): string {
  const { data } = preset
  if (data.format === 'html') return 'HTML · standalone file'
  const size =
    data.pdf.pageSize === 'Custom'
      ? `${data.pdf.customWidthMm}×${data.pdf.customHeightMm} mm`
      : data.pdf.pageSize
  const theme = data.theme === 'inherit' ? 'document theme' : data.theme
  return `PDF · ${size} ${data.pdf.orientation} · ${theme}`
}

function origin(preset: EffectivePreset): string {
  if (preset.scope === 'workspace') return 'Workspace'
  if (preset.builtIn) return preset.modified ? 'Built-in (modified)' : 'Built-in'
  return 'Global'
}

/** Lists the export presets with the actions that do not need the full Export dialog. */
export function PresetManager({ done, onEdit }: { done(): void; onEdit(presetId: string): void }) {
  const presets = useExportSetup((s) => s.presets)
  const workspaceAvailable = useExportSetup((s) => s.workspacePresetsAvailable)
  const [busy, setBusy] = useState(false)

  const duplicate = async (preset: EffectivePreset) => {
    const name = await dialogs.prompt({
      title: 'Duplicate preset',
      label: 'Name of the copy',
      initialValue: `${preset.name} copy`,
      confirmLabel: 'Duplicate',
      validate: (v) => (v.trim() === '' ? 'Enter a name.' : null)
    })
    if (!name) return
    let scope: 'global' | 'workspace' = 'global'
    if (workspaceAvailable) {
      const choice = await dialogs.choice({
        title: 'Where should the copy be stored?',
        message: 'Workspace presets travel with the folder.',
        options: [
          { value: 'global', label: 'Global', primary: true },
          { value: 'workspace', label: 'This workspace' }
        ]
      })
      if (!choice) return
      scope = choice as 'global' | 'workspace'
    }
    const saved = await useExportSetup.getState().savePreset(scope, {
      name: name.trim(),
      description: preset.description,
      data: preset.data
    })
    if (saved) notify('success', `Created “${saved.name}”.`)
  }

  const rename = async (preset: EffectivePreset) => {
    const name = await dialogs.prompt({
      title: 'Rename preset',
      label: 'Preset name',
      initialValue: preset.name,
      confirmLabel: 'Rename',
      validate: (v) => (v.trim() === '' ? 'Enter a name.' : null)
    })
    if (!name || name.trim() === preset.name || preset.scope === 'built-in') return
    await useExportSetup
      .getState()
      .savePreset(preset.scope === 'workspace' ? 'workspace' : 'global', {
        id: preset.id,
        name: name.trim(),
        description: preset.description,
        data: preset.data
      })
  }

  const remove = async (preset: EffectivePreset) => {
    if (preset.scope === 'built-in') return
    const restoring = preset.builtIn
    const ok = await dialogs.confirm({
      title: restoring ? 'Restore the built-in preset?' : 'Delete this preset?',
      message: restoring
        ? `“${preset.name}” returns to its original settings.`
        : `“${preset.name}” will be deleted. Documents are not affected.`,
      confirmLabel: restoring ? 'Restore' : 'Delete',
      danger: !restoring
    })
    if (ok)
      await useExportSetup
        .getState()
        .deletePreset(preset.scope === 'workspace' ? 'workspace' : 'global', preset.id)
  }

  const restoreAll = async () => {
    const ok = await dialogs.confirm({
      title: 'Restore all built-in presets?',
      message:
        'Edits to the five built-in presets are discarded. Your own presets are not touched.',
      confirmLabel: 'Restore built-in defaults',
      danger: true
    })
    if (!ok) return
    setBusy(true)
    let count = await useExportSetup.getState().restoreBuiltins('global')
    if (workspaceAvailable) count += await useExportSetup.getState().restoreBuiltins('workspace')
    setBusy(false)
    notify(
      'success',
      count > 0
        ? `Restored ${count} built-in preset${count === 1 ? '' : 's'}.`
        : 'All built-in presets already have their original settings.'
    )
  }

  return (
    <Modal
      title="Export presets"
      size="wide"
      onCancel={done}
      footer={
        <>
          <button
            type="button"
            className="button"
            disabled={busy}
            data-testid="presets-restore"
            onClick={() => void restoreAll()}
          >
            Restore built-in defaults…
          </button>
          <span className="toolbar-spacer" />
          <button type="button" className="button primary" data-autofocus onClick={done}>
            Done
          </button>
        </>
      }
    >
      <ul className="preset-list" data-testid="preset-list">
        {presets.map((preset) => (
          <li key={preset.id} data-testid={`preset-row-${preset.id}`}>
            <div className="preset-info">
              <strong>{preset.name}</strong>
              <span className="preset-origin">{origin(preset)}</span>
              <span className="preset-detail">{describe(preset)}</span>
              {preset.description && <span className="preset-detail">{preset.description}</span>}
            </div>
            <div className="button-row">
              <button type="button" className="button" onClick={() => onEdit(preset.id)}>
                Edit…
              </button>
              <button type="button" className="button" onClick={() => void duplicate(preset)}>
                Duplicate…
              </button>
              {!preset.builtIn && (
                <button type="button" className="button" onClick={() => void rename(preset)}>
                  Rename…
                </button>
              )}
              {preset.scope !== 'built-in' && (
                <button type="button" className="button danger" onClick={() => void remove(preset)}>
                  {preset.builtIn ? 'Restore…' : 'Delete…'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
