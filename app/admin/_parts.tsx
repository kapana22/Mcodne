'use client'
// AdminConfirmDialog — shared admin confirmation dialog, modeled on
// components/ConfirmModal.tsx (a11y copied: role="alertdialog", focus trap,
// Escape, focus restore, ink-950/55 scrim, z-[90], mobile bottom-sheet).
// Extends it with an OPTIONAL reason textarea:
//   reason="required" → confirm disabled until non-empty
//   reason="optional" → textarea shown, may be left empty
//   reason="none"     → plain confirm (default)
// onConfirm receives the trimmed reason text (empty string when none).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// Shared section header for every admin tab — consistent eyebrow + title + sub,
// with an optional right-aligned actions slot. Single source so all sections
// (including blog/texts) read identically.
export const TabHeader = ({ eyebrow, title, sub, actions }: { eyebrow: string; title: ReactNode; sub: string; actions?: ReactNode }) => (
  <section className="px-6 lg:px-8 pt-7 pb-5 border-b border-ink-100 bg-white">
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0 max-w-[680px]">
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-900 mb-1.5">{eyebrow}</div>
        <h1 className="font-display text-[24px] lg:text-[28px] font-bold text-ink-900 tracking-tight leading-[1.1]">{title}</h1>
        <p className="mt-2 text-[13px] text-ink-600 leading-[1.55]">{sub}</p>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </section>
)

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
  reason?: 'required' | 'optional' | 'none'
  reasonLabel?: string
  reasonPlaceholder?: string
  onConfirm: (reason: string) => void | Promise<void>
  onCancel: () => void
  busy?: boolean
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function AdminConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'brand',
  reason = 'none',
  reasonLabel,
  reasonPlaceholder,
  onConfirm,
  onCancel,
  busy,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  // Restore focus to the opener on close — expected pattern for accessible modals.
  const restoreRef = useRef<HTMLElement | null>(null)
  const [text, setText] = useState('')

  const cancel = useCallback(() => {
    if (busy) return
    onCancel()
  }, [busy, onCancel])

  // Reset the reason text every time the dialog opens for a new action.
  useEffect(() => { if (open) setText('') }, [open])

  useEffect(() => {
    if (!open) return
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null
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
  const titleId = 'admin-confirm-title'
  const descId = body ? 'admin-confirm-desc' : undefined
  const needReason = reason === 'required'
  const showReason = reason !== 'none'
  const confirmDisabled = needReason && !text.trim()

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
        className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm"
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
          {showReason && (
            <div className="mt-4">
              <label
                htmlFor="admin-confirm-reason"
                className="block font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-1.5"
              >
                {reasonLabel ?? (needReason ? 'მიზეზი (სავალდებულო)' : 'მიზეზი (სურვ.)')}
              </label>
              <textarea
                id="admin-confirm-reason"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={3}
                maxLength={300}
                disabled={busy}
                placeholder={reasonPlaceholder ?? 'დაწერე მიზეზი…'}
                className="w-full px-3 py-3 rounded-field border border-ink-200 bg-white text-[13px] focus:border-brand-400 focus:outline-none resize-none disabled:opacity-60"
              />
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
            onClick={() => onConfirm(text.trim())}
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
