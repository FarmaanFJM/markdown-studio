import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

interface SplitterProps {
  label: string
  /** Called with the pointer's x coordinate while dragging. */
  onDrag(clientX: number): void
  /** Keyboard resizing: called with -1 or +1. */
  onStep(direction: -1 | 1): void
  onReset(): void
  testId?: string
}

/** A vertical draggable divider between two panes. */
export function Splitter({ label, onDrag, onStep, onReset, testId }: SplitterProps) {
  const dragging = useRef(false)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add('resizing')
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onDrag(event.clientX)
  }
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    document.body.classList.remove('resizing')
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') onStep(-1)
    else if (event.key === 'ArrowRight') onStep(1)
    else return
    event.preventDefault()
  }

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  )
}
