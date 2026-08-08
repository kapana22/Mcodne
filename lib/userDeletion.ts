/* Account removal — the decisions, separated from the I/O.
 *
 * The route (app/api/admin/users/[id] DELETE) owns the transaction; everything
 * that can be reasoned about without a database lives here, because two of
 * these three are arithmetic that is wrong in a way no smoke test would show:
 * a cached counter left one too high looks exactly like a correct one.
 *
 * ⚠️ MUST STAY CLIENT-SAFE. app/admin/page.tsx (a client component) imports
 * `isAnonymized` from here so the panel and the server agree on what an
 * anonymized account IS. Never add `next/headers`, `@/lib/prisma`, `crypto`, or
 * anything else server-only to this file — zod is the only dependency.
 */

import { z } from 'zod'

/** Statuses that mean "this session is still ahead of us". */
export const LIVE_STATUSES = ['PREPARING', 'CONFIRMED', 'LIVE'] as const

/** The two Georgian strings a purged-in-place account is left wearing. */
export const ANON_NAME = 'წაშლილი მომხმარებელი'
export const ANON_HEADLINE = 'წაშლილი პროფილი'

/** `.invalid` is reserved by RFC 2606 — it can never resolve to a real
 *  mailbox, and keying it on the user id keeps User.email unique. */
export const ANON_EMAIL_DOMAIN = '@deleted.invalid'
export const anonEmail = (userId: string) => `deleted-${userId}${ANON_EMAIL_DOMAIN}`

/* The address IS the marker — there is no `anonymizedAt` column, and adding one
   would need a migration for a state the email already encodes unambiguously
   (the domain is reserved, so no real account can ever collide with it).
   Used to refuse un-suspending an anonymized account: `suspendedAt` is what
   404s an expert's public profile (app/tutors/[id]/page gates on it and NOTHING
   else — browse's `available` filter does not cover the profile URL), so
   clearing it would put a „წაშლილი პროფილი" tombstone back on the public web. */
export const isAnonymized = (email: string | null | undefined) =>
  !!email && email.endsWith(ANON_EMAIL_DOMAIN)

/** Thrown from inside the delete transaction when a live booking appears
 *  between the pre-check and the deletes. Carried as a class so the route can
 *  tell it apart from a real database failure. */
export class ActiveBookingsError extends Error {
  constructor(public readonly count: number) {
    super('HAS_ACTIVE_BOOKINGS')
    this.name = 'ActiveBookingsError'
  }
}

/* A reason is mandatory. The account this describes is about to stop existing,
   so the audit row is the only place the story survives — an optional field
   would be empty exactly when it matters. */
export const DeleteBody = z.object({
  mode: z.enum(['purge', 'anonymize']),
  reason: z.string().trim().min(3).max(300),
})
export type DeleteMode = z.infer<typeof DeleteBody>['mode']

/* Both halves of a user's footprint in one `where`. Booking, Review and
 * Enrollment all carry `studentId` + `tutorId`, so one shape serves all three.
 *
 * The `tutorId ? [...] : []` spread is load-bearing: Prisma reads `OR: []` as
 * "match nothing", so leaving an empty arm in for a client-only account would
 * silently scope every count and delete to zero rows — the account would
 * report "clean" no matter what it had. */
export function asEitherParty(userId: string, tutorId: string | null) {
  return { OR: [{ studentId: userId }, ...(tutorId ? [{ tutorId }] : [])] }
}

/* Which OTHER experts' cached `rating`/`reviewsCount` go stale when this
 * account's reviews disappear. The account's own profile is excluded — it is
 * being deleted in the same transaction. */
export function staleRatingTargets(
  reviews: { tutorId: string }[],
  ownTutorId: string | null,
): Set<string> {
  return new Set(reviews.map(r => r.tutorId).filter(t => t !== ownTutorId))
}

/* How much to subtract from each OTHER expert's `sessionsCount`.
 *
 * That column is INCREMENTED on completion and never recounted, and a disputed
 * session is deliberately never counted at all (app/api/admin/disputes/[id]).
 * So the honest inverse is "completed AND undisputed rows being removed" — a
 * full recount would quietly inflate every profile that has ever had a
 * dispute, which is the opposite of the bug we are fixing. */
export function sessionCountDecrements(
  bookings: { tutorId: string; status: string; dispute?: { id: string } | null }[],
  ownTutorId: string | null,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const b of bookings) {
    if (b.tutorId === ownTutorId) continue
    if (b.status !== 'COMPLETED') continue
    if (b.dispute) continue
    out.set(b.tutorId, (out.get(b.tutorId) ?? 0) + 1)
  }
  return out
}
