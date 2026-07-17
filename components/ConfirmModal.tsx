'use client'
// ConfirmModal — shared confirmation dialog primitive.
//
// Usage:
//   <ConfirmModal
//     open={open}
//     title="ჯავშნის გაუქმება?"
//     body="თანხა დაბრუნდება escrow-ის შემდეგ"
//     tone="danger"
//     onConfirm={handleConfirm}
//     onCancel={() => setOpen(false)}
//     busy={busy}
//   />
//
// Behavior:
//   • role="alertdialog", aria-modal="true"
//   • aria-labelledby → title, aria-describedby → body (when present)
//   • Focus goes to cancel button on open (safer default for confirmations)
//   • Tab / Shift+Tab cycles inside the modal (focus trap)
//   • Escape or backdrop click → cancel (disabled while `busy`)
//   • `motion-safe:animate-[fadeIn_180ms_ease-out]` — respects prefers-reduced-motion
//   • Tone drives confirm-button color: danger/brand/warning
//   • busy → both buttons disabled + confirm shows "ინახება…"

import { useCallback, useEffect, useRef } from 'react'

type Tone = 'danger' | 'brand' | 'warning'

const TONE_CLS: Record<Tone, string> = {
  danger:  'bg-danger-500 hover:bg-danger-600 active:bg-danger-700 text-white focus-visible:ring-danger-300',
  brand:   'bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white focus-visible:ring-brand-300',
  warning: 'bg-warning-500 hover:bg-warning-600 active:bg-warning-700 text-white focus-visible:ring-warning-300',
}

type Props = {
  open: boolean
  title: string
  body?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: Tone
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  busy?: boolean
  // Independently disable the confirm button without triggering the "busy"
  // spinner UX — useful for gates like double-confirm ("type DELETE").
  confirmDisabled?: boolean
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'brand',
  onConfirm,
  onCancel,
  busy,
  confirmDisabled,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  // Remember the element that had focus before the dialog opened so we can
  // restore it on close — expected pattern for accessible modals.
  const restoreRef = useRef<HTMLElement | null>(null)

  const cancel = useCallback(() => {
    if (busy) return
    onCancel()
  }, [busy, onCancel])

  useEffect(() => {
    if (!open) return
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null
    // Focus the cancel button — for confirmations we want the safe default.
    // Slight delay lets the modal render + animate in before we grab focus.
    const t = window.setTimeout(() => cancelBtnRef.current?.focus(), 20)
    return () => {
      window.clearTimeout(t)
      restoreRef.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); return }
      if (e.key !== 'Tab') return
      const root = containerRef.current
      if (!root) return
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(n => !n.hasAttribute('disabled') && n.tabIndex !== -1)
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, cancel])

  if (!open) return null

  const cLabel = confirmLabel ?? 'დადასტურე'
  const xLabel = cancelLabel ?? 'გაუქმება'
  const titleId = 'confirm-modal-title'
  const descId = body ? 'confirm-modal-desc' : undefined

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-[fadeIn_180ms_ease-out]"
      ref={containerRef}
    >
      <button
        type="button"
        aria-label={xLabel}
        onClick={cancel}
        tabIndex={-1}
        className="absolute inset-0 bg-accent-900/55 backdrop-blur-sm"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full sm:max-w-[440px] bg-white sm:rounded-card rounded-t-card shadow-float overflow-hidden font-sans motion-safe:animate-scale-in"
      >
        <div className="px-6 pt-6 pb-4">
          <h2
            id={titleId}
            className="font-display text-[18px] font-bold text-ink-900 tracking-tight leading-snug"
          >
            {title}
          </h2>
          {body && (
            <div
              id={descId}
              className="mt-2 text-[13.5px] text-ink-600 leading-relaxed"
            >
              {body}
            </div>
          )}
        </div>
        <div className="px-6 pb-6 pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={cancel}
            disabled={busy}
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink-300 disabled:opacity-50 disabled:pointer-events-none"
          >
            {xLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={`h-11 px-4 rounded-btn font-display font-semibold text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2 ${TONE_CLS[tone]}`}
          >
            {busy ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/70 border-t-transparent rounded-full motion-safe:animate-spin" />
                ინახება…
              </>
            ) : (
              cLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
