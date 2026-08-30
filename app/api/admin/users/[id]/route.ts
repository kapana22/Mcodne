import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRoleApi, hashPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import {
  LIVE_OFFER,
  ANON_NAME,
  ANON_HEADLINE,
  anonEmail,
  DeleteBody,
  isAnonymized,
  ActiveWorkError,
} from '@/lib/userDeletion'

// Full admin drilldown for a single user: the account, their provider profile
// (if any), the reviews they wrote, the requests they made, the offers they
// sent and their recent notifications. Kept in one endpoint so the modal makes
// a single call.
//
// ⚠️ HALF OF WHAT THIS RETURNED WAS BOOKINGS (2026-08-24) — as a student and as
// a tutor, plus the reviews received against a TutorProfile, plus the
// blob-stripping that a booking's embedded profile made necessary. All of it
// went with the consultation product. What replaces it is the footprint that
// exists now, and the delete preview counts the same things.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const { id } = await ctx.params

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      // ⚠️ NEVER THE BLOBS. `photoUrl` and `workPhotos` are base64 columns and
      // this payload opens a modal.
      serviceProfile: {
        omit: { photoUrl: true, workPhotos: true },
        include: { category: { select: { id: true, slug: true, name: true } } },
      },
      _count: {
        select: {
          reviewsGiven: true,
          notifications: true,
          favorites: true,
          serviceRequests: true,
          requestOffers: true,
        },
      },
    },
  })
  if (!user) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const [reviewsWritten, requests, offers, recentNotifications] = await Promise.all([
    prisma.review.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    prisma.serviceRequest.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, publicRef: true, topic: true, status: true, createdAt: true },
    }),
    prisma.requestOffer.findMany({
      where: { expertUserId: id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, status: true, priceGel: true, doneAt: true, createdAt: true },
    }),
    prisma.notification.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  // Never leak passwordHash to the admin UI either.
  const { passwordHash: _ph, ...safeUser } = user as Record<string, unknown>

  // What a deletion would actually destroy. Counted rather than derived from
  // the arrays above, which are capped at take:15 — a preview that says „15
  // მოთხოვნა" for an account with 200 is worse than no preview.
  const [requestsTotal, offersTotal, activeWork, reviewsTotal] = await Promise.all([
    prisma.serviceRequest.count({ where: { userId: id } }),
    prisma.requestOffer.count({ where: { expertUserId: id } }),
    prisma.requestOffer.count({ where: { expertUserId: id, ...LIVE_OFFER } }),
    prisma.review.count({ where: { studentId: id } }),
  ])

  return NextResponse.json({
    user: safeUser,
    reviewsWritten,
    requests,
    offers,
    recentNotifications,
    deleteImpact: {
      requests: requestsTotal,
      offers: offersTotal,
      activeWork,
      reviews: reviewsTotal,
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
      serviceProfile: { select: { id: true } },
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

  const providerId = target.serviceProfile?.id ?? null

  // ⚠️ ACTIVE WORK BLOCKS BOTH MODES, and it is the same rule an upcoming
  // booking used to enforce: anonymising somebody who owes a job leaves the
  // client an ACCEPTED offer against „წაშლილი მომხმარებელი" and no way to reach
  // them.
  //
  // This is only the FAST PATH — it answers with a good message without opening
  // a long transaction. It is NOT the guard: „a status check you read before
  // the write is not a guard" (CLAUDE.md). The real one is the identical count
  // re-run as the FIRST statement inside each transaction, where work that
  // lands in between rolls the whole delete back. See liveWorkGuard.
  const activeWork = await prisma.requestOffer.count({
    where: { expertUserId: id, ...LIVE_OFFER },
  })
  if (activeWork > 0) return activeWorkResponse(activeWork)

  const [requestsCount, offersCount, reviewsCount] = await Promise.all([
    prisma.serviceRequest.count({ where: { userId: id } }),
    prisma.requestOffer.count({ where: { expertUserId: id } }),
    prisma.review.count({ where: { studentId: id } }),
  ])
  const snapshot = {
    reason,
    email: target.email,
    fullName: target.fullName,
    role: target.role,
    wasProvider: !!providerId,
    registeredAt: target.createdAt,
    counts: { requests: requestsCount, offers: offersCount, reviews: reviewsCount },
  }

  try {
    if (mode === 'anonymize') {
      await anonymize(id, providerId)
      await audit(admin.id, 'user.anonymize', { targetType: 'User', targetId: id, meta: snapshot })
      return NextResponse.json({ ok: true, mode, deleted: snapshot.counts })
    }

    // NOTE the asymmetry with every other admin action in this file, and with
    // `audit()` itself: purge writes its audit row INSIDE the transaction. The
    // shared helper is deliberately fire-and-forget so a failed audit can never
    // block the action — right for suspend, which is reversible and leaves the
    // user row sitting there as evidence. A purge leaves nothing. If the audit
    // write is the only surviving record, it cannot be the one thing that is
    // allowed to fail, and it must not be able to describe a delete that rolled
    // back. Atomic in both directions.
    await purge(id, admin.id, snapshot)
    return NextResponse.json({ ok: true, mode, deleted: snapshot.counts })
  } catch (e) {
    // Work landed between the fast path and the transaction — the whole delete
    // rolled back, so this is the honest answer, not a 500.
    if (e instanceof ActiveWorkError) return activeWorkResponse(e.count)
    throw e
  }
}

function activeWorkResponse(count: number) {
  return NextResponse.json(
    {
      ok: false,
      error: 'HAS_ACTIVE_WORK',
      count,
      message: `ანგარიშს აქვს ${count} მიმდინარე სამუშაო — ჯერ დაასრულე ან გააუქმე`,
    },
    { status: 409 },
  )
}

/* The real guard, run as the FIRST statement inside each delete transaction.
 *
 * Deliberately NOT `isolationLevel: 'Serializable'`: this transaction can
 * delete years of rows, and holding Serializable predicate locks across it
 * would abort unrelated writes across the whole site for as long as the delete
 * runs. Re-counting on the same connection immediately before the deletes
 * shrinks the window from a network round trip to the microseconds between two
 * statements, at zero cost to everyone else. */
async function liveWorkGuard(tx: Prisma.TransactionClient, userId: string) {
  const live = await tx.requestOffer.count({ where: { expertUserId: userId, ...LIVE_OFFER } })
  if (live > 0) throw new ActiveWorkError(live)
}

/* Hard delete.
 *
 * ⚠️ THE ORDERED CASCADE OF THE BOOKING WORLD IS GONE (2026-08-24) — reviews
 * before bookings before enrollments, plus two tables (`Package`, `Enrollment`)
 * deleted BY HAND because lib/dbBoot created them with no foreign keys at all.
 * None of those tables exists. What remains genuinely cascades from `User`: the
 * provider profile and its certificates/education/experience, the application,
 * favourites, notifications, sessions, OTP codes, reset tokens, RequestOffer
 * and RequestAccess (both carry REAL ON DELETE CASCADE constraints in
 * lib/dbBoot).
 *
 * Reviews are deleted by hand for the opposite reason to Package's: the FK is
 * Restrict, deliberately — „reviews are a permanent record" — so the row has to
 * go before the user it points at. */
async function purge(id: string, actorId: string, snapshot: Record<string, unknown>) {
  await prisma.$transaction(
    async tx => {
      await liveWorkGuard(tx, id)
      await tx.review.deleteMany({ where: { studentId: id } })

      /* HelpMessage lives outside Prisma entirely (raw SQL, dbBoot-created) and
         stores the sender's EMAIL, NAME and free text. „სრული წაშლა" that
         leaves those behind is not one. Event keeps its analytics row — the
         funnel counts are not about this person — but loses the link. */
      await tx.$executeRaw`DELETE FROM "HelpMessage" WHERE "userId" = ${id}`
      await tx.$executeRaw`UPDATE "Event" SET "userId" = NULL WHERE "userId" = ${id}`

      /* ServiceRequest — the row SURVIVES, the person does not. Its FK is ON
         DELETE SET NULL, so the `userId` link goes by itself; what the cascade
         cannot touch is `contactName`/`phone`/`email`, which are PLAIN COLUMNS
         on the request rather than a join to User. A „სრული წაშლა" that leaves
         a phone number behind is not one.
         The rest of the row — the description, the budget, the city — is kept
         on purpose: a request is the record of WHAT THE MARKET ASKED FOR, and
         that fact is not about this person once their name is off it. Deleting
         it would throw away the only measurement this stage produces. */
      await tx.$executeRaw`
        UPDATE "ServiceRequest"
           SET "contactName" = ${ANON_NAME}, "phone" = '', "email" = NULL
         WHERE "userId" = ${id}`

      await tx.user.delete({ where: { id } })

      // Atomic with the delete — see the note at the call site. AuditLog has no
      // FK to User (actorId/targetId are plain strings), so it survives the row
      // it describes.
      await tx.auditLog.create({
        data: { actorId, action: 'user.delete', targetType: 'User', targetId: id, meta: snapshot as never },
      })
    },
    // An account with years of history is a lot of DELETEs; the 5s default
    // aborts halfway and leaves the reviews gone but the user present.
    { timeout: 30_000, maxWait: 10_000 },
  )
}

/* Keep every row, remove the person. `.invalid` is reserved by RFC 2606, so the
   replacement address can never reach a real mailbox, and it stays unique per
   user id so the column's unique constraint holds. */
async function anonymize(id: string, providerId: string | null) {
  // Hashed OUTSIDE the transaction: bcrypt at cost 10 takes ~100ms and holding
  // a DB transaction open across it is pure lock time for nothing.
  const deadHash = await hashPassword(crypto.randomBytes(24).toString('hex'))

  await prisma.$transaction(
    async tx => {
      await liveWorkGuard(tx, id)
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
      await tx.masterApplication.deleteMany({ where: { userId: id } })

      /* HelpMessage is outside Prisma (raw SQL, dbBoot-created) and carries the
         sender's EMAIL and NAME — the two columns this whole mode exists to
         remove. The message TEXT stays, same rule as chat messages: it is one
         half of a conversation the other side still needs. */
      await tx.$executeRaw`
        UPDATE "HelpMessage" SET "email" = ${anonEmail(id)}, "name" = ${ANON_NAME} WHERE "userId" = ${id}`

      /* ServiceRequest carries the person's NAME, PHONE and EMAIL as plain
         columns — the three this mode exists to remove — and no cascade can
         reach them because they are not a join to User. The request itself
         stays: what the market asked for is not about the person once their
         name is off it. The purge path does the identical UPDATE for the
         identical reason. */
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

      if (providerId) {
        // Diplomas and CVs carry the person's name — these are the most
        // identifying rows in the schema and none of them is history the
        // counterparty needs.
        await tx.certificate.deleteMany({ where: { providerId } })
        await tx.education.deleteMany({ where: { providerId } })
        await tx.experience.deleteMany({ where: { providerId } })
        await tx.serviceProfile.update({
          where: { id: providerId },
          data: {
            // The pretty URL dies with the person; /experts/[slug] resolves by
            // id as well, and `published: false` 404s both.
            slug: null,
            headline: ANON_HEADLINE,
            about: null,
            photoUrl: null,
            workPhotos: [],
            videoUrl: null,
            linkedinUrl: null,
            websiteUrl: null,
            professions: [],
            verified: false,
            featured: false,
            available: false,
            published: false,
            responseMedianMin: null,
            responseSampleN: null,
          },
        })
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  )
}
