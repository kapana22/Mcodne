import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify, notifyMany } from '@/lib/notify'

const Body = z.object({
  bookingId: z.string(),
  reason: z.enum(['NO_SHOW', 'QUALITY', 'WRONG_TOPIC', 'UNPROFESSIONAL', 'TECHNICAL', 'OTHER']),
  details: z.string().max(2000).optional(),
  requested: z.enum(['REFUND_FULL', 'REFUND_PARTIAL', 'REDO_FREE', 'DISMISSED']).optional(),
})

// Student files a dispute against a booking. One dispute per booking.
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // Only the student on the booking can file the dispute.
  const booking = await prisma.booking.findFirst({
    where: { id: parsed.data.bookingId, studentId: user.id },
    include: { tutor: { select: { userId: true } } },
  })
  if (!booking) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  // A dispute only makes sense once the session has actually happened (or was
  // flagged no-show). Reject disputes on bookings that never occurred —
  // PREPARING/CANCELED — matching the review-eligibility rules.
  //
  // EXCEPTION — client-reported expert no-show: only the tutor could flag
  // no_show before, so a student stood up by an expert had no recourse. A
  // NO_SHOW dispute is allowed on a still-CONFIRMED/LIVE booking once 15 min
  // have passed since the scheduled start (grace so nobody files at :01).
  // The booking status is NOT touched — admins resolve the dispute and can
  // cancel/refund from the dashboard.
  const NO_SHOW_GRACE_MS = 15 * 60_000
  const isClientNoShowReport =
    parsed.data.reason === 'NO_SHOW' &&
    (booking.status === 'CONFIRMED' || booking.status === 'LIVE') &&
    Date.now() > booking.startAt.getTime() + NO_SHOW_GRACE_MS
  if (booking.status !== 'COMPLETED' && booking.status !== 'NO_SHOW' && !isClientNoShowReport) {
    return NextResponse.json({ ok: false, error: 'NOT_DISPUTABLE' }, { status: 400 })
  }

  const existing = await prisma.dispute.findUnique({ where: { bookingId: booking.id } })
  if (existing) return NextResponse.json({ ok: false, error: 'ALREADY_EXISTS', id: existing.id }, { status: 409 })

  const dispute = await prisma.dispute.create({
    data: {
      bookingId: booking.id,
      studentId: booking.studentId,
      tutorId: booking.tutorId,
      reason: parsed.data.reason,
      details: parsed.data.details ?? null,
      requested: parsed.data.requested ?? 'PENDING',
    },
  })

  // Notify tutor (so they can respond in chat) + all admins (queue signal).
  await notify(booking.tutor.userId, {
    type: 'GENERIC',
    title: 'ჯავშანთან დაკავშირებული საჩივარი',
    body: `მოსწავლემ დააფიქსირა: ${parsed.data.reason}`,
    href: `/tutor/bookings/${booking.id}#chat`,
  })
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  await notifyMany(admins.map(a => a.id), {
    type: 'GENERIC',
    title: 'ახალი dispute',
    body: `#${booking.ref.slice(0, 8)} · ${parsed.data.reason}`,
    href: '/admin#disputes',
  })

  return NextResponse.json({ ok: true, id: dispute.id })
}
