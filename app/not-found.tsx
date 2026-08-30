import type { Metadata } from 'next'
import { NotFoundClient } from './NotFoundClient'

// Server wrapper so this route can carry its own metadata. It used to be a
// single 'use client' file, which meant a 404 inherited the ROOT metadata —
// every missing URL served the home page's title and description, and none of
// them were marked noindex.
export const metadata: Metadata = {
  title: 'გვერდი ვერ მოიძებნა — მცოდნე',
  description: 'ეს გვერდი აღარ არსებობს. იპოვე ექსპერტი, კატეგორია ან სტატია მცოდნეზე.',
  // A 404 already returns the right status, but an explicit noindex stops the
  // URL being kept as a candidate while the crawler re-checks it.
  robots: { index: false, follow: true },
}

// ⚠️ NOT PRERENDERED, FOR THE SAME REASON EVERY OTHER DB-TOUCHING PAGE HERE
// DECLARES THIS (2026-08-26). The root layout awaits `getPublicSiteTextMap()`,
// so a STATIC /_not-found bakes the header and footer copy as it stood at BUILD
// time — the one page on the site whose chrome could not be corrected from
// ადმინი → ტექსტები. It also made the BUILD depend on database latency: on
// 2026-08-26 the Railway proxy was answering a single count in ~5s and the
// export worker gave up on this page after three 60-second attempts, failing
// the whole build — with nothing wrong in the code. A 404 is rendered rarely
// and cached by nothing; there is no page here that is cheaper to make dynamic.
export const dynamic = 'force-dynamic'

export default function NotFound() {
  return <NotFoundClient />
}
