import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { buildProfileChecks, profilePercent } from '@/lib/profileScore'
import { preThreadInitiators } from '@/lib/preThreadInitiators'
import { requestAccessOf } from '@/lib/requestsServer'
import { offerUnreadTotal } from '@/lib/inboxRows'
import { ROLE } from '@/lib/roles'

// Lightweight counts for the workspace sidebar badges. Polled every 60s by
// useNavBadges — keep this to cheap count queries only (the heavier
// /api/messages threads mode and /api/tutor/bookings list stay off the
// nav-badge polling path).

export async function GET() {
  const auth = await requireRoleApi([ROLE.EXPERT, ROLE.ADMIN])
  if (auth.response) return auth.response
  const user = auth.user
  const profile = await prisma.tutorProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      headline: true,
      bio: true,
      specialty: true,
      price: true,
      languages: true,
      // Certificates are counted ONLY when they carry a document. A row with
      // `fileUrl = NULL` does not render on the public profile at all (an empty
      // frame under „გადამოწმებული აღინიშნება" reads as a credential that failed
      // to verify), so awarding its 8 completeness points told the expert their
      // profile was more finished than a visitor can see. All five certificates
      // on the live roster are in exactly that state.
      _count: {
        select: {
          certificates: { where: { fileUrl: { not: null } } },
          education: true,
          experience: true,
        },
      },
    },
  })
  if (!profile) {
    // noAvailability is NULL, not false, when there is no profile at all (an
    // ADMIN browsing the expert workspace) — „unknown", so the nudge neither
    // fires nor retires itself for that browser.
    return NextResponse.json({ ok: true, requests: 0, messages: 0, reschedules: 0, profilePercent: 0, noAvailability: null })
  }

  const [requests, bookingUnread, preUnreadRows, preInitiators, reschedRows, slotCount, futureSlot] = await Promise.all([
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
    // Counted even when the partner also has a booking with me: /api/messages
    // suppresses that pre thread from the inbox but FOLDS its unread into the
    // booking thread, and opening the booking now stamps those messages read —
    // so this number always has a thread behind it that can clear it. (Before
    // the fold the inbox dropped the count while this badge kept it, leaving a
    // „მიმოწერა N" pill nothing could clear.)
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
    // Future availability slots — the profile-completeness „თავისუფალი დრო"
    // check. Booking is slot-gated, so zero upcoming slots leaves the expert
    // unbookable; this keeps the sidebar percent honest about that.
    prisma.availabilitySlot.count({ where: { tutorId: profile.id, startAt: { gte: new Date() } } }),
    // „Has the expert published ANY time that hasn't passed yet?" — the signal
    // behind the workspace nudge. Rows are WINDOWS (one row can be hours long)
    // and `booked` is legacy/meaningless, so the honest test is „ends in the
    // future", not startAt and not booked=false. findFirst = LIMIT 1 on the
    // [tutorId, …] index — this endpoint is polled per open tab, so it must
    // never grow into a full fetch.
    prisma.availabilitySlot.findFirst({
      where: { tutorId: profile.id, endAt: { gt: new Date() } },
      select: { id: true },
    }),
  ])

  // Count an unread pre-booking message toward the EXPERT badge only when the
  // partner OPENED the thread (they're the client, I'm the responder/expert).
  // Unread in threads I opened is client-side and belongs to the student badge.
  // This is the SAME space rule /api/messages?space=expert applies to pre threads
  // (initiator = client, checked before any booking dedup), so the badge total
  // and the inbox's summed `unreadCount` describe the same set of messages.
  let preUnread = 0
  for (const m of preUnreadRows) {
    if (preInitiators.get(m.fromId) === m.fromId) preUnread++
  }

  // ── THE THIRD KIND, AND WHY IT IS COUNTED FROM THE ROWS (2026-08-19) ──────
  // Offer conversations now live in the SAME inbox as bookings, so the pill
  // over „მიმოწერა" has to cover them or it points at a list holding more than
  // it admits. It is counted by summing the very rows /api/messages returns
  // (lib/inboxRows → offerUnreadTotal = inboxUnreadTotal(offerInboxRows(…))),
  // not by a count query of its own: two derivations of one number is the bug
  // that once left a „მიმოწერა N" pill nothing could clear.
  //
  // Costs one indexed allowlist lookup plus one bounded offer query per poll,
  // and returns 0 immediately for anybody who is not a provider.
  const offerUnread = await offerUnreadTotal(await requestAccessOf(user.id))

  const messages = bookingUnread + preUnread + offerUnread

  const percent = profilePercent(buildProfileChecks(
    profile,
    profile._count.certificates,
    profile._count.education,
    profile._count.experience,
    user.avatarUrl,
    slotCount,
  ))

  return NextResponse.json({
    ok: true,
    requests,
    messages,
    reschedules: reschedRows?.[0]?.count ?? 0,
    profilePercent: percent,
    noAvailability: !futureSlot,
  })
}
