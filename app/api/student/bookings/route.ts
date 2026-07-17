import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bookings = await prisma.booking.findMany({
    where: { studentId: user.id },
    orderBy: { startAt: 'desc' },
    // The dashboard derives ALL summary counters AND list badges from this one
    // response, so this cap also bounds the lifetime "completed / total hours"
    // tally. 500 sits far above any realistic near-term per-student volume, so
    // the previous take:100 silently undercutting those totals can't recur.
    // Move to a server-side aggregate before a student can plausibly exceed it.
    take: 500,
    include: {
      // Narrow user select so we never ship passwordHash / phone / email.
      tutor: {
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, slug: true, name: true } },
        },
      },
      consultation: true,
      // Needed so the dashboard can tell a reviewed session from one still
      // awaiting a rating (otherwise the "awaiting review" badge never clears).
      review: { select: { id: true, rating: true } },
    },
  })
  return NextResponse.json(bookings)
}
