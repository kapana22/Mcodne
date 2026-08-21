import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { avatarSrc } from '@/lib/avatarSrc'
import { BOOKING_REVENUE_ONLY } from '@/lib/packages'
import { ROLE } from '@/lib/roles'

export async function GET() {
  const auth = await requireRoleApi([ROLE.PROVIDER, ROLE.ADMIN])
  if (auth.response) return auth.response
  const user = auth.user
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return NextResponse.json({ profile: null, bookings: [], stats: null })

  const [bookings, upcoming, completed, revenueSum] = await Promise.all([
    prisma.booking.findMany({
      where: { tutorId: profile.id },
      orderBy: { startAt: 'desc' },
      take: 40,
      include: { student: { select: { id: true, fullName: true, avatarUrl: true } } },
    }),
    prisma.booking.count({ where: { tutorId: profile.id, status: { in: ['CONFIRMED', 'PREPARING'] } } }),
    prisma.booking.count({ where: { tutorId: profile.id, status: 'COMPLETED' } }),
    // BOOKING_REVENUE_ONLY, like every money sum over bookings: a package
    // lesson's price is a share of the lump already taken at the Enrollment.
    // /api/tutor/earnings is the screen that reports earnings properly (it adds
    // the Enrollment back); this figure must at least not contradict it.
    prisma.booking.aggregate({ _sum: { price: true }, where: { tutorId: profile.id, status: 'COMPLETED', ...BOOKING_REVENUE_ONLY } }),
  ])

  // rescheduleRequest is a dbBoot-added JSONB column Prisma can't select —
  // merge it via one raw query (same pattern as app/api/bookings/[id]/route.ts)
  // so the dashboard/bookings list can surface pending reschedule decisions.
  //
  // `proposedByStudent` rides along in the SAME query — it is the other dbBoot
  // column the expert's list needs. Without it a request-based booking shows up
  // as an ordinary one at a time the expert never published, which reads as a
  // calendar bug rather than as someone asking.
  let reschedById = new Map<string, unknown>()
  let proposedIds = new Set<string>()
  if (bookings.length > 0) {
    try {
      const ids = bookings.map(b => b.id)
      const rows = await prisma.$queryRawUnsafe<{ id: string; rescheduleRequest: unknown; proposedByStudent: boolean }[]>(
        `SELECT id, "rescheduleRequest", "proposedByStudent" FROM "Booking" WHERE id = ANY($1)`,
        ids,
      )
      reschedById = new Map(rows.filter(r => r.rescheduleRequest != null).map(r => [r.id, r.rescheduleRequest]))
      proposedIds = new Set(rows.filter(r => r.proposedByStudent).map(r => r.id))
    } catch { /* column may not exist yet on a fresh DB — omit silently */ }
  }

  return NextResponse.json({
    profile,
    // `student.avatarUrl` is a base64 `data:` webp (~32 KB encoded) and this
    // list carries 40 of them — shipped raw it is over a megabyte of the expert
    // dashboard's payload, re-sent whole on every poll and cacheable by nothing.
    // `avatarSrc` swaps each for `/api/avatars/<id>?v=`. Never pass the stored
    // value through — see lib/avatarSrc.
    bookings: bookings.map(b => ({
      ...b,
      rescheduleRequest: reschedById.get(b.id) ?? null,
      proposedByStudent: proposedIds.has(b.id),
      student: { ...b.student, avatarUrl: avatarSrc(b.student.id, b.student.avatarUrl) },
    })),
    stats: {
      upcoming,
      completed,
      revenue: (revenueSum as any)._sum?.price ?? 0,
    },
  })
}
