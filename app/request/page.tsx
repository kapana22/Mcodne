// /request — the client's wizard. HIDDEN behind FEATURE_REQUESTS (lib/requests).
//
// Thin route shell: metadata and the gate, nothing else. The wizard itself is
// ./RequestWizard.tsx with its steps in `_step*.tsx` siblings and the rules in
// ./_model — the container + parts shape every big screen here uses.
//
// No data is fetched here anymore: the old one-page form loaded the Category
// list for its dropdown, and the wizard deliberately does not ask that question
// — the topic vocabulary is lib/requestTopics (in the bundle, 132 entries) and
// the sphere is DERIVED from the chosen topic server-side. Nobody filling this
// form should have to know the catalogue's filing system.
//
// HIDDEN MEANS HIDDEN, on five independent axes:
//   1. The middleware 404s the whole path when FEATURE_REQUESTS is not „on" —
//      for everyone, admins included.
//   2. requestsViewer() false → notFound(), so the route 404s for anyone the
//      allowlist does not admit. 404 and NOT 403: a 403 confirms the page is
//      there, and a redirect to /signin tells an anonymous visitor it is real
//      and worth returning to with an account.
//   3. robots: noindex, nofollow — nofollow deliberately, matching /business
//      and /abroad: a crawler that reached this page must not walk out of it.
//   4. absent from app/sitemap.ts (STATIC_ROUTES is an allowlist) and from
//      /rss.xml. Deliberately ALSO absent from app/robots.ts: that file is
//      public, so a Disallow line would publish the exact URL this page exists
//      to keep unlisted.
//   5. NOTHING links here — not the header, not the footer, not BottomNav, not
//      the home page. The URL is the entry point, on purpose.
//      tests/requests.test.ts scans the tree and fails if that stops being true.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requestsViewer } from '@/lib/requestsServer'
import { RequestWizard } from './RequestWizard'

// A dark page must never be pre-rendered into the build's static output — and
// the gate reads the session, which is per-request by definition.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'მოთხოვნა — მცოდნე',
  // noindex AND nofollow — see the header. No canonical and no OG card: those
  // are for a page you want shared.
  robots: { index: false, follow: false },
}

export default async function Page() {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) notFound()
  // The three fields the contact screen would otherwise ask a signed-in person
  // to retype. Passed down rather than fetched by the wizard — see the prop's
  // note in RequestWizard, and app/request/_model → withAccountContact for the
  // fill rule (empty fields only, never an overwrite).
  return (
    <RequestWizard
      account={viewer.user
        ? { fullName: viewer.user.fullName, phone: viewer.user.phone, email: viewer.user.email }
        : null}
    />
  )
}
