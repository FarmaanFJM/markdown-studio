import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { basename } from '@shared/paths'
import type { MenuHeading } from '@shared/windowChrome'
import { api } from '../bridge'
import { documentName, useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'
import { useWorkspace } from '../state/workspace'

/** The window title: active document, folder and application name. */
export function useWindowTitle(): string {
  const doc = useDocuments((s) => s.documents.find((d) => d.id === s.activeId) ?? null)
  const root = useWorkspace((s) => s.root)
  const parts = [
    doc ? `${doc.dirty ? '● ' : ''}${documentName(doc)}` : null,
    root ? basename(root) : null,
    'Markdown Studio'
  ]
  return parts.filter(Boolean).join(' — ')
}

/**
 * Integrated title bar. The native caption buttons (minimise, maximise, close) are drawn by the
 * system over the right end of the bar, so they behave exactly like those of any other window.
 * On Windows and Linux the menu headings live here; macOS keeps its global menu bar.
 *
 * Only the empty parts of the bar drag the window; the menu headings are excluded (see CSS).
 */
export function TitleBar() {
  const title = useWindowTitle()
  const theme = useSettings((s) => s.settings.theme)
  const [headings, setHeadings] = useState<MenuHeading[]>([])
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    void api.app.menuHeadings().then(setHeadings, () => setHeadings([]))
  }, [])

  // The native caption buttons and system menus follow the application theme.
  useEffect(() => {
    void api.app.setTheme(theme)
  }, [theme])

  const open = (index: number) => {
    const rect = buttons.current[index]?.getBoundingClientRect()
    if (rect) void api.app.popupMenu(index, rect.left, rect.bottom)
  }

  // Alt+letter opens the matching menu, like the menu bar of any Windows application.
  useEffect(() => {
    if (headings.length === 0) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const index = headings.findIndex((h) => h.mnemonic === event.key.toLowerCase())
      if (index < 0) return
      event.preventDefault()
      open(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [headings])

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const move = (to: number) => buttons.current[(to + headings.length) % headings.length]?.focus()
    if (event.key === 'ArrowRight') move(index + 1)
    else if (event.key === 'ArrowLeft') move(index - 1)
    else if (event.key === 'ArrowDown') open(index)
    else return
    event.preventDefault()
  }

  return (
    <header className="title-bar" data-testid="title-bar" data-platform={api.platform}>
      {headings.length > 0 && (
        <nav className="title-menu" role="menubar" aria-label="Application menu">
          {headings.map((heading, index) => (
            <button
              key={heading.label}
              ref={(element) => {
                buttons.current[index] = element
              }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              className="title-menu-button"
              data-testid={`menu-${heading.label.toLowerCase()}`}
              onClick={() => open(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {heading.label}
            </button>
          ))}
        </nav>
      )}
      <div className="title-text" title={title} data-testid="title-text">
        {title}
      </div>
    </header>
  )
}
