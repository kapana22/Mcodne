// Shared booking-domain logic — the ONE source of truth for slot enumeration,
// calendar grouping, price resolution and fallback defaults. Extracted from
// app/tutors/[id]/client.tsx (the honest reference implementation) so the
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

// Service length for the surfaces that render BEFORE a tier is chosen (the
// sticky rail, the mobile bar, the in-page „განრიგი"): the SHORTEST real
// service, because that is the one that fits the most windows — if nothing is
// open for it, nothing is open at all. Falls back to the expert's profile-level
// duration when they publish no tiers. Never a synthetic number: pairing the
// preview with a length no service actually has is how the picker used to
// advertise unbookable times.
export function previewServiceMin(consultations: ConsultationItem[], fallbackMin: number): number {
  const mins = (consultations ?? []).map(c => c.minutes).filter(m => typeof m === 'number' && m > 0)
  return mins.length ? Math.min(...mins) : fallbackMin
}

/* ───── Tier pricing labels ───── */

// From-price label for rails/bars (DESIGN_FIX_PROMPT 1.2): with 2+ tiers whose
// prices differ, the honest headline price is „₾{min}-დან"; otherwise the flat
// (or single-tier) price. Real tier rows only — never a synthetic figure.
export function fromPriceLabel(consultations: ConsultationItem[], flatPrice: number): { label: string; isFrom: boolean } {
  if (consultations.length >= 2) {
    const prices = consultations.map(c => c.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min !== max) return { label: `₾${Math.max(0, Math.round(min))}-დან`, isFrom: true }
    return { label: `₾${Math.max(0, Math.round(min))}`, isFrom: false }
  }
  return { label: `₾${priceForDuration(flatPrice, 0)}`, isFrom: false }
}
