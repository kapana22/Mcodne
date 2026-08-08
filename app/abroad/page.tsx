// /abroad — the diaspora landing. HIDDEN behind FEATURE_ABROAD (lib/flags.ts).
//
// Thin route shell: metadata + the flag guard, nothing else. The page itself is
// ./AbroadLanding.tsx — the same split every other marketing route here uses
// (app/page.tsx → HomeClient, app/apply → ApplyClient), and here it buys one
// more thing: `AbroadLanding` is an ordinary exported function, so a test can
// call it and assert the page actually builds, while calling THIS module's
// default asserts the 404. Neither needs a browser.
//
// HIDDEN means hidden, on four independent axes:
//   1. FEATURE_ABROAD false → notFound(), so the route 404s in production;
//   2. robots: noindex, nofollow — and nofollow deliberately, unlike /ask: this
//      page links to diaspora expert profiles that are equally not ready to be
//      indexed, so the crawler should not walk out of it either;
//   3. absent from app/sitemap.ts (see the comment there) and from /rss.xml
//      (which carries blog posts only);
//   4. NOTHING links here — not the header, not the footer, not the catalog.
//      The URL is the entry point, and that is on purpose.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FEATURE_ABROAD } from '@/lib/flags'
import { AbroadLanding } from './AbroadLanding'

// A dark page must never be pre-rendered into the build's static output — and
// once it is live it reads the SiteText table and the expert list, both of
// which change without a deploy.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ქართული სერვისები საზღვარგარეთ | მცოდნე',
  // noindex AND nofollow — see the header comment. No canonical and no
  // socialMeta(): an OG card is for a page you want shared.
  robots: { index: false, follow: false },
}

export default async function Page() {
  if (!FEATURE_ABROAD) notFound()
  return <AbroadLanding />
}
