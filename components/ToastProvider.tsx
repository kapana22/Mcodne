'use client'
// ToastProvider — global toast host. Mount once in the root layout and
// consume via `useToast()` anywhere in the tree.
//
// Usage:
//   const { toast } = useToast()
//   toast('შენახულია', 'success')
//   toast('შეცდომა', 'error')
//   toast('ინფო შეტყობინება')        // defaults to 'info'
//
// Behavior:
//   • Stacks in the bottom-right corner
//   • Auto-dismisses after 3.5s
//   • Click-to-dismiss anywhere on the toast
//   • ARIA role="status" on each item (a11y for live-region updates)
//   • Uses tailwind tokens: rounded-card, brand/success/danger palettes

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Toast, type ToastKind } from './Toast'

type ToastItem = { id: number; kind: ToastKind; msg: string }

type ToastCtx = {
  toast: (msg: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastCtx | null>(null)

const AUTO_DISMISS_MS = 3500
// Cap the visible stack so a burst of toasts doesn't fill the viewport.
// When the queue is full we drop the OLDEST first — the user's most recent
// action is the most relevant, and pushing off a still-visible toast is
// preferable to hiding the newest one.
const MAX_STACK = 3

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  // Track outstanding auto-dismiss timers per toast so we can clear them
  // both when the user clicks a toast (immediate dismiss) and on unmount.
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const toast = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = ++idRef.current
    setItems(prev => {
      const next = [...prev, { id, kind, msg }]
      if (next.length > MAX_STACK) {
        // Cancel the timer of the toast we're about to drop.
        const drop = next[0]
        const t = timers.current.get(drop.id)
        if (t) { clearTimeout(t); timers.current.delete(drop.id) }
        return next.slice(-MAX_STACK)
      }
      return next
    })
    const handle = setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    timers.current.set(id, handle)
  }, [dismiss])

  useEffect(() => {
    // Copy the ref value into a locally-scoped variable so the cleanup
    // reads the same Map instance that was live when the effect ran.
    const map = timers.current
    return () => { map.forEach(clearTimeout); map.clear() }
  }, [])

  const value = useMemo<ToastCtx>(() => ({ toast }), [toast])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="toast-host fixed bottom-4 right-4 z-[70] flex flex-col gap-2 pointer-events-none safe-area-bottom"
        aria-live="polite"
      >
        {items.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <Toast kind={t.kind} onDismiss={() => dismiss(t.id)}>{t.msg}</Toast>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  // Fall back to a no-op if the provider is missing (e.g. during static-
  // rendering probes) — safer than throwing at render time.
  return ctx ?? { toast: () => {} }
}
