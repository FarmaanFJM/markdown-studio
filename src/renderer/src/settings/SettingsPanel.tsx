import { useEffect, useState } from 'react'
import {
  LIMITS,
  normalizeAssetDirectory,
  type ExplorerMode,
  type ThemeName
} from '@shared/settings'
import { api } from '../bridge'
import { refreshSettings, useSettings } from '../state/settings'
import { notify } from '../state/ui'

function Toggle({
  id,
  checked,
  onChange
}: {
  id: string
  checked: boolean
  onChange(value: boolean): void
}) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="switch"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}

function Row({
  label,
  htmlFor,
  hint,
  children
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="setting-row">
      <div className="setting-line">
        <label htmlFor={htmlFor}>{label}</label>
        <div className="setting-control">{children}</div>
      </div>
      {hint && <p className="setting-hint">{hint}</p>}
    </div>
  )
}

function AssetDirectoryInput() {
  const stored = useSettings((s) => s.settings.assets.directory)
  const update = useSettings((s) => s.update)
  const [value, setValue] = useState(stored)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setValue(stored), [stored])

  const commit = () => {
    const normalized = normalizeAssetDirectory(value)
    if (!normalized) {
      setError('Use a relative folder inside the project, such as "assets" or "docs/images".')
      return
    }
    setError(null)
    setValue(normalized)
    if (normalized !== stored) update({ assets: { directory: normalized } })
  }

  return (
    <div className="stacked">
      <input
        id="setting-assets"
        className="text-input"
        value={value}
        spellCheck={false}
        aria-invalid={error !== null}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

export function SettingsPanel() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)

  return (
    <section className="sidebar-view settings" aria-label="Settings" data-testid="settings-panel">
      <header className="sidebar-header">
        <span className="sidebar-title">Settings</span>
      </header>
      <div className="sidebar-body settings-body">
        <h3 className="settings-section">Appearance</h3>
        <Row label="Theme" htmlFor="setting-theme">
          <select
            id="setting-theme"
            className="select"
            value={settings.theme}
            onChange={(e) => update({ theme: e.target.value as ThemeName })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Row>

        <h3 className="settings-section">Editor</h3>
        <Row label="Font size" htmlFor="setting-font-size">
          <input
            id="setting-font-size"
            className="number-input"
            type="number"
            min={LIMITS.fontSize.min}
            max={LIMITS.fontSize.max}
            value={settings.editor.fontSize}
            onChange={(e) => {
              const size = Number(e.target.value)
              if (size >= LIMITS.fontSize.min && size <= LIMITS.fontSize.max)
                update({ editor: { fontSize: size } })
            }}
          />
        </Row>
        <Row label="Word wrap" htmlFor="setting-word-wrap" hint="Alt+Z">
          <Toggle
            id="setting-word-wrap"
            checked={settings.editor.wordWrap}
            onChange={(v) => update({ editor: { wordWrap: v } })}
          />
        </Row>
        <Row label="Minimap" htmlFor="setting-minimap">
          <Toggle
            id="setting-minimap"
            checked={settings.editor.minimap}
            onChange={(v) => update({ editor: { minimap: v } })}
          />
        </Row>

        <h3 className="settings-section">Explorer</h3>
        <Row label="Presentation" htmlFor="setting-explorer-mode">
          <select
            id="setting-explorer-mode"
            className="select"
            value={settings.explorer.mode}
            onChange={(e) => update({ explorer: { mode: e.target.value as ExplorerMode } })}
          >
            <option value="tree">List</option>
            <option value="thumbnails">Thumbnails</option>
          </select>
        </Row>
        <Row
          label="Thumbnail size"
          htmlFor="setting-thumb-size"
          hint={`${settings.explorer.thumbnailSize}px`}
        >
          <input
            id="setting-thumb-size"
            type="range"
            min={LIMITS.thumbnailSize.min}
            max={LIMITS.thumbnailSize.max}
            step={8}
            value={settings.explorer.thumbnailSize}
            onChange={(e) => update({ explorer: { thumbnailSize: Number(e.target.value) } })}
          />
        </Row>

        <h3 className="settings-section">Images</h3>
        <Row
          label="Asset folder"
          htmlFor="setting-assets"
          hint="Images dropped from outside the project are copied here, relative to the project folder."
        >
          <AssetDirectoryInput />
        </Row>

        <h3 className="settings-section">Preview</h3>
        <Row
          label="Refresh PDF automatically"
          htmlFor="setting-pdf-refresh"
          hint="Regenerates the PDF shortly after you stop typing."
        >
          <Toggle
            id="setting-pdf-refresh"
            checked={settings.preview.pdfAutoRefresh}
            onChange={(v) => update({ preview: { pdfAutoRefresh: v } })}
          />
        </Row>

        <h3 className="settings-section">Workspace</h3>
        <Row label="Reopen last folder on startup" htmlFor="setting-restore">
          <Toggle
            id="setting-restore"
            checked={settings.workspace.restoreLastWorkspace}
            onChange={(v) => update({ workspace: { restoreLastWorkspace: v } })}
          />
        </Row>
        <Row
          label="Recent folders"
          htmlFor="setting-clear-recent"
          hint={`${settings.workspace.recent.length} remembered`}
        >
          <button
            id="setting-clear-recent"
            type="button"
            className="button"
            disabled={settings.workspace.recent.length === 0}
            onClick={async () => {
              update({ workspace: { recent: [] } })
              await refreshSettings()
              notify('info', 'Recent folders cleared.')
            }}
          >
            Clear
          </button>
        </Row>

        <p className="settings-footer">
          Settings are stored on this computer only.{' '}
          <button
            type="button"
            className="link-button"
            onClick={async () => {
              const info = await api.app.info()
              await api.shell.showItemInFolder(info.settingsPath)
            }}
          >
            Show settings file
          </button>
        </p>
      </div>
    </section>
  )
}
