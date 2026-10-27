import { useEffect } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { aiAvailability, BLOCK_MESSAGES } from '@shared/ai/availability'
import { pathsEqual } from '@shared/paths'
import { AI_PROVIDERS } from '@shared/ai/types'
import { activeDocument, useDocuments } from '../state/documents'
import { useSettings } from '../state/settings'
import { openSettings } from '../state/ui'
import { useWorkspace } from '../state/workspace'
import { aiCommands } from './commands'
import { useAi } from './state'

/** Sidebar of the AI assistant: status, per-document and per-workspace switches and actions. */
export function AiPanel() {
  const ai = useSettings((s) => s.settings.ai)
  const update = useSettings((s) => s.update)
  const root = useWorkspace((s) => s.root)
  const docPath = useDocuments((s) => s.documents.find((d) => d.id === s.activeId)?.path ?? null)
  const hasDocument = useDocuments((s) => s.activeId !== null)
  const busy = useAi((s) => s.busy)
  const status = useAi((s) => s.status)
  useEffect(() => void useAi.getState().refreshStatus(), [])

  const copilot = useAi((s) => s.copilot)
  const availability = aiAvailability(ai, root, docPath, copilot.state)
  const provider = AI_PROVIDERS.find((p) => p.id === ai.provider)
  const workspaceOff = root !== null && ai.disabledWorkspaces.some((w) => pathsEqual(w, root))
  const documentOff = docPath !== null && ai.disabledDocuments.some((d) => pathsEqual(d, docPath))

  return (
    <section className="sidebar-view ai-panel" aria-label="AI assistant" data-testid="ai-panel">
      <header className="sidebar-header">
        <span className="sidebar-title">AI Assistant</span>
        <div className="sidebar-actions">
          <button
            type="button"
            className="icon-button"
            title="AI settings"
            aria-label="AI settings"
            data-testid="ai-open-settings"
            onClick={() => openSettings('ai')}
          >
            <SettingsIcon size={15} />
          </button>
        </div>
      </header>
      <div className="sidebar-body ai-body">
        <div className="ai-status" role="status" data-testid="ai-status">
          <strong>{availability.available ? 'Ready' : 'Not active'}</strong>
          <span>
            {availability.available
              ? ai.provider === 'github-copilot'
                ? `GitHub Copilot${copilot.user ? ` · ${copilot.user}` : ''}`
                : `${provider?.name ?? 'Provider'} · ${ai.model}`
              : BLOCK_MESSAGES[availability.blocked ?? 'off']}
          </span>
        </div>

        {!ai.enabled && (
          <p className="setting-hint">
            AI is optional and off. Markdown Studio works fully without it, and no text leaves this
            computer unless you turn it on and choose a provider.
          </p>
        )}
        {!ai.enabled && (
          <button
            type="button"
            className="button"
            data-testid="ai-configure"
            onClick={() => openSettings('ai')}
          >
            Set up AI…
          </button>
        )}

        {ai.enabled && (
          <>
            <h3 className="settings-section">Write</h3>
            <div className="ai-actions">
              <button
                type="button"
                className="button"
                disabled={!availability.available || !hasDocument || busy !== null}
                data-testid="ai-continue"
                onClick={aiCommands.continueWriting}
              >
                Continue writing
              </button>
              <button
                type="button"
                className="button"
                disabled={
                  !availability.available ||
                  !hasDocument ||
                  busy !== null ||
                  provider?.capabilities.rewrite === false
                }
                title={provider?.capabilities.rewrite === false ? provider.limitations : undefined}
                data-testid="ai-rewrite"
                onClick={aiCommands.rewriteSelection}
              >
                Rewrite selection…
              </button>
            </div>
            {busy !== null && <p className="setting-hint">Waiting for the provider…</p>}
            {status && !status.hasKey && ai.provider === 'openai-compatible' && (
              <p className="setting-hint">No API key is stored. Local models do not need one.</p>
            )}

            <h3 className="settings-section">Where AI is allowed</h3>
            <label className="ai-check">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={!workspaceOff}
                disabled={root === null}
                data-testid="ai-workspace-toggle"
                onChange={aiCommands.toggleForWorkspace}
              />
              <span>This workspace</span>
            </label>
            <label className="ai-check">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={!documentOff}
                disabled={!hasDocument || activeDocument()?.path == null}
                data-testid="ai-document-toggle"
                onChange={aiCommands.toggleForDocument}
              />
              <span>This document</span>
            </label>
            <p className="setting-hint">
              Remembered per folder and per file. Unsaved documents cannot be remembered yet.
            </p>
            <label className="ai-check">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={ai.inlineSuggestions}
                data-testid="ai-inline-toggle"
                onChange={(e) => update({ ai: { inlineSuggestions: e.target.checked } })}
              />
              <span>Suggest while typing</span>
            </label>
          </>
        )}

        <h3 className="settings-section">Providers</h3>
        <ul className="ai-providers">
          {AI_PROVIDERS.map((p) => (
            <li key={p.id} data-testid={`ai-provider-${p.id}`}>
              <strong>
                {p.name}
                {p.id === ai.provider && ai.enabled ? ' (active)' : ''}
              </strong>
              <span className="setting-hint">{p.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
