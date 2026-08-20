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
// STAGE 8 (2026-08-19) ADDED THE SECOND FACT: the PROFESSION. A CONSULTATION /
// PROJECT topic may name the professions that answer it (lib/requestTopics →
// Topic.professions, job labels from lib/professions), and an expert lists the
// professions they are (TutorProfile.professions). Those either intersect or
// they do not — still a fact, still explainable: „you were mailed because you
// are a ბუღალტერი and the request is a დღგ question". The two facts are UNIONED:
// the sphere match keeps everybody it reached before, the profession match
// adds the expert filed under another sphere who is nonetheless the person.
// The shipped bug this closes: `categoryId` was the ONLY expert key, and a
// topic with no sphere („ფოტოგრაფია", „გიდი", „საბაჟო") went to everyone.
//
// PURE — no prisma, no react, so the cron, the admin route and the tests share
// one copy of every rule. The queries live at the call sites; the DECISIONS
// live here. The one import is the topic vocabulary, itself pure.
import { professionsOfTopic } from './requestTopics'

/* ═══════════ who gets the email ═════════════════════════════════════════
 *
 * Two audiences, and the second one is the honest half:
 *
 *   TARGETED   the request maps onto a sphere and somebody is filed under it,
 *              OR its topic names a profession somebody claims (stage 8) —
 *              or, on the trades side, a master lists the topic and the city.
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

  /** ⚠️ WHAT THIS PROVIDER ACTUALLY DOES, AND WHERE (2026-08-18). A trades
   *  request carries no `categoryId` — the sphere table is the EXPERT
   *  taxonomy and no service topic maps into it — so `routeRequest` fell
   *  straight through to „EVERYONE" for every single one. Measured: a Tbilisi
   *  flat-cleaning request was mailed to all six allowlisted providers,
   *  including the Batumi electrician and the appliance repairman.
   *
   *  Harmless at five masters and fatal at fifty: lib/requestJobs opens by
   *  saying the file exists so this platform is not the lead-mill whose
   *  providers drown in work they cannot do, and the trades path was exactly
   *  that. Empty arrays mean „this provider has no service profile", which is
   *  every expert, and they are matched the old way. */
  services?: string[]
  areas?: string[]

  /** What this expert calls themselves (TutorProfile.professions, stage 8) —
   *  the second expert key beside the sphere. Empty/absent = matched by
   *  sphere alone, exactly as before. */
  professions?: string[]
}

const norm = (s: string) => s.trim().toLowerCase()

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
  /** ⚠️ THE TRADES MATCH, and it is a different question from the sphere one.
   *  An expert is filed under one sphere; a master lists up to twelve topics
   *  and the cities they travel to, and the request names exactly one of each.
   *  Passed as an option so every existing caller and test keeps its meaning. */
  service?: { topic: string | null; city: string | null } | null,
): RoutingResult {
  const all = providers.map(p => p.userId)

  // The service side FIRST, because a request that has a topic a master lists
  // is targeted whether or not it also has a sphere — and a trades request
  // never has a sphere, which is how every one of them was reaching everybody.
  if (service?.topic) {
    const matched = providers
      .filter(p => (p.services ?? []).includes(service.topic!))
      // A city they do not travel to is not their work. A request with no city
      // matches on trade alone rather than not at all — `city` has a default
      // today, but a row written before it did must not become unroutable.
      .filter(p => !service.city || (p.areas ?? []).length === 0 || (p.areas ?? []).includes(service.city))
      .map(p => p.userId)

    if (matched.length > 0) return { audience: 'TARGETED', recipients: matched }
    // …and if nobody covers it, the fallback below applies for the reason the
    // header states: silence teaches us nothing about demand we cannot serve.
  }

  // ── The expert side: sphere ∪ profession ─────────────────────────────────
  // Case-insensitive, trimmed — a label typed by an applicant and the label in
  // lib/professions are the same word whether or not somebody's keyboard left
  // a space on the end. Never a substring: „იურისტი" must not catch
  // „კორპორატიული იურისტი" — those are two entries in the owner's list, and
  // the corporate lawyer's request names the corporate lawyer.
  const wanted = new Set(professionsOfTopic(service?.topic).map(norm))
  const targeted = providers
    .filter(p => !p.isCompanyMember && (
      (categoryId !== null && p.categoryId === categoryId) ||
      (wanted.size > 0 && (p.professions ?? []).some(j => wanted.has(norm(j))))
    ))
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
