// What happens to an offer AFTER the client chose it — stage 7 (2026-08-19).
//
// Until now the lifecycle ended at ACCEPTED: the two sides had each other's
// number and the platform stepped out. This file adds the three things that
// happen afterwards, and nothing else:
//
//   DONE       either side says the job finished. `doneAt`/`doneBy` on the
//              offer, ONCE — claimed with updateMany({ where: { id, status:
//              'ACCEPTED', kind: 'QUOTE', doneAt: null } }) + count !== 1 →
//              409, the pattern every status change in this subsystem uses.
//   REVIEW     a done offer carries ONE review (Review.offerId is unique — the
//              database is the guard, P2002 → 409). The client writes it; the
//              request's account user is the author (Review.studentId), so a
//              request that never got an account cannot be reviewed — the UI
//              hides the picker in that case and the route says NO_ACCOUNT.
//   CLOSE      nobody said „დასრულდა" for 14 days → ONE reminder (the client
//              by mail, the provider by bell), marked by an OfferEvent
//              'REMINDED' row so the unique (offerId, type) index is what makes
//              it once; 21 days → `closedAt`, silently. The offer keeps its
//              status — closing is a stamp, not a transition, and a review is
//              still possible if the client comes back and marks it done.
//
// Plus D8: a provider takes a SENT offer back — WITHDRAWN, claimed on
// { id, status: 'SENT', <provider matches> }. `ServiceRequest.offerCount`
// counts CLAIMED PLACES (a SENT offer took one — see app/api/provider/offers),
// so withdrawing gives the place back with the same guarded decrement the
// offer route uses on failure. The unique (requestId, provider) index means the
// same provider cannot re-bid on that request; that is accepted — a withdrawal
// is a decision, not a draft.
//
// ⚠️ KIND. `RequestOffer.kind` is QUOTE (a price for a job — this file) or
// BOOKING (the consultation path). TODO(stage 7b): a BOOKING offer should
// create a Booking on accept and let the booking lifecycle (auto-complete,
// review via bookingId) carry it; today accept treats both kinds alike and this
// file refuses to mark a BOOKING offer done — the claim below carries
// `kind: 'QUOTE'` on purpose, so nothing here ever writes a second completion
// beside a Booking's own.
//
// The RULES are pure and tested (tests/offerLifecycle.test.ts); the prisma
// helpers underneath only apply them.

import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { recordOfferEvent } from './offerEvents'
import type { ProviderIdentity } from './requestsServer'

/* ═══════════ the numbers ════════════════════════════════════════════════ */

/** Days after acceptance with nobody saying „დასრულდა" before the ONE reminder. */
export const DONE_REMINDER_DAYS = 14
/** Days after acceptance before the offer is closed silently. */
export const DONE_CLOSE_DAYS = 21
/** One sentence. Long enough for a real one, short enough not to be a page. */
export const REVIEW_BODY_MAX = 300
/** How many rows one cron tick touches per job. */
const BATCH = 100

const DAY = 86_400_000

/* ═══════════ the pure rules ═════════════════════════════════════════════ */

export type DoneBy = 'CLIENT' | 'PROVIDER'

export type LifecycleRow = {
  status: string
  kind: string
  doneAt: Date | string | null
  closedAt: Date | string | null
}

/**
 * May this offer be marked done? ACCEPTED, a QUOTE, not already done. `closedAt`
 * does NOT block it: a client who comes back on day 25 and says it finished is
 * telling the truth late, and the review that follows is worth having.
 */
export function canMarkDone(o: LifecycleRow): boolean {
  return o.status === 'ACCEPTED' && o.kind === 'QUOTE' && o.doneAt == null
}

/**
 * THE CLAIM for done, as the `where` it is written with. Exported so the test
 * can pin the shape and the route cannot drift from it: `doneAt: null` is what
 * makes it once, `status`/`kind` are what make it legal.
 */
export function markDoneWhere(offerId: string) {
  return { id: offerId, status: 'ACCEPTED' as const, kind: 'QUOTE' as const, doneAt: null }
}

/** May the provider take this offer back? Only while it is on the table. */
export function canWithdraw(o: { status: string }): boolean {
  return o.status === 'SENT'
}

/**
 * THE CLAIM for withdraw. The provider identity is IN the where — a session
 * that does not own the offer matches zero rows and learns nothing.
 */
export function withdrawWhere(offerId: string, provider: ProviderIdentity) {
  return {
    id: offerId,
    status: 'SENT' as const,
    ...(provider.kind === 'EXPERT'
      ? { expertUserId: provider.userId }
      : { companyId: provider.companyId }),
  }
}

export type ReviewGate = 'OK' | 'NOT_DONE' | 'ALREADY_REVIEWED' | 'NO_ACCOUNT'

/** May a review be written on this offer? Done, unreviewed, by somebody with
 *  an account to sign it. */
export function reviewGate(o: {
  doneAt: Date | string | null
  reviewed: boolean
  authorUserId: string | null
}): ReviewGate {
  if (o.doneAt == null) return 'NOT_DONE'
  if (o.reviewed) return 'ALREADY_REVIEWED'
  if (!o.authorUserId) return 'NO_ACCOUNT'
  return 'OK'
}

/** The body a client sends: whole stars 1–5 and at most one short paragraph.
 *  An empty body is fine — the stars are the review; the sentence is a gift. */
export const ReviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(REVIEW_BODY_MAX).default(''),
})
export type ReviewInput = z.infer<typeof ReviewInput>

/** The 409 every claim in this file answers with — one shape, so the client
 *  component reads one code. */
export const CONFLICT = { status: 409 } as const

type ClockRow = {
  status: string
  kind: string
  acceptedAt: Date | string | number
  doneAt: Date | string | null
  closedAt: Date | string | null
  reminded: boolean
}

const ms = (d: Date | string | number) =>
  typeof d === 'number' ? d : typeof d === 'string' ? Date.parse(d) : d.getTime()

/** Is the ONE reminder due? Accepted ≥14 days, still open, not yet reminded. */
export function reminderDue(o: ClockRow, now: number): boolean {
  if (!canMarkDone(o) || o.closedAt != null || o.reminded) return false
  return now - ms(o.acceptedAt) >= DONE_REMINDER_DAYS * DAY
}

/** Is the silent close due? Accepted ≥21 days, still open. Independent of the
 *  reminder — a row the reminder skipped (no email) still closes. */
export function closeDue(o: ClockRow, now: number): boolean {
  if (!canMarkDone(o) || o.closedAt != null) return false
  return now - ms(o.acceptedAt) >= DONE_CLOSE_DAYS * DAY
}

/* ═══════════ the prisma helpers ═════════════════════════════════════════ */

export type ClaimResult = { ok: true } | { ok: false; error: string }

/**
 * Mark an offer done, once. The `where` IS the guard — no read-then-write.
 * The DONE event is best-effort bookkeeping and never undoes the stamp.
 */
export async function markOfferDone(offerId: string, by: DoneBy, now = new Date()): Promise<ClaimResult> {
  const claimed = await prisma.requestOffer.updateMany({
    where: markDoneWhere(offerId),
    data: { doneAt: now, doneBy: by },
  })
  if (claimed.count !== 1) return { ok: false, error: 'ALREADY_DONE' }
  const rec = await recordOfferEvent(offerId, 'DONE', { by })
  if (!rec.ok) console.error('[offerEvents] DONE not recorded', offerId, rec.error)
  return { ok: true }
}

/**
 * Withdraw a SENT offer and give its place back. Two statements: the offer's
 * claim decides; the counter follows, guarded by `gt: 0` so a stray second
 * call can never drive it below zero (the CHECK would refuse and 500).
 */
export async function withdrawOffer(offerId: string, provider: ProviderIdentity): Promise<ClaimResult> {
  const offer = await prisma.requestOffer.findFirst({
    where: withdrawWhere(offerId, provider),
    select: { requestId: true },
  })
  if (!offer) return { ok: false, error: 'NOT_OPEN' }
  const claimed = await prisma.requestOffer.updateMany({
    where: withdrawWhere(offerId, provider),
    data: { status: 'WITHDRAWN' },
  })
  if (claimed.count !== 1) return { ok: false, error: 'NOT_OPEN' }
  await prisma.serviceRequest.updateMany({
    where: { id: offer.requestId, offerCount: { gt: 0 } },
    data: { offerCount: { decrement: 1 } },
  }).catch(() => {})
  const rec = await recordOfferEvent(offerId, 'WITHDRAWN')
  if (!rec.ok) console.error('[offerEvents] WITHDRAWN not recorded', offerId, rec.error)
  return { ok: true }
}

/** Every provider account behind an offer — one expert, or a company's
 *  members. The notification audience for anything the client does. */
export async function providerUserIdsOf(o: { expertUserId: string | null; companyId: string | null }): Promise<string[]> {
  if (o.expertUserId) return [o.expertUserId]
  if (!o.companyId) return []
  const members = await prisma.companyMember.findMany({
    where: { companyId: o.companyId },
    select: { userId: true },
  })
  return members.map(m => m.userId)
}

/* ═══════════ the cron ═══════════════════════════════════════════════════ */

export type OfferLifecycleJobsResult = { reminded: number; closed: number }

/**
 * One tick: the reminder, then the close. Both idempotent and claim-style —
 * the reminder's claim is the OfferEvent row (unique per offer and type, so
 * `first === false` means another tick already sent it), the close's claim is
 * `closedAt: null` in the where. Mail and bells are passed in so the tick
 * itself owns no template — lib/emailTemplates does, and the cron route wires
 * them.
 */
export async function runOfferLifecycleJobs(
  now: number,
  send: {
    remindClient: (o: { email: string; publicRef: string; topic: string }) => Promise<void>
    remindProvider: (userIds: string[], o: { topic: string }) => Promise<void>
  },
): Promise<OfferLifecycleJobsResult> {
  const out: OfferLifecycleJobsResult = { reminded: 0, closed: 0 }

  // The candidate set for both jobs: still-open QUOTE offers accepted a while
  // ago. `updatedAt` is the index hint — after acceptance nothing writes the
  // offer row until this file does — and the ACCEPTED event's own time is
  // the clock when it was recorded.
  const select = {
    id: true, status: true, kind: true, doneAt: true, closedAt: true, updatedAt: true,
    expertUserId: true, companyId: true,
    request: { select: { publicRef: true, topic: true, email: true } },
    events: { where: { type: { in: ['ACCEPTED', 'REMINDED'] } }, select: { type: true, at: true } },
  } satisfies Prisma.RequestOfferSelect
  const rowOf = (r: {
    status: string; kind: string; doneAt: Date | null; closedAt: Date | null; updatedAt: Date
    events: { type: string; at: Date }[]
  }): ClockRow => ({
    status: r.status, kind: r.kind, doneAt: r.doneAt, closedAt: r.closedAt,
    acceptedAt: r.events.find(e => e.type === 'ACCEPTED')?.at ?? r.updatedAt,
    reminded: r.events.some(e => e.type === 'REMINDED'),
  })

  // ── 1. The reminder ────────────────────────────────────────────────────
  try {
    const due = await prisma.requestOffer.findMany({
      where: {
        status: 'ACCEPTED', kind: 'QUOTE', doneAt: null, closedAt: null,
        updatedAt: { lte: new Date(now - DONE_REMINDER_DAYS * DAY) },
        events: { none: { type: 'REMINDED' } },
      },
      take: BATCH,
      select,
    })
    for (const r of due) {
      if (!reminderDue(rowOf(r), now)) continue
      // THE CLAIM: the marker row. A second tick (or a second instance) gets
      // `first: false` from the unique index and sends nothing.
      const rec = await recordOfferEvent(r.id, 'REMINDED')
      if (!rec.ok || !rec.first) continue
      out.reminded++
      const topic = r.request.topic
      if (r.request.email) {
        try { await send.remindClient({ email: r.request.email, publicRef: r.request.publicRef, topic }) } catch { /* best-effort */ }
      }
      try {
        const ids = await providerUserIdsOf(r)
        if (ids.length) await send.remindProvider(ids, { topic })
      } catch { /* best-effort */ }
    }
  } catch { /* one job's failure is not the tick's */ }

  // ── 2. The silent close ────────────────────────────────────────────────
  try {
    const due = await prisma.requestOffer.findMany({
      where: {
        status: 'ACCEPTED', kind: 'QUOTE', doneAt: null, closedAt: null,
        updatedAt: { lte: new Date(now - DONE_CLOSE_DAYS * DAY) },
      },
      take: BATCH,
      select,
    })
    for (const r of due) {
      if (!closeDue(rowOf(r), now)) continue
      const claimed = await prisma.requestOffer.updateMany({
        where: { id: r.id, status: 'ACCEPTED', doneAt: null, closedAt: null },
        data: { closedAt: new Date(now) },
      })
      if (claimed.count !== 1) continue
      out.closed++
      const rec = await recordOfferEvent(r.id, 'CLOSED')
      if (!rec.ok) console.error('[offerEvents] CLOSED not recorded', r.id, rec.error)
    }
  } catch { /* … */ }

  return out
}
