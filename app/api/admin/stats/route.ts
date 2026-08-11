import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { isBookingLive } from '@/lib/bookingLive'
import { ensureDbReady } from '@/lib/dbBoot'
import { b2bFeatureExists } from '@/lib/b2b'

export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  // Sessions that COULD be live now: CONFIRMED, starting within the last
  // 4h (>= max session length) so any still-running one is in range.
  const now = Date.now()
  const liveWindowStart = new Date(now - 240 * 60_000)
  await ensureDbReady().catch(() => {})
  const [users, tutors, students, bookings, pendingApps, completed, revenue, liveCandidates, helpOpen, b2bLeads] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'TUTOR' } }),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.booking.count(),
    prisma.tutorApplication.count({ where: { status: 'SUBMITTED' } }),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    prisma.booking.aggregate({ _sum: { price: true }, where: { status: 'COMPLETED' } }),
    prisma.booking.findMany({
      where: { status: { in: ['CONFIRMED', 'LIVE'] }, startAt: { gte: liveWindowStart, lte: new Date(now) } },
      select: { status: true, startAt: true, durationMin: true },
    }),
    // The help-chat badge rides along here rather than on its own request.
    // It used to be a separate `/api/admin/help?days=7` call fired from the
    // shell on EVERY admin page load — seven SQL queries including a 100-row
    // message scan, to render one small number. This is one COUNT on an
    // indexed column, on a request the shell already makes.
    prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "HelpMessage" WHERE "status" = 'new'`,
    ).then(r => Number(r[0]?.n ?? 0)).catch(() => 0),
    // Unanswered B2B enquiries, riding along for the same reason the help count
    // does: the shell already makes this request, and a queue with a person
    // waiting at the other end of it has to announce itself. Without this a
    // lead sat in a tab nobody opens until somebody thought to look.
    //
    // `.catch(() => 0)` because this table only exists once lib/dbBoot has run.
    // A B2B count is never worth 500-ing the whole admin shell over — every
    // other badge on the panel would go with it.
    b2bFeatureExists()
      ? prisma.businessLead.count({ where: { status: 'NEW' } }).catch(() => 0)
      : Promise.resolve(0),
  ])
  // Derived truth — the stored LIVE status is never written (see lib/bookingLive).
  const live = liveCandidates.filter(isBookingLive).length
  return NextResponse.json({
    users, tutors, students, bookings, pendingApps, completed, live, helpOpen, b2bLeads,
    revenue: (revenue as any)._sum?.price ?? 0,
  })
}
