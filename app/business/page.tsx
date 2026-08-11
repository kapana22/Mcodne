// /business — the company landing. HIDDEN behind B2B_VISIBILITY (lib/flags.ts).
//
// Thin route shell: metadata + the gate, nothing else. The page itself is
// ./BusinessLanding.tsx — the same split every other marketing route here uses
// (app/page.tsx → HomeClient, app/abroad → AbroadLanding), and here it buys one
// more thing: `BusinessLanding` is an ordinary exported function, so a test can
// call it and assert the page actually builds, while calling THIS module's
// default asserts the 404. Neither needs a browser.
//
// HIDDEN means hidden, on four independent axes:
//   1. canSeeB2B() false → notFound(), so the route 404s for everyone the stage
//      does not admit. 404 and NOT 403: a 403 confirms the page is there.
//   2. robots: noindex, nofollow — nofollow deliberately, matching /abroad: a
//      crawler that reached this page must not walk out of it either.
//   3. absent from app/sitemap.ts (STATIC_ROUTES is an allowlist) and from
//      /rss.xml (which carries blog posts only). Deliberately ALSO absent from
//      app/robots.ts: that file is public, so a Disallow line would publish the
//      exact URL this page exists to keep unlisted.
//   4. NOTHING links here — not the header, not the footer, not the catalog.
//      The URL is the entry point, and that is on purpose.
//      tests/b2b.test.ts scans the tree and fails if that stops being true.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { canSeeB2B } from '@/lib/b2b'
import { BusinessLanding } from './BusinessLanding'

// A dark page must never be pre-rendered into the build's static output — and
// the gate reads the session, which is per-request by definition.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ბიზნესისთვის — მცოდნე',
  // noindex AND nofollow — see the header comment. No canonical and no
  // socialMeta(): an OG card is for a page you want shared.
  robots: { index: false, follow: false },
}

export default async function Page() {
  const me = await getCurrentUser()
  if (!canSeeB2B(me?.role)) notFound()
  return <BusinessLanding />
}
