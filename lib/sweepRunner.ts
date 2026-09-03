import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'

/**
 * Traffic-triggered maintenance sweep.
 *
 * ⚠️ WHY THIS EXISTS — read before deleting it.
 * The Railway `cleanup-cron` service fired every 15 minutes for days and Railway
 * reported „Completed" every single time, while the sweep NEVER ran: the cron
 * requested `/api/internal/cleanup` without a valid secret, received the
 * harmless GET self-documentation page, and `curl` (no `-f`) exited 0. So every
 * scheduled behaviour was silently dark in production — session reminders,
 * unread-message reminders, post-session review nudges, stale-PREPARING
 * auto-cancel, the reschedule-restore path and auto-complete. A real confirmed
 * session went by with neither party reminded.
 *
 * The lesson is not "fix the cron command" (that too), it is that correctness
 * must not depend on one un-monitored external caller. ⚠️ AND THE CRON IS RED
 * AGAIN as of 2026-09-01 — a different fault, same silence: the command lost
 * its `sh -c`, so `$CLEANUP_SECRET` never expands and every tick 401s. This
 * runner is why that costs only the quiet hours rather than everything, which
 * is also, again, why nobody noticed. lib/cronAuth carries the measurements. So the same sweep is
 * ALSO kicked off by ordinary site traffic:
 *
 *   - the claim is a guarded UPDATE on `JobRun`, so exactly ONE request per
 *     interval does the work — across concurrent requests AND instances. An
 *     in-memory flag would not survive a restart and would not span instances.
 *   - the work runs inside `after()` at the call site, never on the response
 *     path: a visitor's request is not delayed by it.
 *   - it is safe to run alongside a real cron — both go through
 *     the same claim, so they cannot double-process.
 *
 * The sweep body itself is NOT duplicated here. Next validates that a route
 * file exports only HTTP verbs, so the logic cannot be imported out of
 * `app/api/internal/cleanup/route.ts`; instead we POST to it with the same
 * Bearer secret a healthy cron would use. One internal request per 15 minutes.
 */

const JOB_KEY = 'cleanup-sweep'
const INTERVAL_MIN = 15
/** Cheap in-process throttle so a burst of requests doesn't all hit the DB claim. */
const LOCAL_QUIET_MS = 60_000
let lastLocalAttempt = 0

function baseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge'
  return raw.replace(/\/+$/, '')
}

/**
 * Try to run the sweep. Resolves quickly and NEVER throws — every failure path
 * is swallowed and logged, because this is a side effect of someone else's
 * request and must never surface to them.
 *
 * Call it inside `after()`, not inline.
 */
export async function kickSweep(): Promise<void> {
  const now = Date.now()
  if (now - lastLocalAttempt < LOCAL_QUIET_MS) return
  lastLocalAttempt = now

  const secret = process.env.CLEANUP_SECRET
  if (!secret) return // nothing to authenticate with — the cron path is equally dead, but that's an operator issue

  try {
    await ensureDbReady()

    // Seed the ledger row far enough in the past that the very first request
    // after a deploy claims immediately.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "JobRun" ("key", "ranAt") VALUES ($1, now() - interval '1 day')
       ON CONFLICT ("key") DO NOTHING`,
      JOB_KEY,
    )

    // THE CLAIM. Only the winner gets a row back; everyone else no-ops.
    const claimed = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
      `UPDATE "JobRun" SET "ranAt" = now()
        WHERE "key" = $1 AND "ranAt" < now() - ($2 * interval '1 minute')
        RETURNING "key"`,
      JOB_KEY,
      INTERVAL_MIN,
    )
    if (claimed.length === 0) return

    const res = await fetch(`${baseUrl()}/api/internal/cleanup`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      // Release the claim so the next request retries rather than waiting out
      // the full interval on a transient failure.
      await prisma.$executeRawUnsafe(
        `UPDATE "JobRun" SET "ranAt" = now() - ($2 * interval '1 minute'), "ok" = false,
                             "result" = $3::jsonb
          WHERE "key" = $1`,
        JOB_KEY,
        INTERVAL_MIN,
        JSON.stringify({ error: `HTTP ${res.status}` }),
      ).catch(() => {})
      console.error('[server-error]', JSON.stringify({ scope: 'sweep', status: res.status }))
      return
    }
    // Persist WHAT it did, so the admin panel shows outcomes rather than a bare
    // timestamp. Truncated defensively — this column is a dashboard aid, not a log.
    const body = await res.text().catch(() => '')
    await prisma.$executeRawUnsafe(
      `UPDATE "JobRun" SET "ok" = true, "result" = $2::jsonb WHERE "key" = $1`,
      JOB_KEY,
      body.slice(0, 4000) || '{}',
    ).catch(() => {})
    console.log('[sweep] ran via traffic trigger')
  } catch (err) {
    console.error('[server-error]', JSON.stringify({ scope: 'sweep', detail: String(err).slice(0, 200) }))
  }
}

/** Last successful (claimed) run, for the endpoint's self-doc heartbeat. */
export async function lastSweepRunAt(): Promise<string | null> {
  return (await lastSweepRun()).ranAt
}

/** How long the sweep may go unrun before we call it broken. It should tick
 *  every {@link INTERVAL_MIN}; double that plus slack is a genuine failure,
 *  not jitter. */
export const SWEEP_STALE_MIN = 35

type SweepStatus = {
  ranAt: string | null
  minutesAgo: number | null
  /** true when the sweep has not run recently enough to be trusted. */
  stale: boolean
  ok: boolean | null
  result: unknown
}

export async function lastSweepRun(): Promise<SweepStatus> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ ranAt: Date; ok: boolean | null; result: unknown }>>(
      `SELECT "ranAt", "ok", "result" FROM "JobRun" WHERE "key" = $1`,
      JOB_KEY,
    )
    const row = rows[0]
    if (!row?.ranAt) return { ranAt: null, minutesAgo: null, stale: true, ok: null, result: null }
    const ranAt = new Date(row.ranAt)
    const minutesAgo = Math.floor((Date.now() - ranAt.getTime()) / 60_000)
    return {
      ranAt: ranAt.toISOString(),
      minutesAgo,
      stale: minutesAgo > SWEEP_STALE_MIN,
      ok: row.ok ?? null,
      result: row.result ?? null,
    }
  } catch {
    // Never let a dashboard read throw — an unreadable status is itself "stale".
    return { ranAt: null, minutesAgo: null, stale: true, ok: null, result: null }
  }
}
