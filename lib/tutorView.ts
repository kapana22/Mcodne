// Shared expert (tutor) view logic.
//
// Single source of truth for the fields and rules that the search card
// (app/tutors/page.tsx), the expert detail page (app/tutors/[id]/page.tsx),
// and the search API (app/api/tutors/route.ts) must all agree on. Before this
// module existed the constants + slot math were copy-pasted across those files
// with a "keep identical to the other file" comment — which is exactly how the
// "card says bookable, detail page has no slots" drift crept in.
//
// Framework-agnostic (no React, no Prisma) so both server routes and client
// components import it. Covered by tests/tutor-mapping.test.ts.

// ───── Shared fallback defaults ─────
// Duration is aligned to the Prisma schema (`consultationDurationMin @default(30)`);
// price has no schema default, so we pick one shared fallback used everywhere.
export const TUTOR_DEFAULTS = {
  price: 80,
  durationMin: 30,
  name: 'ექსპერტი',
  responseHours: 24,
} as const

// The expert sets a flat price per consultation: what they enter is what the
// client pays. The system does NOT re-derive it from an hourly rate — the
// duration argument is a display label only. The two-arg signature is kept so
// existing "/ N წთ" call sites stay unchanged.
export function priceForDuration(base: number, _minutes?: number): number {
  return Math.max(0, Math.round(base || 0))
}

// ───── Slot / availability types ─────
// Accept both ISO strings (client, over the wire) and Date objects (server,
// straight from Prisma) so the same helpers run on both sides.
export type SlotInput = { startAt: string | Date; endAt: string | Date; booked?: boolean }
export type BusyInput = { startAt: string | Date; endAt: string | Date }
export type TimeChoice = { start: Date; end: Date; taken: boolean }

const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : new Date(d).getTime())

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * Enumerate the bookable start times on `date` for a session of `durationMin`,
 * stepping by `durationMin` within each availability slot that falls on that
 * day. A time is "taken" when it overlaps a busy booking. Past times are
 * skipped.
 *
 * NOTE on the capacity model ("book only the chosen sub-interval"): a single
 * availability slot can host multiple back-to-back bookings. We therefore do
 * NOT treat `slot.booked` as making the whole slot unbookable here — capacity
 * is driven entirely by the `busy` list (active bookings). `slot.booked` is
 * kept in the type only for backward-compat with older payloads; a slot the
 * server still flags booked simply contributes no free windows because its
 * time is covered by a busy booking.
 */
export function enumerateTimes(
  date: Date,
  avail: SlotInput[],
  busy: BusyInput[],
  durationMin: number,
  now: number = Date.now(),
): TimeChoice[] {
  const out: TimeChoice[] = []
  const step = durationMin * 60_000
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
  const busyMs = busy.map(b => ({ s: ms(b.startAt), e: ms(b.endAt) }))

  const daySlots = avail.filter(s => sameDay(new Date(ms(s.startAt)), date))
  for (const slot of daySlots) {
    const slotStart = ms(slot.startAt)
    const slotEnd = ms(slot.endAt)
    for (let t = slotStart; t + step <= Math.min(slotEnd, dayEnd.getTime()); t += step) {
      const startMs = t
      const endMs = t + step
      if (endMs < now) continue // fully past
      const overlaps = busyMs.some(b => b.s < endMs && b.e > startMs)
      out.push({ start: new Date(startMs), end: new Date(endMs), taken: overlaps })
    }
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime())
  return out
}

/**
 * The soonest *actually bookable* start time across all slots: a free window of
 * length `durationMin` that starts in the future and doesn't overlap a busy
 * booking. Returns `null` when the expert has no bookable capacity.
 *
 * This is the authoritative bookability signal. The search API uses it to set
 * `nextSlotAt`, and `isTutorBookable(nextSlotAt)` gates every "book" CTA — so a
 * card can never advertise availability the booking flow can't honor.
 */
export function computeNextSlot(
  avail: SlotInput[],
  busy: BusyInput[],
  durationMin: number,
  now: Date = new Date(),
): Date | null {
  const step = durationMin * 60_000
  const nowMs = now.getTime()
  const busyMs = busy.map(b => ({ s: ms(b.startAt), e: ms(b.endAt) }))
  let best: number | null = null
  for (const slot of avail) {
    const slotStart = ms(slot.startAt)
    const slotEnd = ms(slot.endAt)
    // First candidate start no earlier than now, aligned to the slot start.
    const from = Math.max(slotStart, nowMs)
    for (let t = from; t + step <= slotEnd; t += step) {
      const endMs = t + step
      const overlaps = busyMs.some(b => b.s < endMs && b.e > t)
      if (!overlaps) {
        if (best === null || t < best) best = t
        break // earliest free window in THIS slot found; move to next slot
      }
    }
  }
  return best === null ? null : new Date(best)
}

/** A card/detail CTA is bookable iff the expert has a real upcoming free slot. */
export function isTutorBookable(nextSlotAt?: string | null): boolean {
  return nextSlotAt != null
}
