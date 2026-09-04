import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyMany } from '@/lib/notify'
import { pruneEvents, EVENT_RETENTION_DAYS } from '@/lib/events'
import { cronAuth } from '@/lib/cronAuth'
import { requestsOn, PROVIDER_ROUTE, topicLabel } from '@/lib/requests'
import { runRequestJobs } from '@/lib/requestJobs'
import { runOfferLifecycleJobs, DONE_REMINDER_DAYS, DONE_CLOSE_DAYS } from '@/lib/offerLifecycle'
import { runCreditJobs } from '@/lib/creditsServer'
import { sendMail } from '@/lib/mailer'
import { refreshDeliveries } from '@/lib/messageLog'
import { offerDoneReminderClientEmail } from '@/lib/emailTemplates'
import { lastSweepRunAt } from '@/lib/sweepRunner'

// THE MAINTENANCE SWEEP — everything recurring, in one endpoint.
//
// ⚠️ IT WAS 733 LINES AND MOST OF THEM WERE BOOKINGS (2026-08-24). Nine of its
// thirteen jobs described the consultation product and went with it:
//
//   · PREPARING → CANCELED after 24h, freeing the held availability slot
//   · a stale reschedule proposal → the booking restored to its original time
//   · CONFIRMED/LIVE → COMPLETED 48h after the session ended, bumping
//     `TutorProfile.sessionsCount`
//   · BOOKING_REMINDER at 24h and 1h, in-app and by mail
//   · the post-session review nudge
//   · the expert escalation ladder (12h / 3h before auto-cancel)
//   · the expert ACTIVATION nudges („no service, or no free times")
//   · the rolling availability horizon (top-up 8 weeks ahead)
//   · Enrollment ACTIVE → EXPIRED / COMPLETED
//
// What is left is what still has a clock on it: the auth artefacts, the
// notification and event retention, and the three request-side jobs.
//
// Auth: see lib/cronAuth. Prefer `Authorization: Bearer <CLEANUP_SECRET>`; the
// `?secret=` query form still works on GET only, for the live cron, and is
// being retired (a secret in a URL lands in access logs). lib/cronAuth records
// what the crashed `cleanup-cron` service turned out NOT to be, and carries the
// operator steps that do fix it.
//
// Recommended schedule: every 15 minutes. Nothing here needs a tick inside a
// particular hour any more, so any cadence is tolerable — but the heartbeat
// (`lastRunAt`) is only as fresh as the last ping.
//
// Railway cron setup:
//   1. Set env CLEANUP_SECRET=<random 32+ char string> in Variables
//   2. Dashboard → Service → Cron → add job:
//        Schedule: every 15 minutes (`0,15,30,45 * * * *`)
//        Command:  sh -c 'curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_SECRET" \
//                    https://mcodne.ge/api/internal/cleanup'
//
//      ⚠️ `sh -c` IS LOAD-BEARING and this recipe used to omit it, which is how
//      the cron came to spend days returning 401. `curlimages/curl` runs `curl`
//      as its ENTRYPOINT, so without a shell nothing expands `$CLEANUP_SECRET`
//      and the literal 15 characters go on the wire. Keep `-f` too: without it
//      curl exits 0 on a 401 and Railway reports „Completed" while the sweep
//      never ran. See lib/cronAuth for the measurements.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = cronAuth(req)
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  const now = new Date()

  // ── Auth-artefact deletes ─────────────────────────────────────────────
  const notifCutoff = new Date(now.getTime() - 120 * 24 * 3600_000) // 120 days
  const [sessions, otps, phoneOtps, resets, notifs] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.otpCode.deleteMany({
      where: { OR: [{ consumed: true }, { expiresAt: { lt: now } }] },
    }),
    /* ⚠️ `expiresAt` ALONE, AND NOT `consumed` (2026-09-04). A PhoneOtp row is
       consumed the moment the code is answered — and then goes on living for
       another 15 minutes as the TICKET that lets the person type their name
       (lib/phoneAuth). Deleting on `consumed` the way the row above does would
       throw that proof away mid-registration and refuse them with
       „TICKET_EXPIRED" while they were still typing. The clock covers both:
       `expiresAt` is extended to the ticket window on consumption. */
    prisma.phoneOtp.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ consumed: true }, { expiresAt: { lt: now } }] },
    }),
    // Prune old READ notifications so the table (one row per message / offer
    // event / broadcast) does not grow unbounded and slow the dedupe scans.
    prisma.notification.deleteMany({ where: { readAt: { not: null }, createdAt: { lt: notifCutoff } } }),
  ])

  // Event retention. „Event" is append-only and every browse search writes a
  // row, so it grows without bound unless something trims it — and lib/events
  // names THIS sweep as the owner (it is the one place recurring deletes live).
  // Index-backed, idempotent, and guarded like everything else here.
  let eventsPruned = 0
  try { eventsPruned = await pruneEvents() } catch { /* best-effort */ }

  // ── Did the texts we sent actually arrive? ─────────────────────────────
  // sender.ge's 200 only means it accepted the message; callback.php is the
  // carrier's answer (lib/sms → deliveryStatus). Without this tick the log can
  // claim „გაიგზავნა" for a text that never rang a phone.
  let deliveries = { checked: 0, settled: 0 }
  try { deliveries = await refreshDeliveries() } catch { /* best-effort */ }

  // ── The requests subsystem's own jobs ──────────────────────────────────
  // Re-route a request nobody answered (once, widened past the sphere that
  // stayed silent), remind a client sitting on unchosen offers (once), and
  // close what has gone stale.
  // ⚠️ Nothing here verifies, accepts or opens a contact — those three stay
  // human, and the admin's phone call is the quality gate this platform is
  // built on. See lib/requestJobs for the whole argument.
  //
  // Gated on the flag so a deployment with the subsystem off does no work and
  // touches no table; wrapped because one failing job must never cost the
  // others their tick.
  const requestJobs = requestsOn()
    ? await runRequestJobs(now.getTime()).catch(() => ({ providerNudges: 0, clientNudges: 0, autoClosed: 0 }))
    : null

  // ── After the choice: „დასრულდა?" (lib/offerLifecycle) ──────────────────
  // Two phases, both claim-style: an ACCEPTED offer nobody marked done for
  // DONE_REMINDER_DAYS gets ONE reminder — the client by mail, the provider by
  // bell — claimed by the OfferEvent 'REMINDED' row; at DONE_CLOSE_DAYS the
  // offer is closed silently (`closedAt`). Same flag, same wrapping.
  const offerJobs = requestsOn()
    ? await runOfferLifecycleJobs(now.getTime(), {
        remindClient: async o => {
          await sendMail({ key: 'request.doneReminder.client', to: o.email, ...(await offerDoneReminderClientEmail({ publicRef: o.publicRef, topicLabel: topicLabel(o.topic) })) })
        },
        remindProvider: async (ids, o) => {
          await notifyMany(ids, {
            type: 'REQUEST_DONE',
            title: 'დასრულდა სამუშაო?',
            // The topic, never the reference — a provider bell never carries
            // the client's credential.
            body: topicLabel(o.topic),
            href: `${PROVIDER_ROUTE}/offers`,
          })
        },
      }).catch(() => ({ reminded: 0, closed: 0 }))
    : null

  // ── The balance's earn-back, swept ─────────────────────────────────────
  //
  // The backstop under the 25₾ the „დასრულდა“ route pays inline — a reward
  // nobody sees for fifteen minutes is not a reward, but a request that crashed
  // between the stamp and the grant must not cost a provider the payment. Both
  // writers use the same `grantKey`, so whichever arrives second writes nothing;
  // the sweep re-derives „was this finished job paid for" from `doneAt` and the
  // ledger rather than from any event, so nothing can be lost.
  const creditJobs = requestsOn()
    ? await runCreditJobs(now.getTime()).catch(() => ({ jobsPaid: 0 }))
    : null

  return NextResponse.json({
    ok: true,
    deleted: {
      sessions: sessions.count,
      otpCodes: otps.count,
      phoneOtps: phoneOtps.count,
      passwordResetTokens: resets.count,
      notifications: notifs.count,
    },
    eventsPruned,
    deliveries,
    requests: requestJobs,
    offers: offerJobs,
    // The only place an operator can see the earn-back is alive.
    credits: creditJobs,
    at: now.toISOString(),
  })
}

// GET dual-purpose: if `?secret=<CLEANUP_SECRET>` matches, run the cleanup
// (convenience for cron systems that can only ping GET URLs, e.g. the Railway
// UI cron). Otherwise return a self-doc JSON.
export async function GET(req: Request) {
  const expected = process.env.CLEANUP_SECRET

  // Actual cleanup path — header preferred, legacy `?secret=` still honoured
  // here (and ONLY here) so the live Railway cron keeps working.
  if (cronAuth(req, { allowQuery: true }).ok) {
    // Reconstruct a POST-shaped Request and defer to the POST handler so we do
    // not duplicate the whole cleanup block.
    return POST(new Request(req.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${expected}` },
    }))
  }

  const configured = !!expected

  // ⚠️ THE SELF-DOC IS FOR THE OPERATOR, AND THE OPERATOR HAS THE SECRET
  // (2026-08-21). The `cronAuth` branch above is taken only on success, so
  // everything below used to answer ANY anonymous GET with 200: the internal
  // jobs by name, the retention windows, and — the part that is genuinely
  // operational — `lastRunAt`, the heartbeat that says whether the sweep is
  // alive. That is a free status page for the platform's background work,
  // published at a guessable URL.
  //
  // WHEN THE SECRET IS NOT SET the body stays open on purpose: nothing is
  // running, there is no heartbeat to leak, and this page is how a developer
  // discovers that `CLEANUP_SECRET` is what turns the sweep on.
  if (configured) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    endpoint: '/api/internal/cleanup',
    methods: ['POST (Bearer) — preferred', 'GET ?secret=… — legacy, being retired'],
    auth: 'Authorization: Bearer <CLEANUP_SECRET>',
    configured,
    actions: [
      'Delete expired Session rows',
      'Delete consumed/expired OtpCode rows',
      'Delete expired PhoneOtp rows (the phone-registration code, and the ticket it becomes)',
      'Delete consumed/expired PasswordResetToken rows',
      'Prune READ notifications older than 120 days',
      `Prune "Event" analytics rows older than ${EVENT_RETENTION_DAYS} days`,
      'Requests: re-route an unanswered request once, nudge a client sitting on offers once, close what went stale',
      `Requests: remind ONCE about an ACCEPTED offer nobody marked done after ${DONE_REMINDER_DAYS} days (client by email, provider by bell), and close it silently at ${DONE_CLOSE_DAYS} days`,
      'Requests: pay the finished-job grant the „დასრულდა“ route may have missed',
    ],
    // HEARTBEAT. The whole sweep was silently dark for days because a
    // „Completed" cron proved nothing — it never carried a valid secret and
    // this very page is what it kept receiving. `lastRunAt` makes that
    // impossible to miss: if it is null or hours old, nothing is running,
    // whatever the cron dashboard claims.
    lastRunAt: await lastSweepRunAt(),
    hint: configured
      ? 'Ping this endpoint every 15 min — POST with an Authorization: Bearer header. Traffic also self-triggers it (lib/sweepRunner); check lastRunAt above before trusting any cron status.'
      : 'CLEANUP_SECRET is NOT set — endpoint is disabled. Set it in Railway env to enable.',
  })
}
