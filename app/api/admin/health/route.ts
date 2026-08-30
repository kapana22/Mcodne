import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
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

  // ⚠️ THE BOOKING HALF OF THIS ANSWER IS GONE (2026-08-24), and it was most of
  // it: sessions in the next 24 hours, bookings awaiting an expert, open
  // disputes, and the two „why does this marketplace look alive and sell
  // nothing" counts (no future availability window, no consultation). All five
  // described a product that no longer exists. What replaces them is the same
  // question asked of the one that does: a provider who is listed but has
  // nothing listed cannot be routed to.
  const [
    sweep,
    integrations,
    trgm,
    pendingApps,
    liveProviders,
    providersWithoutService,
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
    prisma.masterApplication.count({ where: { status: 'SUBMITTED' } }),
    // Publicly listed providers = the catalogue's own visibility rule.
    prisma.serviceProfile.count({
      where: { available: true, published: true, user: { suspendedAt: null } },
    }),
    // …of those, how many list NOTHING. They are invisible to routing and their
    // card has no offer on it, which is the most common reason the marketplace
    // looks alive and sells nothing.
    prisma.serviceProfile
      .count({
        where: {
          available: true,
          published: true,
          user: { suspendedAt: null },
          services: { isEmpty: true },
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
      providersWithoutService,
      liveProviders,
      pendingApplications: pendingApps,
    },
  })
}
