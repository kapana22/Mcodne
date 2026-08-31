// Lightweight counts for the workspace sidebar badges. Polled every 60s by
// useNavBadges — keep this to cheap count queries only.
//
// ⚠️ IT WAS `/api/tutor/nav-badges` AND MOST OF IT WAS BOOKINGS (2026-08-24).
// Four of the five numbers came from the consultation product: PREPARING
// bookings awaiting an answer, unread booking messages, unread pre-booking
// messages (with an initiator lookup to decide whose badge they belonged to),
// and reschedule requests read out of a JSONB column with raw SQL. All four
// went with the product. The fifth — unread OFFER messages — is the whole
// „მიმოწერა" badge now, and it is still summed from the very rows the inbox
// renders rather than counted separately: two derivations of one number is the
// bug that once left a „მიმოწერა N" pill nothing could clear.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { requestAccessOf } from '@/lib/requestsServer'
import { offerUnreadTotal } from '@/lib/inboxRows'
import { ROLE } from '@/lib/roles'

export async function GET() {
  const auth = await requireRoleApi([ROLE.PROVIDER, ROLE.ADMIN])
  if (auth.response) return auth.response
  const user = auth.user
  const profile = await prisma.serviceProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      headline: true,
      about: true,
      services: true,
      areas: true,
      priceList: true,
      languages: true,
      // ⚠️ THREE COUNTS STOOD HERE AND NOTHING SCORES THEM (removed
      // 2026-08-29). Certificates, education and experience each carried 8
      // points of the completeness percentage; the CV they described left the
      // product the same day (lib/profileScore says why), so this was three
      // joins on every sidebar poll feeding a number that no longer exists.
    },
  })

  // The offer inbox's unread total. Returns 0 immediately for anybody who is
  // not on the allowlist — an ADMIN browsing the workspace included.
  const messages = await offerUnreadTotal(await requestAccessOf(user.id))

  // ⚠️ `profilePercent` LEFT THIS ROUTE ON 2026-08-30, and the reason is worth
  // keeping. The rail's progress block was its only reader, polling it every 90
  // seconds — so the block could not paint until the first poll returned, which
  // is the „ნახევარს ტვირთავს და მერე ჩნდება" the owner reported that day. The
  // rail reads the server layout now (app/work/layout → grantEarnedTasks), in
  // the first paint.
  //
  // It was also the WRONG NUMBER for where it was drawn: lib/profileScore's
  // weighted checks, sitting directly above a line derived from the grant's
  // tasks — two different six-item lists. lib/profileScore is still right for
  // the checklist on /work/profile, which is about whether a profile READS
  // well; it was never the grant's measure.

  // ⚠️ AND THE THREE PLACEHOLDERS ARE GONE (2026-08-26). `requests: 0`,
  // `reschedules: 0` and `noAvailability: null` were kept because the browser's
  // badge reader still read them — „they go when that file does", said the note
  // that stood here. That file went today: components/work/useNavBadges no
  // longer has the keys, the pill they fed could never show a number, and the
  // modal `noAvailability` drove asked providers to publish calendar time that
  // has not existed since 2026-08-24.
  return NextResponse.json({ ok: true, messages })
}
