import { useEffect, useId, useRef, type ReactNode } from 'react'

export interface ModalProps {
  title: string
  onCancel(): void
  children: ReactNode
  footer: ReactNode | null
  /** `wide` suits forms and lists, `xwide` grids such as the table editor. */
  size?: 'normal' | 'wide' | 'xwide'
  /** Kept for the Phase 1 dialogs. */
  wide?: boolean
  className?: string
  /** Show the dialog near the top of the window instead of the usual position. */
  top?: boolean
}

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.offsetParent !== null || element === document.activeElement
  )
}

/**
 * The shared dialog frame: focus moves in on open and returns to the previous element on close,
 * Tab and Shift+Tab stay inside the dialog, Escape cancels, and clicking the backdrop cancels.
 */
export function Modal({
  title,
  onCancel,
  children,
  footer,
  size,
  wide,
  className,
  top
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current
    first?.focus()
    return () => previous?.focus?.()
  }, [])

  const width = size ?? (wide ? 'wide' : 'normal')
  return (
    <div
      className={`modal-backdrop${top ? ' top' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={ref}
        className={`modal${width === 'normal' ? '' : ` ${width}`}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
            return
          }
          if (e.key !== 'Tab' || !ref.current) return
          const items = focusableIn(ref.current)
          if (items.length === 0) {
            e.preventDefault()
            return
          }
          const first = items[0]
          const last = items[items.length - 1]
          const active = document.activeElement
          if (e.shiftKey && (active === first || active === ref.current)) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && active === last) {
            e.preventDefault()
            first.focus()
          }
        }}
      >
        <h2 className="modal-title" id={titleId}>
          {title}
        </h2>
        <div className="modal-body">{children}</div>
        {footer !== null && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
