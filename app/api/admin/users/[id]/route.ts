import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRoleApi, hashPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { stripTutorBlobs, stripAvatar } from '@/lib/stripTutorBlobs'
import {
  LIVE_STATUSES,
  ANON_NAME,
  ANON_HEADLINE,
  anonEmail,
  DeleteBody,
  asEitherParty,
  staleRatingTargets,
  sessionCountDecrements,
  isAnonymized,
  ActiveBookingsError,
} from '@/lib/userDeletion'

// Full admin drilldown for a single user: profile + tutor row (if any) +
// all bookings (as student and as tutor) + reviews written + reviews received
// + recent notifications. Kept in one endpoint so the modal makes a single call.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const { id } = await ctx.params

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      tutor: {
        include: { category: { select: { id: true, slug: true, name: true } } },
        // featured + videoUrl are new fields — Prisma default is `include: true`
        // which returns all scalar columns, so no explicit select needed.
      },
      _count: {
        select: {
          bookingsAsStudent: true,
          reviewsGiven: true,
          sentMessages: true,
          notifications: true,
          favorites: true,
        },
      },
    },
  })
  if (!user) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const [bookingsAsStudent, bookingsAsTutor, reviewsWritten, reviewsReceived, recentNotifications] =
    await Promise.all([
      prisma.booking.findMany({
        where: { studentId: id },
        orderBy: { startAt: 'desc' },
        take: 30,
        include: {
          tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        },
      }),
      user.tutor
        ? prisma.booking.findMany({
            where: { tutorId: user.tutor.id },
            orderBy: { startAt: 'desc' },
            take: 30,
            include: {
              student: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          })
        : Promise.resolve([]),
      prisma.review.findMany({
        where: { studentId: id },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        },
      }),
      user.tutor
        ? prisma.review.findMany({
            where: { tutorId: user.tutor.id },
            orderBy: { createdAt: 'desc' },
            take: 15,
            include: { student: { select: { id: true, fullName: true, avatarUrl: true } } },
          })
        : Promise.resolve([]),
      prisma.notification.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

  // Never leak passwordHash to admin UI either.
  const { passwordHash: _ph, ...safeUser } = user as any

  // What a deletion would actually destroy. Computed here rather than derived
  // from the arrays above, which are capped at take:30/15 — a preview that
  // says „30 ჯავშანი" for an account with 200 is worse than no preview.
  const tutorId = user.tutor?.id ?? null
  const [bookingsTotal, activeBookings, messagesTotal, reviewsTotal, enrollmentsTotal] =
    await Promise.all([
      prisma.booking.count({ where: asEitherParty(id, tutorId) }),
      prisma.booking.count({
        where: { ...asEitherParty(id, tutorId), status: { in: [...LIVE_STATUSES] } },
      }),
      prisma.message.count({ where: { OR: [{ fromId: id }, { toId: id }] } }),
      prisma.review.count({ where: asEitherParty(id, tutorId) }),
      prisma.enrollment.count({ where: asEitherParty(id, tutorId) }),
    ])

  // Each counterparty row carries a full TutorProfile / User — strip the blobs
  // so this one-shot modal call doesn't drag ~45 avatars/profession blobs along.
  return NextResponse.json({
    user: safeUser,
    bookingsAsStudent: bookingsAsStudent.map(b => ({ ...b, tutor: stripTutorBlobs(b.tutor) })),
    bookingsAsTutor: bookingsAsTutor.map(b => ({ ...b, student: stripAvatar(b.student) })),
    reviewsWritten: reviewsWritten.map(r => ({ ...r, tutor: stripTutorBlobs(r.tutor) })),
    reviewsReceived: reviewsReceived.map(r => ({ ...r, student: stripAvatar(r.student) })),
    recentNotifications,
    deleteImpact: {
      bookings: bookingsTotal,
      activeBookings,
      messages: messagesTotal,
      reviews: reviewsTotal,
      enrollments: enrollmentsTotal,
    },
  })
}

/* ── Admin safety actions: suspend / unsuspend ──
   Guarded identically to every other /api/admin route (requireRoleApi('ADMIN'))
   and audit-logged, following app/api/admin/experts/[id]/featured as the
   pattern. The reason is optional and, when supplied, kept in the audit meta. */
const PatchBody = z.object({
  action: z.enum(['suspend', 'unsuspend', 'makeAdmin', 'revokeAdmin']),
  reason: z.string().max(300).optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  const { id } = await ctx.params
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { action } = parsed.data
  // The suspend reason is OPTIONAL — an admin can pause an account without
  // typing a note (product decision 2026-07-26). When given it's still kept in
  // the audit meta below; when omitted it's simply null.
  const reason = parsed.data.reason?.trim() || null

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, suspendedAt: true, email: true },
  })
  if (!target) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  // An anonymized account's `suspendedAt` is not a pause — it is the entire
  // mechanism that keeps the tombstone off the public web. app/experts/[slug]/page
  // gates on `suspendedAt` and on NOTHING else (browse's `available` filter
  // doesn't cover the profile URL), so un-suspending would republish a
  // „წაშლილი პროფილი" page at its old address.
  if (action === 'unsuspend' && isAnonymized(target.email)) {
    return NextResponse.json(
      { ok: false, error: 'ANONYMIZED', message: 'ეს ანგარიში ანონიმიზებულია — შეჩერება ვერ მოიხსნება' },
      { status: 400 },
    )
  }

  // ── Role changes (grant / revoke ADMIN) ──────────────────────────────────
  // Guarded hard because of the 2026-07-18 incident where a demotion left ZERO
  // admins and locked everyone out: you can never demote yourself, and never
  // demote the last remaining admin.
  if (action === 'makeAdmin' || action === 'revokeAdmin') {
    if (action === 'makeAdmin' && target.role === 'ADMIN') {
      return NextResponse.json({ ok: false, error: 'ALREADY_ADMIN', message: 'უკვე ადმინია' }, { status: 400 })
    }
    if (action === 'revokeAdmin') {
      if (target.role !== 'ADMIN') {
        return NextResponse.json({ ok: false, error: 'NOT_ADMIN', message: 'ეს მომხმარებელი ადმინი არ არის' }, { status: 400 })
      }
      if (target.id === admin.id) {
        return NextResponse.json({ ok: false, error: 'CANNOT_DEMOTE_SELF', message: 'საკუთარ თავს ვერ მოხსნი ადმინობას' }, { status: 400 })
      }
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) {
        return NextResponse.json({ ok: false, error: 'LAST_ADMIN', message: 'ბოლო ადმინს ვერ მოხსნი — ჯერ სხვა ადმინი დანიშნე' }, { status: 400 })
      }
    }
    const newRole = action === 'makeAdmin' ? 'ADMIN' : 'USER'
    const u = await prisma.user.update({ where: { id }, data: { role: newRole }, select: { id: true, role: true } })
    // Demotion: wipe sessions so the ex-admin's shell drops its admin access now.
    if (action === 'revokeAdmin') await prisma.session.deleteMany({ where: { userId: id } }).catch(() => {})
    // The admin panel requires a reason before grant/revoke — keep it with the
    // audit row, exactly like suspend does.
    await audit(admin.id, action === 'makeAdmin' ? 'user.makeAdmin' : 'user.revokeAdmin', { targetType: 'User', targetId: id, meta: { reason } })
    return NextResponse.json({ ok: true, user: u })
  }

  // Admins can't suspend admins (or themselves) — removes the foot-gun of
  // locking the whole staff out via the UI.
  if (action === 'suspend' && (target.role === 'ADMIN' || target.id === admin.id)) {
    return NextResponse.json(
      { ok: false, error: 'FORBIDDEN_TARGET', message: 'ადმინის ანგარიშის შეჩერება არ შეიძლება' },
      { status: 400 },
    )
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { suspendedAt: action === 'suspend' ? new Date() : null },
    select: { id: true, suspendedAt: true },
  })

  // Revoke every live session so a suspended user is logged out immediately,
  // not just blocked on next login. getCurrentUser also rejects suspended users
  // defensively, but wiping sessions makes the lockout instant and clean.
  if (action === 'suspend') {
    await prisma.session.deleteMany({ where: { userId: id } }).catch(() => {})
  }

  await audit(admin.id, action === 'suspend' ? 'user.suspend' : 'user.unsuspend', {
    targetType: 'User',
    targetId: id,
    meta: { reason },
  })

  return NextResponse.json({ ok: true, user: updated })
}

/* ── Account removal ────────────────────────────────────────────────────────
   The escape hatch that /api/me DELETE already promises: self-delete refuses
   any account with history and tells the person to „მიმართე მხარდაჭერას ხელით
   წასაშლელად". This is that hand.

   Two modes, because one answer cannot be right for both cases:

   · `purge` — the row and everything hanging off it are gone. Correct for
     test, spam and empty accounts. It is NOT free: bookings and messages have
     two owners, so purging one side also deletes the counterparty's copy of a
     session that really happened.

   · `anonymize` — every row survives, the person does not. Email, name, phone,
     bio, photo and the public expert text are replaced, the account is
     suspended (which is what removes an expert from every public read — see
     lib/tutorsQuery, /api/tutors/[id], app/experts/[slug]/page) and every way back
     in is revoked. The counterparty keeps a coherent history.

   A reason is mandatory in both, because the account it describes is about to
   stop existing — the audit row is the only place the story survives. For the
   same reason the audit meta carries a snapshot (email, name, role, counts):
   an audit entry pointing at a deleted id and nothing else is unreadable.

   The decisions (scope, counter arithmetic, body schema) live in
   lib/userDeletion so they can be tested without a database — see
   tests/userDeletion.test.ts. */

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  const { id } = await ctx.params

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'REASON_REQUIRED', message: 'წაშლის მიზეზი სავალდებულოა (მინ. 3 სიმბოლო)' },
      { status: 400 },
    )
  }
  const { mode, reason } = parsed.data

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, role: true, email: true, fullName: true, createdAt: true,
      tutor: { select: { id: true } },
    },
  })
  if (!target) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  if (target.id === admin.id) {
    return NextResponse.json(
      { ok: false, error: 'CANNOT_DELETE_SELF', message: 'საკუთარ ანგარიშს ვერ წაშლი' },
      { status: 400 },
    )
  }
  // Same shape as the suspend guard: an admin is never a one-click target.
  // Revoking admin first is a separate, audited decision.
  if (target.role === 'ADMIN') {
    return NextResponse.json(
      { ok: false, error: 'FORBIDDEN_TARGET', message: 'ჯერ მოხსენი ადმინის უფლება, მერე წაშალე' },
      { status: 400 },
    )
  }

  const tutorId = target.tutor?.id ?? null
  const scope = asEitherParty(id, tutorId)

  // Upcoming/live sessions block BOTH modes. Anonymizing someone who has a
  // session tomorrow leaves the counterparty with a confirmed booking against
  // „წაშლილი მომხმარებელი" and no way to reach them.
  //
  // This is only the FAST PATH — it answers with a good message without opening
  // a long transaction. It is NOT the guard: „a status check you read before
  // the write is not a guard" (CLAUDE.md). The real one is the identical count
  // re-run as the FIRST statement inside each transaction, where a booking that
  // lands in between rolls the whole delete back. See liveBookingGuard.
  const activeBookings = await prisma.booking.count({
    where: { ...scope, status: { in: [...LIVE_STATUSES] } },
  })
  if (activeBookings > 0) return activeBookingsResponse(activeBookings)

  const [bookingsCount, messagesCount, reviewsCount, enrollmentsCount] = await Promise.all([
    prisma.booking.count({ where: scope }),
    prisma.message.count({ where: { OR: [{ fromId: id }, { toId: id }] } }),
    prisma.review.count({ where: scope }),
    prisma.enrollment.count({ where: scope }),
  ])
  const snapshot = {
    reason,
    email: target.email,
    fullName: target.fullName,
    role: target.role,
    wasExpert: !!tutorId,
    registeredAt: target.createdAt,
    counts: { bookings: bookingsCount, messages: messagesCount, reviews: reviewsCount, enrollments: enrollmentsCount },
  }

  try {
    if (mode === 'anonymize') {
      await anonymize(id, tutorId, scope)
      await audit(admin.id, 'user.anonymize', { targetType: 'User', targetId: id, meta: snapshot })
      return NextResponse.json({ ok: true, mode, deleted: snapshot.counts })
    }

    // NOTE the asymmetry with every other admin action in this file, and with
    // `audit()` itself: purge writes its audit row INSIDE the transaction. The
    // shared helper is deliberately fire-and-forget so a failed audit can never
    // block the action — right for suspend, which is reversible and leaves the
    // user row sitting there as evidence. A purge leaves nothing. If the audit
    // write is the only surviving record, it cannot be the one thing that is
    // allowed to fail, and it must not be able to describe a delete that
    // rolled back. Atomic in both directions.
    await purge(id, tutorId, scope, admin.id, snapshot)
    return NextResponse.json({ ok: true, mode, deleted: snapshot.counts })
  } catch (e) {
    // A booking landed between the fast path and the transaction — the whole
    // delete rolled back, so this is the honest answer, not a 500.
    if (e instanceof ActiveBookingsError) return activeBookingsResponse(e.count)
    throw e
  }
}

function activeBookingsResponse(count: number) {
  return NextResponse.json(
    {
      ok: false,
      error: 'HAS_ACTIVE_BOOKINGS',
      count,
      message: `ანგარიშს აქვს ${count} აქტიური ჯავშანი — ჯერ გააუქმე ისინი`,
    },
    { status: 409 },
  )
}

/* The real guard, run as the FIRST statement inside each delete transaction.
 *
 * Deliberately NOT `isolationLevel: 'Serializable'`, unlike POST /api/bookings.
 * That route's transaction is small and hot; this one can delete years of rows,
 * and holding Serializable predicate locks across it would abort unrelated
 * bookings across the whole site for as long as the delete runs. Re-counting on
 * the same connection immediately before the deletes shrinks the window from a
 * network round trip to the microseconds between two statements, at zero cost
 * to everyone else. */
async function liveBookingGuard(
  tx: Prisma.TransactionClient,
  scope: ReturnType<typeof asEitherParty>,
) {
  const live = await tx.booking.count({
    where: { ...scope, status: { in: [...LIVE_STATUSES] } },
  })
  if (live > 0) throw new ActiveBookingsError(live)
}

/* Hard delete. Order matters and is dictated by the schema's deliberate
   Restrict edges (see the notes on Booking.student / Message.from / Review):
   reviews before bookings (Review→Booking is Restrict), bookings before
   enrollments, everything before the user.

   What genuinely cascades from User or TutorProfile, and is therefore NOT
   listed below: the profile itself, certificates, education, experience,
   consultations, availability, application, favorites, notifications,
   sessions, OTP codes, reset tokens, disputes, reschedule requests.

   ⚠️ `Package` and `Enrollment` are NOT in that list even though schema.prisma
   annotates them Cascade — their tables come from lib/dbBoot, which declares no
   foreign keys, so the annotation has nothing to enforce it. Both are deleted
   by hand below; see the note there. */
async function purge(
  id: string,
  tutorId: string | null,
  scope: ReturnType<typeof asEitherParty>,
  actorId: string,
  snapshot: Record<string, unknown>,
) {
  // Read the counterparty damage BEFORE the rows are gone. `rating`,
  // `reviewsCount` and `sessionsCount` are cached columns on TutorProfile: an
  // untouched cache after this would show a rating with no reviews behind it.
  const [reviewRows, bookingRows] = await Promise.all([
    prisma.review.findMany({ where: scope, select: { tutorId: true } }),
    prisma.booking.findMany({
      where: scope,
      select: { tutorId: true, status: true, dispute: { select: { id: true } } },
    }),
  ])

  const ratingTargets = staleRatingTargets(reviewRows, tutorId)
  const sessionDecrements = sessionCountDecrements(bookingRows, tutorId)

  await prisma.$transaction(
    async tx => {
      await liveBookingGuard(tx, scope)
      await tx.review.deleteMany({ where: scope })
      await tx.message.deleteMany({ where: { OR: [{ fromId: id }, { toId: id }] } })
      await tx.booking.deleteMany({ where: scope })
      await tx.enrollment.deleteMany({ where: scope })

      /* ⚠️ Package and Enrollment are created by lib/dbBoot's raw
         `CREATE TABLE IF NOT EXISTS`, and that file declares NO foreign keys at
         all — there is not one REFERENCES clause in it. schema.prisma says
         `Package.tutor onDelete: Cascade`, but Prisma does not emulate
         referential actions on Postgres: it relies on a DB constraint that, for
         these two tables, does not exist. So the cascade is a comment, and
         deleting the profile would leave orphan rows pointing at a tutorId
         that is gone. Both are therefore deleted BY HAND. Do not "simplify"
         either line away on the strength of the schema annotation. */
      if (tutorId) await tx.package.deleteMany({ where: { tutorId } })

      /* HelpMessage lives outside Prisma entirely (raw SQL, dbBoot-created) and
         stores the sender's EMAIL, NAME and free text. „სრული წაშლა" that
         leaves those behind is not one. Event keeps its analytics row — the
         funnel counts are not about this person — but loses the link. */
      await tx.$executeRaw`DELETE FROM "HelpMessage" WHERE "userId" = ${id}`
      await tx.$executeRaw`UPDATE "Event" SET "userId" = NULL WHERE "userId" = ${id}`

      /* ServiceRequest (2026-08-14) — the row SURVIVES, the person does not.
         Its FK is ON DELETE SET NULL, so the `userId` link goes by itself; what
         the cascade cannot touch is `contactName`/`phone`/`email`, which are
         PLAIN COLUMNS on the request rather than a join to User. A „სრული
         წაშლა" that leaves a phone number behind is not one.
         The rest of the row — the description, the budget, the city — is kept
         on purpose, and it is the one deliberate difference from Booking above:
         a request is the record of WHAT THE MARKET ASKED FOR, and that fact is
         not about this person once their name is off it. Deleting it would
         throw away the only measurement stage 1 produces. Same reasoning as
         "Event" on the line above.
         RequestOffer and RequestAccess need no line here: unlike Package and
         Enrollment, both carry REAL ON DELETE CASCADE constraints in
         lib/dbBoot, so the database removes them with the user. */
      await tx.$executeRaw`
        UPDATE "ServiceRequest"
           SET "contactName" = ${ANON_NAME}, "phone" = '', "email" = NULL
         WHERE "userId" = ${id}`

      await tx.user.delete({ where: { id } })

      // Atomic with the delete — see the note at the call site. AuditLog has no
      // FK to User (actorId/targetId are plain strings), so it survives the row
      // it describes.
      await tx.auditLog.create({
        data: { actorId, action: 'user.delete', targetType: 'User', targetId: id, meta: snapshot as any },
      })

      for (const t of ratingTargets) {
        const stats = await tx.review.aggregate({
          where: { tutorId: t },
          _count: { _all: true },
          _avg: { rating: true },
        })
        await tx.tutorProfile.update({
          where: { id: t },
          data: { reviewsCount: stats._count._all, rating: stats._avg.rating ?? 0 },
        })
      }
      for (const [t, n] of sessionDecrements) {
        // GREATEST in SQL rather than read-subtract-write: the clamp and the
        // subtraction land in one atomic statement, so a concurrent completion
        // can't be lost and the counter can never go negative.
        await tx.$executeRaw`UPDATE "TutorProfile" SET "sessionsCount" = GREATEST(0, "sessionsCount" - ${n}) WHERE "id" = ${t}`
      }
    },
    // An account with years of history is a lot of DELETEs; the 5s default
    // aborts halfway and leaves the reviews gone but the user present.
    { timeout: 30_000, maxWait: 10_000 },
  )
}

/* Keep every row, remove the person. `.invalid` is reserved by RFC 2606, so
   the replacement address can never reach a real mailbox, and it stays unique
   per user id so the column's unique constraint holds. */
async function anonymize(
  id: string,
  tutorId: string | null,
  scope: ReturnType<typeof asEitherParty>,
) {
  // Hashed OUTSIDE the transaction: bcrypt at cost 10 takes ~100ms and holding
  // a DB transaction open across it is pure lock time for nothing.
  const deadHash = await hashPassword(crypto.randomBytes(24).toString('hex'))

  await prisma.$transaction(
    async tx => {
      await liveBookingGuard(tx, scope)
      await tx.user.update({
        where: { id },
        data: {
          email: anonEmail(id),
          fullName: ANON_NAME,
          phone: null,
          bio: null,
          avatarUrl: null,
          // Replaced, not blanked — a null-ish hash would be a password of
          // „nothing" for any future code path that compares against it.
          passwordHash: deadHash,
          emailVerified: false,
          notificationPrefs: Prisma.DbNull,
          suspendedAt: new Date(),
        },
      })
      // Every live way back in.
      await tx.session.deleteMany({ where: { userId: id } })
      await tx.otpCode.deleteMany({ where: { userId: id } })
      await tx.passwordResetToken.deleteMany({ where: { userId: id } })
      // Personal, and worthless once the person is gone.
      await tx.favorite.deleteMany({ where: { userId: id } })
      await tx.notification.deleteMany({ where: { userId: id } })
      await tx.tutorApplication.deleteMany({ where: { userId: id } })

      /* HelpMessage is outside Prisma (raw SQL, dbBoot-created) and carries the
         sender's EMAIL and NAME — the two columns this whole mode exists to
         remove. The message TEXT stays, same rule as chat messages: it is one
         half of a conversation the other side still needs. */
      await tx.$executeRaw`
        UPDATE "HelpMessage" SET "email" = ${anonEmail(id)}, "name" = ${ANON_NAME} WHERE "userId" = ${id}`

      /* ServiceRequest (2026-08-14) carries the person's NAME, PHONE and EMAIL
         as plain columns — the three this mode exists to remove — and no
         cascade can reach them because they are not a join to User. The
         request itself stays: what the market asked for is not about the
         person once their name is off it. Same treatment as HelpMessage above,
         and the purge path does the identical UPDATE for the identical reason. */
      await tx.$executeRaw`
        UPDATE "ServiceRequest"
           SET "contactName" = ${ANON_NAME}, "phone" = '', "email" = ${anonEmail(id)}
         WHERE "userId" = ${id}`
      /* The requests allowlist is a PERMISSION, not history — the same bucket
         as `favorite` and `notification` above, and worthless once there is
         nobody behind the account. Left in place it would keep naming a dead
         account in the admin's access list, which is a list whose whole value
         is that every row is somebody you could phone.
         Their OFFERS are deliberately NOT deleted here: an offer is one half of
         a conversation the client still needs to see, exactly like a chat
         message, and it carries no contact detail of its own. */
      await tx.requestAccess.deleteMany({ where: { userId: id } })

      if (tutorId) {
        // Diplomas and CVs carry the person's name and photo — these are the
        // most identifying rows in the schema and none of them are history the
        // counterparty needs.
        await tx.certificate.deleteMany({ where: { tutorId } })
        await tx.education.deleteMany({ where: { tutorId } })
        await tx.experience.deleteMany({ where: { tutorId } })
        await tx.availabilitySlot.deleteMany({ where: { tutorId } })
        // A sellable product of an account that no longer has a person behind
        // it. `packagesEnabled: false` below already hides the vertical; this
        // is the belt to that brace. (Consultation has no `active` column —
        // it is reached only through the profile, which `suspendedAt` 404s.)
        await tx.package.updateMany({ where: { tutorId }, data: { active: false } })
        await tx.tutorProfile.update({
          where: { id: tutorId },
          data: {
            // The pretty URL dies with the person; /experts/[slug] resolves by id
            // as well, and `suspendedAt` already 404s both.
            slug: null,
            headline: ANON_HEADLINE,
            specialty: '—',
            bio: null,
            videoUrl: null,
            linkedinUrl: null,
            websiteUrl: null,
            professionData: Prisma.DbNull,
            verified: false,
            featured: false,
            available: false,
            packagesEnabled: false,
            responseMedianMin: null,
            responseSampleN: null,
          },
        })
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  )
}
