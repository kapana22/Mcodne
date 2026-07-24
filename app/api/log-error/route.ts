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
    // eslint-disable-next-line no-console
    console.error('[client-error]', JSON.stringify(entry))
  } catch {
    // The error sink must never itself error.
  }
  return new Response(null, { status: 204 })
}
