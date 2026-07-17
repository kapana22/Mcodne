import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { buildProfileChecks, profilePercent } from '@/lib/profileScore'

// Lightweight counts for the workspace sidebar badges. Polled every 60s by
// useNavBadges — keep this to cheap count queries only (the heavier
// /api/messages threads mode and /api/tutor/bookings list stay off the
// nav-badge polling path).

export async function GET() {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const profile = await prisma.tutorProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      headline: true,
      bio: true,
      specialty: true,
      price: true,
      languages: true,
      _count: { select: { certificates: true, education: true, experience: true } },
    },
  })
  if (!profile) {
    return NextResponse.json({ ok: true, requests: 0, messages: 0, reschedules: 0, profilePercent: 0 })
  }

  const [requests, messages, reschedRows] = await Promise.all([
    prisma.booking.count({ where: { tutorId: profile.id, status: 'PREPARING' } }),
    prisma.message.count({ where: { toId: user.id, readAt: null } }),
    // rescheduleRequest is a dbBoot-added JSONB column Prisma can't select —
    // raw SQL, same as app/api/bookings/[id]/route.ts.
    prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM "Booking"
       WHERE "tutorId" = $1
         AND status IN ('PREPARING', 'CONFIRMED')
         AND "rescheduleRequest" IS NOT NULL
         AND "rescheduleRequest"->>'proposedBy' = 'STUDENT'`,
      profile.id,
    ).catch(() => [{ count: 0 }]),
  ])

  const percent = profilePercent(buildProfileChecks(
    profile,
    profile._count.certificates,
    profile._count.education,
    profile._count.experience,
    user.avatarUrl,
  ))

  return NextResponse.json({
    ok: true,
    requests,
    messages,
    reschedules: reschedRows?.[0]?.count ?? 0,
    profilePercent: percent,
  })
}
