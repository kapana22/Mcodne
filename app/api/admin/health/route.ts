import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { hasFutureWindow } from '@/lib/bookability'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { lastSweepRun, SWEEP_STALE_MIN } from '@/lib/sweepRunner'
import { getIntegrations } from '@/lib/integrations'

// System health for the admin „სისტემა" tab.
//
// WHY IT EXISTS: the Railway cleanup cron reported „Completed" every 15 minutes
// for days while the maintenance sweep never actually ran (it requested the
// endpoint without a valid secret, got the self-doc page, and curl exited 0).
// Session reminders, message reminders, review nudges, stale-booking cleanup and
// auto-complete were ALL dark, and a real confirmed session went by with neither
// party reminded. Nothing surfaced it. This endpoint is the thing that surfaces it.
//
// Secrets are never returned — only whether they are SET.
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 3600_000)

  const [
    sweep,
    integrations,
    trgm,
    pendingApps,
    preparingBookings,
    openDisputes,
    upcoming24h,
    liveExperts,
    expertsWithFutureWindow,
    expertsWithoutService,
  ] = await Promise.all([
    lastSweepRun(),
    getIntegrations().catch(() => ({ gaId: '' } as any)),
    // pg_trgm powers Georgian-aware search. Without it the code silently falls
    // back to substring matching, which misses every declined form — a quiet
    // quality regression with no error anywhere.
    prisma
      .$queryRawUnsafe<Array<{ installed: boolean }>>(
        `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS installed`,
      )
      .then(r => Boolean(r[0]?.installed))
      .catch(() => false),
    prisma.tutorApplication.count({ where: { status: 'SUBMITTED' } }),
    prisma.booking.count({ where: { status: 'PREPARING' } }),
    prisma.dispute.count({ where: { resolvedAt: null } }).catch(() => 0),
    prisma.booking.count({ where: { status: 'CONFIRMED', startAt: { gt: now, lte: in24h } } }),
    // Publicly bookable experts = the same visibility rule lib/tutorsQuery uses.
    prisma.tutorProfile.count({
      where: { available: true, user: { suspendedAt: null }, category: { is: { isLive: true } } },
    }),
    // …of those, how many actually have a future availability WINDOW. An expert
    // with none cannot be booked at all, which is the single most common reason
    // the marketplace looks alive but sells nothing.
    prisma.tutorProfile
      .count({
        where: {
          available: true,
          user: { suspendedAt: null },
          category: { is: { isLive: true } },
          availability: hasFutureWindow(now),
        },
      })
      .catch(() => 0),
    // …and how many have no SERVICE at all. A different blocker with a
    // different fix: free times are worthless until there is something to sell,
    // and unlike the windows case this one now hides the expert from browse
    // outright (lib/tutorsQuery), so the admin panel is the only place it
    // surfaces. lib/expertActivation emails both groups.
    prisma.tutorProfile
      .count({
        where: {
          available: true,
          user: { suspendedAt: null },
          consultations: { none: {} },
        },
      })
      .catch(() => 0),
  ])

  const envGaId = process.env.NEXT_PUBLIC_GA_ID || ''
  const dbGaId = (integrations as any)?.gaId || ''

  return NextResponse.json({
    sweep: {
      ...sweep,
      staleAfterMin: SWEEP_STALE_MIN,
    },
    config: {
      paymentsLive: PAYMENTS_LIVE,
      cleanupSecretSet: !!process.env.CLEANUP_SECRET,
      mailerMode: process.env.MAILER_MODE || 'log',
      mailFrom: process.env.MAIL_FROM || '(unset)',
      // The admin „ამოშლა" button clears the DB row but CANNOT clear the env
      // fallback — the panel has to say so or the badge lies.
      gaFromDb: !!dbGaId,
      gaFromEnv: !!envGaId,
      trgmInstalled: trgm,
      timezone: process.env.TZ || '(unset)',
    },
    attention: {
      expertsWithoutAvailability: Math.max(0, liveExperts - expertsWithFutureWindow),
      expertsWithoutService,
      liveExperts,
      pendingApplications: pendingApps,
      bookingsAwaitingExpert: preparingBookings,
      openDisputes,
      sessionsNext24h: upcoming24h,
    },
  })
}
