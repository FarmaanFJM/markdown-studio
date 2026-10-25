import { useEffect, useRef, type ReactNode } from 'react'

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

/**
 * The shared dialog frame: focus moves in on open and returns to the previous element on close,
 * Escape cancels, and clicking the backdrop cancels.
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
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
      >
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        {footer !== null && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
