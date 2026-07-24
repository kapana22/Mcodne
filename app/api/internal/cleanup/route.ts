import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notify'
import { fmtKaDateTime, fmtKaTime } from '@/lib/kaDate'
import { sendSessionReminders } from '@/lib/sessionReminders'
import { sendMessageReminders } from '@/lib/messageReminders'

// Cleanup job for expired auth artifacts + stale bookings.
//
// Deletes:
//   - Session rows where expiresAt < now (also revoked sessions)
//   - OtpCode rows where consumed=true OR expiresAt < now
//   - PasswordResetToken rows where consumed=true OR expiresAt < now
//
// Auto-transitions:
//   - Booking PREPARING → CANCELED  (tutor never responded within 24h, OR the
//     scheduled start time passed unanswered — whichever comes first).
//     Frees the held AvailabilitySlot for someone else.
//   - Booking CONFIRMED / LIVE → COMPLETED  (session ended ≥ 48h ago and
//     nobody flagged NO_SHOW — benefit of the doubt).
//
// Reminders:
//   - CONFIRMED bookings starting within 24h / within 1h → BOOKING_REMINDER to
//     both parties (deduped via deterministic href markers — see below).
//     NB: the 1h reminder only fires if a cron tick lands inside that hour, so
//     schedule this endpoint at least every 15–30 min for it to be reliable.
//
// Auth: shared secret in the `Authorization: Bearer <CLEANUP_SECRET>` header,
// OR `?secret=<CLEANUP_SECRET>` query param on the GET variant (simpler for
// cron systems that only support HTTP GET pings).
//
// Recommended schedule: every 15 minutes (the 1h session reminder needs a
// tick inside its window; everything else tolerates any cadence).
//
// Railway cron setup:
//   1. Set env CLEANUP_SECRET=<random 32+ char string> in Variables
//   2. Dashboard → Service → Cron → add job:
//        Schedule: */15 * * * *
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
  const notifCutoff = new Date(now.getTime() - 120 * 24 * 3600_000) // 120 days
  const [sessions, otps, resets, notifs] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.otpCode.deleteMany({
      where: { OR: [{ consumed: true }, { expiresAt: { lt: now } }] },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ consumed: true }, { expiresAt: { lt: now } }] },
    }),
    // Prune old READ notifications so the table (one row per booking event /
    // message / broadcast) doesn't grow unbounded and slow the dedupe scans.
    prisma.notification.deleteMany({ where: { readAt: { not: null }, createdAt: { lt: notifCutoff } } }),
  ])

  // ── Booking auto-transitions ──────────────────────────────────────────
  // PREPARING → CANCELED when EITHER deadline passes, whichever comes first:
  //   (a) unanswered for 24h since creation, or
  //   (b) the scheduled startAt itself has passed (a request the expert never
  //       answered before the session time is dead regardless of age).
  const preparingCutoff = new Date(now.getTime() - PREPARING_TTL_HOURS * 3600_000)
  const stalePrepAll = await prisma.booking.findMany({
    where: {
      status: 'PREPARING',
      OR: [
        { createdAt: { lt: preparingCutoff } },
        { startAt: { lt: now } },
      ],
    },
    select: {
      id: true,
      tutorId: true,
      startAt: true,
      durationMin: true,
      topic: true,
      studentId: true,
      heldSlotId: true,
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
    // Free the EXACT slot this booking claimed (heldSlotId) — same as the
    // cancel/decline flows. The time-containment scan is a legacy fallback
    // ONLY for rows created before heldSlotId existed (schema.prisma warns the
    // scan can free an unrelated slot, so it must never be the primary path).
    let slotId: string | null = b.heldSlotId
    if (!slotId) {
      const end = new Date(b.startAt.getTime() + b.durationMin * 60_000)
      const legacySlot = await prisma.availabilitySlot.findFirst({
        where: {
          tutorId: b.tutorId,
          startAt: { lte: b.startAt },
          endAt:   { gte: end },
          booked: true,
        },
        select: { id: true },
      })
      slotId = legacySlot?.id ?? null
    }
    await prisma.$transaction(async tx => {
      await tx.booking.update({
        where: { id: b.id },
        data: { status: 'CANCELED', payoutStatus: 'REFUNDED', heldSlotId: null },
      })
      if (slotId) {
        await tx.availabilitySlot.updateMany({ where: { id: slotId }, data: { booked: false } })
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
      body: `${sessionRef} — მოთხოვნა უპასუხოდ დარჩა და ავტომატურად გაუქმდა`,
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
    // status flips silently and neither side knows why. State is already
    // committed above, so these are pure side-effects — fan them out in one
    // batch instead of one serial round-trip per party.
    await Promise.all(overdue.flatMap(b => {
      const sessionRef = `${b.topic} · ${fmtKaDateTime(b.startAt, { year: true })}`
      return [
        notify(b.studentId, {
          type: 'BOOKING_COMPLETED',
          title: 'სესია დასრულებულად ჩაითვალა',
          body: `${sessionRef} — ავტომატურად მოინიშნა დასრულებულად`,
          href: `/student/bookings/${b.id}`,
        }),
        notify(b.tutor.userId, {
          type: 'BOOKING_COMPLETED',
          title: 'სესია დასრულებულად ჩაითვალა',
          body: `${sessionRef} — ავტომატურად მოინიშნა დასრულებულად`,
          href: `/tutor/bookings/${b.id}`,
        }),
      ]
    }))
  }

  // ── Session reminders (24h / 1h before start) ─────────────────────────
  // Both parties of a CONFIRMED booking get a BOOKING_REMINDER when the
  // session starts within 24h; a second, more urgent one when it starts
  // within 1h. Dedupe WITHOUT a schema change: the Notification model has no
  // meta/JSONB column, but `href` is queryable — every reminder's href carries
  // a deterministic `?reminder=24h|1h` marker, and we check for an existing
  // (userId, type=BOOKING_REMINDER, href) row before sending. A notify()
  // suppressed by the user's prefs inserts nothing, so the check simply
  // re-runs (and stays silent) on the next tick — no duplicates either way.
  const in24h = new Date(now.getTime() + 24 * 3600_000)
  const upcoming = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', startAt: { gt: now, lte: in24h } },
    select: {
      id: true,
      topic: true,
      startAt: true,
      studentId: true,
      tutor: { select: { userId: true } },
    },
  })
  let remindersSent = 0
  if (upcoming.length > 0) {
    type PlannedReminder = { userId: string; href: string; title: string; body: string }
    const planned: PlannedReminder[] = []
    for (const b of upcoming) {
      // Within 1h → only the urgent kind (its own dedupe key, so a booking
      // that already got the 24h reminder still gets the 1h one).
      const kind = b.startAt.getTime() - now.getTime() <= 3600_000 ? '1h' : '24h'
      const title = kind === '1h'
        ? `სესია იწყება 1 საათში · ${fmtKaTime(b.startAt)}`
        : `შეხსენება: სესია 24 საათში · ${fmtKaTime(b.startAt)}-ზე`
      const body = `${b.topic} · ${fmtKaDateTime(b.startAt, { year: true })}`
      planned.push({ userId: b.studentId, href: `/student/bookings/${b.id}?reminder=${kind}`, title, body })
      planned.push({ userId: b.tutor.userId, href: `/tutor/bookings/${b.id}?reminder=${kind}`, title, body })
    }
    const existing = await prisma.notification.findMany({
      where: { type: 'BOOKING_REMINDER', href: { in: planned.map(p => p.href) } },
      select: { userId: true, href: true },
    })
    const alreadySent = new Set(existing.map(e => `${e.userId}|${e.href}`))
    const toSend = planned.filter(p => !alreadySent.has(`${p.userId}|${p.href}`))
    // Reminders are independent side-effects — send them in one batch.
    await Promise.all(toSend.map(p => notify(p.userId, {
      type: 'BOOKING_REMINDER',
      title: p.title,
      body: p.body,
      href: p.href,
    })))
    remindersSent += toSend.length
  }

  // Email session reminders ride this same */15 cron (best-effort — a mail
  // failure must never break the cleanup job). Separate from the in-app
  // `remindersSent` above; deduped by its own sessionReminderSentAt column.
  let emailReminders = { bookings: 0, emails: 0 }
  try { emailReminders = await sendSessionReminders() } catch { /* best-effort */ }

  // Delayed unread-message reminders ride the same cron — email a message that's
  // sat unread for ~30 min, at most once per unread streak. Deduped by its own
  // Message.reminderEmailSentAt column.
  let messageReminders = { threads: 0, emails: 0 }
  try { messageReminders = await sendMessageReminders() } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true,
    deleted: {
      sessions: sessions.count,
      otpCodes: otps.count,
      passwordResetTokens: resets.count,
      notifications: notifs.count,
    },
    bookings: {
      preparingCanceled,
      autoCompleted,
      remindersSent,
    },
    emailReminders,
    messageReminders,
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
      `Cancel PREPARING bookings unanswered for ${PREPARING_TTL_HOURS}h OR past their startAt + free their held slot`,
      `Auto-complete CONFIRMED/LIVE bookings past (startAt + duration + ${AUTO_COMPLETE_GRACE_HOURS}h)`,
      'Send BOOKING_REMINDER (24h + 1h before start) to both parties of CONFIRMED bookings — run every 15–30 min for reliable 1h reminders',
    ],
    hint: configured
      ? 'Ping this endpoint on a schedule (e.g. every 6h) — POST with Bearer or GET with ?secret=…'
      : 'CLEANUP_SECRET is NOT set — endpoint is disabled. Set it in Railway env to enable.',
  })
}
