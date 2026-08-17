// WHO A REQUEST IS FOR — the routing rules, and the lifecycle clock.
//
// ⚠️ THIS IS NOT A MATCHING ALGORITHM, and the difference is deliberate. There
// is no score, no ranking, no weighting and no learned relevance: a request
// carries the sphere its topic maps onto (lib/requestTopics →
// categorySlugOfTopic), an expert carries the sphere they are filed under, and
// the two either agree or they do not. That is a FACT, and a fact can be
// explained to the provider who asks „why did I get this".
//
// The stage-1 brief refused „ავტომატური დაკავშირება, ალგორითმი, ქულები,
// რეიტინგი" — and this still refuses all four. What the owner asked for on
// 2026-08-17 is the thing underneath them: stop mailing every request to
// everybody. Sphere-agreement does that without inventing a ranking nobody can
// audit.
//
// PURE — no prisma, no react, so the cron, the admin route and the tests share
// one copy of every rule. The queries live at the call sites; the DECISIONS
// live here.

/* ═══════════ who gets the email ═════════════════════════════════════════
 *
 * Two audiences, and the second one is the honest half:
 *
 *   TARGETED   the request maps onto a sphere and somebody is filed under it.
 *              They are mailed. Everybody else still SEES the request in the
 *              queue — the mail is a nudge, never a permission.
 *
 *   EVERYONE   the request maps onto no sphere (most learning topics: this
 *              platform has no „ქიმია" sphere), or it maps onto one nobody is
 *              filed under. Then we genuinely do not know who fits, and a
 *              request nobody is told about is a request that dies. Silence
 *              would be us pretending to a precision we do not have.
 */
export type RoutingAudience = 'TARGETED' | 'EVERYONE'

export type RoutableProvider = {
  userId: string
  /** The sphere this provider is filed under, when they have a profile. */
  categoryId: string | null
  /** A company member has no TutorProfile — they are routed by their company's
   *  allowlist row, which carries no sphere, so they are always in the
   *  EVERYONE audience. Modelled explicitly rather than left as a null
   *  category, because „no profile" and „profile with no sphere" are different
   *  facts and only one of them is a gap. */
  isCompanyMember?: boolean
}

export type RoutingResult = {
  audience: RoutingAudience
  /** The user ids to mail. Never empty when there is anybody on the allowlist —
   *  see the EVERYONE fallback. */
  recipients: string[]
}

/**
 * Who to mail about this request.
 *
 * ⚠️ THE FALLBACK IS THE POINT. A targeted list that comes back empty must
 * NEVER mean „mail nobody": the first thing this platform will learn from the
 * requests table is demand it has no experts for, and a chemistry request that
 * silently reached zero inboxes teaches us nothing and helps nobody. Empty
 * target → everybody, and the audience name records which happened so the
 * admin panel can say so.
 */
export function routeRequest(
  categoryId: string | null,
  providers: RoutableProvider[],
): RoutingResult {
  const all = providers.map(p => p.userId)
  if (!categoryId) return { audience: 'EVERYONE', recipients: all }

  const targeted = providers
    .filter(p => !p.isCompanyMember && p.categoryId === categoryId)
    .map(p => p.userId)

  return targeted.length > 0
    ? { audience: 'TARGETED', recipients: targeted }
    : { audience: 'EVERYONE', recipients: all }
}

/* ═══════════ the lifecycle clock ════════════════════════════════════════
 *
 * Four timers, each answering a question somebody would otherwise have to
 * remember. Every one of them is a NUDGE or a CLOSE — none of them decides
 * anything a human decides: nothing here verifies a request, accepts an offer,
 * or hands out a contact.
 *
 * The hours are round numbers chosen against the speed-to-lead research
 * (a lead's value collapses within hours, not days) and against the honest
 * rhythm of a platform an owner runs by phone. They live here as named
 * constants so a change is one edit and the tests read the same numbers.
 */

/** Verified, still nobody has offered → re-mail, once, WIDENED to everyone.
 *  6h: long enough that the first mail had its chance, short enough that the
 *  client has not given up. */
export const UNANSWERED_NUDGE_HOURS = 6

/** Offers are waiting and the client has not chosen → remind them, once.
 *  48h: the offers are still fresh and the providers who wrote them have not
 *  yet written the client off. */
export const CLIENT_NUDGE_HOURS = 48

/** Verified, never answered, nobody is coming → close it. 14 days: past this
 *  the request is not a queue item, it is a tombstone, and leaving it open
 *  tells providers a stale story about how much work there is. */
export const STALE_OPEN_DAYS = 14

/** Matched, and the two of them have long since talked or not → close it.
 *  30 days: the platform has no part in what happens after the contact opens,
 *  so the row's only remaining job is to stop occupying a live queue. */
export const MATCHED_CLOSE_DAYS = 30

export type LifecycleRow = {
  id: string
  status: string
  offerCount: number
  verifiedAt: Date | string | null
  createdAt: Date | string
  /** When the row last changed — for a MATCHED request that IS the moment it
   *  matched, because nothing writes the row afterwards. */
  updatedAt: Date | string
  providerNudgeAt: Date | string | null
  clientNudgeAt: Date | string | null
}

const ms = (v: Date | string) => (typeof v === 'string' ? Date.parse(v) : v.getTime())
const hoursSince = (v: Date | string, now: number) => (now - ms(v)) / 3_600_000
const daysSince = (v: Date | string, now: number) => hoursSince(v, now) / 24

/** Should the providers be re-mailed about this unanswered request? */
export function needsProviderNudge(r: LifecycleRow, now: number = Date.now()): boolean {
  if (r.status !== 'VERIFIED' || r.offerCount > 0) return false
  // Never nudged before — the flag is the „once" and it is a column, not a
  // guess from timestamps, because a cron that runs every 15 minutes would
  // otherwise re-send on every tick of the eligible window.
  if (r.providerNudgeAt) return false
  if (!r.verifiedAt) return false
  return hoursSince(r.verifiedAt, now) >= UNANSWERED_NUDGE_HOURS
}

/** Should the client be reminded that offers are waiting? */
export function needsClientNudge(r: LifecycleRow, now: number = Date.now()): boolean {
  if (r.status !== 'VERIFIED' || r.offerCount < 1) return false
  if (r.clientNudgeAt) return false
  if (!r.verifiedAt) return false
  return hoursSince(r.verifiedAt, now) >= CLIENT_NUDGE_HOURS
}

/** Should this row leave the live queue? */
export function shouldAutoClose(r: LifecycleRow, now: number = Date.now()): boolean {
  if (r.status === 'VERIFIED' && r.offerCount === 0 && r.verifiedAt) {
    return daysSince(r.verifiedAt, now) >= STALE_OPEN_DAYS
  }
  if (r.status === 'MATCHED') {
    // MATCHED has no timestamp of its own — `updatedAt` moved when the status
    // did, and the row is not written again afterwards, so it IS the moment of
    // matching. `createdAt` would be WRONG here and the error is silent: a
    // request submitted five weeks ago and matched yesterday would close a day
    // later, taking a live introduction off the client's page.
    return daysSince(r.updatedAt, now) >= MATCHED_CLOSE_DAYS
  }
  return false
}
