import { BookOpen, Files, Settings, Sparkles } from 'lucide-react'
import type { SidebarView } from '@shared/settings'
import logo from '../assets/logo-128.png'
import { commands } from '../commands/commands'
import { useSettings } from '../state/settings'
import { closeSettings, openSettings, useUi } from '../state/ui'

/** Slim navigation bar. Only activities that exist in this version are shown. */
export function ActivityBar() {
  const { sidebarVisible, sidebarView } = useSettings((s) => s.settings.layout)
  const update = useSettings((s) => s.update)

  const settingsOpen = useUi((s) => s.settingsOpen)

  const toggle = (view: SidebarView) => {
    // From the Settings page an activity simply goes there; it is not a request to hide it.
    if (settingsOpen) closeSettings()
    const active = sidebarVisible && sidebarView === view && !settingsOpen
    update({ layout: { sidebarVisible: !active, sidebarView: view } })
  }

  const item = (view: SidebarView, label: string, shortcut: string, Icon: typeof Files) => {
    const active = sidebarVisible && sidebarView === view
    return (
      <button
        type="button"
        className={`activity-item${active ? ' active' : ''}`}
        title={shortcut ? `${label} (${shortcut})` : label}
        aria-label={label}
        aria-pressed={active}
        data-testid={`activity-${view}`}
        onClick={() => toggle(view)}
      >
        <Icon size={22} strokeWidth={1.5} />
      </button>
    )
  }

  return (
    <nav className="activity-bar" aria-label="Activities">
      <button
        type="button"
        className="activity-logo"
        title="About Markdown Studio"
        aria-label="About Markdown Studio"
        onClick={commands.about}
      >
        <img src={logo} alt="" width={26} height={26} />
      </button>
      {item('explorer', 'Explorer', 'Ctrl+Shift+E', Files)}
      {item('publication', 'Publication', 'Ctrl+Shift+J', BookOpen)}
      {item('ai', 'AI Assistant', '', Sparkles)}
      <div className="activity-spacer" />
      <button
        type="button"
        className={`activity-item${settingsOpen ? ' active' : ''}`}
        title="Settings (Ctrl+,)"
        aria-label="Settings"
        aria-pressed={settingsOpen}
        data-testid="activity-settings"
        onClick={() => (settingsOpen ? closeSettings() : openSettings())}
      >
        <Settings size={22} strokeWidth={1.5} />
      </button>
    </nav>
  )
}
