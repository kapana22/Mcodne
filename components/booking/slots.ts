// Shared booking-domain logic — the ONE source of truth for slot enumeration,
// calendar grouping, price resolution and fallback defaults. Extracted from
// app/experts/[slug]/client.tsx (the honest reference implementation) so the
// listing and the profile can never drift again (DESIGN_FIX_PROMPT 1.1).
//
// WINDOWS, NOT TICKETS. An `AvailabilitySlot` row is a WINDOW of availability,
// not a pre-sold ticket: bookable starts are DERIVED from
// windows − bookings − the chosen service length (+ buffer) by lib/availability.
// Historically a row was pre-sliced by the expert's single profile-level
// `consultationDurationMin` and sold exactly one start, which broke as soon as
// individual services carried their own `minutes` — a 60-min service was
// offered starts a 30-min row could not host, and a 15-min service ate a whole
// 60-min row. Exactly-touching rows merge inside the lib, so legacy pre-sliced
// data keeps working with NO migration.
//
// `ApiSlot.booked` is LEGACY and always false on the wire — never read it.
// Openness is binary and derived; there is no „taken" start to render.
//
// Split of concerns: all availability MATH runs on absolute instants through
// lib/availability; only DISPLAY is viewer-local (Date#getHours renders the
// VIEWER's wall clock, and the UI labels say so via TzLabels).
import { computeOpenStarts, isStartOpen, type Interval, type OpenStartsOpts } from '@/lib/availability'

/* ───── Types ───── */

/** `booked` is legacy (always false) — kept so the payload type still matches
 *  the wire, never consulted. */
export type ApiSlot = { id: string; startAt: string; endAt: string; booked: boolean }
export type BusySlot = { startAt: string; endAt: string }
export type TimeChoice = { start: Date; end: Date }
/** dayKey → the bookable starts falling on that viewer-local day, ascending. */
export type StartsByDay = Map<string, Date[]>

// Consultation row exactly as /api/tutors/[id] ships it.
//
// ⚠️ `tier` LEFT THIS TYPE ON 2026-08-21, and the comment below is why it could:
// resolution reads minutes and price, never the enum. Five queries were
// selecting it — including the browse list, which loads 200 experts — to ship a
// value no surface renders and no branch tests.
export type ConsultationItem = {
  id: string
  title: string
  description: string | null
  minutes: number
  price: number
  /** ⚠️ FALSE = A JOB, NOT AN HOUR — see Consultation.bookable in schema.prisma.
   *  Optional so every existing caller keeps compiling; absent reads as true,
   *  which is what every row written before 2026-08-20 is. Anything that offers
   *  a TIME must check it — `orderedTiers` already drops these because a
   *  service carries `minutes: 0`, and that is not a coincidence to rely on
   *  silently: filter on the flag where the meaning matters. */
  bookable?: boolean
}

/**
 * The only two columns tier RESOLUTION actually reads.
 *
 * Pre-tier surfaces (browse card, /ask, saved experts, the student dashboard)
 * deliberately select just `minutes/price/tier` — shipping a tier's title and
 * description to a list of 200 experts is payload nobody renders. Typing the
 * resolvers against the full `ConsultationItem` forced those call sites to
 * either widen to `any` or invent the missing fields; both hide real mistakes.
 * Resolvers take this instead, and `ConsultationItem` still satisfies it.
 */
export type TierShape = { minutes: number; price: number }

/* ───── Shared fallback defaults ─────
 * Single source for the card/profile/booking fallbacks. Duration is aligned to
 * the Prisma schema (`consultationDurationMin @default(30)`); price has no
 * schema default, so one shared fallback is used by every surface.
 * Covered by tests/tutor-mapping.test.ts (which replicates these values). */
export const TUTOR_DEFAULTS = { price: 80, durationMin: 30, name: 'ექსპერტი', responseHours: 24 } as const

// Flat, expert-authored price. `base` is the exact price the expert set for
// their consultation: what they enter is what the client pays. The system does
// NOT re-derive it from an hourly rate — `minutes` is only a display label. We
// keep the two-arg signature so call sites (which pass the duration for the
// "/ N წთ" label) stay unchanged.
export function priceForDuration(base: number, _minutes: number): number {
  return Math.max(0, Math.round(base || 0))
}

/* ───── Georgian calendar labels ───── */

export const WEEK_HEADERS = ['ორშ', 'სამშ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვ']
export const DAY_NAMES_FULL = ['ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი', 'კვირა']
export const DAY_SHORT = ['ორშ.', 'სამშ.', 'ოთხ.', 'ხუთ.', 'პარ.', 'შაბ.', 'კვ.']

export const TIME_BANDS = [
  { id: 'morning',   l: 'დილა',    range: '00:00 – 12:00', from: 0,  to: 12 },
  { id: 'afternoon', l: 'დღე',     range: '12:00 – 18:00', from: 12, to: 18 },
  { id: 'evening',   l: 'საღამო',  range: '18:00 – 24:00', from: 18, to: 24 },
] as const

/* ───── Date helpers (viewer-local) ───── */

// isoWeekday: Mon=0..Sun=6 (so it maps to WEEK_HEADERS index)
export const isoWeekday = (d: Date) => (d.getDay() + 6) % 7
export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export const fmtHM = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/* ───── Slot enumeration (delegates to lib/availability) ───── */

/** Start-time grid the UI offers inside a window. Anchored to each window's own
 *  start, so a 10:00–11:00 legacy row still leads with 10:00. */
export const SLOT_GRANULARITY_MIN = 15

/** Expert-level rules that shape the derivation. `bufferMin` comes from the
 *  tutor profile (0 until the payload carries it — never break on its absence);
 *  the rest are overridable for tests/preview surfaces. */
export type SlotRules = {
  bufferMin?: number
  granularityMin?: number
  leadMin?: number
  now?: Date
}

const toIntervals = (rows: { startAt: string; endAt: string }[] | null | undefined): Interval[] =>
  (rows ?? []).map(r => ({ start: new Date(r.startAt), end: new Date(r.endAt) }))

// ONE options builder feeds BOTH lib entry points (enumeration + single-instant
// check), so the list the picker renders and the predicate that re-validates a
// pick can never drift apart.
const toOpts = (
  avail: ApiSlot[],
  busy: BusySlot[],
  serviceMin: number,
  rules?: SlotRules,
  limit?: number,
): OpenStartsOpts => ({
  windows: toIntervals(avail),
  busy: toIntervals(busy),
  serviceMin,
  bufferMin: rules?.bufferMin ?? 0,
  granularityMin: rules?.granularityMin ?? SLOT_GRANULARITY_MIN,
  leadMin: rules?.leadMin ?? 0,
  now: rules?.now,
  limit,
})

// The ONE call into the math. Everything below is grouping/labelling on top of
// it, so no surface can invent its own notion of „free".
const openStarts = (
  avail: ApiSlot[],
  busy: BusySlot[],
  serviceMin: number,
  rules?: SlotRules,
  limit?: number,
): Date[] => computeOpenStarts(toOpts(avail, busy, serviceMin, rules, limit))

/** Calendar grouping: bucket derived starts into viewer-local days. Replaces
 *  the old `groupSlotsByDay` — the calendar must count what is BOOKABLE for the
 *  chosen service, not how many rows the expert happened to publish. */
export const groupStartsByDay = (starts: Date[]): StartsByDay => {
  const map: StartsByDay = new Map()
  for (const s of starts) {
    const key = dayKey(s)
    const arr = map.get(key)
    if (arr) arr.push(s)
    else map.set(key, [s])
  }
  return map
}

/** Bookable starts for `serviceMin`, grouped by viewer-local day. */
export const openStartsByDay = (
  avail: ApiSlot[],
  busy: BusySlot[],
  serviceMin: number,
  rules?: SlotRules,
): StartsByDay => groupStartsByDay(openStarts(avail, busy, serviceMin, rules))

/** The starts on one day out of an already-computed map (no re-derivation). */
export const startsOnDay = (byDay: StartsByDay, date: Date | null): Date[] =>
  date ? byDay.get(dayKey(date)) ?? [] : []

/** First day (ascending) that has at least one bookable start, or null. */
export const firstOpenDay = (byDay: StartsByDay): Date | null => {
  let best: Date | null = null
  for (const arr of byDay.values()) {
    const d = arr[0]
    if (d && (best === null || d.getTime() < best.getTime())) best = d
  }
  return best ? startOfDay(best) : null
}

/** Attach the service length so the picker can render „10:00 – 11:00". */
export const toTimeChoices = (starts: Date[], serviceMin: number): TimeChoice[] =>
  starts.map(s => ({ start: s, end: new Date(s.getTime() + serviceMin * 60_000) }))

// Bookable start times on one viewer-local day. Kept as the per-day entry point
// for surfaces that don't already hold a grouped map.
export const enumerateTimes = (
  date: Date,
  avail: ApiSlot[],
  busy: BusySlot[],
  serviceMin: number,
  rules?: SlotRules,
): TimeChoice[] =>
  toTimeChoices(startsOnDay(openStartsByDay(avail, busy, serviceMin, rules), date), serviceMin)

// Earliest actually-bookable start — the SAME derivation the picker runs, so a
// "next available" hint can never advertise a time the picker then withholds.
// Returns null when nothing is bookable for this service length.
export const computeNextFreeStart = (
  avail: ApiSlot[],
  busy: BusySlot[],
  serviceMin: number,
  rules?: SlotRules,
): Date | null => openStarts(avail, busy, serviceMin, rules, 1)[0] ?? null

/** Re-validate ONE picked start — the client-side twin of the server's guard.
 *  Used when the chosen service changes under an already-picked time. */
export const isOpenStart = (
  start: Date | null,
  avail: ApiSlot[],
  busy: BusySlot[],
  serviceMin: number,
  rules?: SlotRules,
): boolean => start != null && isStartOpen(start, toOpts(avail, busy, serviceMin, rules))

/* ───── Tier resolution ───── */

/** A tier the expert offers at no charge — the „გაცნობითი" intro session. */
export const isFreeTier = (c: TierShape): boolean => !(c.price > 0)

/**
 * The expert's FLAGSHIP service — what a visitor should see priced and
 * scheduled before touching anything: the LONGEST PAID tier.
 *
 * WHY LONGEST-PAID, and why this replaced the old shortest-service rule:
 * deriving the pre-tier preview from the shortest service looked safe ("it fits
 * the most windows") but produced the single worst bug in the booking flow. An
 * expert offering a free 15-min intro alongside a 60-min consultation had their
 * „განრიგი" drawn on a 15-minute grid — most of those starts cannot hold 60
 * minutes. A visitor picked 15:45, chose the 60-min service, and the flow
 * silently dropped their time because it no longer fit. The time they picked
 * was never bookable for the service they wanted; only the preview claimed it
 * was.
 *
 * Longest-paid also matches how experts think about their own offer: the free
 * intro is a door, not the product, so it must never be the default.
 *
 * Falls back to the profile-level duration when no tiers are published, and to
 * the longest FREE tier if — unusually — every tier is free. Never a synthetic
 * number: previewing a length no service actually has is what advertised
 * unbookable times in the first place.
 */
export function primaryService<T extends TierShape>(consultations: T[]): T | null {
  const valid = (consultations ?? []).filter(c => typeof c.minutes === 'number' && c.minutes > 0)
  if (!valid.length) return null
  const paid = valid.filter(c => !isFreeTier(c))
  const pool = paid.length ? paid : valid
  return pool.reduce((best, c) => (c.minutes > best.minutes ? c : best), pool[0])
}

/**
 * The NUMBER behind `primaryPriceLabel` — the floor of the leading shape, and
 * the only number a price FILTER or a price SORT may compare.
 *
 * WHY IT EXISTS: `primaryPriceLabel` answers „what does the card SAY", and for
 * a long time nothing answered „what should the card be FILTERED by". So
 * /experts compared the raw flat rate while every card rendered a tier, and the
 * two disagree for any expert who set one and then priced the other differently.
 * Measured live 2026-08-13: „₾50-მდე" returned ლიზა ზუბაშვილი (flat 20) whose
 * card reads ₾60, and „₾50–100" returned მარიამ ფოფხაძე (flat 60) whose card
 * reads ₾30 — a budget filter that answers with prices outside the budget.
 *
 * ⚠️ IT DELEGATES, IT DOES NOT RE-DERIVE (2026-08-20). It used to call
 * `primaryService` directly, which is the BOOKING flow's rule (longest paid),
 * not the card's — so the moment the card moved to the floor the filter would
 * have gone back to comparing a number the reader cannot see. One function
 * decides what the price of an expert IS; everything else reads it from here.
 */
export function primaryPrice(consultations: (TierShape & { bookable?: boolean })[], flatPrice: number): number {
  return primaryPriceLabel(consultations ?? [], flatPrice, 0).price
}

/** Minutes of `primaryService`, or the profile-level duration when there are no tiers. */
export function primaryServiceMin(consultations: TierShape[], fallbackMin: number): number {
  return primaryService(consultations)?.minutes ?? fallbackMin
}

/**
 * Tier order for every picker: paid tiers longest-first (the flagship leads),
 * then free intro tiers last. Stable and shared, so the „განრიგი" chips, the
 * tier step and the rail can never disagree about which service comes first.
 */
export function orderedTiers(consultations: ConsultationItem[]): ConsultationItem[] {
  const valid = (consultations ?? []).filter(c => typeof c.minutes === 'number' && c.minutes > 0)
  return valid.slice().sort((a, b) => {
    const af = isFreeTier(a) ? 1 : 0
    const bf = isFreeTier(b) ? 1 : 0
    if (af !== bf) return af - bf
    return b.minutes - a.minutes
  })
}

/** „უფასო" for a zero-price tier, „₾N" otherwise. One definition, everywhere. */
export const tierPriceLabel = (c: TierShape): string =>
  isFreeTier(c) ? 'უფასო' : `₾${Math.max(0, Math.round(c.price))}`

/* ───── Tier pricing labels ───── */

/**
 * WHAT A PRE-TIER SURFACE ADVERTISES — the browse card, the profile rail, the
 * mobile bar, the home grid, the favourites list. One helper, so they cannot
 * quote different numbers for one expert.
 *
 * ⚠️ THE NUMBER IS THE FLOOR OF THE LEADING SHAPE, NOT THE FLAGSHIP (2026-08-20,
 * second pass). Between 2026-07-31 and today this returned the FLAGSHIP tier's
 * price — the longest paid one, the same tier `primaryService` pre-selects in
 * the booking flow — and the argument for it was real: the rail printed
 * „₾25-დან" while the card printed „₾80", and a visitor who clicked ₾25 met ₾80.
 * Aligning both on the flagship removed the disagreement.
 *
 * Then „-დან" was appended to the flagship number on the card, and that put the
 * SAME false claim back the other way round. MEASURED on the live database:
 * 24 visible experts, 11 with two or more paid tiers, and 10 of those 11
 * advertise a floor they do not have —
 *   მათე ივანიაძე  card „₾100-დან"  really sells a ₾25 tier
 *   ნინო გახოკია   card „₾80-დან"   really sells a ₾25 tier
 *   გიორგი         card „₾80-დან"   really sells a ₾1 tier
 * „-დან" is a promise about the CHEAPEST thing on offer. A number that is not
 * the cheapest cannot carry it, and 10 of 24 cards is not an edge case.
 *
 * So the two claims are separated and each is made true:
 *   `price` / `label`  the lowest PAID price in the leading shape — the floor,
 *                      which is what a marketplace that shows one price shows
 *                      (Fiverr „From $45" is the Basic package; Upwork prints
 *                      an explicit range). Never a number nobody can pay.
 *   `isFrom`           whether that shape actually holds two different prices.
 *                      One tier is not a range and „-დან" is a range word, so
 *                      the caller prints the bare number.
 * The July alignment argument is answered by `minutes` coming off the SAME row
 * as the price: „₾25-დან · 15 წთ" describes one real service, so a visitor who
 * clicks it meets exactly it. What broke then was two surfaces describing two
 * different tiers — not the floor itself.
 *
 * The free intro tier is excluded throughout (`isFreeTier`): a free door is not
 * the product, and pricing a profile from it made an expert charging ₾80
 * advertise „₾0-დან" — that is `fromPriceLabel`'s rule below, kept here.
 *
 * ⚠️ SERVICE FIRST WHEN THEY HOLD BOTH. Since `Consultation.bookable`
 * (schema.prisma, 2026-08-20) one expert can publish a JOB („დეკლარაციის
 * შევსება — ₾100", no clock) beside an HOUR („კონსულტაცია 60წთ — ₾80"). The site
 * sells services and a consultation is the pre-step to buying one, so the line
 * describes the SERVICE and its floor; the consultation keeps the profile and,
 * where the expert has published time, the card's button. The floor is taken
 * WITHIN the leading shape, never across both — a „-დან" that quietly jumps
 * from a service to an hour would describe neither.
 *
 * `suffix` is the second half of the line and it names the shape instead of
 * repeating a clock a service does not have: „60 წთ" for an hour, „სერვისი" for
 * a job — the word the workspace editor already prints on a service row
 * (app/work/services/_consultations). `minutes` is null there ON PURPOSE: every
 * call site that wants to print a duration is forced to say what it does when
 * there is none.
 *
 * Falls back to the flat profile price + `fallbackMin` only when the expert has
 * published no tiers at all — the pre-tier behaviour, unchanged.
 */
export type HeadlineOffer = {
  /** „₾25", or „უფასო" when every paid row is gone. No „-დან" — see `isFrom`. */
  label: string
  /** The number behind `label`. What a price filter and a price sort compare. */
  price: number
  /** True only when the leading shape holds two DIFFERENT paid prices. */
  isFrom: boolean
  /** The priced row's own length, or null when the leading offer is a service. */
  minutes: number | null
  /** „60 წთ" or „სერვისი" — what the line says after the price. */
  suffix: string
  /** Whether the leading offer is a job rather than a bookable hour. */
  isService: boolean
}

/** A row as this resolver needs it: `bookable` absent reads as true, which is
 *  what every row written before 2026-08-20 is. See ConsultationItem. */
type OfferShape = TierShape & { bookable?: boolean }

/** The word a service row carries where an hour carries its length. */
export const SERVICE_SUFFIX = 'სერვისი'

export function primaryPriceLabel(
  consultations: OfferShape[],
  flatPrice: number,
  fallbackMin: number,
): HeadlineOffer {
  const rows = consultations ?? []
  // PAID only — the free door never prices the profile. A bookable row must also
  // carry a real length: `minutes: 0` on a bookable row is a broken row, and
  // pricing „· 0 წთ" off it would advertise a session of no duration.
  const paid = rows.filter(c => !isFreeTier(c))
  const services = paid.filter(c => c.bookable === false)
  const sessions = paid.filter(c => c.bookable !== false && c.minutes > 0)
  // ⚠️ AN ALL-FREE PROFILE FALLS BACK TO ITS FREE ROWS, NOT TO THE FLAT PRICE
  // (2026-08-20). Somebody whose only published offering is the free intro has
  // `paid` empty, and dropping to the flat branch printed „₾0" — which reads as
  // a broken price, not as a gift. `tierPriceLabel` says „უფასო" for exactly
  // this, and it is the reason that function exists.
  // Only when there is NOTHING published at all does the flat rate answer.
  const free = rows.filter(c => isFreeTier(c) && c.minutes > 0)
  const pool = services.length ? services : sessions.length ? sessions : free

  if (!pool.length) {
    const flat = priceForDuration(flatPrice, 0)
    return { label: `₾${flat}`, price: flat, isFrom: false, minutes: fallbackMin, suffix: `${fallbackMin} წთ`, isService: false }
  }

  const floor = pool.reduce((best, c) => (c.price < best.price ? c : best), pool[0])
  const isFrom = pool.some(c => c.price !== floor.price)
  const isService = services.length > 0
  return {
    label: tierPriceLabel(floor),
    price: Math.max(0, Math.round(floor.price)),
    isFrom,
    minutes: isService ? null : floor.minutes,
    suffix: isService ? SERVICE_SUFFIX : `${floor.minutes} წთ`,
    isService,
  }
}

/** The price line as one string — „₾25-დან" / „₾80". The „-დან" rule lives with
 *  the number that earns it, so no surface can append the word on its own. */
export const offerPriceLabel = (o: HeadlineOffer): string => (o.isFrom ? `${o.label}-დან` : o.label)

// From-price label for rails/bars (DESIGN_FIX_PROMPT 1.2): with 2+ tiers whose
// prices differ, the honest headline price is „₾{min}-დან"; otherwise the flat
// (or single-tier) price. Real tier rows only — never a synthetic figure.
// SUPERSEDED for the rail/card headline by `primaryPriceLabel` above — see its
// docblock. Kept because `isFrom` still drives copy elsewhere; do not reach for
// it as a new surface's headline price.
export function fromPriceLabel(consultations: TierShape[], flatPrice: number): { label: string; isFrom: boolean } {
  // PAID tiers only. A free intro session made `min` 0, so an expert charging
  // ₾80 advertised „₾0-დან" on their card, rail and mobile bar — the free door
  // priced the whole profile. Fall back to every tier only if all are free.
  const paid = consultations.filter(c => !isFreeTier(c))
  const pool = paid.length ? paid : consultations
  if (pool.length >= 2) {
    const prices = pool.map(c => c.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min !== max) return { label: `₾${Math.max(0, Math.round(min))}-დან`, isFrom: true }
    return { label: `₾${Math.max(0, Math.round(min))}`, isFrom: false }
  }
  if (pool.length === 1) return { label: tierPriceLabel(pool[0]), isFrom: false }
  return { label: `₾${priceForDuration(flatPrice, 0)}`, isFrom: false }
}
