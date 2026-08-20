// ONE LIST OF WORK — the shared row behind /work/jobs (2026-08-19).
//
// ⚠️ WHY THIS FILE EXISTS. The same provider's committed work was split by
// WHICH MACHINE PRODUCED IT: a `Booking` (a client picked a published time —
// PREPARING/CONFIRMED/LIVE/COMPLETED/CANCELED, reschedule, no-show) lived on
// /work/bookings, and an ACCEPTED `RequestOffer` (a price the client chose,
// finished by `doneAt`, closed by `closedAt` — lib/offerLifecycle) was visible
// only inside /work/offers. Nothing about the PERSON differs between them: a
// consultation is one KIND of service — the bookable one (CLAUDE.md, THE
// PRODUCT MODEL) — so both rows are simply „work I have agreed to do", and
// splitting them by table asked the provider to hold the platform's schema in
// their head to find out what they owe somebody this week.
//
// PURE: no prisma, no react, no `Date#getHours()`/`getDay()`. Day bucketing
// comes from lib/bookings (`dayKeyInTz`, Asia/Tbilisi) — the SAME bucketing the
// two dashboards already agree on — rather than a second copy of it, which is
// exactly how the student and expert dashboards once counted the same account
// differently. Executed by tests/jobs.test.ts.

import { UPCOMING_STATUSES, dayKeyInTz } from './bookings'
import { clientContactFor, gel, offerPriceLabel, type ClientContact } from './requests'
import { topicLabel } from './requestTopics'

/* ═══════════ the row ════════════════════════════════════════════════════ */

export type JobKind = 'BOOKING' | 'QUOTE'

/** Which part of the list a row belongs to. Three, not two, because
 *  „somebody is waiting on MY answer" was already a bucket on the bookings
 *  page and losing it would bury a PREPARING request under a calendar. */
export type JobBucket = 'attention' | 'active' | 'history'

export type JobRow = {
  kind: JobKind
  id: string
  /** Where the row opens. A booking has its own detail page; a quote has none,
   *  so it opens where an offer is already viewable. */
  href: string
  title: string
  /** The other side, as this viewer is allowed to name them — see
   *  `quotePeerName`. NEVER a phone number: this is a list. */
  peerName: string
  /**
   * The agreed instant, or null when the work has no time attached.
   *
   * ⚠️ NULL IS THE HONEST ANSWER FOR A QUOTE and it is not filled in. A quote
   * is „I will do this for this price", agreed on a day and done on some other;
   * writing `updatedAt` into `when` would print a date the client never named
   * and sort the row into a calendar it does not belong to. See `sortAt`.
   */
  when: Date | null
  /** BOOKING: the existing booking vocabulary, untouched.
   *  QUOTE: ACTIVE | DONE | CLOSED — see `quoteJobStatus`. */
  status: string
  statusLabel: string
  /** Already formatted, because the two kinds price differently: a booking is
   *  a lari figure, a quote may be „-დან" or a call-out fee (offerPriceLabel). */
  price: string
  /** THE SORT KEY, and the documented fallback. `when` when there is one;
   *  otherwise the row's own last movement (`updatedAt` for a quote). Rows are
   *  never mixed on it — see `sortJobRows`. */
  sortAt: number
  bucket: JobBucket
}

/** The header the undated rows sit under. They are grouped, never interleaved:
 *  a quote does not have a slot and must not borrow one. */
export const UNDATED_LABEL = 'თარიღის გარეშე'

/** What a nameless client is called. */
export const CLIENT_FALLBACK = 'კლიენტი'

/* ═══════════ bookings ═══════════════════════════════════════════════════ */

/** The booking status vocabulary, unchanged — this list adopts it, it does not
 *  translate it. The words are the ones components/StatusPill already prints,
 *  so a row and its pill can never disagree. */
export const BOOKING_JOB_STATUS_LABEL: Record<string, string> = {
  PREPARING: 'ელოდება დადასტურებას',
  CONFIRMED: 'დადასტურდა',
  LIVE: 'მიმდინარეობს',
  COMPLETED: 'დასრულდა',
  CANCELED: 'გაუქმდა',
  NO_SHOW: 'არ გამოცხადდა',
}

export type BookingJobInput = {
  id: string
  topic: string
  status: string
  startAt: string | number | Date
  durationMin: number
  price: number
  student?: { fullName?: string | null } | null
  rescheduleRequest?: { proposedBy?: string | null } | null
}

const ms = (d: string | number | Date): number =>
  typeof d === 'number' ? d : typeof d === 'string' ? Date.parse(d) : d.getTime()

/** The booking's own end has passed while it is still CONFIRMED/LIVE — the
 *  expert owes a complete / no-show decision. Mirrors `awaitsClosure` in
 *  app/work/_components/types (which is a .tsx-side helper over the same two
 *  fields); kept here because bucketing must stay importable by a pure test. */
export function bookingAwaitsClosure(b: BookingJobInput, now: number): boolean {
  return (b.status === 'CONFIRMED' || b.status === 'LIVE') &&
    ms(b.startAt) + b.durationMin * 60_000 < now
}

/** The client proposed a new time and the expert has not answered. */
export function bookingAwaitsReschedule(b: BookingJobInput): boolean {
  return (b.status === 'PREPARING' || b.status === 'CONFIRMED') &&
    b.rescheduleRequest?.proposedBy === 'STUDENT'
}

export function bookingJobBucket(b: BookingJobInput, now: number): JobBucket {
  if (b.status === 'COMPLETED' || b.status === 'CANCELED' || b.status === 'NO_SHOW') return 'history'
  if (b.status === 'PREPARING' || bookingAwaitsReschedule(b) || bookingAwaitsClosure(b, now)) return 'attention'
  // Live counts as active even once its start is behind us — that is the whole
  // meaning of LIVE, and `UPCOMING_STATUSES` is the set the dashboards use.
  if ((UPCOMING_STATUSES as readonly string[]).includes(b.status)) return 'active'
  return 'history'
}

export function bookingJobRow(b: BookingJobInput, now: number): JobRow {
  const when = new Date(ms(b.startAt))
  return {
    kind: 'BOOKING',
    id: b.id,
    // ⚠️ THE DETAIL PAGE DID NOT MOVE. Only the LIST did.
    href: `/work/bookings/${b.id}`,
    title: b.topic,
    peerName: (b.student?.fullName ?? '').trim() || 'უცნობი კლიენტი',
    when,
    status: b.status,
    statusLabel: BOOKING_JOB_STATUS_LABEL[b.status] ?? b.status,
    price: gel(b.price),
    sortAt: when.getTime(),
    bucket: bookingJobBucket(b, now),
  }
}

/* ═══════════ quotes ═════════════════════════════════════════════════════ */

/**
 * ⚠️ THE THREE WORDS A QUOTE ANSWERS WITH, and why they are not the offer's
 * own statuses. On the offers page a row says „მიღებული" — that is news about
 * a BID. Here the bid is already history: the row is work, and the only
 * question is whether it is running, finished or timed out. `closedAt` is a
 * stamp and not a transition (the offer stays ACCEPTED — lib/offerLifecycle),
 * so the status has to be derived rather than read.
 *
 * `doneAt` OUTRANKS `closedAt` deliberately: a client who comes back on day 25
 * and says it finished is telling the truth late, and „დასრულებული" is the
 * truer sentence about that job than „დაიხურა".
 */
export const QUOTE_JOB_STATUS_LABEL = {
  ACTIVE: 'მიმდინარე',
  DONE: 'დასრულებული',
  CLOSED: 'დაიხურა',
} as const
export type QuoteJobStatus = keyof typeof QUOTE_JOB_STATUS_LABEL

export type QuoteJobInput = {
  id: string
  /** The offer's own status. Only ACCEPTED rows are work — see the query. */
  status: string
  priceGel: number
  priceKind: string
  doneAt: string | number | Date | null
  closedAt: string | number | Date | null
  updatedAt: string | number | Date
  /** The request's topic id (lib/requestTopics), never a hand-typed label. */
  topic: string | null
  /** The request's contact NAME. ⚠️ The phone and the email are NOT selected
   *  into this list at all — see app/work/jobs/page.tsx. */
  contactName: string | null
}

export function quoteJobStatus(q: Pick<QuoteJobInput, 'doneAt' | 'closedAt'>): QuoteJobStatus {
  if (q.doneAt != null) return 'DONE'
  if (q.closedAt != null) return 'CLOSED'
  return 'ACTIVE'
}

/**
 * The contact seal, ASKED rather than re-implemented.
 *
 * lib/requestChat's rule is „masked before acceptance, open after" and
 * lib/requests → `clientContactFor` is the one function that decides it: it
 * returns null for every status but ACCEPTED. An accepted offer is precisely
 * the case where the contact IS open, so the client's NAME is the provider's
 * to read here. Calling the real function with a probe contact keeps that
 * decision in one place instead of copying `status === 'ACCEPTED'` into a
 * second file.
 */
const PROBE_CONTACT: ClientContact = { contactName: '', phone: '', email: null }
export function contactIsOpen(offer: { status: string }): boolean {
  return clientContactFor(offer, PROBE_CONTACT) !== null
}

/** „კლიენტი" whenever the seal is shut or the name is blank — never a guess,
 *  and never, on any row, a phone number. */
export function quotePeerName(q: Pick<QuoteJobInput, 'status' | 'contactName'>): string {
  if (!contactIsOpen(q)) return CLIENT_FALLBACK
  return (q.contactName ?? '').trim() || CLIENT_FALLBACK
}

export function quoteJobRow(q: QuoteJobInput): JobRow {
  const status = quoteJobStatus(q)
  return {
    kind: 'QUOTE',
    id: q.id,
    // There is no per-offer page; /work/offers is where an offer is viewable.
    href: '/work/offers',
    title: topicLabel(q.topic),
    peerName: quotePeerName(q),
    when: null,
    status,
    statusLabel: QUOTE_JOB_STATUS_LABEL[status],
    price: offerPriceLabel(q.priceGel, q.priceKind),
    sortAt: ms(q.updatedAt),
    // A quote is never „attention": nothing on this platform is waiting for the
    // provider to press a button on it. The 14-day nudge and the 21-day close
    // are the client's clock (lib/offerLifecycle), not a task in this list.
    bucket: status === 'ACTIVE' ? 'active' : 'history',
  }
}

/* ═══════════ the order ══════════════════════════════════════════════════ */

/**
 * THE SORT RULE, and it is honest about the two kinds rather than smoothing
 * them together:
 *
 *   1. DATED ROWS FIRST, on `when`. `'ASC'` (soonest first) for work still
 *      ahead — the order the bookings list has always used, because the next
 *      thing you must show up for is the first thing you should read; `'DESC'`
 *      (most recent first) for history.
 *   2. UNDATED ROWS AFTER THEM, as their own group, ALWAYS newest-movement
 *      first (`sortAt` = `updatedAt`). They are not interleaved and they do not
 *      borrow a slot: a quote has no time, and a list that pretended otherwise
 *      would put „ბინის რემონტი" at 14:00 on Thursday.
 *   3. Ties break on id, so the order is stable across renders.
 */
export function sortJobRows(rows: JobRow[], order: 'ASC' | 'DESC'): JobRow[] {
  const dir = order === 'ASC' ? 1 : -1
  const dated = rows.filter(r => r.when !== null)
    .sort((a, b) => (a.sortAt - b.sortAt) * dir || a.id.localeCompare(b.id))
  const undated = rows.filter(r => r.when === null)
    .sort((a, b) => b.sortAt - a.sortAt || a.id.localeCompare(b.id))
  return [...dated, ...undated]
}

/** The same split the UI groups on — dated rows (day headers) and the undated
 *  tail under `UNDATED_LABEL`. */
export function splitDated(rows: JobRow[]): { dated: JobRow[]; undated: JobRow[] } {
  return { dated: rows.filter(r => r.when !== null), undated: rows.filter(r => r.when === null) }
}

/** The whole list, bucketed and ordered. One call, so the tabs, the counters
 *  and the rows can never be built from three different sorts. */
export function buildJobRows(
  input: { bookings?: BookingJobInput[]; quotes?: QuoteJobInput[] },
  now: number = Date.now(),
): Record<JobBucket, JobRow[]> {
  const rows = [
    ...(input.bookings ?? []).map(b => bookingJobRow(b, now)),
    ...(input.quotes ?? []).map(quoteJobRow),
  ]
  const of = (b: JobBucket) => rows.filter(r => r.bucket === b)
  return {
    // Stalest first: the request that has waited longest is the one that is
    // costing somebody an answer.
    attention: sortJobRows(of('attention'), 'ASC'),
    active: sortJobRows(of('active'), 'ASC'),
    history: sortJobRows(of('history'), 'DESC'),
  }
}

/** The Tbilisi day a dated row is filed under. Re-exported so the page never
 *  reaches for a second timezone helper. */
export function jobDayKey(row: JobRow): string | null {
  return row.when ? dayKeyInTz(row.when) : null
}
