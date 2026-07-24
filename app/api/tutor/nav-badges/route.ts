import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { buildProfileChecks, profilePercent } from '@/lib/profileScore'
import { preThreadInitiators } from '@/lib/preThreadInitiators'

// Lightweight counts for the workspace sidebar badges. Polled every 60s by
// useNavBadges — keep this to cheap count queries only (the heavier
// /api/messages threads mode and /api/tutor/bookings list stay off the
// nav-badge polling path).

export async function GET() {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const profile = await prisma.tutorProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      headline: true,
      bio: true,
      specialty: true,
      price: true,
      languages: true,
      _count: { select: { certificates: true, education: true, experience: true } },
    },
  })
  if (!profile) {
    return NextResponse.json({ ok: true, requests: 0, messages: 0, reschedules: 0, profilePercent: 0 })
  }

  const [requests, bookingUnread, preUnreadRows, preInitiators, reschedRows] = await Promise.all([
    prisma.booking.count({ where: { tutorId: profile.id, status: 'PREPARING' } }),
    // EXPERT-space unread only. A dual-role user (STUDENT promoted to TUTOR) also
    // has client-side unread (bookings where they're the student, inquiries they
    // opened) which must NOT inflate their expert badge — mirror the space filter
    // in /api/messages: booking threads where I'm the tutor, and pre-booking
    // threads a client opened WITH me (I'm the responder/expert).
    prisma.message.count({ where: { toId: user.id, readAt: null, booking: { tutorId: profile.id } } }),
    // Unread pre-booking messages addressed to me (from = the partner). No 200
    // cap here — it's an unread count, and unread messages are few even for busy
    // experts; capping could undercount the badge.
    prisma.message.findMany({
      where: { bookingId: null, toId: user.id, readAt: null },
      select: { fromId: true },
    }),
    // AUTHORITATIVE initiator per partner (= who is the client), so a thread is
    // attributed to the same space the inbox files it under. See preThreadInitiators.
    preThreadInitiators(user.id),
    // rescheduleRequest is a dbBoot-added JSONB column Prisma can't select —
    // raw SQL, same as app/api/bookings/[id]/route.ts.
    prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM "Booking"
       WHERE "tutorId" = $1
         AND status IN ('PREPARING', 'CONFIRMED')
         AND "rescheduleRequest" IS NOT NULL
         AND "rescheduleRequest"->>'proposedBy' = 'STUDENT'`,
      profile.id,
    ).catch(() => [{ count: 0 }]),
  ])

  // Count an unread pre-booking message toward the EXPERT badge only when the
  // partner OPENED the thread (they're the client, I'm the responder/expert).
  // Unread in threads I opened is client-side and belongs to the student badge.
  let preUnread = 0
  for (const m of preUnreadRows) {
    if (preInitiators.get(m.fromId) === m.fromId) preUnread++
  }
  const messages = bookingUnread + preUnread

  const percent = profilePercent(buildProfileChecks(
    profile,
    profile._count.certificates,
    profile._count.education,
    profile._count.experience,
    user.avatarUrl,
  ))

  return NextResponse.json({
    ok: true,
    requests,
    messages,
    reschedules: reschedRows?.[0]?.count ?? 0,
    profilePercent: percent,
  })
}
