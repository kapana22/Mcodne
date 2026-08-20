// A package lesson's credit comes back when the booking dies — every way it can.
//
// `Enrollment.lessonsUsed` counts lessons BOOKED, so a booking that never
// happens must give its credit back, or the client quietly pays for a lesson
// nobody taught. Before this file only the client's own cancel did that; the
// expert's decline and the cleanup cron's auto-cancel silently kept the
// credit. Three exits, one function — call it inside the SAME transaction
// that flips the booking, so the two can never disagree.
//
// Guarded at 0: a double-cancel is refused upstream by the status claim, but a
// negative balance is the kind of thing worth making impossible.

import type { Prisma } from '@prisma/client'
import { extendedExpiry, DEFAULT_LESSON_MINUTES } from '@/lib/packages'

export async function releaseBookingCredit(
  tx: Prisma.TransactionClient,
  enrollmentId: string | null | undefined,
  opts: { cancelledBy?: string | null; noShowBy?: string | null; lessonMinutes?: number | null } = {},
): Promise<void> {
  if (!enrollmentId) return
  await tx.enrollment.updateMany({
    where: { id: enrollmentId, lessonsUsed: { gt: 0 } },
    data: { lessonsUsed: { decrement: 1 } },
  })
  // When the EXPERT is at fault the client also loses a day of their month
  // through no doing of their own — lib/packages → extendedExpiry says why a
  // whole day and not a lesson.
  const e = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { expiresAt: true } })
  const next = extendedExpiry(e?.expiresAt, {
    cancelledBy: opts.cancelledBy,
    noShowBy: opts.noShowBy,
    lessonMinutes: opts.lessonMinutes ?? DEFAULT_LESSON_MINUTES,
  })
  if (next && e?.expiresAt && next.getTime() !== e.expiresAt.getTime()) {
    await tx.enrollment.update({ where: { id: enrollmentId }, data: { expiresAt: next } })
  }
}
