'use client'
// Client → server error reporter. Fire-and-forget, deduped, `keepalive` so the
// beacon survives an unload/navigation. Never throws, and never reports its own
// network failure (that would loop). Pairs with app/api/log-error.
type Kind = 'render' | 'window' | 'unhandledrejection'

const seen = new Map<string, number>()
const DEDUP_MS = 10_000

export function reportClientError(kind: Kind, message: string, stack?: string, digest?: string): void {
  try {
    if (typeof window === 'undefined') return
    const msg = (message || '').slice(0, 1000)
    const key = kind + '|' + msg + '|' + (stack || '').slice(0, 200)
    const now = Date.now()
    const last = seen.get(key)
    if (last && now - last < DEDUP_MS) return // collapse a burst of the same error
    seen.set(key, now)
    if (seen.size > 100) seen.clear() // keep the dedup map bounded
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message: msg, stack: (stack || '').slice(0, 4000), digest, url: window.location?.href }),
      keepalive: true,
    }).catch(() => {}) // swallow — the reporter must never surface an error
  } catch {
    // swallow
  }
}
