// THE workspace clock. One module, one zone.
//
// `lib/kaDate.ts` formats with Date#getHours()/getDay() — i.e. the MACHINE's
// zone. In a client component that is the viewer's browser, so an expert in
// Berlin read „14:00" for a session the platform (and every e-mail, which says
// „თბილისის დროით") calls 16:00. Server components rendered a third value
// unless TZ happened to be set. Three clocks, no labels.
//
// Every session time in the student/tutor workspace goes through here instead:
// `lib/tz.ts` composes the wall-clock parts in an explicit zone (Georgian month
// and weekday names come from the same kaDate arrays), so the string is Tbilisi
// wall-clock no matter where the code runs — server render, client hydration or
// a later re-render. Pair it with <TzNote> (same folder) so a viewer outside
// Georgia is told which zone they are reading.
//
// NOT for the booking picker: components/booking/slots.ts + lib/availability.ts
// are pure instants and are already correct — leave them alone.

import { fmtDateTime, TBILISI } from '@/lib/tz'

// ⚠️ `sessionDateTime` AND `sessionWeekdayShort` WERE HERE (deleted 2026-09-03).
// „ხუთ, 24 ივლ, 14:00" and „ხუთ" — the stacked date chip and the combined stamp
// the consultation product's session lists drew. Nothing has called either since
// that product went; what survives is `sessionDate` + `sessionTime`, which
// /work/jobs prints side by side. The module's rule is unchanged and is the
// reason it exists at all: every workspace clock reads Tbilisi wall-time.

/** „24 ივლ" — date only. */
export function sessionDate(iso: string, opts?: { month?: 'short' | 'long'; weekday?: boolean; year?: boolean }): string {
  return fmtDateTime(iso, {
    ...(opts?.weekday ? { weekday: 'short' as const } : {}),
    day: 'numeric',
    month: opts?.month ?? 'short',
    ...(opts?.year ? { year: 'numeric' as const } : {}),
  }, TBILISI).local
}

/** „14:00" — 24h, zero-padded. */
export function sessionTime(iso: string): string {
  return fmtDateTime(iso, { hour: '2-digit', minute: '2-digit' }, TBILISI).local
}
