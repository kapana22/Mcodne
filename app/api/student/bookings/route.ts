import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'

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
      // omit the heavy blobs at the DB level (not just post-query) so the
      // unbounded professionData JSON + legacy base64 videoUrl never cross the
      // DB→Node wire once per row (take:500). stripTutorBlobs still runs below
      // for the oversized-avatar guard.
      tutor: {
        omit: { professionData: true, videoUrl: true },
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
  // Up to 500 rows, each carrying the tutor's full profile — strip the heavy
  // blobs (professionData JSON, legacy base64 video/avatar) before shipping.
  return NextResponse.json(
    bookings.map(b => ({ ...b, tutor: stripTutorBlobs(b.tutor) })),
  )
}
