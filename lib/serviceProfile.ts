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
  TOPIC_GROUPS, CITIES, ALL_CITIES, topicLabel, cityLabel, isTopicOfKind, groupIsLive, REQUEST_KINDS,
  type Topic, type TopicGroup, type CityName,
} from './requestTopics'
// The professional half of this row moved here on 2026-08-30 (see
// ServiceProfileInput). All three are pure, like this file.
import { georgianRefine, georgianNameRefine } from './georgianText'
import { MAX_PROFESSIONS } from './professions'
import { HEADLINE_MAX } from './headline'

/** The bounds `lib/providerApplication` already applied at intake, named here
 *  because the editor now enforces the same two — a second copy in the input's
 *  `minLength` is how a form starts refusing what the endpoint accepts. */
export const NAME_MIN = 3
export const NAME_MAX = 80

/** Deliberately loose — an unusual TLD is not our business to refuse, and the
 *  empty string means „clear this". Copied from `/api/me/provider`, which held
 *  the only definition while it was the only writer. */
const optionalUrl = z.string().trim().max(500).refine(
  v => v === '' || /^https?:\/\/\S+\.\S+/.test(v),
  { message: 'ბმული უნდა იწყებოდეს http:// ან https://-ით' },
).nullable().optional()

/* ═══════════ the vocabulary a master may choose from ════════════════════ */

/**
 * Every service a master can be filed under, grouped as the picker draws them.
 *
 * DERIVED FROM `kinds`, never listed again. A second hand-written list of
 * service groups would go stale the first time somebody adds a trade to
 * requestTopics — and it would go stale silently, because the only symptom is a
 * service nobody can select.
 */
/* ═══════════ WHAT A PROVIDER MAY REGISTER ═══════════════════════════════
 *
 * ⚠️ EVERY GROUP, SINCE 2026-08-24 — IT WAS THE EIGHT TRADES. This file read
 * `kinds.includes('SERVICE')`, i.e. „somebody comes to your address", and that
 * was the only kind of thing a ServiceProfile could hold. It is why the whole
 * professional side of the site had to live in a second table: a იურისტი had
 * nothing to tick here. Owner, 2026-08-24: „ტაქსონომია ახლავე გავაფართოვოთ."
 *
 * So the roster is the vocabulary. A lawyer registers „ხელშეკრულების მომზადება"
 * exactly as a plumber registers „ონკანი და მილი" — one list, one form, one
 * table — and `kinds` goes back to meaning what it always meant on the DEMAND
 * side: which questions the request wizard asks about money and time.
 */
export const OFFER_GROUPS = TOPIC_GROUPS

/** The flat set, for validation. */
const OFFER_TOPIC_IDS = new Set(OFFER_GROUPS.flatMap(g => g.topics.map(t => t.id)))

export function isOfferableTopic(id: string): boolean {
  return OFFER_TOPIC_IDS.has(id)
}

/** Every offerable topic, flat — for a picker that does not group. */
export const OFFER_TOPICS: Topic[] = OFFER_GROUPS.flatMap(g => g.topics)

/**
 * The subset a provider may actually TICK today — `groupIsLive` in
 * requestTopics decides, and three groups (school · arts · sport) are written,
 * kept and not offered.
 *
 * ⚠️ VALIDATION DELIBERATELY DOES NOT USE THIS. `isOfferableTopic` accepts the
 * whole vocabulary, because the gate is a supply decision that will move and a
 * stored row must survive it moving: a provider admitted by hand into a group
 * we have not opened yet is a real thing we will want to do, and a profile saved
 * today must not become unsavable the week we close a group to re-staff it. The
 * picker narrows what is OFFERED; the schema keeps meaning what it meant.
 */
export const LIVE_OFFER_GROUPS = OFFER_GROUPS.filter(groupIsLive)
export const LIVE_OFFER_TOPICS: Topic[] = LIVE_OFFER_GROUPS.flatMap(g => g.topics)

// ⚠️ WHAT MAY BE SAVED reads the OFFERED list, not the vocabulary: a provider
// cannot tick a city the site does not serve. Reading a stored value uses
// ALL_CITIES instead — see areaLabels, and the note on CITIES.
const AREA_IDS = new Set(CITIES.map(c => c.id))

/* ═══════════ what may be saved ══════════════════════════════════════════ */

/**
 * ⚠️ THE CEILINGS ARE NOT ARBITRARY AND THEY ARE NOT ABOUT STORAGE.
 *
 * A provider who ticks everything is telling us nothing — they are saying „send
 * me everything", which is the lead-mill behaviour the routing exists to stop,
 * and it would put them in the audience for every request on the site while
 * looking like a targeted match. The cap has to sit above the widest REAL
 * business and below „all of it".
 *
 * ⚠️ 12 → 16 ON 2026-08-29, BECAUSE THE VOCABULARY MOVED UNDER IT AND THE CAP
 * DID NOT. This number was chosen against 39 topics in 8 groups; the sentence
 * that justified it („12 is more than any real trade spans") was written that
 * day and stayed here, unchanged, through the 2026-08-24 expansion to 171
 * topics in 31 groups. 12 of 39 left a provider 31% of the catalogue. 12 of 148
 * live topics leaves them 8%, and it had stopped clearing real businesses:
 *
 *   · a full-service renovation crew — სარემონტო (6) + სანტექნიკა (5) +
 *     ელექტრიკა (4) = 15 topics, all of them things one brigade genuinely does;
 *   · a full-stack developer — პროგრამირება (8) + IT (7) = 15.
 *
 * 16 is one above the widest of those, measured against the live vocabulary on
 * 2026-08-29, and still refuses „send me everything" by a factor of nine. When
 * the vocabulary next moves, RE-MEASURE — that is the failure this note is
 * here to stop repeating, not the number itself.
 *
 * Areas are capped at the list's own length: picking every city is a legitimate
 * answer for a company with vans, so the only thing to enforce is that each one
 * is real.
 */
export const MAX_SERVICES = 16

/** ⚠️ SIX, AND IT LIVES HERE BECAUSE TWO SCREENS WRITE THE SAME COLUMN. The
 *  application collects work photos at intake (lib/providerApplication → MASTER,
 *  which re-exports this one) and /work/services edits them for the rest of the
 *  profile's life. Two constants would let the editor accept a seventh photo
 *  the intake refuses, and /api/providers/[id]/photo — which serves them by index
 *  — carries the same ceiling as `MAX_WORK_INDEX`. */
export const MAX_WORK_PHOTOS = 6

/** ⚠️ A STORED PHOTO IS NEVER SENT BACK TO THE BROWSER, so the editor cannot
 *  return one. It sends this token instead — „the k-th photo you already hold"
 *  — and the endpoint resolves it against the column. Without it a full-replace
 *  PUT would have to round-trip a megabyte of base64 through a form, or the
 *  first save from that form would erase every photo it never received. */
export const KEPT_PHOTO = /^kept:([0-5])$/

/**
 * ⚠️ EVERY FIELD IS `.optional()` SINCE 2026-08-29, AND THAT IS A BUG FIX, NOT A
 * LOOSENING. The five below used to be REQUIRED, so a form that edits none of
 * them still had to send all five — and `app/work/profile/_provider.tsx`, which
 * edits work photos and nothing else, sent the values it had loaded ON MOUNT.
 * Both forms live on pages a provider uses in one sitting, and one of the five
 * has its own switch on the SAME PAGE:
 *
 *   hide the profile in the ხილვადობა tab (PATCH /api/me/provider writes
 *   `available: false`) → add a work photo below it → save → this endpoint
 *   receives `available: true` from a form mounted before the switch was
 *   touched, and the provider is PUBLIC AND ROUTABLE AGAIN with nothing on
 *   screen saying so.
 *
 * The same shape put the mount-time `services` and `areas` back over anything
 * changed on /work/services in another tab.
 *
 * So the rule the media fields already followed — ABSENT MEANS LEAVE IT ALONE —
 * is now the whole endpoint's rule, and each form sends only what it draws. A
 * full replace still happens for anything a form DOES send: unticking every
 * service sends `services: []`, which is present and empty.
 */
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
    .refine(ids => ids.every(isOfferableTopic), {
      message: 'არჩეულია სერვისი, რომელიც სიაში არ არის',
    })
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'სერვისი ორჯერ არის არჩეული',
    }).optional(),
  areas: z.array(z.string().trim().min(1).max(20))
    .max(ALL_CITIES.length)
    .refine(ids => ids.every(id => AREA_IDS.has(id as CityName)), {
      message: 'არჩეულია ქალაქი, რომელიც სიაში არ არის',
    })
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'ქალაქი ორჯერ არის არჩეული',
    }).optional(),
  // Null is „ask me", and it has to stay expressible — see prisma/schema. The
  // DB CHECK carries the same bounds, so a raw insert cannot get past them
  // either.
  calloutFee: z.number().int().positive().max(100_000).nullable().optional(),
  priceFrom: z.number().int().positive().max(1_000_000).nullable().optional(),
  available: z.boolean().optional(),

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
  /* ⚠️ 2000 AND A SCRIPT GATE SINCE 2026-08-30, both taken from the endpoint
     that used to own this column. `/api/me/provider` sent it as `bio`, capped
     at 2000 and refused it in Latin; this schema capped it at 1500 and accepted
     any script. Two writers, two answers — and the LOOSER one was reachable, so
     the gate the other endpoint enforced could be walked around by saving from
     the services form. Keeping 1500 would have been the other bug: a provider
     whose 1 800-character paragraph was written through the old route could no
     longer save their own page. */
  about: z.string().trim().max(2000).superRefine(georgianRefine('აღწერა')).nullable().optional(),

  /* ⚠️ THE PRICE PER SERVICE AND THE PHOTOS OF FINISHED WORK BECAME EDITABLE
     2026-08-21, AND UNTIL THEN THEY WERE FROZEN AT APPLICATION DAY — exactly
     like the face and the sentence above them, and with a second cost the other
     two did not have.

     Both columns are what the SERVICE half of the bonus is paid for
     (lib/credits → PROFILE_SERVICE „დაუწერე ფასი ერთ სერვისს მაინც" and
     PROFILE_CERTIFICATE „ატვირთე ნამუშევრის ფოტო"), and `profileFacts` reads
     precisely these two columns to decide whether the 40₾ has been earned. The
     intake wrote them once and no screen has written them since — so a provider
     who signed up without a price could see two tasks worth 40₾ of a grant the
     landing calls 100₾ and had nowhere on the site to complete either. The
     wording was adapted for them months before the fields were.

     Optional for the same reason as the two above: this is a full-replace
     endpoint, and a client that does not send a field must not blank it. */
  priceList: z.record(z.string(), z.number().int().positive().max(1_000_000)).optional(),

  /** Either a fresh data URI or `kept:<n>` for one already stored — see
   *  KEPT_PHOTO. Resolved by the endpoint; the column only ever holds images. */
  workPhotos: z.array(
    z.string().trim().max(4_000_000)
      .refine(v => v.startsWith('data:image/') || KEPT_PHOTO.test(v), { message: 'ფოტო ვერ აიტვირთა' }),
  ).max(MAX_WORK_PHOTOS).optional(),

  /* ═════════ THE PROFESSIONAL HALF, ABSORBED 2026-08-30 ══════════════════
     ⚠️ THESE ARRIVED FROM `/api/me/provider`'s OWN `Body`, and the move is the
     point rather than a tidy. Until today two endpoints wrote this ONE row and
     a comment above that schema explained why that was safe: „every field
     belongs to exactly one of them". It was true of the fields and false of the
     screen. The provider saw two pages, two „ნახე შენი პროფილი" buttons, two
     copies of the same preview card and SIX save controls — and one column,
     `available`, really was on both, with a different label and a different
     interaction model on each. Owner, 2026-08-30: „ერთი და იგივე ინფოს აკეთებს
     თითქოს და რატომ".

     One row, one editor, ONE save — and that last word is why this is a schema
     change and not a second fetch. Two requests behind one button can half-fail,
     and „half your profile saved" is a worse answer than either outcome.
     `prisma.serviceProfile.upsert` writes all of it or none of it.

     ⚠️ THE VALIDATORS ARE THE ONES THAT WERE ALREADY ON THESE FIELDS, not new
     ones: the Georgian-script gate on the two free-text fields, the profession
     vocabulary, the loose URL check, the same ceilings. `categoryId` is checked
     against the live Category set BY THE ENDPOINT, exactly as before — this file
     is pure and has no database. */
  fullName: z.string().trim().min(NAME_MIN).max(NAME_MAX).superRefine(georgianNameRefine('სახელი და გვარი')).optional(),
  headline: z.string().trim().min(2).max(HEADLINE_MAX).superRefine(georgianRefine('ერთი წინადადება შენზე')).optional(),
  yearsExp: z.number().int().min(0).max(80).optional(),
  languages: z.array(z.string().trim().min(2).max(10)).max(20).optional(),
  categoryId: z.string().trim().min(1).max(40).nullable().optional(),
  professions: z.array(z.string().trim().max(80)).max(MAX_PROFESSIONS).optional(),
  linkedinUrl: optionalUrl,
  websiteUrl: optionalUrl,
})
  // A price against a service they do not offer is either a stale key left
  // behind when a tick came off, or a crafted body — the same rule the intake
  // enforces (lib/providerApplication). `pricedServices` would ignore it on read,
  // but a row holding a price for a service the provider does not do is a row
  // nobody can explain, and it would be shown by whatever reads the map next.
  //
  // ⚠️ AND A PRICE MAP MAY NOT ARRIVE WITHOUT THE LIST IT IS PRICED AGAINST
  // (2026-08-29). Now that every field is optional, `services` could be absent
  // while `priceList` is present — and this rule would then have nothing to
  // check the keys against, so it would pass anything. They are one answer from
  // one form (the rows are the ticks; see app/work/services/_trades.tsx), so a
  // body carrying one and not the other is a client we do not have.
  .refine(v => v.priceList === undefined || v.services !== undefined, {
    message: 'ფასი გამოგზავნილია სერვისების სიის გარეშე', path: ['priceList'],
  })
  .refine(v => Object.keys(v.priceList ?? {}).every(k => (v.services ?? []).includes(k)), {
    message: 'ფასი მითითებულია სერვისზე, რომელიც არჩეული არ არის', path: ['priceList'],
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

/** What is still missing, in the words the screen shows. Empty when ready.
 *
 *  ⚠️ THE CITY IS NOT REPORTED WHILE THERE IS ONE CITY (2026-08-29). It stayed
 *  in this list after the form stopped asking for it, so a provider read „ჯერ
 *  არ ხარ სიაში — აირჩიე ქალაქი" above a screen with no city on it: a demand
 *  with no control behind it, which is worse than either asking or not asking.
 *  The PUT fills it in (see the route), so what is left to report is the one
 *  thing the person actually has to decide.
 *
 *  `profileIsRoutable` above deliberately KEEPS its `areas.length > 0` test:
 *  routability is a fact about the stored row, and a row seeded before the
 *  change really does have nowhere to be routed until its next save. What
 *  changes here is only what we ASK somebody to go and do. */
export function profileGaps(p: {
  services: string[]
  areas: string[]
}): string[] {
  const out: string[] = []
  if (p.services.length === 0) out.push('აირჩიე ერთი სერვისი მაინც')
  if (p.areas.length === 0 && CITIES.length > 1) out.push('აირჩიე ქალაქი')
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
  // ⚠️ DE-DUPLICATED BY LABEL, NOT BY ID (2026-08-25). Four topic ids share a
  // label with another — `accounting-l`/`accounting` are both „ბუღალტერია",
  // and so are `data-l`/`data-an`, `ai-l`/`ai`, `photo-l`/`photo` — because one
  // is the academic subject and the other the service, and Georgian uses the
  // same word for both. A provider holding both printed „ბუღალტერია ·
  // ბუღალტერია" on their card, which was live on four accountants.
  //
  // The ids stay distinct in the database and in the routing, where the
  // distinction is real; it is only the READER who must never be shown one word
  // twice. Order is preserved — the first occurrence wins.
  const out: string[] = []
  for (const t of OFFER_TOPICS) {
    if (!set.has(t.id)) continue
    const label = topicLabel(t.id)
    if (!out.includes(label)) out.push(label)
  }
  return out
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
  for (const t of LIVE_OFFER_TOPICS) {
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
    services: p.services.filter(isOfferableTopic),
    areas: p.areas.filter(id => AREA_IDS.has(id as CityName)),
  }
}

/* ═══════════ the queue narrowing MOVED OUT (2026-08-21) ═════════════════
 *
 * `routingWhere(ServiceProfile | null)` used to live here, and its whole
 * signature was the bug. A ServiceProfile is only ONE HALF of what a person
 * offers, so „no ServiceProfile" was read as „no narrowing" and returned null
 * — and every viewer without one saw the entire platform. Measured 2026-08-21:
 * 12 open requests with room left, and an expert holding only CONSULT, an
 * admin and a company member each saw all 12, ქიმია and მათემატიკა included.
 *
 * It is `queueScope` + `queueWhere` in lib/requestRouting now, which is the
 * file that already decides who a request is for and holds the sphere and
 * profession facts the other half needs. Moved rather than widened here, so
 * that every call site had to say which question it was asking — the same
 * argument lib/requestsServer makes for renaming `allowed` to
 * `providerAllowed`. `covers()` above is unchanged and is still the TypeScript
 * twin of the trades half of that clause.
 */

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
 * master slugs are generated, and lib/providerSlug reserves every trade id).
 * Null = not a trade, try the masters.
 */
export function resolveTrade(slug: string): { group: TopicGroup; topic: Topic | null } | null {
  for (const g of LIVE_OFFER_GROUPS) {
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

/** Every offerable topic belongs to a KIND the request wizard can ask about —
 *  the invariant that makes the id in this table and the id on a request the
 *  same thing. It used to read „every service topic is of kind SERVICE"; the
 *  roster is the whole vocabulary now, so the check is that no topic is
 *  orphaned from every kind. */
export function vocabularyIsConsistent(): boolean {
  return OFFER_TOPICS.every(t => REQUEST_KINDS.some(k => isTopicOfKind(k, t.id)))
}
