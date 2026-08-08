// Server-side half of the MEASURED response time: read the raw messages,
// run lib/responseTime's pure math, persist the result on TutorProfile.
//
// Split from lib/responseTime.ts on purpose — that file is imported by the
// `'use client'` browse list, and importing Prisma from a client module is a
// bundling hazard. Everything Prisma-shaped lives here.
//
// ── WHY IT IS STORED, NOT COMPUTED PER REQUEST ───────────────────────────────
// The browse list (lib/tutorsQuery) has a documented payload/latency history:
// it already runs exactly three bounded queries for up to 200 experts. Scanning
// 90 days of messages per card would be a per-row fan-out on the hottest public
// page. So the median is denormalised onto TutorProfile.responseMedianMin /
// .responseSampleN and simply rides along with the row that is already read.
//
// ── HOW IT STAYS FRESH ───────────────────────────────────────────────────────
// `recomputeResponseTime(tutorUserId)` is the incremental trigger. The natural
// caller is the message-send path — after an expert sends a message, their
// number may have moved. app/api/messages/route.ts should call it inside its
// existing `after(...)` block (it is already fire-and-forget safe: this
// function never throws and self-throttles per process, see THROTTLE_MS).
//
// ── HOW TO BACKFILL ──────────────────────────────────────────────────────────
//   npx tsx -r dotenv/config lib/responseTimeStore.ts
// (or `DATABASE_URL=… npx tsx lib/responseTimeStore.ts` if you'd rather not
// load .env). It walks every TutorProfile, recomputes, and prints a summary.
// Safe to re-run: it is a pure recompute-and-overwrite, never an increment.

import type { ResponseMsgRow, ResponseStats } from './responseTime'
import { computeResponseStats, responseWindowStart } from './responseTime'

// Hard ceiling on rows pulled per expert. Ordered ASCENDING on purpose: if an
// extremely busy expert exceeds this, the rows we drop are the NEWEST, so every
// conversation we do measure still has its true first message. Truncating from
// the other end would mistake a mid-thread message for the opener and invent a
// fast reply.
const MAX_ROWS = 5000

// Per-process throttle so a burst of messages from one expert doesn't re-scan
// 90 days of history on every send. Correctness is unaffected — the value is a
// 90-day median, it does not move minute to minute — and the backfill/`force`
// path always bypasses it.
const THROTTLE_MS = 10 * 60 * 1000
const lastRun = new Map<string, number>()

/** Raw rows for one expert inside the measurement window. Never selects `body`. */
async function loadWindowRows(tutorUserId: string, now: Date): Promise<ResponseMsgRow[]> {
  const { prisma } = await import('./prisma')
  return prisma.message.findMany({
    where: {
      createdAt: { gte: responseWindowStart(now) },
      OR: [{ fromId: tutorUserId }, { toId: tutorUserId }],
    },
    select: { fromId: true, toId: true, bookingId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_ROWS,
  })
}

/**
 * Recompute + persist one expert's measured response time.
 *
 * Never throws: this is a background statistic, and a failure here must not
 * break sending a message. Returns the new stats (or null when the sample is
 * below RESPONSE_MIN_SAMPLE — in which case the stored columns are cleared, so
 * a number that decays below the threshold stops being shown).
 */
export async function recomputeResponseTime(
  tutorUserId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<ResponseStats | null> {
  const now = opts.now ?? new Date()
  if (!opts.force) {
    const prev = lastRun.get(tutorUserId)
    if (prev && now.getTime() - prev < THROTTLE_MS) return null
  }
  lastRun.set(tutorUserId, now.getTime())

  try {
    const { prisma } = await import('./prisma')
    const rows = await loadWindowRows(tutorUserId, now)
    const stats = computeResponseStats(tutorUserId, rows, now)
    // updateMany (not update) so a userId with no TutorProfile is a no-op
    // instead of a thrown P2025.
    await prisma.tutorProfile.updateMany({
      where: { userId: tutorUserId },
      data: {
        responseMedianMin: stats ? stats.medianMin : null,
        responseSampleN: stats ? stats.sampleN : null,
      },
    })
    return stats
  } catch (err) {
    console.error('[responseTime] recompute failed for', tutorUserId, err)
    return null
  }
}

/**
 * Bulk recompute across every expert — the backfill, and a safe periodic
 * refresh (a median can also go STALE upward: an expert who stops replying
 * keeps their old number until something recomputes it).
 *
 * Sequential by design: this runs against the same small Postgres the live site
 * uses, and there is no deadline on a backfill.
 */
async function backfillResponseTimes(
  opts: { now?: Date } = {},
): Promise<{ scanned: number; withData: number }> {
  const { prisma } = await import('./prisma')
  const now = opts.now ?? new Date()
  const profiles = await prisma.tutorProfile.findMany({ select: { userId: true } })
  let withData = 0
  for (const p of profiles) {
    const stats = await recomputeResponseTime(p.userId, { force: true, now })
    if (stats) withData++
  }
  return { scanned: profiles.length, withData }
}

// CLI entry — see the "HOW TO BACKFILL" note above. Guarded so the bundled
// server build (where `module` is webpack's, never `require.main`) never runs it.
if (typeof require !== 'undefined' && require.main === module) {
  backfillResponseTimes()
    .then(r => {
      console.log(`[responseTime] backfill done — ${r.scanned} experts scanned, ${r.withData} now have a publishable median`)
      process.exit(0)
    })
    .catch(err => {
      console.error('[responseTime] backfill failed:', err)
      process.exit(1)
    })
}
