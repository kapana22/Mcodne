// /work/(provider) — the master's screens: /work/requests, /work/offers,
// /work/service-profile. THE GUARD ONLY; the chrome is app/work/layout.tsx.
//
// ONE ADDRESS WITH THE EXPERT'S WORKSPACE, TWO GUARDS (stage 6, 2026-08-19).
// The master's screens used to be their own /provider space, beside /tutor and
// /student, so that bidding on work with no time attached never shared a nav
// with a calendar. The two spaces are now /me (the client's) and /work (the
// supply side's, whatever you supply); the separation the old note argued for
// survives as two ROUTE GROUPS under one prefix — this file's gate is not the
// expert group's, and the shell above draws each group's items only for the
// capability that owns them (components/tutor/navConfig → NAV_GROUPS).
//
// It also still means the two can be switched off independently, and that an
// account with requests access but no expert profile (a company member) has
// somewhere to land at all — the (expert) layout sends a WORK-only account here.
//
// ⚠️ notFound() and NEVER requireRole(). requireRole redirects a signed-out
// visitor to /signin, which tells them the page is real and worth coming back
// to with an account — the one thing the 404 exists to deny. Everyone the
// allowlist does not admit gets the same answer an unknown URL gets. And the
// shell above renders NOTHING but children when there is no session, so this
// 404 is a bare 404 — no chrome around it saying „there is a workspace here".

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requestsViewer } from '@/lib/requestsServer'

// Re-verify on every request for this segment, matching the /me and (expert)
// layouts: the pages must never be served from a cached render that outlived
// the session or the allowlist row behind it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'მოთხოვნები — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) notFound()
  return <>{children}</>
}
