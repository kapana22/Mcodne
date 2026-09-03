// THE PANEL'S HEADLINE NUMBERS — one request, every badge.
//
// ⚠️ THE MONEY AND THE SESSIONS ARE GONE (2026-08-24). This used to answer with
// bookings, completed bookings, sessions live right now, and revenue summed
// across two tables under a documented exclusion rule. All four described the
// consultation product, which was removed; nothing here invents a replacement,
// because the requests side's money is a ledger of CREDITS spent on offers
// (lib/credits) and that is a different question this endpoint has never asked.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { requestsFeatureExists, providersFeatureExists } from '@/lib/requests'
import { ROLE } from '@/lib/roles'

export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  await ensureDbReady().catch(() => {})
  // ⚠️ THE THREE „ATTENTION" NUMBERS BELOW EXIST BECAUSE OF WHAT HAPPENED ON
  // 2026-08-24–26 (added 2026-08-26). `routableProviders()` threw for two days,
  // so every verified request was mailed to NOBODY — and the panel showed a
  // green queue the whole time, because „verified" is a status and the failure
  // was in what happens after it. A request that is verified and has no offers
  // is the one shape that looks fine on every screen and is broken; measured
  // that morning it was 1 of 1. Counted, never inferred.
  const DAY_AGO = new Date(Date.now() - 24 * 3600 * 1000)
  const [users, providers, clients, pendingApps, helpOpen, newRequests,
         awaitingOffers, stalled24h, offersSent, offersAccepted] = await Promise.all([
    prisma.user.count(),
    // Profiles, not roles. A provider is somebody with a ServiceProfile; the
    // role decides what else they may do.
    prisma.serviceProfile.count(),
    prisma.user.count({ where: { role: ROLE.USER } }),
    // The ONE application queue. `.catch(() => 0)` and the flag for the same
    // reason as the two below: a badge is never worth 500-ing the whole admin
    // shell over, and every other number on the panel would go down with it.
    providersFeatureExists()
      ? prisma.providerApplication.count({ where: { status: 'SUBMITTED' } }).catch(() => 0)
      : Promise.resolve(0),
    // The help-chat badge rides along here rather than on its own request. It
    // used to be a separate `/api/admin/help?days=7` call fired from the shell
    // on EVERY admin page load — seven SQL queries including a 100-row message
    // scan, to render one small number. This is one COUNT on an indexed column,
    // on a request the shell already makes.
    prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "HelpMessage" WHERE "status" = 'new'`,
    ).then(r => Number(r[0]?.n ?? 0)).catch(() => 0),
    // Unverified requests — a queue with a person waiting for a PHONE CALL at
    // the other end, and the whole feature dies if it goes unopened for a day.
    requestsFeatureExists()
      ? prisma.serviceRequest.count({ where: { status: 'NEW' } }).catch(() => 0)
      : Promise.resolve(0),
    // Verified, providers were told, and not one of them has written back.
    requestsFeatureExists()
      ? prisma.serviceRequest.count({ where: { status: 'VERIFIED', offerCount: 0 } }).catch(() => 0)
      : Promise.resolve(0),
    // The same, but old enough that „they are still reading it" has stopped
    // being the explanation.
    requestsFeatureExists()
      ? prisma.serviceRequest.count({ where: { status: 'VERIFIED', offerCount: 0, verifiedAt: { lte: DAY_AGO } } }).catch(() => 0)
      : Promise.resolve(0),
    // Two ends of one line: how many offers were written, how many were taken.
    //
    // ⚠️ `INVITED` IS NOT AN OFFER AND MUST NOT BE COUNTED AS ONE — the schema
    // says so in as many words („it holds no price, it does not consume a place
    // against offerLimit, it cannot be accepted"). It is the row that exists
    // because the CLIENT wrote first. A bare `count()` here would have reported
    // „1 offer sent" on 2026-08-26 when the true answer was zero, which is
    // exactly the kind of number this panel must never print.
    requestsFeatureExists()
      ? prisma.requestOffer.count({ where: { status: { not: 'INVITED' } } }).catch(() => 0)
      : Promise.resolve(0),
    requestsFeatureExists()
      ? prisma.requestOffer.count({ where: { status: 'ACCEPTED' } }).catch(() => 0)
      : Promise.resolve(0),
  ])
  return NextResponse.json({
    users,
    providers,
    clients,
    pendingApps,
    helpOpen,
    newRequests,
    // ⚠️ TWO NAMES, ONE NUMBER. There were two application queues until
    // 2026-08-24 — the consultation form and the service one — and two counts to
    // match. The overview tile still reads `pendingApps` and the nav badge still
    // reads `pendingProviders`; both are answered with the one queue that exists,
    // because leaving either undefined renders as „no applications waiting",
    // which is a lie the operator cannot see.
    pendingProviders: pendingApps,
    awaitingOffers,
    stalled24h,
    offersSent,
    offersAccepted,
  })
}
