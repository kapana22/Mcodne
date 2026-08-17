// THE THREAD WITH US — the conversation that exists from the moment somebody
// presses send, before any provider has been told the request exists.
//
// PURE: no prisma, no react. The endpoint enforces these; the pages render
// them; the tests execute them. Same contract as lib/requestChat, which owns
// the OTHER thread — the per-offer one. Read that file first; this one is
// deliberately written as its differences.
//
// ⚠️ WHY IT EXISTS AT ALL. The old shape was: submit → a thank-you card, a code,
// and „დაგირეკავთ". Everything real then happened out of sight — an admin phones,
// the request is verified, providers are told, offers arrive. On a good day that
// is hours. The person who just described their problem had nowhere to add the
// thing they forgot, no way to ask whether it arrived, and nothing to look at.
// Owner, 2026-08-17: „ეს ფორმასავით შემოდის."
//
// ⚠️ AND WHY IT IS NOT THE SAME THREAD AS THE OFFER CHAT. Three rules differ,
// and every one of them differs in the direction that would be a BUG if the two
// were merged:
//
//   WHO READS IT   the client and US. Never a provider — this is where somebody
//                  says „my budget is really lower than I put", and a provider
//                  reading that is the client bidding against themselves.
//   MASKING        NONE. The offer chat scrubs phone numbers because the whole
//                  product promise is that contact opens on acceptance. Here the
//                  client is talking to the platform they ALREADY handed a phone
//                  number to, and an operator who cannot write „დაგირეკავთ
//                  032 2 40…" is an operator who cannot do the job.
//   WHEN IT CLOSES on the request, not on an offer.
//
// Merging them would have meant one set of rules bent to cover both, and the
// bend would have landed on masking — the one that cannot be got wrong twice.

/** Who is speaking on this thread. `STAFF` rather than `ADMIN` because what
 *  matters to a bubble is „the platform said it", not which operator typed it —
 *  the client is talking to მცოდნე, and staffing is our business. */
export type ThreadSide = 'CLIENT' | 'STAFF'

/* ═══════════ when it is open ════════════════════════════════════════════ */

/**
 * May this thread be written to?
 *
 * OPEN ON EVERY LIVE STATUS, INCLUDING REJECTED — and that is the one worth
 * stating. A request under the budget floor is answered „ამ ბიუჯეტში ვერ
 * დაგეხმარებით" and never phoned; closing their thread too would mean the only
 * person on the site who was actively turned away is also the only one who
 * cannot ask why. They are exactly who should be able to reply „და 300₾-ზე?".
 *
 * CLOSED is the single terminal state — the request is finished, and a thread on
 * a finished request is a place to write to nobody.
 */
export function threadIsOpen(request: { status: string }): boolean {
  return request.status !== 'CLOSED'
}

/** Why it is closed, in the words the screen shows. Null when it is open. */
export function threadClosedReason(request: { status: string }): string | null {
  return threadIsOpen(request) ? null : 'მოთხოვნა დახურულია.'
}

/* ═══════════ presence ═══════════════════════════════════════════════════
 *
 * ⚠️ THE BADGE IS A PROMISE, so it is computed from a heartbeat and nothing
 * else. An opening-hours table would say „online" at 11:00 on a day the operator
 * is ill; the whole reason to show the badge is that somebody deciding whether
 * to wait five minutes or go away can trust it.
 */

/** How stale a heartbeat may be and still count as „at the desk". Three missed
 *  beats at the 40s interval the panel keeps — long enough to survive a laptop
 *  sleeping through one, short enough that a closed tab goes dark within two
 *  minutes rather than at the end of the day. */
export const PRESENCE_TTL_MS = 2 * 60_000

export function staffIsOnline(lastSeenAt: Date | string | null | undefined, now: number): boolean {
  if (!lastSeenAt) return false
  const t = typeof lastSeenAt === 'string' ? Date.parse(lastSeenAt) : lastSeenAt.getTime()
  return Number.isFinite(t) && now - t < PRESENCE_TTL_MS
}

/**
 * What the client is told, in both states.
 *
 * ⚠️ THE OFFLINE LINE PROMISES A REPLY, NOT A TIME. „ვუპასუხებთ 15 წუთში" is a
 * number nobody here can keep at 02:00, and one broken estimate costs more than
 * the vagueness saves. What IS promised is true and checkable: the message is
 * stored, and it reaches the operator by email — see the endpoint.
 */
export function presenceLabel(online: boolean): string {
  return online ? 'ონლაინ ვართ' : 'ახლა ოფლაინ ვართ'
}

export function presenceHint(online: boolean): string {
  return online
    ? 'დაწერე — ვკითხულობთ.'
    : 'დაწერე მაინც — შეტყობინება მოგვდის და გიპასუხებთ.'
}
