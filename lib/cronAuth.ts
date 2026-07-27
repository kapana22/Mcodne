// Shared gate for the internal cron endpoints (/api/internal/cleanup and
// /api/internal/reminders). One place, so the legacy query-param path can be
// deleted in exactly one edit once the Railway cron command is switched.
//
// ⚠️ MIGRATION IN PROGRESS. Two ways to authenticate, deliberately:
//
//   1. `Authorization: Bearer <CLEANUP_SECRET>` — PREFERRED. A header is not
//      written to access logs, proxy logs, or Referer, and does not sit in a
//      shell's history the way a URL does.
//   2. `?secret=<CLEANUP_SECRET>` — LEGACY, still accepted because the live
//      Railway */15 cron pings the URL form. Removing it before the cron
//      command changes would silently stop cleanup + session reminders.
//
// Operator steps to finish the migration (then delete the fallback below):
//   1. Rotate CLEANUP_SECRET in Railway variables (the old one has been sitting
//      in URLs, so treat it as exposed).
//   2. Change the cron command to:
//        curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_SECRET" \
//          https://mcodne.ge/api/internal/cleanup
//   3. Confirm a tick succeeds, then drop `allowQuery` here.

import { timingSafeEqual } from 'crypto'

/** Constant-time compare — a plain `!==` on a secret leaks its prefix length
 *  to a patient attacker through response timing. */
function secretEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  // timingSafeEqual throws on length mismatch, so that check has to come first;
  // secret LENGTH is not the part worth protecting here.
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export type CronGate =
  | { ok: true }
  | { ok: false; status: 401 | 503; body: { ok: false; error: string; hint?: string } }

/**
 * @param allowQuery accept the legacy `?secret=` form. Pass `false` for POST —
 *   a POST caller can always set a header, so there is no reason to widen it.
 */
export function cronAuth(req: Request, { allowQuery = false }: { allowQuery?: boolean } = {}): CronGate {
  const expected = process.env.CLEANUP_SECRET
  if (!expected) {
    return { ok: false, status: 503, body: { ok: false, error: 'DISABLED', hint: 'Set CLEANUP_SECRET in env to enable this endpoint.' } }
  }

  const auth = req.headers.get('authorization') || ''
  const header = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (header && secretEquals(header, expected)) return { ok: true }

  if (allowQuery) {
    const query = new URL(req.url).searchParams.get('secret')
    if (query && secretEquals(query, expected)) return { ok: true }
  }

  return { ok: false, status: 401, body: { ok: false, error: 'UNAUTHORIZED' } }
}
