import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppInfo } from '@shared/ipc'
import { api } from '../bridge'
import logo from '../assets/logo-128.png'
import { EDITOR_SHORTCUTS, formatBinding, KEYBINDINGS } from '../commands/keybindings'
import { useUi, type DialogRequest } from '../state/ui'

interface ModalProps {
  title: string
  onCancel(): void
  children: ReactNode
  footer: ReactNode
  wide?: boolean
}

function Modal({ title, onCancel, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current
    first?.focus()
    return () => previous?.focus?.()
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={ref}
        className={`modal${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
      >
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  )
}

function UnsavedDialog({ request }: { request: Extract<DialogRequest, { kind: 'unsaved' }> }) {
  const many = request.fileNames.length > 1
  return (
    <Modal
      title="Unsaved Changes"
      onCancel={() => request.resolve('cancel')}
      footer={
        <>
          <button type="button" className="button primary" data-autofocus onClick={() => request.resolve('save')}>
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
        <button type="button" className="button primary" data-autofocus onClick={() => request.resolve()}>
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
    </Modal>
  )
}

function ShortcutsDialog({ request }: { request: Extract<DialogRequest, { kind: 'shortcuts' }> }) {
  const seen = new Set<string>()
  const app = KEYBINDINGS.filter((b) => (seen.has(b.label) ? false : (seen.add(b.label), true)))
  return (
    <Modal
      title="Keyboard Shortcuts"
      wide
      onCancel={() => request.resolve()}
      footer={
        <button type="button" className="button primary" data-autofocus onClick={() => request.resolve()}>
          Close
        </button>
      }
    >
      <table className="shortcut-table">
        <tbody>
          {app.map((b) => (
            <tr key={b.label}>
              <td>{b.label}</td>
              <td>
                <kbd>{formatBinding(b)}</kbd>
              </td>
            </tr>
          ))}
          {EDITOR_SHORTCUTS.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td>
                <kbd>{s.keys}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

/** Renders the front-most pending dialog. */
export function DialogHost() {
  const request = useUi((s) => s.dialogs[0])
  if (!request) return null
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
  }
}
