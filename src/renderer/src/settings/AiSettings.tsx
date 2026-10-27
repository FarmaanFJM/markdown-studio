import { useEffect, useState } from 'react'
import { checkAiEndpoint, normalizeAiModel } from '@shared/ai/endpoint'
import type { CopilotStatus } from '@shared/ai/copilot'
import { AI_LIMITS, AI_PROVIDERS, type AiProviderId } from '@shared/ai/types'
import { useAi } from '../ai/state'
import { errorMessage } from '../bridge'
import { api } from '../bridge'
import { useSettings } from '../state/settings'
import { notify } from '../state/ui'
import { Row, Toggle } from './controls'

function EndpointInput() {
  const stored = useSettings((s) => s.settings.ai.endpoint)
  const update = useSettings((s) => s.update)
  const [value, setValue] = useState(stored)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setValue(stored), [stored])
  const commit = () => {
    const check = checkAiEndpoint(value)
    if (!check.url) return setError(check.problem)
    setError(null)
    setValue(check.url)
    if (check.url !== stored) update({ ai: { endpoint: check.url } })
  }
  return (
    <div className="stacked wide">
      <input
        id="setting-ai-endpoint"
        className="text-input"
        value={value}
        spellCheck={false}
        maxLength={AI_LIMITS.endpointLength}
        aria-invalid={error !== null}
        data-testid="ai-endpoint"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

function ModelInput() {
  const stored = useSettings((s) => s.settings.ai.model)
  const update = useSettings((s) => s.update)
  const [value, setValue] = useState(stored)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setValue(stored), [stored])
  const commit = () => {
    if (value.trim() === '') {
      setError(null)
      if (stored !== '') update({ ai: { model: '' } })
      return
    }
    const model = normalizeAiModel(value)
    if (!model) return setError('Use the model name exactly as the service lists it.')
    setError(null)
    setValue(model)
    if (model !== stored) update({ ai: { model } })
  }
  return (
    <div className="stacked wide">
      <input
        id="setting-ai-model"
        className="text-input"
        value={value}
        spellCheck={false}
        placeholder="For example gpt-4o-mini or llama3.1"
        aria-invalid={error !== null}
        data-testid="ai-model"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

function KeyInput() {
  const status = useAi((s) => s.status)
  const [value, setValue] = useState('')
  useEffect(() => void useAi.getState().refreshStatus(), [])
  const save = async () => {
    try {
      useAi.getState().setStatus(await api.ai.setKey(value))
      setValue('')
      notify('success', 'API key stored, encrypted by this computer.')
    } catch (error) {
      notify('error', errorMessage(error))
    }
  }
  return (
    <div className="ai-key">
      <div className="inline-row">
        <input
          id="setting-ai-key"
          className="text-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={status?.hasKey ? '•••••••• (stored)' : 'Paste an API key'}
          value={value}
          data-testid="ai-key"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value && void save()}
        />
        <button
          type="button"
          className="button"
          disabled={value.trim() === ''}
          data-testid="ai-key-save"
          onClick={() => void save()}
        >
          Save key
        </button>
        <button
          type="button"
          className="button"
          disabled={!status?.hasKey}
          data-testid="ai-key-remove"
          onClick={async () => useAi.getState().setStatus(await api.ai.clearKey())}
        >
          Remove
        </button>
      </div>
      <p className="setting-hint">
        {status?.canStoreKey === false
          ? 'This computer has no credential store, so keys cannot be kept. Local models do not need one.'
          : 'The key is encrypted by your operating system and kept outside the settings file. Local models do not need one.'}
      </p>
    </div>
  )
}

const COPILOT_STATE_TEXT: Record<CopilotStatus['state'], string> = {
  off: 'Not connected',
  unavailable: 'Unavailable',
  starting: 'Connecting…',
  'signed-out': 'Not signed in',
  pending: 'Waiting for you to finish signing in on GitHub',
  'signed-in': 'Connected',
  'no-access': 'Signed in, but no Copilot access',
  error: 'Error'
}

/** GitHub account, sign-in and sign-out for the Copilot provider. Credentials never reach this page. */
function CopilotAccount() {
  const copilot = useAi((s) => s.copilot)
  const [busy, setBusy] = useState(false)
  useEffect(() => void useAi.getState().refreshCopilot(), [])
  const run = async (action: () => Promise<CopilotStatus>) => {
    setBusy(true)
    try {
      useAi.getState().setCopilot(await action())
    } catch (error) {
      notify('error', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const canSignIn = ['signed-out', 'error', 'no-access'].includes(copilot.state)
  return (
    <div className="copilot-account" data-testid="copilot-account">
      <div className="copilot-status" role="status" data-testid="copilot-status">
        <strong data-testid="copilot-state">{COPILOT_STATE_TEXT[copilot.state]}</strong>
        {copilot.user && (
          <span data-testid="copilot-user">
            Signed in as <b>{copilot.user}</b>
          </span>
        )}
        {copilot.message && <span className="setting-hint">{copilot.message}</span>}
        {copilot.serverVersion && (
          <span className="setting-hint" data-testid="copilot-server-version">
            GitHub Copilot language server {copilot.serverVersion}
          </span>
        )}
      </div>
      {copilot.state === 'pending' && copilot.userCode && (
        <div className="copilot-code" data-testid="copilot-pending">
          <p className="setting-hint">
            Enter this code on GitHub to connect your account. A browser window should have opened
            at {copilot.verificationUri}.
          </p>
          <code className="copilot-user-code" data-testid="copilot-code">
            {copilot.userCode}
          </code>
        </div>
      )}
      <div className="inline-row">
        {canSignIn && (
          <button
            type="button"
            className="button primary"
            disabled={busy}
            data-testid="copilot-sign-in"
            onClick={() => void run(api.copilot.signIn)}
          >
            {copilot.needsReauth ? 'Sign in with GitHub again' : 'Sign in with GitHub'}
          </button>
        )}
        {copilot.state === 'pending' && (
          <>
            {copilot.userCode && (
              <button
                type="button"
                className="button"
                onClick={() => void navigator.clipboard?.writeText(copilot.userCode ?? '')}
              >
                Copy code
              </button>
            )}
            {copilot.verificationUri && (
              <button
                type="button"
                className="button"
                onClick={() => void api.shell.openExternal(copilot.verificationUri ?? '')}
              >
                Open GitHub
              </button>
            )}
            <button
              type="button"
              className="button"
              disabled={busy}
              data-testid="copilot-cancel"
              onClick={() => void run(api.copilot.cancelSignIn)}
            >
              Cancel
            </button>
          </>
        )}
        {(copilot.state === 'signed-in' || copilot.state === 'no-access') && (
          <button
            type="button"
            className="button"
            disabled={busy}
            data-testid="copilot-sign-out"
            onClick={() => void run(api.copilot.signOut)}
          >
            Sign out
          </button>
        )}
      </div>
      <p className="setting-hint">
        Sign-in uses GitHub’s own device flow in your browser. Markdown Studio never sees your
        password or token: the session is kept by the GitHub Copilot language server in a private
        folder of this application, separate from other editors’ Copilot sign-ins. Copilot needs an
        active GitHub Copilot plan (including Copilot Free) and is subject to its usage limits.
      </p>
      <p className="setting-hint" data-testid="copilot-privacy">
        <strong>What is sent.</strong> While Copilot is on and you are signed in, the document you
        are editing is shared with the Copilot language server on this computer, and the server
        sends the context it chooses (at least the text around the cursor, possibly more of the
        document) to GitHub to produce each suggestion. Markdown Studio does not control or limit
        that context. Documents or folders switched off below are never shared. Nothing is sent when
        AI is off, when you are signed out, or for documents that are blocked.
      </p>
    </div>
  )
}

/** The AI category of the Settings page. */
export function AiSettings() {
  const ai = useSettings((s) => s.settings.ai)
  const update = useSettings((s) => s.update)
  const provider = AI_PROVIDERS.find((p) => p.id === ai.provider)

  return (
    <>
      <p className="setting-hint section-note">
        AI writing help is optional. With it off — the default — nothing in Markdown Studio uses AI
        and no text leaves your computer. When on, only the text an action needs (the selection or
        the text around the cursor) is sent to the provider you choose, and only when you ask or
        when you have turned on suggestions while typing.
      </p>
      <Row label="Enable AI assistance" htmlFor="setting-ai-enabled">
        <Toggle
          id="setting-ai-enabled"
          checked={ai.enabled}
          onChange={(v) => update({ ai: { enabled: v } })}
        />
      </Row>
      <Row label="Provider" htmlFor="setting-ai-provider">
        <select
          id="setting-ai-provider"
          className="select"
          value={ai.provider}
          data-testid="ai-provider"
          onChange={(e) => update({ ai: { provider: e.target.value as AiProviderId } })}
        >
          <option value="none">None</option>
          {AI_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Row>
      {provider && <p className="setting-hint">{provider.description}</p>}
      {provider && provider.limitations && (
        <p className="setting-hint" data-testid="ai-provider-limits">
          {provider.limitations}
        </p>
      )}
      {ai.provider === 'github-copilot' && <CopilotAccount />}
      {ai.provider === 'openai-compatible' && (
        <>
          <Row
            label="Service address"
            htmlFor="setting-ai-endpoint"
            hint="Must be https://, except for a model on this computer (http://localhost)."
          >
            <EndpointInput />
          </Row>
          <Row label="Model" htmlFor="setting-ai-model">
            <ModelInput />
          </Row>
          <Row label="API key" htmlFor="setting-ai-key">
            <span />
          </Row>
          <KeyInput />
        </>
      )}
      <Row
        label={
          ai.provider === 'github-copilot' ? 'Automatic inline suggestions' : 'Suggest while typing'
        }
        htmlFor="setting-ai-inline"
        hint={
          ai.provider === 'github-copilot'
            ? 'Asks Copilot for a ghost-text suggestion whenever you pause while typing. Off, you can still ask on demand with AI: Continue Writing. Accept with Tab, dismiss with Esc.'
            : 'Shows ghost-text continuations after you pause at the end of a line. This sends the text around the cursor to the provider while you write, so it is off unless you turn it on. Accept with Tab, dismiss with Esc.'
        }
      >
        <Toggle
          id="setting-ai-inline"
          checked={ai.inlineSuggestions}
          onChange={(v) => update({ ai: { inlineSuggestions: v } })}
        />
      </Row>
      {ai.provider === 'github-copilot' && (
        <Row
          label="Suggestion delay"
          htmlFor="setting-ai-delay"
          hint="How long to wait after you stop typing before Copilot is asked."
        >
          <select
            id="setting-ai-delay"
            className="select"
            value={ai.copilotDelayMs}
            data-testid="copilot-delay"
            onChange={(e) => update({ ai: { copilotDelayMs: Number(e.target.value) } })}
          >
            {[0, 150, 300, 600, 1000].map((ms) => (
              <option key={ms} value={ms}>
                {ms === 0 ? 'No delay' : `${ms} ms`}
              </option>
            ))}
          </select>
        </Row>
      )}
      <p className="setting-hint">
        Switch AI off for one folder or one document from the AI Assistant panel; the choice is
        remembered. Currently off for {ai.disabledWorkspaces.length} folder
        {ai.disabledWorkspaces.length === 1 ? '' : 's'} and {ai.disabledDocuments.length} document
        {ai.disabledDocuments.length === 1 ? '' : 's'}.
      </p>
    </>
  )
}
