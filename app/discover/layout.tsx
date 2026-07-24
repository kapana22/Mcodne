import type { Metadata } from 'next'

// /discover is a legacy, unlinked surface (no nav/footer link, not in the
// sitemap) with stale curated content. Keep it reachable but tell crawlers not
// to index it, so it can't surface as a thin duplicate of /tutors until it's
// either revived (add real metadata + a nav link + sitemap entry) or removed.
export const metadata: Metadata = {
  title: 'აღმოაჩინე — მცოდნე',
  robots: { index: false, follow: true },
}

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
