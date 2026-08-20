// WHAT HAPPENED TO AN OFFER — the append-only record, and the one function
// allowed to write it.
//
// ⚠️ THIS IS THE FUTURE INVOICE. The owner's decision (2026-08-17) is that an
// expert pays „როცა კლიენტმა წაიკითხა" — so the moment a price is switched on,
// these rows ARE the billing. Everything below is shaped by that and by nothing
// else:
//
//   APPEND-ONLY      rows are inserted, never updated, never deleted. A charge
//                    you cannot show the evidence for is a charge you will lose
//                    an argument about.
//   FIRST WINS       „opened twice" costs once. Enforced by a UNIQUE constraint
//                    on (offerId, type), not by a read-then-write — two polls
//                    arriving together would both pass a TypeScript check.
//   LOUD, NOT SILENT the caller decides whether a failure matters. The old
//                    read-receipt sweep swallowed its own errors, which is
//                    correct for a badge and indefensible for money.
//
// ⚠️ THE PRICE IS 0 TODAY AND BOTH SIGNALS ARE RECORDED. Which of VIEWED and
// REPLIED should cost money is unsettled and the market disagrees: Profi.ru
// bills on the open and refunds it if the client never opens within five days;
// Thumbtack bills on the reply, and ABANDONED its open-based refund window —
// evidence that the open is the noisier of the two. A client who opens five
// offers out of curiosity and hires nobody has cost five experts money. While
// the lead is free, recording both is free, and after a month the ratio decides
// it with a number instead of an opinion.

import { prisma } from './prisma'

/* ═══════════ the vocabulary ═════════════════════════════════════════════ */

export const OFFER_EVENTS = [
  /** The expert sent it. The clock every other event is measured from. */
  'SENT',
  /** It left the building — the client's email went out. Not proof of reading;
   *  proof that we did our part, which is what an expert asks about first. */
  'DELIVERED',
  /** ⚠️ THE CLIENT OPENED THE THREAD. Today's chosen billing trigger. */
  'VIEWED',
  /** The client wrote back. The stronger signal, recorded so the choice between
   *  the two can be made from data. */
  'REPLIED',
  /** The client chose this offer. */
  'ACCEPTED',
  /** The client chose somebody else. */
  'DECLINED',
  // ── After the choice (stage 7, lib/offerLifecycle) ─────────────────────
  // The provider took a SENT offer back; the job was marked finished (by
  // either side, once — see markOfferDone); the 14-day „დასრულდა?" reminder
  // went out — a MARKER as much as an event, because the unique (offerId,
  // type) constraint is what makes the cron send it exactly once; the offer
  // was silently closed at 21 days with nobody saying it finished.
  'WITHDRAWN',
  'DONE',
  'REMINDED',
  'CLOSED',
] as const

export type OfferEventName = (typeof OFFER_EVENTS)[number]

/**
 * The events a price could ever be attached to.
 *
 * SENT and DELIVERED are deliberately NOT here: charging for the act of
 * answering is the Bark model, where the expert pays before the client has done
 * anything at all, and the documented result is that roughly half of paid leads
 * never respond. That is the model this platform exists not to be.
 */
export const BILLABLE_EVENTS: readonly OfferEventName[] = ['VIEWED', 'REPLIED', 'ACCEPTED']

export function isOfferEvent(v: string): v is OfferEventName {
  return (OFFER_EVENTS as readonly string[]).includes(v)
}

/** Georgian, for the admin's timeline. Never a raw code on a screen. */
export const OFFER_EVENT_LABEL: Record<OfferEventName, string> = {
  SENT: 'გაიგზავნა',
  DELIVERED: 'მიუვიდა',
  VIEWED: 'კლიენტმა გახსნა',
  REPLIED: 'კლიენტმა უპასუხა',
  ACCEPTED: 'კლიენტმა აირჩია',
  DECLINED: 'კლიენტმა სხვა აირჩია',
  WITHDRAWN: 'გატანილი',
  DONE: 'დასრულდა',
  REMINDED: 'შეხსენება გაიგზავნა',
  CLOSED: 'დაიხურა',
}

/* ═══════════ writing one ════════════════════════════════════════════════ */

export type RecordResult =
  /** Written now — this is the first time it happened. A billing rule acts on
   *  exactly this answer and on no other. */
  | { ok: true; first: true }
  /** Already recorded. Not an error: the client opened the thread again, or two
   *  polls raced. The bill was already decided the first time. */
  | { ok: true; first: false }
  /** The write failed. Returned rather than thrown so the caller decides — a
   *  read receipt must never fail a page render, and a charge must never be
   *  silently skipped. Both are true and they are different callers. */
  | { ok: false; error: unknown }

/**
 * Record that something happened to an offer, once.
 *
 * ⚠️ THE UNIQUE VIOLATION IS THE ANSWER, NOT AN ERROR. „Has this happened
 * before" is asked by attempting the insert and letting the database refuse it
 * — the same claim-don't-check rule CLAUDE.md states for status transitions and
 * app/api/requests/[ref]/accept follows. A `findFirst` then `create` would let
 * two 15-second polls arriving together both find nothing and both insert, and
 * on the day this costs money that is a double charge.
 *
 * P2002 is Prisma's unique-violation code. Anything else is a real failure and
 * is reported as one.
 */
export async function recordOfferEvent(
  offerId: string,
  type: OfferEventName,
  meta?: Record<string, unknown>,
): Promise<RecordResult> {
  try {
    await prisma.offerEvent.create({
      data: { offerId, type, meta: meta ? (meta as object) : undefined },
      select: { id: true },
    })
    return { ok: true, first: true }
  } catch (e: any) {
    if (e?.code === 'P2002') return { ok: true, first: false }
    return { ok: false, error: e }
  }
}

/* ═══════════ reading them back ══════════════════════════════════════════ */

export type OfferEventRow = { type: string; at: Date | string }

/**
 * The lifecycle of one offer, oldest first, as a timeline reads.
 *
 * Ordered by the EVENT ORDER rather than the timestamp when the two disagree —
 * they can, by milliseconds, when an accept writes ACCEPTED and DECLINED in one
 * transaction, and a timeline that shows „chose somebody else" above „chose
 * this one" is a timeline nobody trusts.
 */
export function timelineOf(rows: OfferEventRow[]): { type: OfferEventName; at: string }[] {
  const rank = new Map(OFFER_EVENTS.map((t, i) => [t as string, i]))
  return rows
    .filter(r => isOfferEvent(r.type))
    .sort((a, b) => (rank.get(a.type)! - rank.get(b.type)!))
    .map(r => ({
      type: r.type as OfferEventName,
      at: typeof r.at === 'string' ? r.at : r.at.toISOString(),
    }))
}

/**
 * How long the client took to open it, in minutes — or null if they never did.
 *
 * ⚠️ THE ONE NUMBER THIS TABLE EXISTS TO PRODUCE, besides the bill. „What share
 * of offers are ever opened, and how fast" is the health of the whole
 * marketplace, and it is the number Bark's own users compute by hand and quote
 * back at them (~44% ever respond). Knowing it before the experts do is the
 * difference between fixing routing and being told about it in a review.
 */
export function minutesToView(rows: OfferEventRow[]): number | null {
  const at = (t: OfferEventName) => {
    const r = rows.find(x => x.type === t)
    if (!r) return null
    const ms = typeof r.at === 'string' ? Date.parse(r.at) : r.at.getTime()
    return Number.isFinite(ms) ? ms : null
  }
  const sent = at('SENT')
  const viewed = at('VIEWED')
  if (sent === null || viewed === null) return null
  // Negative would mean the clock moved; report nothing rather than a lie.
  const mins = (viewed - sent) / 60_000
  return mins >= 0 ? Math.round(mins) : null
}

/**
 * What an expert would be charged for this offer, under a given rule.
 *
 * ⚠️ THE PRICE IS A PARAMETER AND IT IS 0 TODAY (owner, 2026-08-17: „ახლა
 * რადგან სტარტაპია 0 ლარი იქნება ლიდი, მაგრამ მერე ეს ფასი გაიზრდება"). Pure,
 * so the same function answers „what would last month have cost at 5₾ on
 * VIEWED?" against real recorded history — which is exactly how the first real
 * price should be chosen, rather than by picking a number and finding out.
 */
export function chargeFor(
  rows: OfferEventRow[],
  rule: { on: OfferEventName; priceGel: number },
): number {
  if (!BILLABLE_EVENTS.includes(rule.on)) return 0
  return rows.some(r => r.type === rule.on) ? rule.priceGel : 0
}
