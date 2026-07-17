// Simple sliding-window rate limiter (in-memory, per-instance)
// For production scale, replace with Redis/upstash.

type Entry = { count: number; resetAt: number }
const store = new Map<string, Entry>()

// Clean expired entries every 5 min
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of store.entries()) if (v.resetAt < now) store.delete(k)
  }, 5 * 60 * 1000).unref?.()
}

export type RateResult = { ok: true } | { ok: false; retryInSec: number }

export function rateLimit(key: string, max: number, windowSec: number): RateResult {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowSec * 1000 })
    return { ok: true }
  }
  if (entry.count >= max) {
    return { ok: false, retryInSec: Math.ceil((entry.resetAt - now) / 1000) }
  }
  entry.count++
  return { ok: true }
}

export function clientIp(req: Request): string {
  const h = req.headers
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'unknown'
  )
}
