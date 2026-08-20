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

// Consultation tier row exactly as /api/tutors/[id] ships it.
export type ConsultationItem = {
  id: string
  tier: string
  title: string
  description: string | null
  minutes: number
  price: number
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
 * The NUMBER behind `primaryPriceLabel` — the flagship tier's price, or the flat
 * profile price when the expert has published no tiers.
 *
 * WHY IT EXISTS: `primaryPriceLabel` answers „what does the card SAY", and for a
 * long time nothing answered „what should the card be FILTERED by". So /experts
 * compared the raw flat rate while every card rendered the flagship, and the two
 * disagree for any expert who set one and then priced the other differently.
 * Measured live 2026-08-13: „₾50-მდე" returned ლიზა ზუბაშვილი (flat 20) whose
 * card reads ₾60, and „₾50–100" returned მარიამ ფოფხაძე (flat 60) whose card
 * reads ₾30 — a budget filter that answers with prices outside the budget.
 * A filter must compare the number the reader can see. This is that number.
 */
export function primaryPrice(consultations: TierShape[], flatPrice: number): number {
  return primaryService(consultations ?? [])?.price ?? flatPrice
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
 * THE price a pre-tier surface advertises: the FLAGSHIP tier's price and its
 * real length. One helper, so the browse card, the profile rail and the mobile
 * bar cannot quote three different numbers for one expert.
 *
 * WHY THIS REPLACED THE TWO RULES THAT PRECEDED IT (2026-07-31). Measured on
 * production, ONE expert advertised three prices at once:
 *   • the /experts card said „₾80 · 30 წთ" — it priced `consultationDurationMin`,
 *     the profile-level DEFAULT, which is not a service anybody can buy;
 *   • the profile rail said „₾25-დან" — `fromPriceLabel` anchors on the CHEAPEST
 *     paid tier, so a 15-minute add-on priced the whole profile;
 *   • the service list said 60წთ ₾80 · 30წთ ₾45 · 15წთ ₾25 — the truth.
 * A visitor who clicked ₾25 met ₾80. Anchoring on the flagship is the only rule
 * that agrees with `primaryService` — which is ALREADY what the „განრიგი" grid,
 * the tier step and every duration preview resolve from — so the price and the
 * times on screen now describe the same service.
 *
 * `label` is the tier's own `tierPriceLabel` (so a free flagship reads „უფასო",
 * never „₾0"), and `minutes` is that tier's real length — never a synthetic
 * number, which is the bug primaryService's own docblock exists to prevent.
 * Falls back to the flat profile price + `fallbackMin` only when the expert has
 * published no tiers at all.
 */
export function primaryPriceLabel(
  consultations: TierShape[],
  flatPrice: number,
  fallbackMin: number,
): { label: string; minutes: number } {
  const flagship = primaryService(consultations ?? [])
  if (flagship) return { label: tierPriceLabel(flagship), minutes: flagship.minutes }
  return { label: `₾${priceForDuration(flatPrice, 0)}`, minutes: fallbackMin }
}

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
