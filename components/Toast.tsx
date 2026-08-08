'use client'
// Toast — single toast presentation. Do not import directly; use `useToast()`
// from ./ToastProvider, which stacks these in a corner and manages timers.

import type { ReactNode } from 'react'

export type ToastKind = 'info' | 'success' | 'error'

const ACCENT: Record<ToastKind, string> = {
  info:    'border-l-brand-500',
  success: 'border-l-success-500',
  error:   'border-l-danger-500',
}

const ICON_BG: Record<ToastKind, string> = {
  info:    'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  error:   'bg-danger-50 text-danger-700',
}

// Inline SVG so no extra import cost. All 18×18, stroke-based to match Icon.tsx.
const Icons: Record<ToastKind, ReactNode> = {
  info: (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v5h1" />
    </svg>
  ),
  success: (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="m4 12 5 5L20 6" />
    </svg>
  ),
  error: (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 10v5M12 18h0" />
    </svg>
  ),
}

export function Toast({
  kind,
  onDismiss,
  leaving = false,
  children,
}: {
  kind: ToastKind
  onDismiss: () => void
  /** Exit phase — the host keeps the toast mounted for one slide-out. */
  leaving?: boolean
  children: ReactNode
}) {
  return (
    <div
      role="status"
      /* SOLID, deliberately (reverted 2026-08-02). A toast lands over
         whatever the page is showing and carries a one-line message the user
         gets one chance to read — translucency made it ambiguous against busy
         content. Glass stays for surfaces you look PAST, not surfaces you
         must read. */
      className={`select-none min-w-[260px] max-w-[380px] bg-white border border-ink-200 shadow-pop border-l-4 ${ACCENT[kind]} rounded-card pl-4 pr-3 py-3 flex items-start gap-3 text-body text-ink-900 ${leaving ? 'motion-safe:animate-slide-out-b' : 'motion-safe:animate-slide-in-b'}`}
    >
      <span className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full ${ICON_BG[kind]}`}>
        {Icons[kind]}
      </span>
      <span className="flex-1 leading-snug pt-1">{children}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="დახურვა"
        className="shrink-0 w-9 h-9 -m-1 rounded-btn text-ink-400 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast"
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  )
}
