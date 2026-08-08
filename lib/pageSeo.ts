// Build a page's Next `Metadata` from the editable SEO table.
//
// One helper, nine pages. Before this, each page hand-wrote its own metadata
// block and the SERP title, the canonical and the OG card were three
// independent literals in the same object — which is how a page ends up sharing
// a headline that no longer matches the one it ranks under.
//
// Resolving SiteText here is safe and correct: `generateMetadata` is an async
// server function, so it can read the database exactly like the page body does.
// The DB read is uncached, which also opts the route out of static rendering —
// necessary, because a statically-built page would bake whatever the defaults
// were at BUILD time (Railway's builder cannot reach the DB, so that means the
// code defaults, forever, no matter what the admin types). The pages that were
// not already dynamic declare `force-dynamic` for exactly this reason.

import type { Metadata } from 'next'
import { getSiteTextMap } from '@/lib/siteText'
import { socialMeta } from '@/lib/seo'
import { PAGE_SEO, pageSeoKey } from '@/lib/pageSeoDefs'

/**
 * @param page  a `PAGE_SEO.page` value
 * @param path  the canonical path ('/', '/help', …)
 * @param extra merged last — for the one page that needs `robots`, and for the
 *              computed description on /contact.
 */
export async function pageMetadata(
  page: string,
  path: string,
  extra?: { description?: string; ogDescription?: string } & Partial<Metadata>,
): Promise<Metadata> {
  const def = PAGE_SEO.find(p => p.page === page)
  if (!def) throw new Error(`pageMetadata: unknown page „${page}"`)

  let map: Record<string, string> = {}
  try {
    map = await getSiteTextMap()
  } catch {
    // Metadata must never take a page down. Defaults are always correct copy,
    // just possibly stale.
  }
  const pick = (part: 'title' | 'description' | 'ogTitle' | 'ogDescription') =>
    map[pageSeoKey(page, part)] || def[part]

  const { description: extraDesc, ogDescription: extraOg, ...rest } = extra ?? {}
  // A locked description belongs to the caller (it interpolates a constant);
  // otherwise the admin's text wins, then the table default.
  const description = def.lockedDescription ? (extraDesc ?? '') : pick('description')
  const ogDescription = def.lockedDescription ? (extraOg ?? extraDesc ?? '') : pick('ogDescription')

  return {
    title: pick('title'),
    description,
    alternates: { canonical: path },
    ...socialMeta({ title: pick('ogTitle'), description: ogDescription, url: path }),
    ...rest,
  }
}
