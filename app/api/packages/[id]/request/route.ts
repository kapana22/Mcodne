import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notify'
import { getCurrentUser } from '@/lib/auth'
import { packagesFeatureExists, perLessonPrice } from '@/lib/packages'
import { packageFits } from '@/lib/packageFit'

// A client asks for a package. Creates an Enrollment in REQUESTED.
//
// WHY „REQUEST" AND NOT „BUY". There is no payment gateway (PAYMENTS_LIVE is
// false), so nothing can be charged here. The two settle offline and the
// teacher marks it paid, which is the same shape a Booking already has: created
// PREPARING, confirmed by the expert. When checkout ships, the gateway callback
// replaces the manual step and REQUESTED simply stops being reachable.
//
// EVERYTHING THE CLIENT AGREED TO IS SNAPSHOTTED onto the Enrollment. A later
// edit to the Package — or its deletion — must never rewrite a running deal.

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await ctx.params
  const pkg = await prisma.package.findUnique({
    where: { id },
    include: { tutor: { select: { id: true, userId: true, packagesEnabled: true, profileType: true } } },
  })
  if (!pkg || !pkg.active) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  // Both gates, server-side. The UI hides unsellable packages; this is what
  // makes hiding them true rather than cosmetic.
  if (pkg.tutor.profileType !== 'TEACHER' || !pkg.tutor.packagesEnabled) {
    return NextResponse.json({ ok: false, error: 'NOT_AVAILABLE' }, { status: 403 })
  }

  // Nobody buys from themselves — the same self-booking guard the booking route
  // applies, for the same reason.
  if (pkg.tutor.userId === me.id) {
    return NextResponse.json({ ok: false, error: 'SELF' }, { status: 400 })
  }

  // THE SCHEDULE GATE, enforced. Selling eight lessons a calendar cannot hold
  // is the failure this whole gate exists to prevent — see lib/packages.
  const fit = await packageFits(pkg.tutor.id, [pkg])
  if (!fit[pkg.id]?.fits) {
    return NextResponse.json(
      { ok: false, error: 'NO_CAPACITY', message: 'მასწავლებელს ამ პერიოდში საკმარისი თავისუფალი დრო არ აქვს.' },
      { status: 409 },
    )
  }

  // One live enrollment per client per package. A second REQUESTED row is not a
  // second purchase, it is the same person clicking twice.
  const existing = await prisma.enrollment.findFirst({
    where: { packageId: id, studentId: me.id, status: { in: ['REQUESTED', 'ACTIVE'] } },
    select: { id: true, status: true },
  })
  if (existing) return NextResponse.json({ ok: true, item: existing, already: true })

  const item = await prisma.enrollment.create({
    data: {
      packageId: pkg.id,
      studentId: me.id,
      tutorId: pkg.tutor.id,
      status: 'REQUESTED',
      // Snapshots — see the note at the top. Lesson LENGTH is one of them: it
      // is as much a part of „what I bought" as the price, and the teacher can
      // edit the Package at any time.
      lessonsTotal: pkg.lessonsCount,
      priceTotal: pkg.price,
      perLessonPrice: perLessonPrice(pkg.price, pkg.lessonsCount),
      minutesPerLesson: pkg.minutesPerLesson,
    },
    select: { id: true, status: true, lessonsTotal: true, priceTotal: true },
  })

  // Tell the teacher. Without this the request is a row in a table nobody is
  // watching: they would have to happen to open their profile page and scroll.
  // `after` keeps it off the response path, matching POST /api/bookings.
  after(async () => {
    await notify(pkg.tutor.userId, {
      type: 'BOOKING_CREATED',
      title: 'ახალი პაკეტის მოთხოვნა',
      body: `${me.fullName} — ${pkg.lessonsCount} გაკვეთილი · ₾${pkg.price}`,
      href: '/tutor/profile#section-students',
    }).catch(() => {})
  })

  return NextResponse.json({ ok: true, item })
}
