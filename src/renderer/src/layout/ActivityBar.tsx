import { Files, Settings } from 'lucide-react'
import type { SidebarView } from '@shared/settings'
import logo from '../assets/logo-128.png'
import { commands } from '../commands/commands'
import { useSettings } from '../state/settings'

/** Slim navigation bar. Only activities that exist in this version are shown. */
export function ActivityBar() {
  const { sidebarVisible, sidebarView } = useSettings((s) => s.settings.layout)
  const update = useSettings((s) => s.update)

  const toggle = (view: SidebarView) => {
    const active = sidebarVisible && sidebarView === view
    update({ layout: { sidebarVisible: !active, sidebarView: view } })
  }

  const item = (view: SidebarView, label: string, shortcut: string, Icon: typeof Files) => {
    const active = sidebarVisible && sidebarView === view
    return (
      <button
        type="button"
        className={`activity-item${active ? ' active' : ''}`}
        title={`${label} (${shortcut})`}
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
      <button type="button" className="activity-logo" title="About Markdown Studio" aria-label="About Markdown Studio" onClick={commands.about}>
        <img src={logo} alt="" width={26} height={26} />
      </button>
      {item('explorer', 'Explorer', 'Ctrl+Shift+E', Files)}
      <div className="activity-spacer" />
      {item('settings', 'Settings', 'Ctrl+,', Settings)}
    </nav>
  )
}
