import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { api } from '../bridge'
import { setExplorerMode } from '../explorer/mode'
import { refreshSettings, useSettings } from '../state/settings'
import { closeSettings, notify, useUi, type SettingsCategoryId } from '../state/ui'
import { LIMITS, type ExplorerMode, type ThemeName } from '@shared/settings'
import { AiSettings } from './AiSettings'
import { AssetDirectoryInput, AuthorInput, Row, StyleRules, Toggle } from './controls'
import { useDocumentSettingsSections } from './DocumentSettings'
import { matchesQuery, SETTINGS_CATEGORIES } from './model'

interface Entry {
  id: string
  category: SettingsCategoryId
  title: string
  /** Extra words the search matches. */
  keywords: string
  node: ReactNode
}

/**
 * The application's settings, as a page in place of the editor rather than a narrow sidebar.
 * Categories on the left scroll to their section; the search box filters every setting at once.
 */
export function SettingsPage() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const target = useUi((s) => s.settingsTarget)
  const document = useDocumentSettingsSections()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<SettingsCategoryId>('editor')
  const scroller = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const entries: Entry[] = [
    {
      id: 'font-size',
      category: 'editor',
      title: 'Font size',
      keywords: 'text size zoom editor',
      node: (
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
      )
    },
    {
      id: 'word-wrap',
      category: 'editor',
      title: 'Word wrap',
      keywords: 'wrap lines long',
      node: (
        <Row label="Word wrap" htmlFor="setting-word-wrap" hint="Alt+Z">
          <Toggle
            id="setting-word-wrap"
            checked={settings.editor.wordWrap}
            onChange={(v) => update({ editor: { wordWrap: v } })}
          />
        </Row>
      )
    },
    {
      id: 'minimap',
      category: 'editor',
      title: 'Minimap',
      keywords: 'overview scroll',
      node: (
        <Row label="Minimap" htmlFor="setting-minimap">
          <Toggle
            id="setting-minimap"
            checked={settings.editor.minimap}
            onChange={(v) => update({ editor: { minimap: v } })}
          />
        </Row>
      )
    },
    {
      id: 'smart-lists',
      category: 'markdown',
      title: 'Smart lists and quotes',
      keywords: 'enter tab indent nest list quote',
      node: (
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
      )
    },
    {
      id: 'table-navigation',
      category: 'markdown',
      title: 'Table navigation',
      keywords: 'tab cells table',
      node: (
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
      )
    },
    {
      id: 'table-width',
      category: 'markdown',
      title: 'Table source width',
      keywords: 'format table width line length wide readable',
      node: (
        <Row
          label="Table source width"
          htmlFor="setting-table-width"
          hint="Format Table aligns columns up to this many characters per line; wider tables are balanced so the source stays readable. 0 always aligns every column. The rendered table is the same either way."
        >
          <input
            id="setting-table-width"
            className="number-input"
            type="number"
            min={0}
            max={LIMITS.tableWidth.max}
            value={settings.markdown.tableMaxWidth}
            onChange={(e) => {
              const width = Number(e.target.value)
              if (Number.isFinite(width) && width >= 0)
                update({ markdown: { tableMaxWidth: width } })
            }}
          />
        </Row>
      )
    },
    {
      id: 'auto-suggest',
      category: 'markdown',
      title: 'Automatic suggestions',
      keywords: 'completion intellisense slash path',
      node: (
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
      )
    },
    {
      id: 'toolbar',
      category: 'markdown',
      title: 'Formatting toolbar',
      keywords: 'buttons bold italic',
      node: (
        <Row label="Formatting toolbar" htmlFor="setting-toolbar">
          <Toggle
            id="setting-toolbar"
            checked={settings.markdown.toolbar}
            onChange={(v) => update({ markdown: { toolbar: v } })}
          />
        </Row>
      )
    },
    {
      id: 'check-links',
      category: 'markdown',
      title: 'Check links and images',
      keywords: 'problems diagnostics missing anchors',
      node: (
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
      )
    },
    {
      id: 'check-tables',
      category: 'markdown',
      title: 'Check tables',
      keywords: 'problems diagnostics columns',
      node: (
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
      )
    },
    {
      id: 'check-style',
      category: 'markdown',
      title: 'Style checks',
      keywords: 'problems diagnostics markdownlint lint spacing quick fix rules',
      node: (
        <>
          <Row
            label="Style checks"
            htmlFor="setting-check-style"
            hint="Spacing and structure notes from markdownlint, with quick fixes (Ctrl+.)."
          >
            <Toggle
              id="setting-check-style"
              checked={settings.markdown.diagnostics.lint}
              onChange={(v) => update({ markdown: { diagnostics: { lint: v } } })}
            />
          </Row>
          {settings.markdown.diagnostics.lint && <StyleRules />}
        </>
      )
    },
    {
      id: 'toc-title',
      category: 'markdown',
      title: 'Table of contents: include the document title',
      keywords: 'toc contents heading',
      node: (
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
      )
    },
    {
      id: 'toc-depth',
      category: 'markdown',
      title: 'Table of contents: deepest heading level',
      keywords: 'toc contents depth',
      node: (
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
      )
    },
    {
      id: 'app-theme',
      category: 'appearance',
      title: 'Theme',
      keywords: 'dark light application colour color',
      node: (
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
      )
    },
    {
      id: 'document-appearance',
      category: 'appearance',
      title: 'Document appearance',
      keywords:
        'document theme fonts colours css custom professional report editorial technical minimal workspace override',
      node: document.appearance
    },
    {
      id: 'pdf-refresh',
      category: 'preview',
      title: 'Refresh PDF automatically',
      keywords: 'pdf preview regenerate',
      node: (
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
      )
    },
    {
      id: 'rendering',
      category: 'preview',
      title: 'Math and diagrams',
      keywords: 'math katex equations mermaid diagrams render',
      node: document.rendering
    },
    {
      id: 'pdf-export',
      category: 'export',
      title: 'PDF export',
      keywords: 'page size margins header footer paper orientation',
      node: document.pdf
    },
    {
      id: 'html-export',
      category: 'export',
      title: 'HTML export',
      keywords: 'embed images',
      node: document.html
    },
    {
      id: 'presets',
      category: 'export',
      title: 'Export presets',
      keywords: 'preset default export',
      node: document.presets
    },
    {
      id: 'explorer-mode',
      category: 'files',
      title: 'Explorer presentation',
      keywords: 'list thumbnails tree',
      node: (
        <Row label="Presentation" htmlFor="setting-explorer-mode">
          <select
            id="setting-explorer-mode"
            className="select"
            value={settings.explorer.mode}
            onChange={(e) => setExplorerMode(e.target.value as ExplorerMode)}
          >
            <option value="tree">List</option>
            <option value="thumbnails">Thumbnails</option>
          </select>
        </Row>
      )
    },
    {
      id: 'thumb-size',
      category: 'files',
      title: 'Thumbnail size',
      keywords: 'explorer images',
      node: (
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
      )
    },
    {
      id: 'asset-folder',
      category: 'files',
      title: 'Asset folder',
      keywords: 'images drop copy assets directory',
      node: (
        <Row
          label="Asset folder"
          htmlFor="setting-assets"
          hint="Images dropped from outside the project are copied here, relative to the project folder."
        >
          <AssetDirectoryInput />
        </Row>
      )
    },
    {
      id: 'author',
      category: 'files',
      title: 'Author name',
      keywords: 'templates author',
      node: (
        <Row
          label="Author name"
          htmlFor="setting-author"
          hint="Offered when a template asks for an author. It is never filled in without your say."
        >
          <AuthorInput />
        </Row>
      )
    },
    {
      id: 'restore',
      category: 'files',
      title: 'Reopen last folder on startup',
      keywords: 'workspace folder restore startup',
      node: (
        <Row label="Reopen last folder on startup" htmlFor="setting-restore">
          <Toggle
            id="setting-restore"
            checked={settings.workspace.restoreLastWorkspace}
            onChange={(v) => update({ workspace: { restoreLastWorkspace: v } })}
          />
        </Row>
      )
    },
    {
      id: 'recent',
      category: 'files',
      title: 'Recent folders',
      keywords: 'clear history workspace',
      node: (
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
      )
    },
    {
      id: 'ai',
      category: 'ai',
      title: 'AI assistance',
      keywords:
        'ai copilot openai provider model api key completion inline suggestions rewrite privacy ollama',
      node: <AiSettings />
    },
    {
      id: 'settings-file',
      category: 'advanced',
      title: 'Settings file',
      keywords: 'json location storage reset',
      node: (
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
      )
    }
  ]

  const visible = useMemo(
    () => entries.filter((entry) => matchesQuery(entry, query)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entries are rebuilt every render
    [query, settings, document]
  )
  const shown = new Set(visible.map((e) => e.category))

  // Jump to the category a command asked for.
  useEffect(() => {
    if (!target) return
    setQuery('')
    requestAnimationFrame(() => {
      scroller.current
        ?.querySelector(`#settings-category-${target.category}`)
        ?.scrollIntoView({ block: 'start' })
      setActive(target.category)
    })
  }, [target])

  // Follow the scroll position in the category list.
  const onScroll = () => {
    const root = scroller.current
    if (!root) return
    const top = root.getBoundingClientRect().top + 24
    let current: SettingsCategoryId | null = null
    for (const { id } of SETTINGS_CATEGORIES) {
      const section = root.querySelector(`#settings-category-${id}`)
      if (section && section.getBoundingClientRect().top <= top) current = id
    }
    if (current) setActive(current)
  }

  const go = (id: SettingsCategoryId) => {
    setQuery('')
    requestAnimationFrame(() => {
      scroller.current
        ?.querySelector(`#settings-category-${id}`)
        ?.scrollIntoView({ block: 'start' })
      setActive(id)
    })
  }

  return (
    <section
      className="settings-page"
      aria-label="Settings"
      data-testid="settings-panel"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault()
          closeSettings()
        }
      }}
    >
      <header className="settings-page-header">
        <h1>Settings</h1>
        <div className="settings-search">
          <Search size={14} aria-hidden />
          <input
            ref={searchRef}
            type="search"
            className="text-input"
            placeholder="Search settings"
            aria-label="Search settings"
            data-testid="settings-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="icon-button"
          title="Close settings (Esc)"
          aria-label="Close settings"
          data-testid="settings-close"
          onClick={closeSettings}
        >
          <X size={16} />
        </button>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings categories">
          {SETTINGS_CATEGORIES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`settings-nav-item${active === id ? ' active' : ''}`}
              aria-current={active === id ? 'true' : undefined}
              disabled={query !== '' && !shown.has(id)}
              data-testid={`settings-nav-${id}`}
              onClick={() => go(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-scroll" ref={scroller} onScroll={onScroll}>
          <div className="settings-content">
            {visible.length === 0 && (
              <p className="setting-hint" data-testid="settings-empty">
                No settings match “{query}”.
              </p>
            )}
            {SETTINGS_CATEGORIES.filter(({ id }) => shown.has(id)).map(({ id, label }) => (
              <section
                key={id}
                id={`settings-category-${id}`}
                className="settings-category"
                aria-labelledby={`settings-heading-${id}`}
              >
                <h2 id={`settings-heading-${id}`}>{label}</h2>
                {visible
                  .filter((entry) => entry.category === id)
                  .map((entry) => (
                    <div key={entry.id} data-setting={entry.id}>
                      {entry.node}
                    </div>
                  ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
