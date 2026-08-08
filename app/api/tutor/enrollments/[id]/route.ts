import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { z } from 'zod'
import { notify } from '@/lib/notify'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { packagesFeatureExists, DEFAULT_VALID_DAYS } from '@/lib/packages'

// The teacher acts on one enrollment: accept (= mark paid, which starts the
// clock) or decline.
//
// ⚠️ „mark paid" is the ONE place on this platform where a person asserts, by
// hand, that money changed hands — because there is no gateway to assert it for
// them. It is therefore audited: who marked what, and when. Without that a
// dispute is unresolvable, and a package dispute is eight lessons' worth.

const Body = z.object({ action: z.enum(['accept', 'decline']) })

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi(['TUTOR', 'ADMIN'])
  if (auth.response) return auth.response
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const user = auth.user
  const { id } = await ctx.params

  const e = await prisma.enrollment.findUnique({
    where: { id },
    include: {
      tutor: { select: { userId: true } },
      package: { select: { validDays: true } },
    },
  })
  if (!e) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (e.tutor.userId !== user.id && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  if (e.status !== 'REQUESTED') {
    return NextResponse.json({ ok: false, error: 'NOT_PENDING', message: 'ეს მოთხოვნა უკვე დამუშავებულია.' }, { status: 409 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // ⚠️ THE STATUS CHECK ABOVE IS A COURTESY, NOT THE GUARD. It read the row
  // before this request did anything; a second click, a second tab, or an
  // accept racing a decline all pass it and then both write. The guard is the
  // conditional write below — `updateMany … where status: 'REQUESTED'` plus
  // `count !== 1`, which is the same claim-or-lose pattern the cancel route
  // uses (app/api/bookings/[id]/cancel). It matters more here than almost
  // anywhere else on the platform: a duplicate accept re-stamps `expiresAt`
  // (silently handing the client extra days) and writes a SECOND
  // „enrollment.markPaid" audit row — for a single payment, in the one place a
  // human asserts by hand that money changed hands.

  if (parsed.data.action === 'decline') {
    const claim = await prisma.enrollment.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { status: 'CANCELLED' },
    })
    if (claim.count !== 1) {
      return NextResponse.json({ ok: false, error: 'NOT_PENDING', message: 'ეს მოთხოვნა უკვე დამუშავებულია.' }, { status: 409 })
    }
    await audit(user.id, 'enrollment.decline', { targetType: 'Enrollment', targetId: id })
    return NextResponse.json({ ok: true, item: { id, status: 'CANCELLED' } })
  }

  // Accept = paid. The clock starts NOW, not at request time: the client should
  // not lose days to however long the teacher took to answer.
  const now = new Date()
  const days = e.package?.validDays ?? DEFAULT_VALID_DAYS
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  const claim = await prisma.enrollment.updateMany({
    where: { id, status: 'REQUESTED' },
    data: { status: 'ACTIVE', paidAt: now, startsAt: now, expiresAt },
  })
  if (claim.count !== 1) {
    return NextResponse.json({ ok: false, error: 'NOT_PENDING', message: 'ეს მოთხოვნა უკვე დამუშავებულია.' }, { status: 409 })
  }
  const updated = { id, status: 'ACTIVE' as const, paidAt: now, expiresAt, lessonsTotal: e.lessonsTotal }

  await audit(user.id, 'enrollment.markPaid', {
    targetType: 'Enrollment',
    targetId: id,
    // The amount is part of the claim being made, so it belongs in the record.
    meta: { priceTotal: e.priceTotal, lessonsTotal: e.lessonsTotal, studentId: e.studentId },
  })

  // Tell the client their credits are live — this is the moment they can start
  // booking, and nothing else on the site would tell them.
  after(async () => {
    await notify(e.studentId, {
      type: 'BOOKING_CREATED',
      title: 'პაკეტი აქტიურია',
      body: `${e.lessonsTotal} გაკვეთილი — დაგეგმე განრიგი`,
      href: '/student',
    }).catch(() => {})
  })

  return NextResponse.json({ ok: true, item: updated })
}
