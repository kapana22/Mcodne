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

  // Atomic first-resolution claim: only the write that flips resolvedAt from
  // null wins. A concurrent (or repeat) resolve sees count 0 → 409, so we never
  // re-notify both parties or overwrite an already-decided outcome.
  const claim = await prisma.dispute.updateMany({
    where: { id, resolvedAt: null },
    data: {
      outcome: parsed.data.outcome,
      resolution: parsed.data.resolution ?? null,
      resolvedAt: new Date(),
      resolvedBy: admin.id,
    },
  })
  if (claim.count !== 1) {
    return NextResponse.json({ ok: false, error: 'ALREADY_RESOLVED' }, { status: 409 })
  }

  // Land the booking in a TERMINAL state that matches the outcome, so accounting,
  // the public stats and the cleanup cron can never disagree with the decision.
  // Writing only payoutStatus used to leave a refunded booking CONFIRMED — the
  // cron's auto-complete then flipped it to COMPLETED/RELEASED 48h later and
  // bumped the expert's sessionsCount, silently reversing the refund:
  //   REFUND_FULL         → CANCELED  + REFUNDED (money back, session voided)
  //   REFUND_PARTIAL      → COMPLETED + REFUNDED (session stands, money partly back)
  //   REDO_FREE/DISMISSED → COMPLETED + RELEASED (expert keeps the payout)
  // An already CANCELED / NO_SHOW booking keeps its status (more specific than
  // anything we'd write) and its payoutStatus unless the outcome is a refund.
  // sessionsCount is deliberately NOT bumped here — a disputed session must not
  // inflate the expert's public „N სესია ჩატარებული" stat.
  const isRefund =
    parsed.data.outcome === 'REFUND_FULL' || parsed.data.outcome === 'REFUND_PARTIAL'
  const prevStatus = dispute.booking.status
  const alreadyTerminal = prevStatus === 'CANCELED' || prevStatus === 'NO_SHOW'
  const nextStatus = alreadyTerminal
    ? prevStatus
    : parsed.data.outcome === 'REFUND_FULL'
      ? 'CANCELED'
      : 'COMPLETED'
  await prisma.booking.update({
    where: { id: dispute.bookingId },
    data: {
      status: nextStatus,
      ...(isRefund
        ? { payoutStatus: 'REFUNDED' as const }
        : alreadyTerminal
          ? {}
          : { payoutStatus: 'RELEASED' as const }),
    },
  })

  const outcomeLabel =
    parsed.data.outcome === 'REFUND_FULL' ? '100% ფულის დაბრუნება' :
    parsed.data.outcome === 'REFUND_PARTIAL' ? '50% ფულის დაბრუნება' :
    parsed.data.outcome === 'REDO_FREE' ? 'უფასო ხელახლა სესია' :
    'საჩივარი არ დაკმაყოფილდა'
  await notify(dispute.studentId, {
    type: 'GENERIC',
    title: 'შენი საჩივარი განიხილულია',
    body: outcomeLabel + (parsed.data.resolution ? ` — ${parsed.data.resolution}` : ''),
    href: `/student/bookings/${dispute.bookingId}`,
  })
  await notify(dispute.booking.tutor.userId, {
    type: 'GENERIC',
    title: 'საჩივარი გადაწყდა',
    body: outcomeLabel,
    href: `/tutor/bookings/${dispute.bookingId}`,
  })

  await audit(admin.id, 'dispute.resolve', {
    targetType: 'Dispute',
    targetId: id,
    meta: {
      outcome: parsed.data.outcome,
      resolution: parsed.data.resolution,
      bookingId: dispute.bookingId,
      // The booking state the decision wrote — so the trail shows the money AND
      // the session outcome, not just the verdict.
      bookingStatusBefore: prevStatus,
      bookingStatusAfter: nextStatus,
      payoutStatus: isRefund ? 'REFUNDED' : alreadyTerminal ? null : 'RELEASED',
    },
  })

  return NextResponse.json({
    ok: true,
    dispute: {
      ...dispute,
      outcome: parsed.data.outcome,
      resolution: parsed.data.resolution ?? null,
      resolvedBy: admin.id,
    },
  })
}
