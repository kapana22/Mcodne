// The teaching-packages vertical — one file, every rule about it.
//
// Same shape and the same reasoning as lib/abroad.ts: pure data + pure
// functions, no prisma and no react, so a server page, a client component and
// an API route can all import from here and a rule stated once cannot drift
// into three versions. The rollout stage lives in lib/flags.ts; this file says
// what it MEANS.
//
// WHAT A PACKAGE IS. A teacher sells N prepaid lessons as one product („8
// გაკვეთილი · 1 თვე · 640₾"). The client spends them one booking at a time.
// Each lesson is an ORDINARY Booking carrying `enrollmentId` — that single
// nullable column is the whole design, because it means reschedule, cancel,
// the video room, messages, reminders, no-show, disputes and the .ics feed all
// keep working with no new code. There is deliberately no second booking
// system to maintain. See prisma/schema.prisma → Package / Enrollment.

import { PACKAGES_VISIBILITY } from '@/lib/flags'

/** The route the whole vertical lives on. */
export const PACKAGES_ROUTE = '/swavleba'

/**
 * Why „swavleba" (სწავლება = *teaching*) and not „maswavleblebi"
 * (მასწავლებლები = *teachers*).
 *
 * CLAUDE.md's lexicon says always „ექსპერტი", never „ტუტორი/რეპეტიტორი" — and
 * adding real teachers makes that rule ambiguous for the first time. That
 * naming decision is still open with the owner, so this route deliberately
 * names the ACTIVITY rather than the person: whichever word wins, the URL
 * stays true and never has to 301. Rename it only once the lexicon rule is
 * written down.
 */

/**
 * Who may see any packages surface right now.
 *
 * The ONLY place PACKAGES_VISIBILITY is interpreted. Call sites ask this
 * question and never compare the constant themselves, so „is it on?" cannot
 * develop two different answers.
 *
 * Takes the viewer's role (or null/undefined when signed out) rather than a
 * whole user, so it is usable from a server page, an API route and a client
 * component alike.
 */
export function canSeePackages(role: string | null | undefined): boolean {
  switch (PACKAGES_VISIBILITY) {
    case 'off':
      return false
    case 'admin':
      return role === 'ADMIN'
    case 'signed-in':
      // Any account, but never an anonymous visitor: `role` is null/undefined
      // when signed out, so this is also the noindex/no-crawler guarantee.
      return !!role
    case 'public':
      return true
  }
}

/**
 * True when the admin toggle is reachable at all.
 *
 * Separate from canSeePackages on purpose: an ADMIN can always see the vertical
 * while it is in 'admin' stage, but once it goes 'public' the toggle is still
 * admin-only — that is enforced by requireRoleApi on the route, not here. This
 * only answers „should the control be rendered at all", i.e. is the feature
 * something this deployment knows about.
 */
export function packagesFeatureExists(): boolean {
  return PACKAGES_VISIBILITY !== 'off'
}

/**
 * The lesson counts a teacher may choose from.
 *
 * 8 is the middle option because it is the unit the Georgian market ALREADY
 * sells in — 2 lessons/week × 4 weeks. Live listings on gurus.ge and
 * servisebi.ge quote „8 გაკვეთილი" at 100–250₾, and parents' budgets are
 * reported per subject per month against exactly that rhythm. 4 is the „try
 * it" size and 12 the intensive one; anything else is a number nobody is
 * comparing against.
 */
export const PACKAGE_LESSON_COUNTS = [4, 8, 12] as const
export type PackageLessonCount = (typeof PACKAGE_LESSON_COUNTS)[number]
export const DEFAULT_LESSON_COUNT: PackageLessonCount = 8

/* ── Teacher-specific profile fields ────────────────────────────────────────
 *
 * A teacher is asked different questions than a consultant. An expert declares
 * an industry and years of practice; a teacher declares WHAT they teach, to
 * WHOM, and at what LEVEL — those three answer the only questions a parent has.
 *
 * These live in the EXISTING `TutorProfile.professionData` JSON bag, which the
 * apply flow already uses for „dynamic profession-specific answers". No new
 * columns: that bag is exactly the mechanism this needs, and adding typed
 * columns for one profile type would make the table lopsided.
 *
 * The keys are stable strings because they are persisted; the LABELS are what
 * changes if the wording does.
 */
export const TEACHER_LEVELS = [
  { key: 'beginner', label: 'დაწყებითი' },
  { key: 'school', label: 'სასკოლო' },
  { key: 'exam', label: 'გამოცდები' },
  { key: 'adult', label: 'მოზრდილები' },
] as const

export const TEACHER_AGES = [
  { key: 'kids', label: '6–11' },
  { key: 'teens', label: '12–17' },
  { key: 'adults', label: '18+' },
] as const

export type TeacherFields = {
  /** Free text, comma-separated by the teacher — the taxonomy is still open. */
  subjects?: string
  levels?: string[]
  ages?: string[]
}

/** Read the teacher block out of the professionData bag, defensively. */
export function readTeacherFields(professionData: unknown): TeacherFields {
  const pd = (professionData && typeof professionData === 'object' ? professionData : {}) as Record<string, unknown>
  const t = (pd.teacher && typeof pd.teacher === 'object' ? pd.teacher : {}) as Record<string, unknown>
  return {
    subjects: typeof t.subjects === 'string' ? t.subjects : undefined,
    levels: Array.isArray(t.levels) ? t.levels.filter((x): x is string => typeof x === 'string') : undefined,
    ages: Array.isArray(t.ages) ? t.ages.filter((x): x is string => typeof x === 'string') : undefined,
  }
}

/** Georgian labels for stored level/age keys, skipping anything unrecognised. */
export function teacherFieldLabels(keys: string[] | undefined, table: readonly { key: string; label: string }[]): string[] {
  if (!Array.isArray(keys)) return []
  return keys.map(k => table.find(t => t.key === k)?.label).filter((x): x is string => !!x)
}

/** „1 თვე" in days. Stored per-package so it can be tuned without a migration. */
export const DEFAULT_VALID_DAYS = 30

/**
 * The per-lesson figure, DERIVED — never stored as an input.
 *
 * The teacher types the TOTAL price and nothing else. Airtasker states the rule
 * plainly and it is worth copying verbatim: „a package must be the total and
 * final price the customer will pay… do not put only a single package with an
 * hourly price, starting price or unit price."
 *
 * This project has already paid for the alternative: one expert's card read
 * „₾80 · 30 წთ" while their profile rail read „₾25-დან" — one real offer, three
 * published prices. One stored number, one truth, everything else computed.
 *
 * Rounds to whole lari: the number exists to be compared at a glance, and
 * tetri on a derived figure is false precision. It therefore may not multiply
 * back to exactly `priceTotal` — always show the total as the authority.
 */
export function perLessonPrice(priceTotal: number, lessonsCount: number): number {
  if (!Number.isFinite(priceTotal) || !Number.isFinite(lessonsCount) || lessonsCount <= 0) return 0
  return Math.round(priceTotal / lessonsCount)
}

/**
 * The saving against buying the same lessons one at a time, as a whole percent.
 *
 * Returns null when there is nothing honest to claim — no single-lesson price
 * to compare against, or the package is not actually cheaper. A „-0%" badge, or
 * one computed against a reference price that does not exist, is a lie in a
 * loud font; render nothing instead.
 */
export function savingPct(priceTotal: number, lessonsCount: number, singleLessonPrice: number | null | undefined): number | null {
  if (!singleLessonPrice || singleLessonPrice <= 0 || lessonsCount <= 0) return null
  const full = singleLessonPrice * lessonsCount
  if (full <= priceTotal) return null
  const pct = Math.round(((full - priceTotal) / full) * 100)
  return pct > 0 ? pct : null
}

/**
 * How many NON-OVERLAPPING lessons a set of open start times can actually hold.
 *
 * ⚠️ Do not shortcut this to `openStarts.length`. `computeOpenStarts` returns
 * every tick of the 15-minute grid that could begin a session, so a single
 * 2-hour window yields ~6 starts but holds only TWO 50-minute lessons. Counting
 * starts would tell a teacher their schedule fits an 8-lesson package when it
 * fits three, and the person who discovers the difference is the client who
 * already paid.
 *
 * Greedy left-to-right packing is optimal here: the starts are points on a line
 * and every lesson has the same length, so taking the earliest available start
 * and skipping past its end can never beat any other choice.
 *
 * `bufferMin` is the teacher's own required gap (TutorProfile.bufferMin) — it
 * already separates a lesson from OTHER bookings inside computeOpenStarts, but
 * two lessons of this package would sit next to each other, so it must be
 * applied again between them.
 */
export function scheduleCapacity(
  openStarts: Date[],
  minutesPerLesson: number,
  bufferMin = 0,
): number {
  if (!Array.isArray(openStarts) || minutesPerLesson <= 0) return 0
  const stepMs = (minutesPerLesson + Math.max(0, bufferMin)) * 60_000
  const times = openStarts
    .map(d => (d instanceof Date ? d.getTime() : NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  let count = 0
  let nextFree = -Infinity
  for (const t of times) {
    if (t >= nextFree) {
      count++
      nextFree = t + stepMs
    }
  }
  return count
}

/**
 * Can this package honestly be sold?
 *
 * The gate exists because of a measured failure: 46% of booking attempts (31 of
 * 68, 2026-08-03) died on „no free time", every one of them because the expert
 * had published nothing upcoming. On a single session that is a lost visitor.
 * On a package it is money taken for eight lessons that cannot be delivered —
 * so „they'll publish times later" is not an acceptable default here.
 */
export function packageFits(capacity: number, lessonsCount: number): boolean {
  return capacity >= lessonsCount
}

/**
 * THE REVENUE RULE, as a Prisma where-fragment so it has exactly one home.
 *
 * A package lesson's `Booking.price` is the per-lesson SHARE of money that was
 * already taken as a lump at the Enrollment. Summing both counts the package
 * twice. Every money aggregate over bookings therefore spreads this in, and
 * package revenue is added separately from `Enrollment.priceTotal`.
 *
 * ⚠️ This was written as a comment on the schema for two days before it was
 * actually applied to `/api/tutor/earnings` and `/api/admin/finance` — a rule
 * that lives only in prose is a rule that is not enforced. `tests/packages.test`
 * pins both call sites now.
 */
export const BOOKING_REVENUE_ONLY = { enrollmentId: null } as const

/** Fallback lesson length, used only when neither snapshot nor package survives. */
export const DEFAULT_LESSON_MINUTES = 50

/**
 * The lesson length a running enrollment was actually sold with.
 *
 * ⚠️ NEVER read `enrollment.package.minutesPerLesson` at a call site. That is
 * the CURRENT length of a product the teacher can still edit, and both spend
 * routes did exactly that until 2026-08-06 — so editing a package from 90
 * minutes to 50 quietly shortened every lesson a client had paid for but not
 * yet booked. Deleting a package while it is in use is already refused
 * (app/api/tutor/packages/[id] → DELETE); editing it was the open door.
 *
 * Order: the snapshot, then the live package for rows that predate the column
 * and whose backfill has not run, then the constant. The last two are safety
 * nets, not behaviour anyone should be relying on.
 */
export function enrollmentMinutes(e: {
  minutesPerLesson?: number | null
  package?: { minutesPerLesson: number } | null
}): number {
  return e.minutesPerLesson ?? e.package?.minutesPerLesson ?? DEFAULT_LESSON_MINUTES
}

/** Remaining lessons on an enrollment, floored at 0 for safety. */
export function lessonsLeft(total: number, used: number): number {
  return Math.max(0, (total || 0) - (used || 0))
}

/**
 * When `expiresAt` should move.
 *
 * The clock is the CLIENT's month, so it may only ever be extended, and only
 * when the fault was not theirs: the expert cancelled, or the expert did not
 * show up. A client-side cancellation returns the credit (subject to
 * CANCEL_CUTOFF_HOURS in lib/flags) but never moves this date — otherwise the
 * validity window means nothing.
 *
 * Returns the new expiry, or the old one unchanged when no extension is due.
 */
export function extendedExpiry(
  currentExpiry: Date | null | undefined,
  opts: { cancelledBy?: string | null; noShowBy?: string | null; lessonMinutes: number },
): Date | null {
  if (!currentExpiry) return currentExpiry ?? null
  const expertAtFault = opts.cancelledBy === 'TUTOR' || opts.noShowBy === 'TUTOR'
  if (!expertAtFault) return currentExpiry
  // Give back a whole day per lost lesson rather than the lesson's own length:
  // the client has to find a new slot in someone else's calendar, and 50
  // minutes of credit does not buy that. A day is the smallest unit that is
  // actually useful and is trivially explainable in the UI.
  return new Date(currentExpiry.getTime() + 24 * 60 * 60 * 1000)
}
