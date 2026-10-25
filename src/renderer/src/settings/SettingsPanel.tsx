import { useEffect, useState } from 'react'
import { LINT_RULES } from '@shared/lint'
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

function AuthorInput() {
  const stored = useSettings((s) => s.settings.templates.author)
  const update = useSettings((s) => s.update)
  const [value, setValue] = useState(stored)
  useEffect(() => setValue(stored), [stored])
  const commit = () => {
    if (value.trim() !== stored) update({ templates: { author: value.trim() } })
  }
  return (
    <input
      id="setting-author"
      className="text-input"
      value={value}
      maxLength={LIMITS.authorLength}
      placeholder="Not set"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}

function StyleRules() {
  const disabled = useSettings((s) => s.settings.markdown.diagnostics.disabledRules)
  const update = useSettings((s) => s.update)
  const toggle = (id: string, enabled: boolean) =>
    update({
      markdown: {
        diagnostics: {
          disabledRules: enabled ? disabled.filter((r) => r !== id) : [...disabled, id]
        }
      }
    })
  return (
    <details className="rule-list" data-testid="style-rules">
      <summary>
        Style rules ({LINT_RULES.length - disabled.length} of {LINT_RULES.length} on)
      </summary>
      <ul>
        {LINT_RULES.map((rule) => (
          <li key={rule.id}>
            <label>
              <input
                type="checkbox"
                checked={!disabled.includes(rule.id)}
                onChange={(e) => toggle(rule.id, e.target.checked)}
              />
              <span className="rule-id">{rule.id}</span> {rule.name}
            </label>
          </li>
        ))}
      </ul>
    </details>
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

        <h3 className="settings-section">Markdown editing</h3>
        <Row
          label="Smart lists and quotes"
          htmlFor="setting-smart-lists"
          hint="Enter continues a list or quote, Tab and Shift+Tab nest items."
        >
          <Toggle
            id="setting-smart-lists"
            checked={settings.markdown.smartLists}
            onChange={(v) => update({ markdown: { smartLists: v } })}
          />
        </Row>
        <Row
          label="Table navigation"
          htmlFor="setting-table-navigation"
          hint="Tab and Shift+Tab move between cells and keep the table tidy."
        >
          <Toggle
            id="setting-table-navigation"
            checked={settings.markdown.tableNavigation}
            onChange={(v) => update({ markdown: { tableNavigation: v } })}
          />
        </Row>
        <Row
          label="Automatic suggestions"
          htmlFor="setting-auto-suggest"
          hint='Offer suggestions after "/" and inside link and image paths. Ctrl+Space always works.'
        >
          <Toggle
            id="setting-auto-suggest"
            checked={settings.markdown.autoSuggest}
            onChange={(v) => update({ markdown: { autoSuggest: v } })}
          />
        </Row>
        <Row label="Formatting toolbar" htmlFor="setting-toolbar">
          <Toggle
            id="setting-toolbar"
            checked={settings.markdown.toolbar}
            onChange={(v) => update({ markdown: { toolbar: v } })}
          />
        </Row>

        <h3 className="settings-section">Problems</h3>
        <Row
          label="Check links and images"
          htmlFor="setting-check-links"
          hint="Missing files, images and heading anchors. Web addresses are never contacted."
        >
          <Toggle
            id="setting-check-links"
            checked={settings.markdown.diagnostics.links}
            onChange={(v) => update({ markdown: { diagnostics: { links: v } } })}
          />
        </Row>
        <Row
          label="Check tables"
          htmlFor="setting-check-tables"
          hint="Tables that the preview does not display as written."
        >
          <Toggle
            id="setting-check-tables"
            checked={settings.markdown.diagnostics.tables}
            onChange={(v) => update({ markdown: { diagnostics: { tables: v } } })}
          />
        </Row>
        <Row
          label="Style checks"
          htmlFor="setting-check-style"
          hint="Spacing and structure notes from markdownlint."
        >
          <Toggle
            id="setting-check-style"
            checked={settings.markdown.diagnostics.lint}
            onChange={(v) => update({ markdown: { diagnostics: { lint: v } } })}
          />
        </Row>
        {settings.markdown.diagnostics.lint && <StyleRules />}

        <h3 className="settings-section">Table of contents</h3>
        <Row
          label="Include the document title"
          htmlFor="setting-toc-title"
          hint="List the first heading when it is a level-1 title."
        >
          <Toggle
            id="setting-toc-title"
            checked={settings.markdown.toc.includeTopLevel}
            onChange={(v) => update({ markdown: { toc: { includeTopLevel: v } } })}
          />
        </Row>
        <Row label="Deepest heading level" htmlFor="setting-toc-depth">
          <input
            id="setting-toc-depth"
            className="number-input"
            type="number"
            min={LIMITS.tocDepth.min}
            max={LIMITS.tocDepth.max}
            value={settings.markdown.toc.maxDepth}
            onChange={(e) => {
              const depth = Number(e.target.value)
              if (depth >= LIMITS.tocDepth.min && depth <= LIMITS.tocDepth.max) {
                update({ markdown: { toc: { maxDepth: depth } } })
              }
            }}
          />
        </Row>

        <h3 className="settings-section">Templates</h3>
        <Row
          label="Author name"
          htmlFor="setting-author"
          hint="Offered when a template asks for an author. It is never filled in without your say."
        >
          <AuthorInput />
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
