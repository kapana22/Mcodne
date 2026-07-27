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
import { Eyebrow } from '@/components/Eyebrow'

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

// ── Shared page-scroll lock ────────────────────────────────────────────────
// ROOT ELEMENT, VERTICAL AXIS ONLY. Two traps here, both verified in-browser:
//
//  1. The old `body.style.overflow = 'hidden'` shorthand also wrote
//     `overflow-x: hidden`, which the canon bans: `hidden` turns the body into
//     a scroll container and kills every `position: sticky` descendant
//     site-wide (globals.css deliberately uses `overflow-x: clip`).
//  2. Writing even `overflow-y: hidden` on the BODY is just as bad, because CSS
//     computes `clip` to `hidden` as soon as the other axis is hidden — so the
//     body's `overflow-x: clip` silently became `overflow-x: hidden` for as long
//     as the dialog was open (confirmed: computed body overflow-x read `hidden`).
//     It also doesn't lock anything: globals.css puts `overflow-x: clip` on
//     <html>, so the ROOT (not the body) is what the viewport takes its
//     scrolling from, and the page kept scrolling behind the dialog on iOS.
//
// So: touch `overflow-y` on <html> alone. The root's overflow is propagated to
// the viewport (the root element itself resolves to `visible`), which stops the
// page scroll without turning the body into a scroll container — sticky rails
// and app bars keep working, and the body's `overflow-x: clip` stays `clip`.
//
// Reference-counted so a ConfirmModal opened on top of a Sheet doesn't unlock
// the page when it closes while the Sheet is still open. Previous inline values
// are captured on the first lock and restored verbatim on the last unlock.
let lockCount = 0
let prevHtmlOverflowY = ''
let prevBodyPaddingRight = ''

export function lockPageScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  const html = document.documentElement
  const body = document.body
  if (lockCount === 0) {
    prevHtmlOverflowY = html.style.overflowY
    prevBodyPaddingRight = body.style.paddingRight
    // Compensate for the classic-scrollbar gutter so the page doesn't jump
    // sideways when the scrollbar disappears (no-op with overlay scrollbars).
    const gutter = window.innerWidth - html.clientWidth
    html.style.overflowY = 'hidden'
    if (gutter > 0) body.style.paddingRight = `${gutter}px`
  }
  lockCount++
  let released = false
  return () => {
    if (released) return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      html.style.overflowY = prevHtmlOverflowY
      body.style.paddingRight = prevBodyPaddingRight
    }
  }
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
  // Consumers pass inline arrow functions for `onClose`, so its identity changes
  // on EVERY parent render (a keystroke in an open sheet is enough). Depending
  // on it re-ran the whole effect — tearing down the lock and yanking focus back
  // to the trigger mid-typing. Read both through refs instead and keep the
  // effect keyed on `open` alone; consumers need no memoization.
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => {
    onCloseRef.current = onClose
    busyRef.current = busy
  })

  // Escape + focus trap + focus restore + page scroll-lock.
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    const unlock = lockPageScroll()
    // Move focus into the panel so the trap has a starting point.
    const t = setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const first = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      // preventScroll: the panel is a fixed overlay pinned to the top of the
      // viewport, so a plain focus() scrolled the PAGE BEHIND the sheet up to
      // meet it (measured: 500 → 56). Closing then dumped you at the top of the
      // list instead of where you were.
      ;(first ?? panel).focus({ preventScroll: true })
    }, 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) { onCloseRef.current(); return }
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
      unlock()
      restoreRef.current?.focus?.()
    }
  }, [open])

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
                <Eyebrow className="mb-1">
                  {eyebrow}
                </Eyebrow>
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
              <svg aria-hidden viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
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
