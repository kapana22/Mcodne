import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { stripTutorBlobs, stripAvatar } from '@/lib/stripTutorBlobs'

// List disputes with optional status filter. Includes booking + student +
// tutor names so the admin table doesn't need N+1 lookups.
export async function GET(req: Request) {
  await requireRole('ADMIN')
  const { searchParams } = new URL(req.url)
  const outcome = searchParams.get('outcome')
  const validOutcomes = ['PENDING', 'REFUND_FULL', 'REFUND_PARTIAL', 'REDO_FREE', 'DISMISSED']
  const where: any = {}
  if (outcome && validOutcomes.includes(outcome)) where.outcome = outcome

  const items = await prisma.dispute.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      booking: {
        select: {
          id: true, ref: true, topic: true, startAt: true, price: true, status: true,
          student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          tutor: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
        },
      },
    },
  })
  return NextResponse.json(
    items.map(d => ({
      ...d,
      booking: d.booking
        ? { ...d.booking, tutor: stripTutorBlobs(d.booking.tutor), student: stripAvatar(d.booking.student) }
        : d.booking,
    })),
  )
}
