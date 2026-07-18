// Shared booking-domain logic — the ONE source of truth for slot enumeration,
// calendar grouping, price resolution and fallback defaults. Extracted from
// app/tutors/[id]/client.tsx (the honest reference implementation) so the
// listing and the profile can never drift again (DESIGN_FIX_PROMPT 1.1).
//
// Everything here is pure (no React), viewer-local-time based: Date#getHours
// renders the VIEWER's wall clock, and the UI labels say so via TzLabels.

/* ───── Types ───── */

export type ApiSlot = { id: string; startAt: string; endAt: string; booked: boolean }
export type BusySlot = { startAt: string; endAt: string }
export type TimeChoice = { start: Date; end: Date; taken: boolean }

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

/* ───── Slot enumeration ───── */

// Group availability into per-day buckets (local time).
export const groupSlotsByDay = (avail: ApiSlot[]): Map<string, ApiSlot[]> => {
  const map = new Map<string, ApiSlot[]>()
  for (const s of avail) {
    const start = new Date(s.startAt)
    const key = dayKey(start)
    const arr = map.get(key) ?? []
    arr.push(s)
    map.set(key, arr)
  }
  return map
}

// Enumerate the bookable start times on a given date for a given duration,
// stepping by `duration` within each availability slot that falls on that day.
// A time is "taken" if it overlaps any busy booking OR falls inside a
// booked availability slot.
export const enumerateTimes = (
  date: Date,
  avail: ApiSlot[],
  busy: BusySlot[],
  durationMin: number,
): TimeChoice[] => {
  const out: TimeChoice[] = []
  const now = Date.now()
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
  const busyMs = busy.map(b => ({ s: new Date(b.startAt).getTime(), e: new Date(b.endAt).getTime() }))

  const daySlots = avail.filter(s => sameDay(new Date(s.startAt), date))
  for (const slot of daySlots) {
    const slotStart = new Date(slot.startAt).getTime()
    const slotEnd = new Date(slot.endAt).getTime()
    // Step by duration, staying within the availability window and this day.
    for (let t = slotStart; t + durationMin * 60_000 <= Math.min(slotEnd, dayEnd.getTime()); t += durationMin * 60_000) {
      const start = new Date(t)
      const end = new Date(t + durationMin * 60_000)
      // Skip past times.
      if (end.getTime() < now) continue
      const overlaps = slot.booked || busyMs.some(b => b.s < end.getTime() && b.e > t)
      out.push({ start, end, taken: overlaps })
    }
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime())
  return out
}

// Earliest actually-bookable start across every published slot — runs the SAME
// enumeration the flow's picker uses (slot.booked + busy-overlap aware), so a
// "next available" hint can never advertise a time the picker then shows as
// taken. Returns null when nothing is bookable.
export const computeNextFreeStart = (
  avail: ApiSlot[],
  busy: BusySlot[],
  durationMin: number,
): Date | null => {
  const dayMap = new Map<string, Date>()
  for (const s of avail) {
    const day = startOfDay(new Date(s.startAt))
    const k = dayKey(day)
    if (!dayMap.has(k)) dayMap.set(k, day)
  }
  const days = Array.from(dayMap.values()).sort((a, b) => a.getTime() - b.getTime())
  for (const day of days) {
    const free = enumerateTimes(day, avail, busy, durationMin).find(t => !t.taken)
    if (free) return free.start
  }
  return null
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
