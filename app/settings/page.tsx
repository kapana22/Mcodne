// /settings — the account page, RESOLVED ON THE SERVER.
//
// ⚠️ IT OPENED AS A FULL-SCREEN SPINNER UNTIL 2026-08-30. The whole page was a
// client component whose first act was `fetch('/api/me')`, and until that
// answered it rendered a centred „იტვირთება…" and nothing else — on a page
// whose every value the session already holds. Owner that morning: „ხანდახან
// დილეი აქვს, ნახევარს ტვირთავს ხოლმე რაღაცებს და მერე ჩნდება."
//
// The interactive half is untouched and still a client component: this page
// only resolves the identity and hands it over. The shape is the one
// /api/me returns, field for field (app/settings/_types → Me), so the values
// on screen at the first paint are the values a re-read would produce — see
// lib/meServer for why a first paint that is merely CLOSE still flickers.
//
// ⚠️ `requireUser` REPLACES A CLIENT-SIDE REDIRECT. The old page pushed to
// /signin when the probe came back 401 — which is a redirect that cannot happen
// until React has booted, so a signed-out visitor watched the spinner first.
import { requireUser } from '@/lib/auth'
import SettingsClient from './client'
import type { Me } from './_types'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await requireUser()

  const initialMe: Me = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Me['role'],
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    phone: user.phone,
    emailVerified: user.emailVerified,
    // Whether the account has a usable password. SSO-only accounts (Google)
    // carry a random unusable hash, so the delete flow must not demand one.
    // A boolean, never the hash — the same line /api/me draws.
    hasPassword: !!user.passwordHash,
  }

  // `chrome={false}`: the rail comes from ./layout → SpaceChrome now, exactly
  // as it has for /me/profile since that screen was merged into this component.
  return <SettingsClient initialMe={initialMe} chrome={false} />
}
