'use client'
// Sheet — the shared modal container: bottom-sheet on mobile, centered card
// (or right-side rail) on desktop. Every consumer gets, for free, the a11y
// and mobile behaviors the hand-rolled modals kept missing: focus trap +
// restore, Escape, body scroll-lock, max-height with internal scroll,
// safe-area-padded footer, and the standard ink-950/55 scrim at z-[80]
// (ConfirmModal stays above at z-[90], toasts above both at z-[95]).
//
// Usage:
//   <Sheet open={open} onClose={close} title="გადადება" size="md"
//          footer={<Btn onClick={submit}>გაგზავნა</Btn>}>
//     …scrollable body…
//   </Sheet>
//
// `variant="side"` renders a full-height right rail on desktop (filters,
// quick-book) while staying a bottom sheet on mobile.

import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  eyebrow?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'sheet' | 'side'
  // Blocks backdrop/Escape close while a mutation is in flight.
  busy?: boolean
  closeOnBackdrop?: boolean
  role?: 'dialog' | 'alertdialog'
  ariaLabel?: string
}

const MAX_W: Record<NonNullable<Props['size']>, string> = {
  sm: 'sm:max-w-[440px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[880px]',
}

export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  size = 'md',
  variant = 'sheet',
  busy = false,
  closeOnBackdrop = true,
  role = 'dialog',
  ariaLabel,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  // Escape + focus trap + focus restore + body scroll-lock.
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Move focus into the panel so the trap has a starting point.
    const t = setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const first = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      ;(first ?? panel).focus()
    }, 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) { onClose(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = [...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(el => el.offsetParent !== null)
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      restoreRef.current?.focus?.()
    }
  }, [open, busy, onClose])

  if (!open) return null

  const side = variant === 'side'

  return (
    <div
      className={`fixed inset-0 z-[80] flex ${
        side
          ? 'items-end sm:items-stretch sm:justify-end'
          : 'items-end sm:items-center sm:justify-center sm:p-4'
      }`}
    >
      <button
        type="button"
        aria-label="დახურვა"
        tabIndex={-1}
        onClick={() => { if (closeOnBackdrop && !busy) onClose() }}
        className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm motion-safe:animate-fade-in-fast"
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        tabIndex={-1}
        className={`relative w-full bg-white shadow-float flex flex-col outline-none ${
          side
            ? `rounded-t-card sm:rounded-none max-h-[85vh] sm:max-h-none sm:h-full ${MAX_W[size]} motion-safe:animate-slide-in-b sm:motion-safe:animate-slide-in-r`
            : `rounded-t-card sm:rounded-card max-h-[85vh] sm:max-h-[calc(100vh-32px)] ${MAX_W[size]} motion-safe:animate-slide-in-b sm:motion-safe:animate-scale-in`
        }`}
      >
        {(title || eyebrow) && (
          <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-ink-100 shrink-0 flex items-start justify-between gap-4">
            <div className="min-w-0">
              {eyebrow && (
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-brand-700 mb-1">
                  {eyebrow}
                </div>
              )}
              {title && (
                <div className="font-display text-[16px] font-bold text-ink-900 tracking-tight">
                  {title}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { if (!busy) onClose() }}
              aria-label="დახურვა"
              className="w-9 h-9 -mr-1.5 -mt-1 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center shrink-0 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4">
          {children}
        </div>
        {footer && (
          <div className="px-5 sm:px-6 pt-3 border-t border-ink-100 shrink-0 pb-[max(16px,env(safe-area-inset-bottom))] sm:pb-4 flex items-center justify-end gap-2 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
