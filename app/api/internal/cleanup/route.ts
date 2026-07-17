import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notify'
import { fmtKaDateTime } from '@/lib/kaDate'

// Cleanup job for expired auth artifacts + stale bookings.
//
// Deletes:
//   - Session rows where expiresAt < now (also revoked sessions)
//   - OtpCode rows where consumed=true OR expiresAt < now
//   - PasswordResetToken rows where consumed=true OR expiresAt < now
//
// Auto-transitions:
//   - Booking PREPARING → CANCELED  (tutor never responded within 24h)
//     Frees the held AvailabilitySlot for someone else.
//   - Booking CONFIRMED / LIVE → COMPLETED  (session ended ≥ 48h ago and
//     nobody flagged NO_SHOW — benefit of the doubt).
//
// Auth: shared secret in the `Authorization: Bearer <CLEANUP_SECRET>` header,
// OR `?secret=<CLEANUP_SECRET>` query param on the GET variant (simpler for
// cron systems that only support HTTP GET pings).
//
// Recommended schedule: every 6 hours.
//
// Railway cron setup:
//   1. Set env CLEANUP_SECRET=<random 32+ char string> in Variables
//   2. Dashboard → Service → Cron → add job:
//        Schedule: 0 */6 * * *
//        Command:  curl -fsS "https://mcodne.ge/api/internal/cleanup?secret=$CLEANUP_SECRET"

const PREPARING_TTL_HOURS = 24
const AUTO_COMPLETE_GRACE_HOURS = 48

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : null
  const expected = process.env.CLEANUP_SECRET

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'DISABLED', hint: 'Set CLEANUP_SECRET in env to enable this endpoint.' },
      { status: 503 },
    )
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const now = new Date()

  // ── Auth-artifact deletes ─────────────────────────────────────────────
  const [sessions, otps, resets] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.otpCode.deleteMany({
      where: { OR: [{ consumed: true }, { expiresAt: { lt: now } }] },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ consumed: true }, { expiresAt: { lt: now } }] },
    }),
  ])

  // ── Booking auto-transitions ──────────────────────────────────────────
  // PREPARING > 24h → CANCELED (+ free slot)
  const preparingCutoff = new Date(now.getTime() - PREPARING_TTL_HOURS * 3600_000)
  const stalePrepAll = await prisma.booking.findMany({
    where: {
      status: 'PREPARING',
      createdAt: { lt: preparingCutoff },
    },
    select: {
      id: true,
      tutorId: true,
      startAt: true,
      durationMin: true,
      topic: true,
      studentId: true,
      tutor: { select: { userId: true } },
    },
  })

  // A pending reschedule proposal force-sets status back to PREPARING on a
  // booking whose createdAt may be days old — keying the TTL on createdAt
  // would silently auto-cancel it mid-negotiation. Exclude every booking with
  // a pending rescheduleRequest (raw JSONB column — not in the Prisma model).
  let pendingRescheduleIds = new Set<string>()
  if (stalePrepAll.length > 0) {
    const placeholders = stalePrepAll.map((_, i) => `$${i + 1}`).join(', ')
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Booking" WHERE "rescheduleRequest" IS NOT NULL AND id IN (${placeholders})`,
      ...stalePrepAll.map(b => b.id),
    )
    pendingRescheduleIds = new Set(rows.map(r => r.id))
  }
  const stalePrep = stalePrepAll.filter(b => !pendingRescheduleIds.has(b.id))

  let preparingCanceled = 0
  for (const b of stalePrep) {
    const end = new Date(b.startAt.getTime() + b.durationMin * 60_000)
    const heldSlot = await prisma.availabilitySlot.findFirst({
      where: {
        tutorId: b.tutorId,
        startAt: { lte: b.startAt },
        endAt:   { gte: end },
        booked: true,
      },
      select: { id: true },
    })
    await prisma.$transaction(async tx => {
      await tx.booking.update({
        where: { id: b.id },
        data: { status: 'CANCELED', payoutStatus: 'REFUNDED' },
      })
      if (heldSlot) {
        await tx.availabilitySlot.update({ where: { id: heldSlot.id }, data: { booked: false } })
      }
    })
    preparingCanceled++

    // Tell both parties — the student's request expired unanswered, and the
    // tutor's queue just lost an item. notify() swallows its own failures.
    const sessionRef = `${b.topic} · ${fmtKaDateTime(b.startAt, { year: true })}`
    await notify(b.studentId, {
      type: 'BOOKING_CANCELED',
      title: 'ჯავშანი გაუქმდა',
      body: `${sessionRef} — შენი მოთხოვნა უპასუხოდ დარჩა და ავტომატურად გაუქმდა`,
      href: `/student/bookings/${b.id}`,
    })
    await notify(b.tutor.userId, {
      type: 'BOOKING_CANCELED',
      title: 'ჯავშანი გაუქმდა',
      body: `${sessionRef} — მოთხოვნა 24 საათში უპასუხოდ დარჩა და ავტომატურად გაუქმდა`,
      href: `/tutor/bookings/${b.id}`,
    })
  }

  // CONFIRMED / LIVE past (startAt + duration + 48h) with nobody having
  // flipped state → auto-COMPLETED. This is the "benefit of the doubt"
  // fallback so bookings don't sit in CONFIRMED forever if the tutor
  // forgets to click "mark complete".
  //
  // NB: we cannot express `startAt + durationMin` in a Prisma `where`,
  // so pull candidates whose startAt is at least (grace + max-duration)
  // ago and check per-row.
  const maxDurationMin = 240
  const candidateCutoff = new Date(
    now.getTime() - (AUTO_COMPLETE_GRACE_HOURS * 60 + maxDurationMin) * 60_000,
  )
  const staleActive = await prisma.booking.findMany({
    where: {
      status: { in: ['CONFIRMED', 'LIVE'] },
      startAt: { lt: candidateCutoff },
    },
    select: {
      id: true,
      startAt: true,
      durationMin: true,
      topic: true,
      studentId: true,
      tutor: { select: { userId: true } },
    },
  })
  const overdue = staleActive.filter(b => {
    const sessionEnd = b.startAt.getTime() + b.durationMin * 60_000
    return sessionEnd + AUTO_COMPLETE_GRACE_HOURS * 3600_000 < now.getTime()
  })
  let autoCompleted = 0
  if (overdue.length > 0) {
    // Also set `autoCompleted: true` so downstream flows (specifically the
    // reviews API) can distinguish sessions the tutor manually closed from
    // ones the cron closed on the "benefit of the doubt" fallback. Reviews on
    // auto-completed bookings are refused — a session that may not have
    // actually happened must not seed a rating.
    const res = await prisma.booking.updateMany({
      where: { id: { in: overdue.map(b => b.id) } },
      data: { status: 'COMPLETED', payoutStatus: 'RELEASED', autoCompleted: true },
    })
    autoCompleted = res.count

    // Both parties learn the session was closed automatically — otherwise the
    // status flips silently and neither side knows why.
    for (const b of overdue) {
      const sessionRef = `${b.topic} · ${fmtKaDateTime(b.startAt, { year: true })}`
      await notify(b.studentId, {
        type: 'BOOKING_COMPLETED',
        title: 'სესია დასრულებულად ჩაითვალა',
        body: `${sessionRef} — ავტომატურად მოინიშნა დასრულებულად`,
        href: `/student/bookings/${b.id}`,
      })
      await notify(b.tutor.userId, {
        type: 'BOOKING_COMPLETED',
        title: 'სესია დასრულებულად ჩაითვალა',
        body: `${sessionRef} — ავტომატურად მოინიშნა დასრულებულად`,
        href: `/tutor/bookings/${b.id}`,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: {
      sessions: sessions.count,
      otpCodes: otps.count,
      passwordResetTokens: resets.count,
    },
    bookings: {
      preparingCanceled,
      autoCompleted,
    },
    at: now.toISOString(),
  })
}

// GET dual-purpose: if `?secret=<CLEANUP_SECRET>` matches, run the cleanup
// (convenience for cron systems that can only ping GET URLs, e.g. Railway UI
// cron). Otherwise return a self-doc JSON.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const expected = process.env.CLEANUP_SECRET

  // Actual cleanup path when secret is supplied AND matches.
  if (querySecret && expected && querySecret === expected) {
    // Reconstruct a POST-shaped Request and defer to the POST handler so we
    // don't duplicate the whole cleanup logic block.
    return POST(new Request(req.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${expected}` },
    }))
  }

  const configured = !!expected
  return NextResponse.json({
    ok: true,
    endpoint: '/api/internal/cleanup',
    methods: ['POST (Bearer)', 'GET ?secret=…'],
    auth: 'Authorization: Bearer <CLEANUP_SECRET> — or query ?secret=<CLEANUP_SECRET>',
    configured,
    actions: [
      'Delete expired Session rows',
      'Delete consumed/expired OtpCode rows',
      'Delete consumed/expired PasswordResetToken rows',
      `Cancel PREPARING bookings older than ${PREPARING_TTL_HOURS}h + free their held slot`,
      `Auto-complete CONFIRMED/LIVE bookings past (startAt + duration + ${AUTO_COMPLETE_GRACE_HOURS}h)`,
    ],
    hint: configured
      ? 'Ping this endpoint on a schedule (e.g. every 6h) — POST with Bearer or GET with ?secret=…'
      : 'CLEANUP_SECRET is NOT set — endpoint is disabled. Set it in Railway env to enable.',
  })
}
