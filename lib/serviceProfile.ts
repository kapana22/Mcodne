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
  TOPIC_GROUPS, CITIES, topicLabel, cityLabel, isTopicOfKind,
  type Topic, type CityName,
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
    .max(CITIES.length)
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
  return CITIES.filter(c => set.has(c.id)).map(c => cityLabel(c.id))
}

/**
 * „გამოძახება 30₾ · სამუშაო 50₾-დან" — whichever halves were filled in.
 *
 * Returns null when neither is, and the screen then says nothing at all rather
 * than „ფასი: —". An absent price is a master who quotes per job, which is a
 * normal way to work and not a blank to apologise for.
 */
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

/** Every service topic still belongs to the SERVICE kind — the invariant that
 *  makes the id in this table and the id on a request the same thing. */
export function vocabularyIsConsistent(): boolean {
  return SERVICE_TOPICS.every(t => isTopicOfKind('SERVICE', t.id))
}
