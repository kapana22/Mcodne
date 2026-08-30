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
import { buildProfileChecks, profilePercent } from '@/lib/profileScore'
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

  if (!profile) {
    // No profile at all (an ADMIN browsing the workspace): nothing to score.
    return NextResponse.json({ ok: true, requests: 0, messages, reschedules: 0, profilePercent: 0, noAvailability: null })
  }

  const percent = profilePercent(buildProfileChecks(profile, user.avatarUrl))

  // ⚠️ AND THE THREE PLACEHOLDERS ARE GONE (2026-08-26). `requests: 0`,
  // `reschedules: 0` and `noAvailability: null` were kept because the browser's
  // badge reader still read them — „they go when that file does", said the note
  // that stood here. That file went today: components/tutor/useNavBadges no
  // longer has the keys, the pill they fed could never show a number, and the
  // modal `noAvailability` drove asked providers to publish calendar time that
  // has not existed since 2026-08-24.
  return NextResponse.json({
    ok: true,
    messages,
    profilePercent: percent,
  })
}
