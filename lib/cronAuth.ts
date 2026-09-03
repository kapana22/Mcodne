// Shared gate for the internal cron endpoints (/api/internal/cleanup and
// /api/internal/reminders). One place, so the legacy query-param path can be
// deleted in exactly one edit once the Railway cron command is switched.
//
// ⚠️ MIGRATION IN PROGRESS. Two ways to authenticate, deliberately:
//
//   1. `Authorization: Bearer <CLEANUP_SECRET>` — PREFERRED. A header is not
//      written to access logs, proxy logs or Referer, and does not sit in a
//      shell's history the way a URL does.
//   2. `?secret=<CLEANUP_SECRET>` — LEGACY, and no longer what the Railway cron
//      sends: it moved to the header on 2026-08-30. Accepted on GET only, for a
//      cron system that can ping nothing but a URL.
//
// ⚠️ THE RAILWAY CRON IS RED AGAIN, AND THE 2026-08-30 ENTRY BELOW WAS WRONG
// ABOUT THE CURE (re-measured 2026-09-01). What that day's note claimed — „the
// command now sends the Bearer header and the first tick after the change ran
// green" — is not what is deployed. The live command, read back today, is the
// LEGACY query form, and every tick since has returned 401:
//
//     curl -fsS "https://mcodne.ge/api/internal/cleanup?secret=$CLEANUP_SECRET"
//
// THE ROOT CAUSE IS THE MISSING SHELL, not the query form. Measured, in order:
//   · `CLEANUP_SECRET` on `cleanup-cron` and on `mcodne` are the SAME value
//     (identical sha256, both 64 chars) — so the secret is not stale;
//   · it is pure hex, so no `+` or `/` is being mangled by URL decoding, and it
//     survives a query round-trip intact;
//   · this GET path accepts `?secret=` (`allowQuery: true` below), so the form
//     the cron uses IS one the server honours;
//   · a request carrying the LITERAL string `$CLEANUP_SECRET` reproduces the
//     cron's failure exactly: 401 `{"ok":false,"error":"UNAUTHORIZED"}`.
// The value the container sends is therefore not the value stored beside it.
// `curlimages/curl` has `curl` as its ENTRYPOINT, so the command does not run
// through a shell and `$CLEANUP_SECRET` is never expanded.
//
// The command that actually works has to ask for a shell by name:
//
//     sh -c 'curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_SECRET" \
//       https://mcodne.ge/api/internal/cleanup'
//
// Widening this gate would fix it too and was measured to work back in August;
// it was REVERTED then and stays reverted, because it would make „a secret in a
// URL" the normal way to call a MUTATING endpoint, for ever, to accommodate one
// caller's quoting.
//
// ⚠️ THE COMMAND *CAN* BE READ BACK — the August note said it could not, and
// that is why the wrong cure went unchecked for two days. It is one call:
//
//     railway status --json \
//       | jq -r '.. | objects | select(.serviceName? == "cleanup-cron") | .startCommand'
//
// ⚠️ A `grep -o '"startCommand":"[^"]*"'` DOES NOT WORK here and this note
// carried one for an hour: the command contains escaped quotes, so the class
// stops at the first `\"` and the match is dropped entirely — it prints
// NOTHING, which reads exactly like „no start command set". Use the jq form.
//
// Verify the command IS what you think before believing any fix. Two things
// have already claimed this change was made when it was not: `railway agent`
// reported „Done" on 2026-09-01 and the read-back showed the old command, and
// a hand edit in the dashboard the same afternoon did not land either. The
// field is Service → Settings → Deploy → Custom Start Command, and it needs
// saving; the read-back is the only proof.
//
// ⚠️ WHAT MADE IT SURVIVABLE, AND WHAT MADE IT INVISIBLE. `lib/sweepRunner` runs
// the same job off ordinary traffic with this header, claimed through `JobRun`,
// so a dead cron costs only the QUIET HOURS — which is also why nobody noticed
// for days. And before that: the command had no `-f`, so `curl` exited 0 on the
// 401 and Railway reported „Completed" while nothing ran. Keep the `-f`.
//
// The live command, as of 2026-08-30:
//
//     curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_SECRET" \
//       https://mcodne.ge/api/internal/cleanup
//
// ⚠️ ONE STEP OF THE MIGRATION IS LEFT and it is not this file's to take:
// rotate CLEANUP_SECRET. The old value spent days inside a URL — in the cron's
// own config, and in whatever logs saw the request — so it should be treated as
// exposed even though nothing is sending it that way any more.
//
// Once rotated, `allowQuery` can go: its last caller is gone. The GET path is
// what still passes it (app/api/internal/cleanup), for cron systems that can
// only ping a URL; delete it there first.

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

  // ⚠️ SAY WHY IT FAILED — WITHOUT SAYING THE SECRET (2026-08-30). A bare 401
  // is silent about WHICH credential the caller tried, and that silence cost a
  // whole conversation: the Railway cron returned 401 on every tick while the
  // same request sent by hand returned 200, and the command itself cannot be
  // read back (the CLI does not print it and the API refuses). One log line
  // turns that into a single tick's diagnosis.
  //
  // ⚠️ SHAPES, NEVER VALUES. Lengths and presence flags only — a log that
  // prints the credential to explain a rejected credential is a worse bug than
  // the one it explains. `sentLen` against `wantLen` is what catches the
  // common cause by itself: a shell that did not expand `$CLEANUP_SECRET`
  // sends the literal 16-character string, not the 64-character secret.
  console.error('[server-error]', JSON.stringify({
    scope: 'cron-auth',
    method: req.method,
    hasBearer: !!header,
    sentLen: header?.length ?? 0,
    wantLen: expected.length,
    hasQuery: new URL(req.url).searchParams.has('secret'),
    queryAllowed: allowQuery,
  }))
  return { ok: false, status: 401, body: { ok: false, error: 'UNAUTHORIZED' } }
}
