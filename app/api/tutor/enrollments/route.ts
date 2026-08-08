import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { packagesFeatureExists, lessonsLeft } from '@/lib/packages'

// „ჩემი მოსწავლეები" — the roster. The teacher's real working surface once
// packages are running: who is on one, how far through they are, when it runs
// out. Circle and Deel both render this exact shape (name · progress bar ·
// last activity), and it is what a teacher is actually managing — an ongoing
// relationship, not a list of discrete bookings.

export async function GET() {
  const auth = await requireRoleApi(['TUTOR', 'ADMIN'])
  if (auth.response) return auth.response
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const tutor = await prisma.tutorProfile.findUnique({
    where: { userId: auth.user.id },
    select: { id: true },
  })
  if (!tutor) return NextResponse.json({ items: [] })

  const rows = await prisma.enrollment.findMany({
    where: { tutorId: tutor.id, status: { in: ['REQUESTED', 'ACTIVE', 'COMPLETED', 'EXPIRED'] } },
    // REQUESTED first — those are the ones waiting on the teacher to act.
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, status: true, lessonsTotal: true, lessonsUsed: true,
      priceTotal: true, perLessonPrice: true, paidAt: true, expiresAt: true, createdAt: true,
      // The snapshot, not `package.minutesPerLesson` — this row is a deal that
      // was struck, and the package it came from is still editable.
      minutesPerLesson: true,
      // No avatarUrl here — it is a data: URI and this is a list payload.
      student: { select: { id: true, fullName: true } },
      package: { select: { title: true, minutesPerLesson: true } },
    },
    take: 100,
  })

  const items = rows.map(e => ({
    ...e,
    left: lessonsLeft(e.lessonsTotal, e.lessonsUsed),
  }))
  return NextResponse.json({ items })
}
