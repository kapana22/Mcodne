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
//      Railway ∗/15 cron pings the URL form. Removing it before the cron
//      command changes would silently stop cleanup + session reminders.
//
// ⚠️ WHAT THE CRASHED `cleanup-cron` SERVICE TURNED OUT TO BE (2026-08-30), and
// why the fix that WORKED was still taken back out.
//
// The symptom: the Railway cron sat `Crashed` on every 15-minute tick with
// `curl: (22) The requested URL returned error: 401`. The cron's command cannot
// be read from here — the CLI does not print it, the API refuses the read — so
// the cause was inferred: it sends POST with the `?secret=` form, the one
// combination nothing accepted (GET took the query, POST took only the header,
// and `allowQuery` defaults to false).
//
// The default was flipped to true, deployed, and measured. THE INFERENCE WAS
// RIGHT: the first clean tick afterwards ran green with an empty log. (An
// earlier tick still showed 401 and was briefly read as a disproof — it had
// landed inside the deploy's rollover window. A 15-minute job needs a tick that
// is unambiguously after the deploy before it can prove anything.)
//
// It was reverted anyway, by the owner's decision, and the reason is that the
// working fix was in the wrong file. Widening this gate makes „a secret in a
// URL" the normal way to call a MUTATING endpoint, for ever, to accommodate one
// caller's quoting. The fault is in the cron command and that is where it gets
// fixed — step 2 below. Until somebody does that, the cron stays red.
//
// ⚠️ WHICH IS AFFORDABLE, BECAUSE THE SWEEP WAS NEVER DARK. `lib/sweepRunner`
// runs the same job off ordinary site traffic, with the Bearer header, claiming
// it through `JobRun` so exactly one request per 15 minutes does the work.
// Production logs „[sweep] ran via traffic trigger", printed only after a 2xx.
// That file exists because this class of failure happened once before, and its
// note says why: „correctness must not depend on one un-monitored external
// caller." A crashed cron is a broken SECOND caller, not a stopped system —
// what it costs is the QUIET HOURS, when no traffic arrives to trigger it.
//
// Operator steps to finish the migration (then delete the fallback below):
//   1. Rotate CLEANUP_SECRET in Railway variables (the old one has been sitting
//      in URLs, so treat it as exposed).
//   2. Change the cron command to:
//        curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_SECRET" \
//          https://mcodne.ge/api/internal/cleanup
//   3. Confirm a tick succeeds, then drop `allowQuery` here — and only then.

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

type CronGate =
  | { ok: true }
  | { ok: false; status: 401 | 503; body: { ok: false; error: string; hint?: string } }

/**
 * @param allowQuery accept the legacy `?secret=` form. Pass `false` for POST —
 *   a POST caller can always set a header, so there is no reason to widen it.
 *   (This default was briefly `true` on 2026-08-30; see the top of this file
 *   for what that was meant to fix and why the measurement took it back out.)
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
