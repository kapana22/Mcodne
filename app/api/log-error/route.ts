import { NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Account-free error sink: structured stderr that Railway (and any log drain)
// captures and makes greppable — no external SaaS / DSN. Errors happen pre-auth
// too, so it's unauthenticated; kept cheap and abuse-resistant with hard size
// caps and a "never throw" body. To adopt a real provider later, forward from
// this one place (grep `[client-error]` for what's already flowing).
const cap = (s: unknown, n: number): string => (typeof s === 'string' ? s.slice(0, n) : '')

/**
 * IS THIS OUR ERROR AT ALL?
 *
 * ⚠️ THE LOG WAS BEING FILLED BY A BROWSER EXTENSION (2026-09-02). Read off
 * production that afternoon: `railway logs` was a solid wall of one entry,
 * repeating every ~15 seconds from a single reader —
 *
 *     "Cannot read properties of undefined (reading 'M_ID')"
 *       at Y (chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/executors/200.js…)
 *       at E (chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/executors/200.js…)
 *
 * Every frame in that stack is the extension's own bundle. It runs in the page,
 * so `window.onunhandledrejection` catches it and this sink faithfully writes
 * it down — and there is nothing whatever we could fix, because none of the
 * code is ours. Meanwhile the rate limit above is per IP: one reader with a
 * noisy extension can spend the whole 60/min budget and drop OUR errors on the
 * floor, which is the opposite of what a sink is for.
 *
 * ⚠️ THE TEST IS „EVERY FRAME", NOT „ANY FRAME", and that is deliberate. An
 * extension that breaks OUR code leaves our file in the stack too, and that one
 * is worth reading — it is a real interaction bug even if we did not cause it.
 * What is dropped is only the error whose entire provenance is somewhere we
 * cannot deploy to. `moz-extension` and `safari-web-extension` are the same
 * fact in the other two engines.
 *
 * No stack at all is NOT dropped: a message with no frames is usually ours.
 */
const EXTENSION_FRAME = /^\s*(at\s+)?.*?(chrome|moz|safari-web)-extension:\/\//
function isForeignError(stack: string | undefined): boolean {
  if (!stack) return false
  const frames = stack.split('\n').map(l => l.trim()).filter(l => /^(at\s|\w+@)/.test(l))
  return frames.length > 0 && frames.every(l => EXTENSION_FRAME.test(l))
}

export async function POST(req: NextRequest) {
  // Unauthenticated sink — cap per IP so a script can't flood Railway logs and
  // drown the real [client-error] signal. 60/min tolerates a genuine error burst.
  const rl = rateLimit(`logerr:${clientIp(req)}`, 60, 60)
  if (!rl.ok) return new Response(null, { status: 429 })
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const entry = {
      t: new Date().toISOString(),
      kind: cap(b.kind, 40) || 'unknown', // render | window | unhandledrejection
      msg: cap(b.message, 1000),
      stack: cap(b.stack, 4000) || undefined,
      digest: cap(b.digest, 120) || undefined,
      url: cap(b.url, 500) || undefined,
      ua: cap(req.headers.get('user-agent'), 300) || undefined,
    }
    // Ignore empty/garbage beacons.
    if (!entry.msg && !entry.stack) return new Response(null, { status: 204 })
    // …and errors thrown entirely inside somebody's browser extension. 204, not
    // 429: nothing is wrong with the caller, we simply have no use for it.
    if (isForeignError(entry.stack)) return new Response(null, { status: 204 })
    // eslint-disable-next-line no-console
    console.error('[client-error]', JSON.stringify(entry))
  } catch {
    // The error sink must never itself error.
  }
  return new Response(null, { status: 204 })
}
