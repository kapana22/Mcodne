import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { audit } from '@/lib/audit'

const Body = z.object({
  outcome: z.enum(['REFUND_FULL', 'REFUND_PARTIAL', 'REDO_FREE', 'DISMISSED']),
  resolution: z.string().max(1000).optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireRole('ADMIN')
  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // Resolution comment is mandatory — it is pushed to both parties' notifications
  // and stored in the audit trail. UI enforces this too; server is the backstop.
  if (!parsed.data.resolution?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'REASON_REQUIRED', message: 'გადაწყვეტის კომენტარი სავალდებულოა' },
      { status: 400 },
    )
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: { booking: { include: { tutor: { select: { userId: true } } } } },
  })
  if (!dispute) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const updated = await prisma.dispute.update({
    where: { id },
    data: {
      outcome: parsed.data.outcome,
      resolution: parsed.data.resolution ?? null,
      resolvedAt: new Date(),
      resolvedBy: admin.id,
    },
  })

  // If refund → mark booking payout as REFUNDED for accounting truth
  if (parsed.data.outcome === 'REFUND_FULL' || parsed.data.outcome === 'REFUND_PARTIAL') {
    await prisma.booking.update({
      where: { id: dispute.bookingId },
      data: { payoutStatus: 'REFUNDED' },
    })
  }

  const outcomeLabel =
    parsed.data.outcome === 'REFUND_FULL' ? '100% ფულის დაბრუნება' :
    parsed.data.outcome === 'REFUND_PARTIAL' ? '50% ფულის დაბრუნება' :
    parsed.data.outcome === 'REDO_FREE' ? 'უფასო ხელახლა სესია' :
    'გადაწყდა (Dismissed)'
  await notify(dispute.studentId, {
    type: 'GENERIC',
    title: 'შენი საჩივარი განიხილა',
    body: outcomeLabel + (parsed.data.resolution ? ` — ${parsed.data.resolution}` : ''),
    href: `/student/bookings/${dispute.bookingId}`,
  })
  await notify(dispute.booking.tutor.userId, {
    type: 'GENERIC',
    title: 'Dispute გადაწყდა',
    body: outcomeLabel,
    href: `/tutor/bookings/${dispute.bookingId}`,
  })

  await audit(admin.id, 'dispute.resolve', {
    targetType: 'Dispute',
    targetId: id,
    meta: { outcome: parsed.data.outcome, resolution: parsed.data.resolution, bookingId: dispute.bookingId },
  })

  return NextResponse.json({ ok: true, dispute: updated })
}
