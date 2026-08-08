// „Does this expert have bookable time?" — ONE definition, four readers.
//
// WHY THIS FILE EXISTS. The question was being answered in four places with two
// different predicates:
//
//   app/api/admin/health      availability: { some: { endAt:   { gt: now } } }
//   app/api/admin/insights    availability: { where: { startAt: { gt: now } } }
//   lib/expertActivation      s."startAt" > NOW()          (raw SQL)
//   app/api/admin/profile-views  startAt: { gt: now }
//
// They agree only while no expert has a window straddling „now". The moment one
// does, the სისტემა tab and the ინსაითები tab report DIFFERENT counts of
// „experts with no time" — and the nudge emails a group that does not match
// either number. Nothing errors; the panel just quietly contradicts itself.
//
// ── THE CHOSEN PREDICATE: endAt > now ───────────────────────────────────────
// A published window that is CURRENTLY OPEN is availability. An expert who
// published 09:00–18:00 today still has bookable time at 11:00, and
// `startAt > now` would call them unbookable and send them a „you have no free
// time" email while their calendar is open — a visible, embarrassing wrong.
//
// The opposite error is real but small: a window ending in two minutes counts
// as availability for a few minutes longer than it is useful. The booking route
// refuses that start anyway (PAST_DATE + isStartOpen in lib/availability), so
// nobody can book something that does not fit — the count is briefly generous,
// never the flow.
//
// Anything stricter than this needs the real slot derivation in lib/availability
// (it knows service duration and buffers), which is far too expensive for a
// COUNT across every expert. This is the cheap DB-level approximation, and it
// is the same approximation everywhere.

/** Prisma relation filter: the expert has at least one window not yet over. */
export function hasFutureWindow(now: Date = new Date()) {
  return { some: { endAt: { gt: now } } }
}

/** Prisma filter for selecting those windows (`where`, not `some`). */
export function futureWindowWhere(now: Date = new Date()) {
  return { endAt: { gt: now } }
}

/**
 * The same predicate for raw SQL, as a fragment to drop into a WHERE clause.
 * `alias` is the AvailabilitySlot alias in the query.
 *
 * No backticks and no interpolated values — it composes into a template literal
 * safely, and `alias` is always a literal written at the call site, never input.
 */
export function futureWindowSql(alias = 's'): string {
  return `${alias}."endAt" > NOW()`
}
