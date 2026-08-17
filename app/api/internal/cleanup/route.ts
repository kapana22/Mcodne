import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notify'
import { fmtKaDateTime, fmtKaTime } from '@/lib/kaDate'
import { sendSessionReminders } from '@/lib/sessionReminders'
import { sendMessageReminders } from '@/lib/messageReminders'
import { sendPostSessionNudges } from '@/lib/postSession'
import { sendExpertRequestEscalations, PREPARING_TTL_HOURS, ESCALATION_STAGES } from '@/lib/expertEscalation'
import { sendExpertActivationNudges } from '@/lib/expertActivation'
import { pruneEvents, EVENT_RETENTION_DAYS } from '@/lib/events'
import { cronAuth } from '@/lib/cronAuth'
import { requestsOn } from '@/lib/requests'
import { runRequestJobs } from '@/lib/requestJobs'
import { lastSweepRunAt } from '@/lib/sweepRunner'
import { topUpAvailability } from '@/lib/availabilityTopUp'

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
//   - Booking PREPARING → CONFIRMED  (a reschedule proposal on a booking that
//     was CONFIRMED expired unanswered and its original time is still ahead —
//     the proposal dies, the session survives at its original time).
//   - Booking CONFIRMED / LIVE → COMPLETED  (session ended ≥ 48h ago and
//     nobody flagged NO_SHOW — benefit of the doubt).
//
// Reminders:
//   - CONFIRMED bookings starting within 24h / within 1h → BOOKING_REMINDER to
//     both parties (deduped via deterministic href markers — see below).
//     NB: the 1h reminder only fires if a cron tick lands inside that hour, so
//     schedule this endpoint at least every 15–30 min for it to be reliable.
//   - COMPLETED bookings with no review → a review nudge (+ folded-in rebook
//     invite) to the client ~3h after the session ended. See lib/postSession.
//   - PREPARING bookings the expert hasn't answered → escalating reminders to
//     the EXPERT at 12h and 3h before the auto-cancel deadline, in-app AND by
//     email, exactly once per stage. See lib/expertEscalation.
//
// Auth: see lib/cronAuth. Prefer `Authorization: Bearer <CLEANUP_SECRET>`; the
// `?secret=` query form still works on GET only, for the live cron, and is
// being retired (a secret in a URL lands in access logs).
//
// Recommended schedule: every 15 minutes (the 1h session reminder needs a
// tick inside its window; everything else tolerates any cadence).
//
// Railway cron setup:
//   1. Set env CLEANUP_SECRET=<random 32+ char string> in Variables
//   2. Dashboard → Service → Cron → add job:
//        Schedule: */15 * * * *
//        Command:  curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_SECRET" \
//                    https://mcodne.ge/api/internal/cleanup

// PREPARING_TTL_HOURS now lives in lib/expertEscalation and is imported above:
// the escalation reminders are timed against the very deadline this constant
// defines, and two copies of it would eventually disagree — nudging an expert
// about a window that no longer matches when the request actually dies.
const AUTO_COMPLETE_GRACE_HOURS = 48
// A pending reschedule proposal force-holds a booking in PREPARING and locks its
// slot. It stays exempt from the PREPARING auto-cancel only while it is still
// negotiable — proposed within this window AND for a still-future time. Once it
// goes stale (nobody answered) it must expire, or the booking + slot are bricked
// forever (cleanup would otherwise skip it indefinitely). Expiring it RESTORES a
// previously-CONFIRMED booking to its original time; only a never-confirmed one
// is auto-canceled.
const RESCHEDULE_PROPOSAL_TTL_HOURS = 48

export async function POST(req: Request) {
  const gate = cronAuth(req)
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

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
  // would silently auto-cancel it mid-negotiation. Exempt such bookings, BUT
  // only while the proposal is still negotiable: proposed within the TTL AND
  // for a still-future time. A stale/dead proposal (nobody ever answered, or
  // even the proposed time has now passed) must NOT stay exempt — otherwise the
  // booking sits in PREPARING forever with its slot locked. Those fall through
  // to the restore / auto-cancel handling below, depending on `prevStatus`.
  // (Raw JSONB column — not in the Prisma model.)
  const proposalTtlMs = RESCHEDULE_PROPOSAL_TTL_HOURS * 3600_000
  const exemptRescheduleIds = new Set<string>()
  // A DEAD proposal on a booking that was CONFIRMED before the proposal forced
  // PREPARING must NOT be canceled either — the expired thing is the proposal,
  // not the session, whose ORIGINAL startAt may still be weeks away. Those get
  // restored to CONFIRMED below instead (`prevStatus` is written by the propose
  // route and bumped to CONFIRMED by the booking-accept PATCH).
  const restoreRescheduleIds = new Set<string>()
  if (stalePrepAll.length > 0) {
    const placeholders = stalePrepAll.map((_, i) => `$${i + 1}`).join(', ')
    const rows = await prisma.$queryRawUnsafe<
      { id: string; rescheduleRequest: { newStartAt?: string; proposedAt?: string; prevStatus?: string } | null }[]
    >(
      `SELECT id, "rescheduleRequest" FROM "Booking" WHERE "rescheduleRequest" IS NOT NULL AND id IN (${placeholders})`,
      ...stalePrepAll.map(b => b.id),
    )
    // Only a booking whose ORIGINAL time is still ahead can be restored — one
    // whose startAt already passed falls through to the normal auto-cancel
    // below (never resurrect a past session as CONFIRMED).
    const futureStartIds = new Set(
      stalePrepAll.filter(b => b.startAt.getTime() > now.getTime()).map(b => b.id),
    )
    for (const r of rows) {
      const rr = r.rescheduleRequest
      if (!rr) continue
      const proposedAt = rr.proposedAt ? new Date(rr.proposedAt).getTime() : 0
      const newStart = rr.newStartAt ? new Date(rr.newStartAt).getTime() : 0
      const fresh = proposedAt > 0 && now.getTime() - proposedAt < proposalTtlMs
      const actionable = newStart > now.getTime()
      if (fresh && actionable) {
        exemptRescheduleIds.add(r.id)
        continue
      }
      if (rr.prevStatus === 'CONFIRMED' && futureStartIds.has(r.id)) restoreRescheduleIds.add(r.id)
    }
  }
  const stalePrep = stalePrepAll.filter(
    b => !exemptRescheduleIds.has(b.id) && !restoreRescheduleIds.has(b.id),
  )

  // Expired proposal on a previously-CONFIRMED booking → restore the booking
  // (original startAt + heldSlotId stay exactly as they are; only the forced
  // PREPARING and the dead proposal blob are undone). Runs BEFORE the
  // auto-cancel loop so a confirmed session is never destroyed by a proposal
  // nobody answered.
  let rescheduleRestored = 0
  for (const b of stalePrepAll.filter(x => restoreRescheduleIds.has(x.id))) {
    const restoredOk = await prisma.$transaction(async tx => {
      // Status-guarded claim, re-read inside the tx: a concurrent accept (→
      // CONFIRMED at the NEW time) or reject (clears the blob) must win. Matching
      // BOTH `status = 'PREPARING'` AND a still-present blob proves the proposal
      // was untouched when we expired it — so this can never run twice on one
      // row, and never clobbers the counter-party's answer.
      const n = await tx.$executeRawUnsafe(
        `UPDATE "Booking"
            SET "status" = 'CONFIRMED', "rescheduleRequest" = NULL, "updatedAt" = NOW()
          WHERE id = $1 AND "status" = 'PREPARING' AND "rescheduleRequest" IS NOT NULL`,
        b.id,
      )
      return n === 1
    })
    if (!restoredOk) continue
    rescheduleRestored++

    // Both parties were waiting on that proposal — tell them the old time stands.
    const sessionRef = `${b.topic} · ${fmtKaDateTime(b.startAt, { year: true })}`
    await notify(b.studentId, {
      type: 'BOOKING_CREATED',
      title: 'ჯავშანი ძველ დროზე დარჩა',
      body: `${sessionRef} — გადადების მოთხოვნას ვადა გაუვიდა, ჯავშანი ძველ დროზე ძალაშია`,
      href: `/student/bookings/${b.id}`,
    })
    await notify(b.tutor.userId, {
      type: 'BOOKING_CREATED',
      title: 'ჯავშანი ძველ დროზე დარჩა',
      body: `${sessionRef} — გადადების მოთხოვნას ვადა გაუვიდა, ჯავშანი ძველ დროზე ძალაშია`,
      href: `/tutor/bookings/${b.id}`,
    })
  }

  let preparingCanceled = 0
  for (const b of stalePrep) {
    // Release the EXACT slot this booking claimed (heldSlotId) — same as the
    // cancel/decline flows. Null is a harmless no-op: under the windows model a
    // booking claims nothing (a row is a WINDOW and bookable starts are derived
    // from windows − active bookings), so cancelling one automatically returns
    // its time to the derivation. Only legacy rows still carry a heldSlotId
    // worth clearing. The old time-containment fallback that matched a row by
    // `startAt <= b.startAt AND endAt >= end AND booked = true` is gone: every
    // new booking has a null heldSlotId, so it fired against whatever unrelated
    // legacy row happened to contain the time — to clear a flag that no longer
    // means anything.
    const slotId: string | null = b.heldSlotId
    const claimed = await prisma.$transaction(async tx => {
      // Status-guarded claim: the tutor could have accepted (PREPARING →
      // CONFIRMED) between our findMany snapshot and this write. count === 1
      // proves the row was STILL PREPARING when we flipped it — otherwise we'd
      // clobber a just-confirmed booking back to CANCELED and free its slot.
      const c = await tx.booking.updateMany({
        where: { id: b.id, status: 'PREPARING' },
        data: { status: 'CANCELED', payoutStatus: 'REFUNDED', heldSlotId: null },
      })
      if (c.count !== 1) return false
      if (slotId) {
        await tx.availabilitySlot.updateMany({ where: { id: slotId }, data: { booked: false } })
      }
      return true
    })
    // Lost the race (a concurrent accept won) — don't free the slot and don't
    // send a bogus cancellation to a booking that's now CONFIRMED.
    if (!claimed) continue
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
      // NEVER auto-complete a booking an admin already decided on. Without these
      // two exclusions this block silently REVERSED a dispute refund 48h later:
      // it flipped payoutStatus back to RELEASED and bumped the expert's public
      // sessionsCount, while the audit row still said REFUND_FULL.
      //   · payoutStatus REFUNDED — money already returned (dispute refund, or
      //     an auto-canceled request), so there is nothing left to release.
      //   · any Dispute row — a resolved one already wrote its own terminal
      //     state (see app/api/admin/disputes/[id]), and an OPEN one must not
      //     be pre-empted by the cron releasing the payout under the admin.
      payoutStatus: { not: 'REFUNDED' },
      dispute: { is: null },
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
  const overdue = staleActive.filter(b => {
    const sessionEnd = b.startAt.getTime() + b.durationMin * 60_000
    return sessionEnd + AUTO_COMPLETE_GRACE_HOURS * 3600_000 < now.getTime()
  })
  let autoCompleted = 0
  // Only rows that ACTUALLY transitioned here get notified + counted.
  const completed: typeof overdue = []
  if (overdue.length > 0) {
    // Also set `autoCompleted: true` so downstream flows (specifically the
    // reviews API) can distinguish sessions the tutor manually closed from
    // ones the cron closed on the "benefit of the doubt" fallback. Reviews on
    // auto-completed bookings are refused — a session that may not have
    // actually happened must not seed a rating.
    for (const b of overdue) {
      const flipped = await prisma.$transaction(async tx => {
        // Status-guarded claim: a concurrent manual complete could have flipped
        // this row between our findMany and now. count === 1 proves THIS tick
        // performed the transition, so the sessionsCount bump below happens
        // exactly once per genuinely auto-completed booking (no double-count).
        const claim = await tx.booking.updateMany({
          where: { id: b.id, status: { in: ['CONFIRMED', 'LIVE'] } },
          data: { status: 'COMPLETED', payoutStatus: 'RELEASED', autoCompleted: true },
        })
        if (claim.count !== 1) return false
        // Bump the expert's public "N სესია ჩატარებული" stat for this session.
        await tx.tutorProfile.update({
          where: { id: b.tutorId },
          data: { sessionsCount: { increment: 1 } },
        })
        return true
      })
      if (flipped) {
        autoCompleted++
        completed.push(b)
      }
    }
  }
  if (completed.length > 0) {
    // Both parties learn the session was closed automatically — otherwise the
    // status flips silently and neither side knows why. State is already
    // committed above, so these are pure side-effects — fan them out in one
    // batch instead of one serial round-trip per party.
    await Promise.all(completed.flatMap(b => {
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

  // Post-session follow-up: ~3h after a completed, unreviewed session, ask the
  // client for a review (with a folded-in „book again" line). Deduped by a
  // deterministic Notification id — no stamp column. See lib/postSession.
  let postSession = { bookings: 0, emails: 0 }
  try { postSession = await sendPostSessionNudges() } catch { /* best-effort */ }

  // Escalating reminders to the EXPERT while a request is still answerable. The
  // creation ping was the ONLY one they ever got, so a single missed email cost
  // the booking outright. Deduped by a deterministic Notification id per stage —
  // no stamp column. Guarded like every other side effect here: a mail or DB
  // failure inside it must never break the sweep. Runs AFTER the auto-cancel
  // block on purpose — a request cancelled this same tick is no longer
  // PREPARING, so it can't be chased and cancelled in the same breath.
  let expertEscalations = { bookings: 0, emails: 0 }
  try { expertEscalations = await sendExpertRequestEscalations() } catch { /* best-effort */ }

  // Approved experts who never finished setup — no service, or no free times —
  // get up to three nudges and then silence. This is the sweep's only OUTBOUND
  // supply-side job: every other block here reacts to a booking, but a profile
  // that CANNOT take bookings produces no events to react to, so nothing in the
  // product would ever have noticed it. Deduped by a deterministic Notification
  // id per (blocker, stage); guarded like every other side effect here. See
  // lib/expertActivation for the production audit that prompted it.
  let expertActivation = { experts: 0, emails: 0 }
  try { expertActivation = await sendExpertActivationNudges() } catch { /* best-effort */ }

  // Event retention. "Event" is append-only and every browse search writes a
  // row, so it grows without bound unless something trims it — and lib/events
  // names THIS sweep as the owner (it is the one place recurring deletes live).
  // Index-backed, idempotent, and guarded like everything else here: the admin
  // „ინსაითები" queries stay cheap only while the table stays bounded.
  let eventsPruned = 0
  try { eventsPruned = await pruneEvents() } catch { /* best-effort */ }

  // ── The rolling availability horizon ──────────────────────────────────────
  // Approval opens 8 weeks from the pattern the expert picked on /apply. Eight
  // weeks later those windows are simply GONE, and an expert who never opened
  // /tutor/schedule is back to „თავისუფალი დრო არ აქვს" — the state that killed
  // 46% of booking attempts — with nothing anywhere saying so. A one-shot seed
  // postpones that failure; it does not fix it. This keeps the horizon rolling
  // for experts who are actively publishing, and deliberately does NOT touch an
  // expert whose calendar is empty (that is a decision, not a gap). See
  // lib/availabilityTopUp for the full set of guards.
  const availabilityTopUp = await topUpAvailability()

  // ── Enrollments reach a terminal state ────────────────────────────────────
  // Nothing else moves them, so without this a package stays ACTIVE forever:
  // the client keeps seeing credits the book route will refuse (it checks the
  // expiry), the teacher's roster never clears, and „ვადაგასული" is a status no
  // row can ever hold. Two transitions, both derivable, neither guessed:
  //
  //   ACTIVE + past expiry            → EXPIRED   (the month ran out)
  //   ACTIVE + every lesson COMPLETED → COMPLETED (the package was delivered)
  //
  // A package whose lessons are all BOOKED but not yet taught stays ACTIVE —
  // that is still work in progress, and calling it complete would tell the
  // teacher they are done when they have eight lessons left to teach.
  let enrollmentsExpired = 0
  let enrollmentsCompleted = 0
  try {
    const expired = await prisma.enrollment.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    })
    enrollmentsExpired = expired.count

    // Fully-delivered ones: all credits spent AND no lesson still outstanding.
    const candidates = await prisma.enrollment.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, lessonsTotal: true, lessonsUsed: true },
      take: 500,
    })
    for (const e of candidates) {
      if (e.lessonsUsed < e.lessonsTotal) continue
      const outstanding = await prisma.booking.count({
        where: { enrollmentId: e.id, status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] } },
      })
      if (outstanding > 0) continue
      // CLAIM the row, don't just write it. The status was read at the top of
      // this loop and the loop awaits a COUNT per candidate, so the gap is real
      // — long enough for the expiry sweep above (or a second sweep runner) to
      // move the same row to EXPIRED, which this would then overwrite with
      // COMPLETED. `count !== 1` means somebody else got there first.
      const claim = await prisma.enrollment.updateMany({
        where: { id: e.id, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      })
      if (claim.count !== 1) continue
      enrollmentsCompleted++
    }
  } catch { /* best-effort, like every other step here */ }

  // ── The requests subsystem's own background work ──────────────────────
  // Four jobs, all of them messages or sweeping: re-mail an unanswered
  // request (once, widened past the sphere that stayed silent), remind a
  // client sitting on unchosen offers (once), and close what has gone stale.
  // ⚠️ Nothing here verifies, accepts or opens a contact — those three stay
  // human, and the admin's phone call is the quality gate this platform is
  // built on. See lib/requestJobs for the whole argument.
  //
  // Gated on the flag so a deployment with the subsystem off does no work and
  // touches no table; wrapped because a requests failure must never cost the
  // booking cleanup its tick.
  const requestJobs = requestsOn()
    ? await runRequestJobs(now.getTime()).catch(() => ({ providerNudges: 0, clientNudges: 0, autoClosed: 0 }))
    : null

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
      rescheduleRestored,
      autoCompleted,
      remindersSent,
    },
    emailReminders,
    messageReminders,
    availabilityTopUp,
    postSession,
    expertEscalations,
    expertActivation,
    eventsPruned,
    enrollments: { expired: enrollmentsExpired, completed: enrollmentsCompleted },
    requests: requestJobs,
    at: now.toISOString(),
  })
}

// GET dual-purpose: if `?secret=<CLEANUP_SECRET>` matches, run the cleanup
// (convenience for cron systems that can only ping GET URLs, e.g. Railway UI
// cron). Otherwise return a self-doc JSON.
export async function GET(req: Request) {
  const expected = process.env.CLEANUP_SECRET

  // Actual cleanup path — header preferred, legacy `?secret=` still honoured
  // here (and ONLY here) so the live Railway cron keeps working.
  if (cronAuth(req, { allowQuery: true }).ok) {
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
    methods: ['POST (Bearer) — preferred', 'GET ?secret=… — legacy, being retired'],
    auth: 'Authorization: Bearer <CLEANUP_SECRET>',
    configured,
    actions: [
      'Delete expired Session rows',
      'Delete consumed/expired OtpCode rows',
      'Delete consumed/expired PasswordResetToken rows',
      `Prune "Event" analytics rows older than ${EVENT_RETENTION_DAYS} days`,
      `Cancel PREPARING bookings unanswered for ${PREPARING_TTL_HOURS}h OR past their startAt + free their held slot`,
      `Restore a previously-CONFIRMED booking whose reschedule proposal went stale (>${RESCHEDULE_PROPOSAL_TTL_HOURS}h or past) and whose original startAt is still ahead`,
      `Auto-complete CONFIRMED/LIVE bookings past (startAt + duration + ${AUTO_COMPLETE_GRACE_HOURS}h) — refunded + disputed bookings excluded`,
      'Send BOOKING_REMINDER (24h + 1h before start) to both parties of CONFIRMED bookings — run every 15–30 min for reliable 1h reminders',
      'Nudge the client to review a completed, unreviewed session ~3h after it ended (auto-completed / disputed excluded) — one in-app notification + one email, plus a rebook invite when they have nothing booked with that expert',
      `Escalate an unanswered PREPARING request to the EXPERT at ${ESCALATION_STAGES.map(s => `${s.hoursLeft}h`).join(' and ')} before it auto-cancels — in-app + email, exactly once per stage, never for an answered/reschedule-pending/past-start request`,
    ],
    // HEARTBEAT. The whole sweep was silently dark for days because a „Completed"
    // cron proved nothing — it never carried a valid secret and this very page is
    // what it kept receiving. `lastRunAt` makes that impossible to miss: if it is
    // null or hours old, nothing is running, whatever the cron dashboard claims.
    lastRunAt: await lastSweepRunAt(),
    hint: configured
      ? 'Ping this endpoint every 15 min — POST with an Authorization: Bearer header. Traffic also self-triggers it (lib/sweepRunner); check lastRunAt above before trusting any cron status.'
      : 'CLEANUP_SECRET is NOT set — endpoint is disabled. Set it in Railway env to enable.',
  })
}
