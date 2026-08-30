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

/** ⚠️ WAS „statuses that mean this session is still ahead of us" — PREPARING,
 *  CONFIRMED, LIVE on a Booking (2026-08-24). There are no sessions; the
 *  analogous fact, and the one that must block a delete for the same reason, is
 *  an ACCEPTED offer that nobody has marked done: somebody is waiting on work
 *  from this account, and anonymising it leaves them a job against „წაშლილი
 *  მომხმარებელი" with no way to reach them. */
export const LIVE_OFFER = { status: 'ACCEPTED', doneAt: null } as const

/** The two Georgian strings a purged-in-place account is left wearing. */
export const ANON_NAME = 'წაშლილი მომხმარებელი'
export const ANON_HEADLINE = 'წაშლილი პროფილი'

/** `.invalid` is reserved by RFC 2606 — it can never resolve to a real
 *  mailbox, and keying it on the user id keeps User.email unique. */
const ANON_EMAIL_DOMAIN = '@deleted.invalid'
export const anonEmail = (userId: string) => `deleted-${userId}${ANON_EMAIL_DOMAIN}`

/* The address IS the marker — there is no `anonymizedAt` column, and adding one
   would need a migration for a state the email already encodes unambiguously
   (the domain is reserved, so no real account can ever collide with it).
   Used to refuse un-suspending an anonymized account: `suspendedAt` is what
   404s an expert's public profile (app/experts/[slug]/page gates on it and NOTHING
   else — browse's `available` filter does not cover the profile URL), so
   clearing it would put a „წაშლილი პროფილი" tombstone back on the public web. */
export const isAnonymized = (email: string | null | undefined) =>
  !!email && email.endsWith(ANON_EMAIL_DOMAIN)

/** Thrown from inside the delete transaction when live work appears between
 *  the pre-check and the deletes. Carried as a class so the route can tell it
 *  apart from a real database failure. */
export class ActiveWorkError extends Error {
  constructor(public readonly count: number) {
    super('HAS_ACTIVE_WORK')
    this.name = 'ActiveWorkError'
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

/* ⚠️ THREE HELPERS LEFT THIS FILE ON 2026-08-24 — `asEitherParty`,
 * `staleRatingTargets` and `sessionCountDecrements`. All three existed because
 * Booking, Review and Enrollment each carried a `studentId` AND a `tutorId`, so
 * a person's footprint had two halves and two cached counters
 * (`TutorProfile.rating`, `.sessionsCount`) had to be repaired by hand when
 * rows on the other side disappeared. None of those tables or columns exists
 * now: a review hangs on an offer, and the provider's rating is derived. What
 * is left is one scope — the account itself.
 */
