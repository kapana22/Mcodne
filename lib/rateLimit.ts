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

type RateResult = { ok: true } | { ok: false; retryInSec: number }

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

// Resolve the real client IP for rate-limit keying.
//
// The LEFTMOST x-forwarded-for entry is attacker-controlled — a client can send
// `X-Forwarded-For: <random>` and the proxy just PREPENDS its observed address,
// so trusting parts[0] lets anyone mint a fresh limiter bucket per request and
// defeat every IP-keyed limit (signup, contact, signin, otp, reset). Instead key
// on the hop the trusted proxy actually appended: index from the RIGHT by the
// number of trusted proxies in front of the app (Railway's edge = 1). An attacker
// can prepend spoofed hops on the left but cannot remove or forge the real one on
// the right. TRUSTED_PROXY_HOPS overrides the default if the platform adds more
// internal hops.
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1)

/** Anything carrying request headers — a `Request`, or `headers()` in a server
 *  component, which has the same `.get` and is how a PAGE keys a limiter. */
type HasHeaders = { headers: { get(name: string): string | null } }

export function clientIp(req: HasHeaders): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) {
      const idx = Math.max(0, parts.length - TRUSTED_PROXY_HOPS)
      return parts[idx]
    }
  }
  // x-real-ip is only trustworthy if the edge sets it; used purely as a fallback
  // when no XFF is present (e.g. local/dev). Never preferred over the proxy hop.
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
