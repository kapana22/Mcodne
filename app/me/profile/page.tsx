// /me/profile — the client's account screen. THE SAME SCREEN AS /settings.
//
// ⚠️ IT WAS A SECOND IMPLEMENTATION OF IT (deleted 2026-09-02). `./client.tsx`
// was 367 lines re-doing what app/settings already does: a name/phone/avatar
// form over /api/me, a password form over /api/me/password, a row pointing at
// /settings for notifications — and a footer line reading „ანგარიშის სრული
// პარამეტრები — პარამეტრები", i.e. the screen admitting in its own copy that
// the real one was elsewhere. Two forms writing the same columns through the
// same endpoints, and whichever of them was edited next would have been the
// only one fixed.
//
// Owner, 2026-09-02: „ეს შეცდომები და 10 ჯერ ერთი და იგივე რამის დახატვა და
// გამოტანა გადავიტანოთ და ერთი დიზაინ პატერნით ვიმუშაოთ."
//
// So: ONE account screen (app/settings/client), and the chrome is this page's
// business — `chrome={false}` drops the sticky bar, the logo and the
// full-height ground, because `ClientShell` has already drawn all three. It is
// the same split app/request/[ref]/_room made the same day, for the same
// reason.
//
// ⚠️ WHAT THE CLIENT GAINS BY THE SWAP, rather than loses: e-mail verification
// (the OTP flow), the notification switches that this page used to send them to
// /settings for, and account deletion. What it loses is the „შემოგვიერთდი"
// card, and that is not a loss — `APPLY_LINK` is a permanent row on the rail
// two inches to the left of it, on every screen in this room. A door drawn
// twice on one screen was the thing being removed.
//
// ⚠️ /settings STILL EXISTS AND IS NOT A DUPLICATE. It is the SAME component
// with its own chrome, and it is the address a provider and an admin use —
// neither of whom has this rail. Deleting it would leave them nothing.
import type { Metadata } from 'next'

// The rail says „პროფილი" and the screen's h1 says „პარამეტრები"; the crumb in
// `ClientTopBar` follows the h1 through `crumb` in components/me/navConfig, so
// the two agree on screen. Both words are already the product's.
export const metadata: Metadata = { title: 'პარამეტრები — მცოდნე' }

import { requireUser } from '@/lib/auth'
import SettingsClient from '@/app/settings/client'
import type { Me } from '@/app/settings/_types'

export const dynamic = 'force-dynamic'

export default async function ClientProfilePage() {
  const user = await requireUser()

  // The shape /api/me returns, field for field — the same object app/settings
  // builds, so the first paint equals what a re-read would produce. See that
  // page's header for why the values are resolved on the server at all.
  const initialMe: Me = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Me['role'],
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    phone: user.phone,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    // A boolean, never the hash — an SSO-only account carries an unusable one
    // and the delete flow must not demand a password it does not have.
    hasPassword: !!user.passwordHash,
  }

  // No <Container> here: the component brings its own, sized `content`, and two
  // would double the gutter.
  return <SettingsClient initialMe={initialMe} chrome={false} />
}
