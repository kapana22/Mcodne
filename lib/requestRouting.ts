// WHO A REQUEST IS FOR — the routing rules, and the lifecycle clock.
//
// ⚠️ NOT A MATCHING ALGORITHM, deliberately. No score, no ranking, no weighting,
// no learned relevance. A request carries the sphere its topic maps onto, an
// expert carries the sphere they are filed under, and the two either agree or
// they do not. That is a FACT, and a fact can be explained to the provider who
// asks „why did I get this". The stage-1 brief refused „ავტომატური დაკავშირება,
// ალგორითმი, ქულები, რეიტინგი" and this still refuses all four.
//
// THE SECOND FACT IS THE PROFESSION. A topic may name the professions that
// answer it and an expert lists the professions they are; those intersect or
// they do not. The two facts are UNIONED — the sphere match keeps everybody it
// reached before, the profession match adds the expert filed under another
// sphere who is nonetheless the person. It closes the bug where `categoryId`
// was the only key and a topic with no sphere went to everyone.
//
// PURE — no prisma, no react, so the cron, the admin route and the tests share
// one copy of every rule. The queries live at the call sites; the DECISIONS
// live here.
import { TOPIC_GROUPS, professionsOfTopic } from './requestTopics'
import { LAUNCH_CATEGORIES } from './launchTaxonomy'
import { sphereOfProfession } from './professions'

/* ═══════════ who gets the email ═════════════════════════════════════════
 *
 *   TARGETED   the request maps onto a sphere somebody is filed under, or its
 *              topic names a profession somebody claims, or a master lists the
 *              topic and the city. Everybody else still SEES it in the queue —
 *              the mail is a nudge, never a permission.
 *
 *   EVERYONE   it maps onto no sphere (most learning topics), or onto one
 *              nobody is filed under. We genuinely do not know who fits, and a
 *              request nobody is told about dies. Silence would be pretending
 *              to a precision we do not have.
 */
type RoutingAudience = 'TARGETED' | 'EVERYONE'

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

  /** ⚠️ WHAT THIS PROVIDER DOES, AND WHERE. A trades request carries no
   *  `categoryId` — the sphere table is the EXPERT taxonomy — so `routeRequest`
   *  fell through to „EVERYONE" for every one. Measured: a Tbilisi flat-cleaning
   *  request was mailed to all six providers, the Batumi electrician included.
   *  Harmless at five masters, fatal at fifty. Empty arrays mean „no service
   *  profile", which is every expert, and they match the old way. */
  services?: string[]
  areas?: string[]

  /** What this expert calls themselves (TutorProfile.professions, stage 8) —
   *  the second expert key beside the sphere. Empty/absent = matched by
   *  sphere alone, exactly as before. */
  professions?: string[]
}

const norm = (s: string) => s.trim().toLowerCase()

type RoutingResult = {
  audience: RoutingAudience
  /** The user ids to mail. Never empty when there is anybody on the allowlist —
   *  see the EVERYONE fallback. */
  recipients: string[]
}

/**
 * Who to mail about this request.
 *
 * ⚠️ THE FALLBACK IS THE POINT. An empty targeted list must NEVER mean „mail
 * nobody": the first thing this platform learns from the requests table is
 * demand it has no experts for, and a chemistry request that reached zero
 * inboxes teaches nothing. Empty target → everybody, and the audience name
 * records which happened.
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

/* ═══════════ what a provider SEES — the queue, not the mail ═════════════
 *
 * THE FACTS ARE SHARED. `queueScope` narrows by the same three agreements
 * `routeRequest` targets on — the trade a master ticked plus their cities, the
 * SPHERE an expert is filed under, the PROFESSION they claim — and invents no
 * fourth. Every row is answerable with a sentence the provider could have
 * predicted.
 *
 * ⚠️ THE FALLBACK IS DELIBERATELY NOT SHARED. `routeRequest` ends in EVERYONE
 * because a request nobody is TOLD about dies. The queue fails the other way:
 * it is a screen walked to on purpose, and „everything on the platform" there
 * is the lead-mill noise lib/requestJobs opens by refusing. Measured 2026-08-21:
 * of 12 open requests, an expert holding only CONSULT saw all 12, ქიმია
 * included, because `routingWhere` returned „no narrowing" for anybody with no
 * ServiceProfile.
 *
 * ⚠️ NOTHING BECOMES UNREACHABLE. The EVERYONE mail still goes out and links to
 * the request's DETAIL page, which carries the gate and no narrowing — still
 * openable, still biddable. It just stopped sitting in twelve queues pretending
 * to be their work.
 */

/** Every LEARNING topic id, from the groups that declare the kind.
 *
 *  ⚠️ WHY THE KIND AND NOT THE SPHERE, FOR TEACHING ONLY. The sphere table is
 *  the EXPERT taxonomy: 16 professional spheres, 91 professions, and not one
 *  school subject — so no amount of sphere-agreement can reach „ქიმია"; the
 *  fact does not exist to be compared. The owner's launch list files სწავლება
 *  under `side: 'LEARN'`, and THAT sphere is the fact „this person teaches".
 *  Coarse, and coarse is honest when the vocabulary holds nothing finer: a
 *  maths tutor seeing a chemistry request is a near miss they can explain, a
 *  cleaner seeing it is the bug. The day a profession names it, the profession
 *  fact narrows this automatically. */
const LEARNING_TOPIC_IDS: readonly string[] =
  TOPIC_GROUPS.filter(g => g.kinds.includes('LEARNING')).flatMap(g => g.topics.map(t => t.id))

/** The spheres the owner's launch list calls teaching. */
const LEARN_SPHERES: ReadonlySet<string> = new Set<string>(
  LAUNCH_CATEGORIES.filter(c => c.side === 'LEARN').map(c => c.slug),
)

/**
 * The topics whose `professions` this expert claims — `professionsOfTopic`
 * read backwards.
 *
 * Same comparison as the mail makes, and it has to be: trimmed,
 * case-insensitive, WHOLE LABEL. Never a substring — „იურისტი" must not catch
 * „კორპორატიული იურისტი", because those are two entries in the owner's list
 * and the corporate lawyer's request names the corporate lawyer. The column is
 * read through `professionsOfTopic` rather than off `Topic.professions`
 * directly, so there is one reader of that field and not two.
 */
export function topicsForProfessions(professions: readonly string[]): string[] {
  const mine = new Set(professions.map(norm).filter(Boolean))
  if (mine.size === 0) return []
  return TOPIC_GROUPS
    .flatMap(g => g.topics)
    .filter(t => professionsOfTopic(t.id).some(j => mine.has(norm(j))))
    .map(t => t.id)
}

/** Does this expert teach? See LEARNING_TOPIC_IDS for why the answer is a
 *  sphere and not a topic. Read from the professions too, because the union of
 *  sphere and profession is what `routeRequest` does and leaving one half out
 *  here would be a second rule: „პროგრამირების მასწავლებელი" filed under `it`
 *  teaches, and the sphere alone would miss them. */
function teaches(e: { categorySlug: string | null; professions: readonly string[] }): boolean {
  if (e.categorySlug && LEARN_SPHERES.has(e.categorySlug)) return true
  return e.professions.some(j => {
    const s = sphereOfProfession(j.trim())
    return !!s && LEARN_SPHERES.has(s)
  })
}

/** ONE PROVIDER, ONE CATALOGUE — both halves of what a person offers, as the
 *  queue reads them. A person may hold both; most hold one; some hold none. */
export type QueueOffer = {
  /** The WORK half — their ServiceProfile, or null when they have none. */
  service: { services: string[]; areas: string[]; available: boolean } | null
  /** The CONSULT half — their TutorProfile, or null when they have none.
   *  `categoryId` is the DB id because `ServiceRequest.categoryId` is derived
   *  from the topic at write time and the mail compares those two columns;
   *  `categorySlug` is the same sphere as the VOCABULARY names it, which is
   *  what `teaches` needs. Two spellings of one fact, and neither is optional:
   *  the id cannot be looked up in a pure file, the slug is not on the row. */
  expert: { categoryId: string | null; categorySlug: string | null; professions: string[] } | null
  /** Is this an admin? Only ever a FALLBACK — see queueScope. */
  isAdmin: boolean
}

/**
 * WHICH QUEUE THIS PERSON GETS, and — when it is empty — WHICH SILENCE.
 *
 * ⚠️ „NOTHING" AND „NOTHING, AND HERE IS WHY" ARE DIFFERENT SCREENS. The page
 * has distinguished „the platform is quiet" from „your services do not match"
 * from „you switched yourself off" since 2026-08-18, because an unexplained
 * empty screen reads as „the site is broken". This type carries that decision
 * instead of the page re-deriving it from a `where` clause it cannot read.
 */
export type QueueScope =
  /** Everything, on purpose — see the admin branch below. */
  | { mode: 'ALL' }
  /** They have a service profile and switched it off. Their own control. */
  | { mode: 'PAUSED' }
  /** They offer nothing we can narrow by. `fix` is the editor that owns the
   *  gap, so the empty state's one link goes where the answer is typed. */
  | { mode: 'UNLISTED'; fix: 'SERVICES' | 'PROFILE' }
  /** Narrowed to the facts they published. */
  | {
      mode: 'FILTERED'
      /** The trades half: topic ids they ticked, and the cities they travel to. */
      work: { topics: string[]; areas: string[] } | null
      /** The sphere half: the request's own `categoryId` column. */
      categoryId: string | null
      /** The profession half, and teaching — topic ids. */
      topics: string[]
    }

/**
 * ⚠️ THE ADMIN IS A FALLBACK AND NEVER AN OVERRIDE, and that ordering is the
 * decision, not an accident of the ifs.
 *
 * An admin must keep being able to INSPECT the queue: they are the only person
 * who can answer „why did this provider not get that request", and blinding
 * them to fix somebody else's screen would take a working tool away. The shell
 * already says so out loud — components/tutor/WorkspaceShell prints „ხედავ
 * როგორც ადმინი — შეთავაზების დაწერა არ შეგიძლია" above every one of these
 * screens for a viewer with no provider identity — so the unnarrowed queue is
 * labelled where a person will read it, and this file does not have to invent
 * a second sentence for it.
 *
 * But an admin who IS a real provider (the owner has ticked trades before, to
 * see the master's side working) is ACTING as that provider, and handing them
 * the platform-wide list would hide the very narrowing they signed in to test.
 * So: narrow by whatever they published, and fall back to everything only when
 * there is nothing to narrow by. One rule, and it needs no second input.
 */
export function queueScope(o: QueueOffer): QueueScope {
  const svc = o.service
  // Paused silences the TRADES half only. `available` is „I am not taking
  // service work this week" — it is the switch in „ჩემი სერვისები" and it says
  // nothing about consultations, so a person who sells both keeps their expert
  // queue. It is still the whole answer for every master on the platform
  // today, because none of them holds a TutorProfile.
  const work = svc && svc.available && svc.services.length > 0
    ? { topics: svc.services, areas: svc.areas }
    : null

  const e = o.expert
  const categoryId = e?.categoryId ?? null
  const topics = new Set<string>()
  if (e) {
    for (const id of topicsForProfessions(e.professions)) topics.add(id)
    if (teaches(e)) for (const id of LEARNING_TOPIC_IDS) topics.add(id)
  }

  if (work || categoryId || topics.size > 0) {
    return { mode: 'FILTERED', work, categoryId, topics: [...topics] }
  }
  // Nothing to narrow by, so the only question left is which silence it is.
  if (svc && !svc.available) return { mode: 'PAUSED' }
  if (o.isAdmin) return { mode: 'ALL' }
  // A company member has neither profile and lands here with the services
  // editor as their fix, which is the right one: their company's row is what
  // carries the trades.
  return { mode: 'UNLISTED', fix: e && !svc ? 'PROFILE' : 'SERVICES' }
}

/**
 * THE NARROWING, AS A PRISMA `where` FRAGMENT — the one both readers spread.
 *
 * ⚠️ IT EXISTS BECAUSE THE BADGE AND THE LIST DISAGREED (2026-08-18). The queue
 * page filtered by the viewer's trades and cities; the nav badge beside it
 * counted every open request on the platform. Measured against production: the
 * badge read 2 while two of the three open requests were school subjects no
 * master can answer — and a master who had switched themselves OFF saw „შენ
 * თავი გამორთე" with a number next to it insisting work was waiting. A badge
 * that disagrees with the list it points at is worse than no badge: the first
 * time somebody taps a „2" and finds nothing, the badge stops meaning anything.
 * Three readers share it now — the badge (app/work/layout), the home board
 * (app/work/page) and the list itself.
 *
 * ⚠️ EVERYTHING IS WRAPPED IN ONE `AND`, AND THAT IS A SAFETY PROPERTY, not a
 * style. The callers SPREAD this into a `where` that already owns a top-level
 * `OR` — the „open to anybody, plus the ones addressed to me" rule. A bare
 * `OR` here would silently overwrite that key and either leak an addressed
 * request into strangers' queues or drop it out of its owner's. `AND` is used
 * by no caller, so one key can never collide; `{}` for ALL spreads to nothing.
 */
export function queueWhere(s: QueueScope): Record<string, unknown> {
  if (s.mode === 'ALL') return {}
  // Paused and unlisted match nothing. An impossible `in` rather than a
  // boolean, so both a count() and a findMany() take it unchanged.
  if (s.mode !== 'FILTERED') return { AND: [{ topic: { in: [] } }] }

  const or: Record<string, unknown>[] = []
  if (s.work) {
    or.push({
      topic: { in: s.work.topics },
      // A request with no city matches on trade alone rather than not at all:
      // `city` has a default today, but a row written before it did must not
      // become invisible because of a column it never had. Same rule `covers`
      // applies in TypeScript (lib/serviceProfile).
      ...(s.work.areas.length > 0 ? { city: { in: s.work.areas } } : {}),
    })
  }
  // The sphere, compared column to column — exactly the comparison the mail
  // makes. `ServiceRequest.categoryId` is derived from the topic at write time
  // (app/api/requests), so this is the vocabulary's own answer and not a
  // second mapping of it.
  if (s.categoryId) or.push({ categoryId: s.categoryId })
  if (s.topics.length > 0) or.push({ topic: { in: s.topics } })
  return { AND: [{ OR: or }] }
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
