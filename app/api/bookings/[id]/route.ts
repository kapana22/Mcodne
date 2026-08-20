import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify, notifyMany, normalizePrefs } from '@/lib/notify'
import { markRelatedRead } from '@/lib/notifClear'
import { newMeetingUrl, isStaleMeetingUrl } from '@/lib/meeting'
import { sendMail } from '@/lib/mailer'
import { bookingConfirmedEmail, bookingChangedEmail, fmtWhenTz } from '@/lib/emailTemplates'
import { releaseBookingCredit } from '@/lib/bookingCredit'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const where = user.role === 'ADMIN'
    ? { id }
    : { id, OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] }
  // Kick off the reschedule-request read BEFORE the main query so the two run
  // concurrently instead of as two sequential round-trips (each round-trip to
  // the DB is the dominant cost). Result is only used once the booking loads +
  // auth passes below, so fetching it for an inaccessible id leaks nothing.
  const reschedulePromise = prisma.$queryRawUnsafe<{ rescheduleRequest: unknown }[]>(
    `SELECT "rescheduleRequest" FROM "Booking" WHERE id = $1 LIMIT 1`,
    id,
  ).catch(() => [] as { rescheduleRequest: unknown }[])
  const booking = await prisma.booking.findFirst({
    where,
    include: {
      // Narrow selects — bookings are visible to both parties + admin, but
      // passwordHash / phone / email should never leave the server.
      tutor: {
        // Drop the heavy blobs at the DB level (this page renders neither the
        // intro video nor professionData) — same omit the sibling booking routes
        // already carry.
        omit: { professionData: true, videoUrl: true },
        include: {
          // Expert email is NOT selected: no UI renders it and returning it to
          // the (any-authenticated) requester who booked a free slot is an
          // email-harvesting vector. Student email below stays — the tutor's
          // booking-detail page renders it as their contact for the session.
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, slug: true, name: true } },
        },
      },
      student: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
      consultation: true,
      messages: {
        // Newest-first + take, then flipped back to ascending below — same
        // recent-200 cap /api/messages uses, so a long thread's whole history
        // no longer rides on every booking GET. (`take` with 'asc' would keep
        // the OLDEST 200 — the wrong end of the thread.)
        orderBy: { createdAt: 'desc' },
        take: 200,
        // Explicit `select`, and the base64 `fileUrl` attachment is NOT in it:
        // each stored data: URL is up to 3 MB, so a handful of image attachments
        // alone made this single GET multi-MB. These rows are only BookingChat's
        // initial seed — it full-loads the thread (attachments included) from
        // /api/messages the moment it mounts — so the rendered bubbles are
        // unchanged. `fileName` stays: it carries the attachment affordance and
        // the `__call__` invite sentinel.
        // Avatars are likewise NOT embedded per message — BookingChat renders
        // each sender's avatar from the 2 thread participants. Embedding a
        // (base64) avatar per message once made this payload multi-MB.
        select: {
          id: true, body: true, fromId: true, createdAt: true, fileName: true,
          from: { select: { id: true, fullName: true } },
        },
      },
      // Include the student's post-session review (if any) so both parties can
      // render "already reviewed" state without a second round-trip.
      review: {
        select: {
          id: true, rating: true, body: true, createdAt: true, studentId: true,
          // The expert's public reply (tutor detail renders + edits it) and the
          // anonymity flag (seeds the student's edit form).
          tutorResponse: true, respondedAt: true, anonymous: true,
        },
      },
    },
  })
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  // Backfill / migrate: a missing room, OR a legacy meet.jit.si room (which now
  // hits the moderator gate), gets a fresh current-provider room the first time
  // a non-terminal booking is opened — so the join button always works.
  if (isStaleMeetingUrl(booking.meetingUrl) && (booking.status === 'CONFIRMED' || booking.status === 'LIVE')) {
    const url = await newMeetingUrl()
    booking.meetingUrl = url
    // Fire-and-forget persist so we only do this once per booking. Not awaited
    // so it doesn't block the response.
    prisma.booking.update({ where: { id: booking.id }, data: { meetingUrl: url } }).catch(() => {})
  }

  // Join cutoff: a session that was never completed stops exposing its room
  // link 30 minutes after the scheduled end — a stale CONFIRMED booking must
  // not offer a joinable (deterministic, guessable-forever) meeting URL.
  // Response-only masking; the stored meetingUrl is untouched.
  if (
    booking.meetingUrl &&
    (booking.status === 'CONFIRMED' || booking.status === 'LIVE') &&
    Date.now() > booking.startAt.getTime() + (booking.durationMin + 30) * 60_000
  ) {
    booking.meetingUrl = null
  }

  // Merge in the reschedule-request JSONB (not part of the Prisma-typed model —
  // lives as a boot-time-added column, queried raw). Null when no proposal is
  // pending; small enough to keep with the booking response payload.
  const rescheduleRows = await reschedulePromise
  const rescheduleRequest = rescheduleRows?.[0]?.rescheduleRequest ?? null

  // The capped thread came back newest-first; hand it to the client in the
  // ascending order the chat renders in.
  const messages = [...booking.messages].reverse()

  return NextResponse.json({ ...booking, messages, rescheduleRequest })
}

// Student-only "prep note" update — separate schema (no `action`) so it never
// conflicts with tutor lifecycle actions below.
const StudentPatchBody = z.object({
  studentNotes: z.string().max(500),
})

// Tutor post-session summary — a `{ tutorNotes }` PATCH without an `action` is
// treated as "tutor is editing their session summary". Only allowed when the
// booking is COMPLETED so it can't be used as a back-door around the lifecycle.
const TutorNotesBody = z.object({
  tutorNotes: z.string().max(1500),
})

// Expert/admin-set payment link. 2000 is a ceiling for a URL and this field is
// genuinely a URL — unlike `Certificate.fileUrl` and `Post.coverUrl`, which
// silently rejected every upload because their max was sized for a link while
// the value was base64. Nothing base64 can ever arrive here: the https-only
// check below rejects `data:` outright.
const PaymentLinkBody = z.object({
  paymentLinkUrl: z.string().max(2000),
})

const PatchBody = z.object({
  action: z.enum(['accept', 'decline', 'complete', 'no_show']),
  tutorNotes: z.string().max(1500).optional(),
})

// Grace window before EITHER side may report a no-show: the scheduled start
// plus this much must have passed, so nobody can flag at :01 — before the other
// party could plausibly have joined. Module scope on purpose: the tutor's
// `no_show` and the student's `expert_no_show` read the SAME value, so the two
// directions can never drift apart. (Same 15 min the disputes route uses for a
// client-reported no-show.)
const NO_SHOW_GRACE_MS = 15 * 60 * 1000

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await ctx.params
  const rawBody = await req.json().catch(() => ({}))

  // Student prep-note branch: only the owning student may update
  // `studentNotes`. Runs before the tutor-action parser so a student can hit
  // the same endpoint without needing an `action` field.
  if (typeof rawBody?.studentNotes === 'string' && rawBody?.action === undefined) {
    const parsedS = StudentPatchBody.safeParse(rawBody)
    if (!parsedS.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
    const own = await prisma.booking.findFirst({ where: { id, studentId: user.id } })
    if (!own) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
    if (own.status === 'COMPLETED' || own.status === 'CANCELED' || own.status === 'NO_SHOW') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    const updated = await prisma.booking.update({
      where: { id },
      data: { studentNotes: parsedS.data.studentNotes.trim() || null },
    })
    return NextResponse.json({ ok: true, studentNotes: updated.studentNotes })
  }

  // Tutor post-session summary branch: `{ tutorNotes }` without `action`. Only
  // the owning tutor may write, and only after the session is COMPLETED so a
  // tutor can't leak arbitrary text via this endpoint before finishing.
  if (typeof rawBody?.tutorNotes === 'string' && rawBody?.action === undefined) {
    const parsedT = TutorNotesBody.safeParse(rawBody)
    if (!parsedT.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
    const own = await prisma.booking.findFirst({ where: { id, tutor: { userId: user.id } } })
    if (!own) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
    if (own.status !== 'COMPLETED') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    const updated = await prisma.booking.update({
      where: { id },
      data: { tutorNotes: parsedT.data.tutorNotes.trim() || null },
    })
    return NextResponse.json({ ok: true, tutorNotes: updated.tutorNotes })
  }

    // Payment-link branch: `{ paymentLinkUrl }` without `action`, written by the
  // booking's EXPERT or an ADMIN, read by the client as a „გადახდა“ button.
  //
  // THIS IS A TEXT FIELD, NOT A PAYMENT INTEGRATION, and the distance between
  // those two is the whole design. There is no checkout, no webhook, no charge,
  // no reconciliation, no ledger; `payoutStatus` is untouched and PAYMENTS_LIVE
  // stays false with its logic unchanged. All that happens is that a link an
  // expert pasted from their BOG/TBC dashboard becomes clickable for the person
  // who owes them money — which is the difference between „we'll sort payment
  // out somehow" and a client abroad actually being able to pay.
  //
  // https ONLY, deliberately stricter than lib/safeUrl's render guard: that one
  // also passes mailto:, tel: and relative paths, and none of those is a bank
  // payment page. A plain http link to one is either a typo or a downgrade
  // attack, so it is refused rather than sanitised.
  if (typeof rawBody?.paymentLinkUrl === 'string' && rawBody?.action === undefined) {
    const parsedP = PaymentLinkBody.safeParse(rawBody)
    if (!parsedP.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
    const own = await prisma.booking.findFirst({
      where: user.role === 'ADMIN' ? { id } : { id, tutor: { userId: user.id } },
      select: { id: true, studentId: true, paymentLinkUrl: true },
    })
    if (!own) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

    const raw = parsedP.data.paymentLinkUrl.trim()
    // Empty string CLEARS the link — the expert who pasted a wrong one needs a
    // way to take it down, and a stale payment link is worse than none.
    let value: string | null = null
    if (raw) {
      if (!/^https:\/\//i.test(raw)) {
        return NextResponse.json({ ok: false, error: 'BAD_PAYMENT_URL' }, { status: 400 })
      }
      try { new URL(raw) } catch {
        return NextResponse.json({ ok: false, error: 'BAD_PAYMENT_URL' }, { status: 400 })
      }
      value = raw
    }

    await prisma.booking.update({ where: { id }, data: { paymentLinkUrl: value } })

    // Tell the client a link appeared. Without this the button is only found by
    // someone who happens to reopen the booking page — and this client is on a
    // phone in another timezone, not watching a tab.
    if (value && value !== own.paymentLinkUrl) {
      after(async () => {
        await notify(own.studentId, {
          type: 'BOOKING_CREATED',
          title: 'გადახდის ბმული მზადაა',
          body: 'ჯავშნის გვერდზე გამოჩნდა გადახდის ღილაკი.',
          href: `/me/bookings/${id}`,
        })
      })
    }
    return NextResponse.json({ ok: true, paymentLinkUrl: value })
  }

  // Client-reported EXPERT no-show — the mirror image of the tutor's `no_show`
  // action below. It lives in its own branch (rather than role-switching inside
  // `no_show`) for two reasons: the lifecycle lookup below is hard-scoped to
  // `tutor: { userId: user.id }`, so a student can never reach it at all; and an
  // explicit action keeps each direction behind its OWN authorization gate —
  // neither party can name the other as the no-show. No payload beyond the
  // action, so there is nothing for zod to add here.
  if (rawBody?.action === 'expert_no_show') {
    // AUTHORIZATION: only the booking's own student (or an ADMIN acting for
    // them). A tutor hitting this gets NOT_FOUND from the same query.
    const own = await prisma.booking.findFirst({
      where: user.role === 'ADMIN' ? { id } : { id, studentId: user.id },
      include: { tutor: { select: { userId: true } } },
    })
    if (!own) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
    // STATUS: only a session that actually reached a live state can be reported
    // as not held. PREPARING (never confirmed), COMPLETED, CANCELED and an
    // already-NO_SHOW booking are all refused.
    if (own.status !== 'CONFIRMED' && own.status !== 'LIVE') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    // TIMING: same grace as the tutor's direction, from the one shared constant.
    if (Date.now() < own.startAt.getTime() + NO_SHOW_GRACE_MS) {
      return NextResponse.json({ ok: false, error: 'TOO_EARLY' }, { status: 400 })
    }
    // Payout policy — the MIRROR IMAGE of the tutor-reported case below: the
    // EXPERT didn't turn up, so the client must not pay for a session that never
    // happened → REFUNDED (the expert gets nothing). `sessionsCount` is NOT
    // touched — only `complete` bumps that stat, and a session that did not
    // happen must never inflate an expert's public „N სესია ჩატარებული".
    // Status-guarded claim: a double click or a race with the tutor's own
    // transition can only ever be processed once (count === 1 proves it was us).
    const claim = await prisma.booking.updateMany({
      where: { id, status: { in: ['CONFIRMED', 'LIVE'] } },
      data: { status: 'NO_SHOW', payoutStatus: 'REFUNDED' },
    })
    if (claim.count !== 1) {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
    }
    // Same terminal cleanup the tutor path does: drop any pending reschedule
    // proposal so the booking can't render a stuck banner with dead buttons.
    await prisma.$executeRawUnsafe(`UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`, id)
    // Both parties are told, with the same BOOKING_CANCELED type the rest of the
    // lifecycle uses — notify() checks each recipient's prefs for it.
    await Promise.all([
      notify(own.studentId, {
        type: 'BOOKING_CANCELED',
        title: 'აღინიშნა: სესია არ შედგა',
        body: `${own.topic} · ${fmtWhenTz(own.startAt, { year: true })} — ექსპერტს ეცნობა. გადასახდელი არაფერია.`,
        href: `/me/bookings/${own.id}`,
      }),
      notify(own.tutor.userId, {
        type: 'BOOKING_CANCELED',
        title: 'აღინიშნა: სესია არ შედგა',
        body: `კლიენტმა აღნიშნა, რომ სესია არ შედგა — ${own.topic} · ${fmtWhenTz(own.startAt, { year: true })}. თუ ეს შეცდომაა, უპასუხე მიმოწერაში — გუნდიც გადახედავს.`,
        href: `/work/bookings/${own.id}#chat`,
      }),
    ])
    // Email BOTH parties — same two recipients as the in-app pair above. The
    // expert side is the one that actually matters here: they are being told,
    // without having done anything themselves, that a session they may believe
    // happened is now marked NO_SHOW and their payout is REFUNDED away. That
    // must not depend on them having a tab open.
    after(async () => {
      try {
        const [student, tutorUser, profile] = await Promise.all([
          prisma.user.findUnique({ where: { id: own.studentId }, select: { email: true, fullName: true, notificationPrefs: true } }),
          prisma.user.findUnique({ where: { id: own.tutor.userId }, select: { email: true, fullName: true, notificationPrefs: true } }),
          prisma.tutorProfile.findUnique({ where: { id: own.tutorId }, select: { user: { select: { fullName: true } } } }),
        ])
        const whenText = fmtWhenTz(own.startAt, { year: true })
        if (student?.email && normalizePrefs(student.notificationPrefs).BOOKING_CREATED) {
          const { subject, html } = bookingChangedEmail('no_show', {
            counterpartName: profile?.user.fullName || 'ექსპერტი',
            topic: own.topic,
            whenText,
            actorLabel: 'შენი',
            note: 'გადასახდელი არაფერია — ექსპერტს ეცნობა.',
            href: `/me/bookings/${own.id}`,
          })
          await sendMail({ to: student.email, subject, html })
        }
        if (tutorUser?.email && normalizePrefs(tutorUser.notificationPrefs).BOOKING_CREATED) {
          const { subject, html } = bookingChangedEmail('no_show', {
            counterpartName: student?.fullName || 'კლიენტი',
            topic: own.topic,
            whenText,
            actorLabel: 'კლიენტის',
            note: 'თუ ეს შეცდომაა, უპასუხე მიმოწერაში — გუნდიც გადახედავს.',
            href: `/work/bookings/${own.id}#chat`,
          })
          await sendMail({ to: tutorUser.email, subject, html })
        }
      } catch { /* email is best-effort */ }
    })
    // Ops ping so „გუნდი გადახედავს" is true: the expert has no dispute form of
    // their own (POST /api/disputes is student-only), so an admin is the real
    // contest surface. Off the response path — same fan-out the disputes route
    // does. GENERIC is not opt-outable, which is what an ops signal needs.
    after(async () => {
      try {
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
        await notifyMany(admins.map(a => a.id), {
          type: 'GENERIC',
          title: 'სესია არ შედგა — ექსპერტი',
          body: `#${own.ref.slice(0, 8)} · კლიენტის განაცხადი`,
          href: '/admin#bookings',
        })
      } catch { /* ops ping is best-effort */ }
    })
    return NextResponse.json({ ok: true, status: 'NO_SHOW' })
  }

  const parsed = PatchBody.safeParse(rawBody)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const booking = await prisma.booking.findFirst({
    where: { id, tutor: { userId: user.id } },
  })
  if (!booking) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const { action, tutorNotes } = parsed.data

  if (action === 'accept') {
    if (booking.status !== 'PREPARING') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    // Provision a Jitsi Meet room per booking. Public Jitsi requires no API
    // key; room URL is deterministic from the booking ref so both sides get
    // the same room. Room name is namespaced to reduce collision odds.
    const meetingUrl = booking.meetingUrl ?? (await newMeetingUrl())
    // Conditional claim (status-guarded), not a blind update: a concurrent
    // /cancel or the */15 cleanup cron may have flipped this to CANCELED between
    // our read and this write. updateMany + count===1 makes the transition
    // fail-safe instead of resurrecting a canceled booking.
    const claim = await prisma.booking.updateMany({
      where: { id, status: 'PREPARING' },
      data: { status: 'CONFIRMED', meetingUrl, tutorNotes: tutorNotes ?? booking.tutorNotes },
    })
    if (claim.count !== 1) {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
    }
    // If a reschedule proposal is still pending, its frozen `prevStatus` is the
    // pre-accept PREPARING. Bump it to CONFIRMED so a later REJECT restores the
    // now-confirmed booking instead of silently demoting it back to PREPARING
    // (where the cleanup cron would auto-cancel this confirmed session).
    await prisma.$executeRawUnsafe(
      `UPDATE "Booking" SET "rescheduleRequest" = jsonb_set("rescheduleRequest", '{prevStatus}', '"CONFIRMED"') WHERE id = $1 AND "rescheduleRequest" IS NOT NULL`,
      id,
    )
    // Tell the student their booking is confirmed.
    await notify(booking.studentId, {
      type: 'BOOKING_CREATED',
      title: 'ჯავშანი დადასტურდა',
      body: booking.topic,
      href: `/me/bookings/${booking.id}`,
    })
    // Tutor already acted — clear their "new request" bell entry so it doesn't
    // keep sitting as unread.
    // `contains` on the booking segment, not the full path: rows written
    // before the /tutor → /work move (stage 6) still say /tutor/bookings/…,
    // and the userId + type already scope the match to this person's own row.
    await markRelatedRead(user.id, `bookings/${booking.id}`, 'BOOKING_CREATED')
    // Confirmation email to the student — fire-and-forget (extra lookups for the
    // names/email run off the response path).
    after(async () => {
      try {
        const [student, profile] = await Promise.all([
          prisma.user.findUnique({ where: { id: booking.studentId }, select: { email: true, fullName: true, notificationPrefs: true } }),
          prisma.tutorProfile.findUnique({ where: { id: booking.tutorId }, select: { user: { select: { fullName: true } } } }),
        ])
        // Honor the student's notification prefs — the in-app notify() above
        // already checks them; the email must too (BOOKING_CREATED covers the
        // whole booking lifecycle, confirmations included).
        if (student?.email && normalizePrefs(student.notificationPrefs).BOOKING_CREATED) {
          const { subject, html } = bookingConfirmedEmail({
            studentName: student.fullName,
            expertName: profile?.user.fullName || 'ექსპერტი',
            topic: booking.topic,
            whenText: fmtWhenTz(booking.startAt, { year: true }),
            bookingId: booking.id,
          })
          await sendMail({ to: student.email, subject, html })
        }
      } catch { /* email is best-effort */ }
    })
    return NextResponse.json({ ok: true, status: 'CONFIRMED', meetingUrl })
  }

  if (action === 'decline') {
    // Decline = rejecting a PENDING request only. Once CONFIRMED (or past), the
    // tutor must use cancel — declining a confirmed/already-happened session
    // would erase it (→ CANCELED) and dodge a review. The UI only ever offers
    // decline on PREPARING, so this just hardens the API against direct calls.
    if (booking.status !== 'PREPARING') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    // Nothing to free: a booking claims no window (heldSlotId is null since the
    // windows model; the legacy `booked` flag is retired — stage 11).
    try {
      await prisma.$transaction(async tx => {
        // Status-guarded: bail if a concurrent write already moved this booking
        // out of PREPARING (e.g. cleanup cron canceled it), so we never free a
        // slot / overwrite a status that's no longer ours to change.
        const claim = await tx.booking.updateMany({
          where: { id, status: 'PREPARING' },
          data: {
            status: 'CANCELED',
            payoutStatus: 'REFUNDED',
            cancelledBy: 'TUTOR',
            tutorNotes: tutorNotes ?? booking.tutorNotes,
            heldSlotId: null,
          },
        })
        if (claim.count !== 1) throw new Error('BAD_STATE')
        await tx.$executeRawUnsafe(`UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`, id)
        // A declined package lesson gives its credit back — the expert said
        // no, so the client's month is also extended (lib/bookingCredit).
        await releaseBookingCredit(tx, booking.enrollmentId, { cancelledBy: 'TUTOR', lessonMinutes: booking.durationMin })
      })
    } catch (e) {
      if (e instanceof Error && e.message === 'BAD_STATE') {
        return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
      }
      throw e
    }
    await notify(booking.studentId, {
      type: 'BOOKING_CANCELED',
      title: 'ჯავშანი უარყოფილია',
      body: booking.topic,
      href: `/me/bookings/${booking.id}`,
    })
    // Clear the tutor's "new request" bell entry — they've already answered.
    // Same segment-only match as the accept path above (stage 6).
    await markRelatedRead(user.id, `bookings/${booking.id}`, 'BOOKING_CREATED')
    // Email the client. A decline is TERMINAL: this booking will never produce
    // another signal (no confirmation, no reminder — the reminder sweep only
    // looks at CONFIRMED rows), so the in-app bell alone means a client who
    // isn't in an open tab is simply never told their request died. Off the
    // response path in after(); a mail failure can never affect the mutation.
    after(async () => {
      try {
        const [student, profile] = await Promise.all([
          prisma.user.findUnique({ where: { id: booking.studentId }, select: { email: true, notificationPrefs: true } }),
          prisma.tutorProfile.findUnique({ where: { id: booking.tutorId }, select: { user: { select: { fullName: true } } } }),
        ])
        // Same gate the in-app notify() applied: BOOKING_CANCELED belongs to the
        // BOOKING_CREATED pref group (see lib/notify prefKeyForType).
        if (student?.email && normalizePrefs(student.notificationPrefs).BOOKING_CREATED) {
          const { subject, html } = bookingChangedEmail('declined', {
            counterpartName: profile?.user.fullName || 'ექსპერტი',
            topic: booking.topic,
            whenText: fmtWhenTz(booking.startAt, { year: true }),
            note: 'იმავე ექსპერტთან სხვა დროს ან სხვა ექსპერტს მარტივად აირჩევ.',
            href: `/experts/${booking.tutorId}`,
          })
          await sendMail({ to: student.email, subject, html })
        }
      } catch { /* email is best-effort */ }
    })
    return NextResponse.json({ ok: true, status: 'CANCELED' })
  }

  if (action === 'no_show') {
    // Tutor flags "student didn't turn up". Only allowed once the shared GRACE
    // window past the scheduled start has elapsed — otherwise a tutor could flag
    // the instant the clock hits startAt, before the student could plausibly
    // join. The opposite direction (`expert_no_show`, above) uses the same
    // constant so the two can never diverge.
    if (booking.status !== 'CONFIRMED' && booking.status !== 'LIVE') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    if (Date.now() < booking.startAt.getTime() + NO_SHOW_GRACE_MS) {
      return NextResponse.json({ ok: false, error: 'TOO_EARLY' }, { status: 400 })
    }
    // Payout policy: the STUDENT didn't turn up, so this is NOT a refund case —
    // the expert held the slot and showed up, so the money is RELEASED to them.
    // (REFUNDED is reserved for tutor-cancel / decline / unanswered auto-cancel,
    // where the student got nothing.)
    const claim = await prisma.booking.updateMany({
      where: { id, status: { in: ['CONFIRMED', 'LIVE'] } },
      data: {
        status: 'NO_SHOW',
        payoutStatus: 'RELEASED',
        tutorNotes: tutorNotes ?? booking.tutorNotes,
      },
    })
    if (claim.count !== 1) {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
    }
    // Clear any leftover reschedule proposal so a terminal booking never renders
    // a stuck pending-reschedule banner with dead accept/reject buttons.
    await prisma.$executeRawUnsafe(`UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`, id)
    await notify(booking.studentId, {
      type: 'BOOKING_CANCELED',
      title: 'აღინიშნა: გამოუცხადებლობა',
      body: `ექსპერტმა აღნიშნა, რომ არ გამოცხადდი — ${booking.topic} · ${fmtWhenTz(booking.startAt, { year: true })}`,
      href: `/me/bookings/${booking.id}`,
    })
    // Email the client: being marked as a no-show is a consequential, contestable
    // claim about them, and the in-app notice reaches nobody who isn't already
    // looking. Mirrors the in-app recipient exactly (client only — the expert
    // just performed this action).
    after(async () => {
      try {
        const [student, profile] = await Promise.all([
          prisma.user.findUnique({ where: { id: booking.studentId }, select: { email: true, notificationPrefs: true } }),
          prisma.tutorProfile.findUnique({ where: { id: booking.tutorId }, select: { user: { select: { fullName: true } } } }),
        ])
        if (student?.email && normalizePrefs(student.notificationPrefs).BOOKING_CREATED) {
          const { subject, html } = bookingChangedEmail('no_show', {
            counterpartName: profile?.user.fullName || 'ექსპერტი',
            topic: booking.topic,
            whenText: fmtWhenTz(booking.startAt, { year: true }),
            actorLabel: 'ექსპერტის',
            note: 'თუ ეს შეცდომაა, მიწერე მიმოწერაში — გუნდიც გადახედავს.',
            href: `/me/bookings/${booking.id}#chat`,
          })
          await sendMail({ to: student.email, subject, html })
        }
      } catch { /* email is best-effort */ }
    })
    return NextResponse.json({ ok: true, status: 'NO_SHOW' })
  }

  // action === 'complete'
  if (booking.status !== 'CONFIRMED' && booking.status !== 'LIVE') {
    return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
  }
  // Can't complete a session before it has even started — that would release
  // the payout and lock out cancellation/refund for a session that never
  // happened. Require the scheduled start time to have passed.
  if (booking.startAt.getTime() > Date.now()) {
    return NextResponse.json({ ok: false, error: 'TOO_EARLY' }, { status: 400 })
  }
  const claim = await prisma.booking.updateMany({
    where: { id, status: { in: ['CONFIRMED', 'LIVE'] } },
    data: { status: 'COMPLETED', payoutStatus: 'RELEASED', tutorNotes: tutorNotes ?? booking.tutorNotes },
  })
  if (claim.count !== 1) {
    return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
  }
  // Clear any leftover reschedule proposal so a completed booking never renders
  // a stuck pending-reschedule banner.
  await prisma.$executeRawUnsafe(`UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`, id)
  // Bump the expert's public "N სესია ჩატარებული" stat. The status-guarded
  // claim above (where status ∈ CONFIRMED/LIVE, count === 1) proves THIS request
  // performed the transition — so a booking that was already COMPLETED (by the
  // cron or a duplicate click) can't reach here and double-count.
  await prisma.tutorProfile.update({
    where: { id: booking.tutorId },
    data: { sessionsCount: { increment: 1 } },
  })
  await notify(booking.studentId, {
    type: 'BOOKING_COMPLETED',
    title: 'სესია დასრულდა',
    body: `${booking.topic} — დატოვე შეფასება`,
    href: `/me/bookings/${booking.id}`,
  })
  return NextResponse.json({ ok: true, status: 'COMPLETED' })
}
