import { FilePlus, FileText, FolderOpen } from 'lucide-react'
import { basename } from '@shared/paths'
import logo from '../assets/logo-128.png'
import { commands } from '../commands/commands'
import { useSettings } from '../state/settings'
import { useWorkspace } from '../state/workspace'

const mod = window.markdownStudio.platform === 'darwin' ? 'Cmd' : 'Ctrl'

/** Shown in the editor area when no document is open. */
export function Welcome() {
  const root = useWorkspace((s) => s.root)
  const recent = useSettings((s) => s.settings.workspace.recent)

  return (
    <div className="welcome" data-testid="welcome">
      <img src={logo} alt="Markdown Studio logo" className="welcome-logo" width={88} height={88} />
      <h1>Markdown Studio</h1>
      <p className="welcome-tagline">Write, preview and export Markdown.</p>
      <div className="welcome-actions">
        <button type="button" className="welcome-action" onClick={commands.newFile}>
          <FilePlus size={16} /> New Markdown File <kbd>{mod}+N</kbd>
        </button>
        <button type="button" className="welcome-action" onClick={() => void commands.openFile()}>
          <FileText size={16} /> Open File… <kbd>{mod}+O</kbd>
        </button>
        <button type="button" className="welcome-action" onClick={() => void commands.openFolder()}>
          <FolderOpen size={16} /> Open Folder…
        </button>
      </div>
      {!root && recent.length > 0 && (
        <div className="welcome-recent">
          <h2>Recent folders</h2>
          {recent.slice(0, 5).map((path) => (
            <button key={path} type="button" className="link-button" title={path} onClick={() => void commands.openFolder(path)}>
              {basename(path) || path} <span className="muted">{path}</span>
            </button>
          ))}
        </div>
      )}
      {root && (
        <p className="welcome-hint">
          Open a Markdown file from the Explorer. Drag images from the Explorer or from your file manager into a document to
          insert them.
        </p>
      )}
    </div>
  )
}
