import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useUi } from '../state/ui'

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.kind === 'error' ? CircleAlert : toast.kind === 'success' ? CircleCheck : Info
        return (
          <div key={toast.id} className={`toast ${toast.kind}`} data-testid={`toast-${toast.kind}`}>
            <Icon size={16} className="toast-icon" />
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  toast.action!.run()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function ContextMenu() {
  const menu = useUi((s) => s.contextMenu)
  const hide = useUi((s) => s.hideContextMenu)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const { offsetWidth, offsetHeight } = ref.current
    setPosition({
      x: Math.min(menu.x, window.innerWidth - offsetWidth - 4),
      y: Math.min(menu.y, window.innerHeight - offsetHeight - 4)
    })
    ref.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) hide()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('blur', hide)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('blur', hide)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menu, hide])

  if (!menu) return null
  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
      onKeyDown={(e) => {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (e.key === 'ArrowDown') buttons[(index + 1) % buttons.length]?.focus()
        else if (e.key === 'ArrowUp') buttons[(index - 1 + buttons.length) % buttons.length]?.focus()
        else return
        e.preventDefault()
      }}
    >
      {menu.items.map((item) => (
        <div key={item.label}>
          {item.separatorBefore && <div className="menu-separator" role="separator" />}
          <button
            type="button"
            role="menuitem"
            className={`menu-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              hide()
              item.run()
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
