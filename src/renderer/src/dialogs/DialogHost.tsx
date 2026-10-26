import { Fragment, useEffect, useRef, useState } from 'react'
import type { AppInfo } from '@shared/ipc'
import { api } from '../bridge'
import logo from '../assets/logo-128.png'
import { EDITOR_SHORTCUTS, SHORTCUTS, shortcutLabel, type ShortcutGroup } from '@shared/shortcuts'
import { useUi, type DialogRequest } from '../state/ui'
import { Modal } from './Modal'

function UnsavedDialog({ request }: { request: Extract<DialogRequest, { kind: 'unsaved' }> }) {
  const many = request.fileNames.length > 1
  return (
    <Modal
      title="Unsaved Changes"
      onCancel={() => request.resolve('cancel')}
      footer={
        <>
          <button
            type="button"
            className="button primary"
            data-autofocus
            onClick={() => request.resolve('save')}
          >
            {many ? 'Save All' : 'Save'}
          </button>
          <button type="button" className="button" onClick={() => request.resolve('discard')}>
            Don't Save
          </button>
          <button type="button" className="button" onClick={() => request.resolve('cancel')}>
            Cancel
          </button>
        </>
      }
    >
      <p>
        {many
          ? `Do you want to save the changes to ${request.fileNames.length} documents?`
          : `Do you want to save the changes you made to ${request.fileNames[0]}?`}
      </p>
      {many && (
        <ul className="file-list">
          {request.fileNames.map((name, i) => (
            <li key={`${name}-${i}`}>{name}</li>
          ))}
        </ul>
      )}
      <p className="muted">Your changes will be lost if you don't save them.</p>
    </Modal>
  )
}

function ConfirmDialog({ request }: { request: Extract<DialogRequest, { kind: 'confirm' }> }) {
  return (
    <Modal
      title={request.title}
      onCancel={() => request.resolve(false)}
      footer={
        <>
          <button
            type="button"
            className={`button ${request.danger ? 'danger' : 'primary'}`}
            data-autofocus
            onClick={() => request.resolve(true)}
          >
            {request.confirmLabel}
          </button>
          <button type="button" className="button" onClick={() => request.resolve(false)}>
            Cancel
          </button>
        </>
      }
    >
      <p>{request.message}</p>
      {request.detail && <p className="muted pre-line">{request.detail}</p>}
    </Modal>
  )
}

function PromptDialog({ request }: { request: Extract<DialogRequest, { kind: 'prompt' }> }) {
  const [value, setValue] = useState(request.initialValue)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.setSelectionRange(0, request.selectLength ?? input.value.length)
  }, [request])

  const submit = () => {
    const problem = request.validate?.(value) ?? null
    if (problem) {
      setError(problem)
      return
    }
    request.resolve(value.trim())
  }

  return (
    <Modal
      title={request.title}
      onCancel={() => request.resolve(null)}
      footer={
        <>
          <button type="button" className="button primary" onClick={submit}>
            {request.confirmLabel}
          </button>
          <button type="button" className="button" onClick={() => request.resolve(null)}>
            Cancel
          </button>
        </>
      }
    >
      <label className="field-label" htmlFor="prompt-input">
        {request.label}
      </label>
      <input
        id="prompt-input"
        ref={inputRef}
        className="text-input wide"
        value={value}
        spellCheck={false}
        aria-invalid={error !== null}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
      {error && <p className="field-error">{error}</p>}
    </Modal>
  )
}

function ChoiceDialog({ request }: { request: Extract<DialogRequest, { kind: 'choice' }> }) {
  return (
    <Modal
      title={request.title}
      wide
      onCancel={() => request.resolve(null)}
      footer={
        <>
          {request.options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              className={`button${option.primary ? ' primary' : ''}${option.danger ? ' danger' : ''}`}
              data-autofocus={
                option.primary || (index === 0 && !request.options.some((o) => o.primary))
                  ? ''
                  : undefined
              }
              onClick={() => request.resolve(option.value)}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            className={`button${request.options.length === 0 ? ' primary' : ''}`}
            data-autofocus={request.options.length === 0 ? '' : undefined}
            onClick={() => request.resolve(null)}
          >
            {request.options.length === 0 ? 'Close' : 'Cancel'}
          </button>
        </>
      }
    >
      <p>{request.message}</p>
      {request.items && request.items.length > 0 && (
        <ul className="file-list scroll-list">
          {request.items.map((item, i) => (
            <li key={`${item}-${i}`}>{item}</li>
          ))}
        </ul>
      )}
      {request.detail && <p className="muted pre-line">{request.detail}</p>}
    </Modal>
  )
}

function AboutDialog({ request }: { request: Extract<DialogRequest, { kind: 'about' }> }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void api.app.info().then(setInfo)
  }, [])
  return (
    <Modal
      title="About Markdown Studio"
      onCancel={() => request.resolve()}
      footer={
        <button
          type="button"
          className="button primary"
          data-autofocus
          onClick={() => request.resolve()}
        >
          Close
        </button>
      }
    >
      <div className="about">
        <img src={logo} alt="Markdown Studio logo" width={72} height={72} />
        <div>
          <div className="about-name">Markdown Studio</div>
          <div className="muted">Version {info?.version ?? '…'}</div>
        </div>
      </div>
      <p>A dedicated desktop editor for writing, previewing and exporting Markdown.</p>
      {info && (
        <dl className="about-details">
          <dt>Electron</dt>
          <dd>{info.electron}</dd>
          <dt>Chromium</dt>
          <dd>{info.chrome}</dd>
          <dt>Node.js</dt>
          <dd>{info.node}</dd>
          <dt>Platform</dt>
          <dd>{info.platform}</dd>
        </dl>
      )}
      <p className="muted">Released under the MIT License. © 2026 FarmaanFJM.</p>
      <p className="muted" data-testid="about-citeproc">
        Citations: APA Style 7th edition, formatted by citeproc-js (CPAL 1.0) with the Citation
        Style Language styles and locales (CC BY-SA 3.0). See THIRD_PARTY_NOTICES.md.
      </p>
    </Modal>
  )
}

const GROUPS: ShortcutGroup[] = [
  'Formatting',
  'Insert',
  'Editing',
  'Navigation',
  'Preview',
  'Files',
  'Application'
]

function ShortcutsDialog({ request }: { request: Extract<DialogRequest, { kind: 'shortcuts' }> }) {
  const platform = window.markdownStudio.platform
  return (
    <Modal
      title="Keyboard Shortcuts"
      wide
      onCancel={() => request.resolve()}
      footer={
        <button
          type="button"
          className="button primary"
          data-autofocus
          onClick={() => request.resolve()}
        >
          Close
        </button>
      }
    >
      <table className="shortcut-table">
        <tbody>
          {GROUPS.map((group) => (
            <Fragment key={group}>
              <tr>
                <th colSpan={2} className="shortcut-group">
                  {group}
                </th>
              </tr>
              {SHORTCUTS.filter((spec) => spec.group === group).map((spec) => (
                <tr key={spec.id}>
                  <td>{spec.label}</td>
                  <td>
                    <kbd>{shortcutLabel(spec, platform)}</kbd>
                  </td>
                </tr>
              ))}
              {group === 'Editing' &&
                EDITOR_SHORTCUTS.map((s) => (
                  <tr key={s.label}>
                    <td>{s.label}</td>
                    <td>
                      <kbd>{(platform === 'darwin' && s.macKeys) || s.keys}</kbd>
                    </td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

function DialogView({ request }: { request: DialogRequest }) {
  switch (request.kind) {
    case 'unsaved':
      return <UnsavedDialog request={request} />
    case 'confirm':
      return <ConfirmDialog request={request} />
    case 'prompt':
      return <PromptDialog request={request} />
    case 'about':
      return <AboutDialog request={request} />
    case 'shortcuts':
      return <ShortcutsDialog request={request} />
    case 'choice':
      return <ChoiceDialog request={request} />
    case 'custom':
      return <>{request.render(request.resolve)}</>
  }
}

/**
 * Renders every open dialog, newest on top. Dialogs below the top one stay mounted (so a
 * manager window keeps its state while a confirmation is shown) but cannot be interacted with.
 */
export function DialogHost() {
  const requests = useUi((s) => s.dialogs)
  return (
    <>
      {requests.map((request, index) => (
        <div key={index} inert={index < requests.length - 1}>
          <DialogView request={request} />
        </div>
      ))}
    </>
  )
}
