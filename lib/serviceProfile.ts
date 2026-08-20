// WHAT A MASTER IS FILED UNDER — the rules for a ServiceProfile.
//
// PURE: no prisma, no react. The endpoint enforces these, the page renders
// them, the tests execute them. Same contract as lib/requestChat and
// lib/requestRouting, and for the same reason — a rule with two copies is a rule
// with two behaviours.
//
// ⚠️ THE WHOLE POINT OF THIS FILE IS THAT `services` HOLDS TOPIC IDS. Not sphere
// slugs, not free text, not a private enum: the exact ids a REQUEST is written
// with (lib/requestTopics). That is what makes stage-3 routing an equality test
// on a string rather than a translation through `categorySlugOfTopic`, which is
// null for 65 of 171 topics and would therefore drop a plumber's requests on the
// floor.
//
// It follows that this file must REFUSE an id that is not a service topic. An
// id that no request can carry is not a harmless typo — it is a provider who
// silently never hears from us, and nothing anywhere would ever report it.

import { z } from 'zod'
import {
  TOPIC_GROUPS, CITIES, ALL_CITIES, topicLabel, cityLabel, isTopicOfKind, groupIsLive,
  type Topic, type TopicGroup, type CityName,
} from './requestTopics'

/* ═══════════ the vocabulary a master may choose from ════════════════════ */

/**
 * Every service a master can be filed under, grouped as the picker draws them.
 *
 * DERIVED FROM `kinds`, never listed again. A second hand-written list of
 * service groups would go stale the first time somebody adds a trade to
 * requestTopics — and it would go stale silently, because the only symptom is a
 * service nobody can select.
 */
export const SERVICE_GROUPS = TOPIC_GROUPS.filter(g => g.kinds.includes('SERVICE'))

/** The flat set, for validation. */
const SERVICE_TOPIC_IDS = new Set(SERVICE_GROUPS.flatMap(g => g.topics.map(t => t.id)))

export function isServiceTopic(id: string): boolean {
  return SERVICE_TOPIC_IDS.has(id)
}

/** Every service topic, flat — for a picker that does not group. */
export const SERVICE_TOPICS: Topic[] = SERVICE_GROUPS.flatMap(g => g.topics)

/**
 * The subset a master may actually TICK today — see requestTopics →
 * LIVE_SERVICE_GROUP_IDS for which four and why.
 *
 * ⚠️ VALIDATION DELIBERATELY DOES NOT USE THIS. `isServiceTopic` still accepts
 * all 39, because the gate is a supply decision that will move and a stored row
 * must survive it moving: a master admitted by hand into a group we have not
 * opened yet is a real thing we will want to do, and a profile saved today must
 * not become unsavable the week we close a group to re-staff it. The picker
 * narrows what is OFFERED; the schema keeps meaning what it meant.
 */
export const LIVE_SERVICE_GROUPS = SERVICE_GROUPS.filter(groupIsLive)
export const LIVE_SERVICE_TOPICS: Topic[] = LIVE_SERVICE_GROUPS.flatMap(g => g.topics)

// ⚠️ WHAT MAY BE SAVED reads the OFFERED list, not the vocabulary: a provider
// cannot tick a city the site does not serve. Reading a stored value uses
// ALL_CITIES instead — see areaLabels, and the note on CITIES.
const AREA_IDS = new Set(CITIES.map(c => c.id))

/* ═══════════ what may be saved ══════════════════════════════════════════ */

/**
 * ⚠️ THE CEILINGS ARE NOT ARBITRARY AND THEY ARE NOT ABOUT STORAGE.
 *
 * A master who ticks all 39 services is telling us nothing — they are saying
 * „send me everything", which is the lead-mill behaviour the routing exists to
 * stop, and it would put them in the audience for every request on the site
 * while looking like a targeted match. 12 is more than any real trade spans and
 * still forces a choice.
 *
 * Areas are capped at the list's own length: picking every city is a legitimate
 * answer for a company with vans, so the only thing to enforce is that each one
 * is real.
 */
export const MAX_SERVICES = 12

export const ServiceProfileInput = z.object({
  services: z.array(z.string().trim().min(1).max(40))
    .max(MAX_SERVICES)
    // ⚠️ REFUSED, NOT SILENTLY DROPPED. Elsewhere in this subsystem an
    // off-list answer is stripped (normalizeExtras) because it arrives from a
    // client we cannot argue with and the request still has to be filed. Here
    // the sender is a signed-in provider looking at a form we drew, so an
    // unknown id means the form and this file disagree — and quietly saving
    // eleven of twelve ticks would leave them believing they are listed for
    // something they are not.
    .refine(ids => ids.every(isServiceTopic), {
      message: 'არჩეულია სერვისი, რომელიც სიაში არ არის',
    })
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'სერვისი ორჯერ არის არჩეული',
    }),
  areas: z.array(z.string().trim().min(1).max(20))
    .max(ALL_CITIES.length)
    .refine(ids => ids.every(id => AREA_IDS.has(id as CityName)), {
      message: 'არჩეულია ქალაქი, რომელიც სიაში არ არის',
    })
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'ქალაქი ორჯერ არის არჩეული',
    }),
  // Null is „ask me", and it has to stay expressible — see prisma/schema. The
  // DB CHECK carries the same bounds, so a raw insert cannot get past them
  // either.
  calloutFee: z.number().int().positive().max(100_000).nullable(),
  priceFrom: z.number().int().positive().max(1_000_000).nullable(),
  available: z.boolean(),

  /* ⚠️ THE FACE AND THE SENTENCE BECAME EDITABLE 2026-08-18, AND UNTIL THEN
     THEY WERE FROZEN AT APPLICATION DAY — PERMANENTLY.

     `photoUrl` and `about` had exactly one writer: the approval transaction.
     The application is sealed afterwards (the page redirects an approved master
     away, and the endpoint 409s), and this form offered services, cities,
     prices and a switch — nothing else. So a master who changed their photo,
     grew a beard, or wanted to rewrite a sentence they typed in a hurry had no
     route to it at all. It is the FIRST thing a client sees on their card.

     Both are `.optional()` rather than required: this endpoint is a full
     replace, and an older client that does not send them must not blank a photo
     it never knew about. */
  photoUrl: z.string().trim().max(4_000_000)
    .refine(v => v.startsWith('data:image/'), { message: 'ფოტო ვერ აიტვირთა' })
    .nullable().optional(),
  about: z.string().trim().max(1500).nullable().optional(),
})
export type ServiceProfileInput = z.infer<typeof ServiceProfileInput>

/* ═══════════ is this profile any use? ═══════════════════════════════════ */

/**
 * May this profile be routed to?
 *
 * ⚠️ EMPTY IS NOT BROKEN, IT IS NOT READY — and the difference matters to the
 * screen. A master who has signed up and ticked nothing has a valid row that no
 * request will ever match; calling that an error would demand they fix
 * something that is not wrong, while calling it fine would leave them waiting
 * forever for work that is never routed to them. The page says which of the two
 * they are in, and this is the one function that decides.
 */
export function profileIsRoutable(p: {
  services: string[]
  areas: string[]
  available: boolean
}): boolean {
  return p.available && p.services.length > 0 && p.areas.length > 0
}

/** What is still missing, in the words the screen shows. Empty when ready. */
export function profileGaps(p: {
  services: string[]
  areas: string[]
}): string[] {
  const out: string[] = []
  if (p.services.length === 0) out.push('აირჩიე ერთი სერვისი მაინც')
  if (p.areas.length === 0) out.push('აირჩიე ქალაქი')
  return out
}

/* ═══════════ how it reads back ══════════════════════════════════════════ */

/**
 * „ონკანი და მილი · ბოილერი · კანალიზაციის გაწმენდა" — the labels, never the
 * ids, and in the CATALOGUE'S order rather than the order they were ticked.
 *
 * Ordering by the catalogue means two masters with the same trades read
 * identically, so a client comparing them is comparing the trades and not the
 * sequence somebody happened to click.
 */
export function serviceLabels(ids: string[]): string[] {
  const set = new Set(ids)
  return SERVICE_TOPICS.filter(t => set.has(t.id)).map(t => topicLabel(t.id))
}

/** The same, for areas. */
export function areaLabels(ids: string[]): string[] {
  const set = new Set(ids)
  // ⚠️ THE VOCABULARY, NOT THE OFFERED LIST. A row written when the site served
  // Batumi still has to read „ბათუმი" — filtering by what we offer TODAY would
  // silently drop it from the provider's own profile. Caught by
  // tests/serviceProfile §F the hour the two lists were split.
  return ALL_CITIES.filter(c => set.has(c.id)).map(c => cityLabel(c.id))
}

/**
 * „გამოძახება 30₾ · სამუშაო 50₾-დან" — whichever halves were filled in.
 *
 * Returns null when neither is, and the screen then says nothing at all rather
 * than „ფასი: —". An absent price is a master who quotes per job, which is a
 * normal way to work and not a blank to apologise for.
 */
/**
 * THE PRICED SERVICES A PROVIDER PUBLISHES — „ბინის დალაგება — 60₾".
 *
 * ⚠️ THE MAP IS UNTRUSTED AND IS READ THROUGH THE TICKS, NEVER LISTED (2026-08-20).
 * `priceList` is a JSON column, so it can hold anything a bad write ever put
 * there: an unknown key, a string where a number belongs, a negative, a topic
 * the provider has since unticked. So the ORDER of operations is the guard —
 * walk `services` (validated ids, in catalogue order), and look each one up.
 * A key the provider no longer offers can then never reach a screen, and a
 * junk value is simply not a number and is skipped.
 *
 * Catalogue order, not map order: two providers offering the same two trades
 * must list them the same way, or a client comparing cards is comparing click
 * sequences. Same rule `serviceLabels` already applies.
 */
export function pricedServices(
  p: { services: string[]; priceList?: unknown },
): { id: string; label: string; price: number }[] {
  const raw = p.priceList
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const map = raw as Record<string, unknown>
  const owned = new Set(p.services)
  const out: { id: string; label: string; price: number }[] = []
  for (const t of LIVE_SERVICE_TOPICS) {
    if (!owned.has(t.id)) continue
    const v = map[t.id]
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n) || n <= 0) continue
    out.push({ id: t.id, label: t.label, price: Math.round(n) })
  }
  return out
}

/** The lowest published price, or null — what the card prints as „X₾-დან". */
export function lowestPrice(p: { services: string[]; priceList?: unknown }): number | null {
  const list = pricedServices(p)
  return list.length ? Math.min(...list.map(s => s.price)) : null
}

export function priceHint(p: { calloutFee: number | null; priceFrom: number | null }): string | null {
  const parts: string[] = []
  if (p.calloutFee !== null) parts.push(`გამოძახება ${p.calloutFee}₾`)
  if (p.priceFrom !== null) parts.push(`სამუშაო ${p.priceFrom}₾-დან`)
  return parts.length ? parts.join(' · ') : null
}

/**
 * Does this master cover this request?
 *
 * ⚠️ PURE, AND IT IS THE RULE STAGE 3 WILL QUERY WITH. The database asks the
 * same question with `services @> ARRAY[topic]` and an area overlap; this is the
 * same test in TypeScript so the routing can be executed by a test without a
 * database, exactly as lib/requestRouting's predicates already are.
 *
 * A request with no city matches on service alone rather than not at all: the
 * city has a default and is always present today, but a row written before that
 * default existed must not become unroutable because of a column it never had.
 */
export function covers(
  p: { services: string[]; areas: string[]; available: boolean },
  request: { topic: string; city?: string | null },
): boolean {
  if (!profileIsRoutable(p)) return false
  if (!p.services.includes(request.topic)) return false
  return !request.city || p.areas.includes(request.city)
}

/**
 * A stored profile, made safe to render.
 *
 * The vocabulary moves — a trade can be renamed or retired — and a row written
 * last month may name a topic that no longer exists. Dropping it here means the
 * page shows what is still true instead of a raw id, and it is the same
 * defensive shape `reviveDraft` uses on the client's side of this subsystem.
 */
export function sanitizeStored(p: { services: string[]; areas: string[] }): {
  services: string[]
  areas: string[]
} {
  return {
    services: p.services.filter(isServiceTopic),
    areas: p.areas.filter(id => AREA_IDS.has(id as CityName)),
  }
}

/**
 * THE ROUTING NARROWING, AS A PRISMA `where` FRAGMENT.
 *
 * ⚠️ IT EXISTS BECAUSE THE BADGE AND THE LIST DISAGREED (2026-08-18). The queue
 * page filtered by `topic ∈ services` and `city ∈ areas`; the nav badge beside
 * it counted every open request on the platform. Measured against production:
 * the badge read 2 while two of the three open requests were school subjects
 * that no master can answer — and a master who had switched themselves OFF saw
 * „შენ თავი გამორთე" with a number next to it insisting work was waiting.
 *
 * A badge that disagrees with the list it points at is worse than no badge:
 * the first time somebody taps a „2" and finds nothing, the badge stops meaning
 * anything.
 *
 * Returns `null` when the viewer should see EVERYTHING (an expert bidding on
 * consultations has no ServiceProfile and never will — narrowing them to
 * nothing would take a working screen away to fix somebody else's), and an
 * impossible clause when they are paused, so „off" means off in both readers.
 */
export function routingWhere(p: {
  services: string[]
  areas: string[]
  available: boolean
} | null): Record<string, unknown> | null {
  if (!p) return null
  // Paused: match nothing. Expressed as an empty `in` rather than a boolean
  // flag so both callers can spread it into a `where` without a second branch.
  if (!p.available) return { topic: { in: [] } }
  if (p.services.length === 0) return null
  return {
    topic: { in: p.services },
    ...(p.areas.length > 0 ? { city: { in: p.areas } } : {}),
  }
}

/* ═══════════ the trade landing (stage 8, §3.6) ═════════════════════════ */

/**
 * ⚠️ HOW MANY PUBLISHED MASTERS A TRADE NEEDS BEFORE /experts/<trade> IS A
 * LANDING PAGE rather than a door. Below this the URL still answers 200 with a
 * heading, one sentence and the intake CTA — NEVER an empty list, because a
 * page that says „ელექტრიკოსები" over nobody teaches a stranger the site is
 * empty. At or above it, the page is the catalogue filtered to the trade. The
 * sitemap submits only trades at or above the bar (counted LIVE, per request).
 * Three, not one: one master is a profile, not a category.
 */
export const TRADE_LANDING_MIN = 3

/**
 * The slug of /experts/<slug> resolved against the trade vocabulary — a LIVE
 * group id, or a topic id inside a live group. Resolved BEFORE the master
 * lookup by app/experts/[slug]/page.tsx — step 2 of its chain (the vocabulary
 * is a fixed list;
 * master slugs are generated, and lib/masterSlug reserves every trade id).
 * Null = not a trade, try the masters.
 */
export function resolveTrade(slug: string): { group: TopicGroup; topic: Topic | null } | null {
  for (const g of LIVE_SERVICE_GROUPS) {
    if (g.id === slug) return { group: g, topic: null }
    const t = g.topics.find(t => t.id === slug)
    if (t) return { group: g, topic: t }
  }
  return null
}

/** The topic ids a trade slug covers — the whole group, or the one topic. */
export function tradeTopicIds(t: { group: TopicGroup; topic: Topic | null }): string[] {
  return t.topic ? [t.topic.id] : t.group.topics.map(x => x.id)
}

/** How many of these (public) rows cover any of the topics — a master counts
 *  ONCE however many of the group's topics they list. Pure, so the page, the
 *  sitemap and the tests count with one rule. */
export function countCovering(rows: { services: string[] }[], topicIds: string[]): number {
  const owned = new Set(topicIds)
  return rows.filter(r => r.services.some(s => owned.has(s))).length
}

/** Every service topic still belongs to the SERVICE kind — the invariant that
 *  makes the id in this table and the id on a request the same thing. */
export function vocabularyIsConsistent(): boolean {
  return SERVICE_TOPICS.every(t => isTopicOfKind('SERVICE', t.id))
}
