import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { professions } from '@/lib/professionSeo'
import { BROWSABLE_CATEGORY } from '@/lib/categoryTree'
import { LIVE_OFFER_GROUPS, TRADE_LANDING_MIN, countCovering } from '@/lib/serviceProfile'
import { PUBLIC } from '@/app/experts/_providers'

// Next auto-serves this at /sitemap.xml. We keep the surface small and static
// for public routes, then splice in provider detail pages sourced directly from
// Prisma. A hard cap of 5000 keeps the file well under the 50k / 50MB limit
// even if the catalogue grows.
//
// force-dynamic: generate at REQUEST time, never at build. Railway's build
// container can't reach the DB, so a statically-built sitemap silently drops
// every tutor profile + blog post (the try/catch below returns []) and ships
// only the static routes — exactly the "experts aren't in the sitemap" bug.
// Reading per-request (crawlers hit this rarely) guarantees the full catalog.
export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

/**
 * Last time the CODE-OWNED copy on this site actually changed — the static
 * marketing pages, the category landing copy (lib/categorySeo) and the
 * profession pages (lib/professionSeo).
 *
 * ⚠️ BUMP THIS when you meaningfully edit that copy. Nothing bumps it for you.
 *
 * WHY IT IS A CONSTANT AND NOT `new Date()`:
 * this route is force-dynamic, so `now` was recomputed on every crawl and 26 of
 * our URLs claimed to have changed seconds ago, every single time. `lastmod` is
 * a trust signal: a sitemap that reports "everything changed just now" on every
 * fetch teaches the crawler the field is noise, and Google then discounts it
 * for the URLs where it IS real (tutor profiles and blog posts, which carry a
 * true `updatedAt` below). A stale-but-honest date is worth far more than a
 * fresh lie.
 */
const CONTENT_REVISION = new Date('2026-07-28T00:00:00.000Z')

const STATIC_ROUTES: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
  priority: number
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  // THE ONE CATALOGUE (2026-08-19, stage 10). It was three entries — /experts
  // (consultations), /masters (trades) and /services (the trades door) — and
  // all three are now one list at one address; the other two 308 here. Only the
  // bare URL is declared: the filtered views (?type=…&trade=…&city=…) are the
  // same rows in a different order and each canonicalises to this address, so
  // submitting them would be submitting duplicates of a page we already list.
  // Its children are the professionEntries below and the expert profiles.
  { path: '/experts', changeFrequency: 'daily', priority: 0.9 },
  // Public again as of 2026-07-29: a guest gets a crawlable page and only the
  // FORM needs a session. It was removed from this list while it 307'd every
  // guest away. /apply → /join since 2026-08-19 (the middleware 308s it), and
  // since 2026-08-20 the bare address is the DOOR (app/join/_door/PublicDoor):
  // the pitch AND the one question, asked before the account is required.
  { path: '/join', changeFrequency: 'monthly', priority: 0.7 },
  // ⚠️ `/join?can=WORK` WAS LISTED HERE AND IS NOT ANY MORE (2026-08-24). It was
  // a real second landing — „დაარეგისტრირე შენი სერვისი", its own copy, its own
  // canonical — because /join had TWO pitches behind one address and the
  // parameter chose between them. There is one pitch now: `?can=` is ignored and
  // the URL renders the same bytes as the row above it, so leaving it here would
  // be submitting a duplicate of our own page to Google. That is precisely why
  // `?can=CONSULT` was never listed, and the reason has simply grown to cover
  // both. The SEO registry row `apply-master` stays retired in lib/pageSeoDefs;
  // a key is never deleted, because a production SiteText row may hold copy
  // typed under it.
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/help', changeFrequency: 'monthly', priority: 0.5 },
  // A sitemap must list ONLY canonical URLs you want in search results — not
  // "every page that exists". Deliberately absent, and why:
  //
  //   /signin, /signup   noindex (their layouts set it).
  //   /ask               retired 2026-08-19 — the middleware 308s it to /experts.
  //   /categories/∗      retired 2026-08-19 (stage 8) — 308 to /experts?category=.
  //   /konsultacia/∗     moved 2026-08-19 (stage 8) — 308 to /experts/<slug>.
  //   /tutors /masters   the catalogue's two old addresses — 308 to /experts
  //   /services          (stage 10, 2026-08-19), and since stage 11 the whole
  //   /services/<x>      prefix with them: a provider profile and a trade
  //                      landing answer at /experts/<x> now and are listed
  //                      below under that address, never their old one.
  //   /terms /privacy    legal pages. Indexable and linked, but nobody searches
  //   /cookies           for them, so they don't belong in a targeted sitemap.
  //   /abroad /business  BOTH DELETED on 2026-09-03. They were noindex,
  //                      nofollow and flag-gated, and the rule they were listed
  //                      under still holds for whatever comes next: never
  //                      submit a URL you are simultaneously telling the
  //                      crawler to ignore. Drop the noindex on the page FIRST,
  //                      then add it here; the two must never disagree.
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: CONTENT_REVISION,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  // ⚠️ ONE BLOCK, AND IT ASKS `PUBLIC` RATHER THAN RESTATING IT (2026-08-26).
  //
  // There were TWO — `tutors` and `masters` — a leftover of the two profile
  // tables, and after the services-only merge both queried the SAME
  // `serviceProfile` with hand-copied where clauses. Measured on the live
  // sitemap that morning: 89 entries, 63 unique. Every provider was submitted
  // TWICE (at two different priorities, 0.7 and 0.6, and two lastModifieds), and
  // the second copy carried a rule the first did not have — no
  // `user.suspendedAt: null` — so two suspended providers were still being
  // submitted to Google and both answered 404.
  //
  // `PUBLIC` (app/experts/_providers) is the one rule that decides who has a
  // page: the catalogue, /experts/<slug> and the photo route all read it. A
  // sitemap that restates it is a sitemap that drifts from it.
  //
  // ⚠️ AND ONLY ROWS WITH A SLUG. A profile with none has no address at all —
  // the card does not link (ProviderRow.slug: „Null = no page yet"), so the id
  // URL the old block fell back to advertised a page nobody could reach.
  let providerEntries: MetadataRoute.Sitemap = []
  try {
    const providers = await prisma.serviceProfile.findMany({
      where: { ...PUBLIC, slug: { not: null } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    })
    providerEntries = providers.map(p => ({
      url: `${SITE_URL}/experts/${p.slug}`,
      lastModified: p.updatedAt ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  } catch {
    // If DB is unreachable at build time we still emit a valid sitemap for
    // static routes instead of failing the entire route.
    providerEntries = []
  }

  // Published blog posts (admin CMS). Same DB-unreachable fallback as tutors.
  let postEntries: MetadataRoute.Sitemap = []
  try {
    const posts = await prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
    })
    postEntries = posts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.updatedAt ?? now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  } catch {
    postEntries = []
  }

  // ⚠️ NO CATEGORY ENTRIES (stage 8, 2026-08-19). /categories/∗ was retired
  // and 308s to /experts?category=<slug>; a filtered catalogue view
  // canonicalises to /experts, which is already listed. Submitting the redirect
  // sources would be submitting URLs that answer 308.

  // Trade landings — /experts/<group> for every LIVE trade with enough
  // published masters to be a page (lib/serviceProfile → TRADE_LANDING_MIN,
  // the ≥3 rule, counted LIVE with the catalogue's own visibility rule). Below the bar the
  // URL still answers 200 with the door only, but a door is not a landing and
  // is not submitted. Same DB-unreachable fallback as the blocks above.
  let tradeEntries: MetadataRoute.Sitemap = []
  try {
    const rows = await prisma.serviceProfile.findMany({
      // The SAME roster the landing will list — `PUBLIC`, not a copy of it.
      // Counted with the old copy, a suspended provider still pushed a trade
      // over TRADE_LANDING_MIN and published a landing they are not on.
      where: PUBLIC,
      select: { services: true },
      take: 5000,
    })
    tradeEntries = LIVE_OFFER_GROUPS
      .filter(g => countCovering(rows, g.topics.map(t => t.id)) >= TRADE_LANDING_MIN)
      .map(g => ({
        url: `${SITE_URL}/experts/${g.id}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
  } catch { tradeEntries = [] }

  // Profession landing pages. Code-owned (lib/professionSeo.ts), so unlike the
  // three blocks above this one can't fail and needs no try/catch.
  const professionEntries: MetadataRoute.Sitemap = professions.map((p) => ({
    url: `${SITE_URL}/experts/${p.slug}`,
    lastModified: CONTENT_REVISION,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return [...staticEntries, ...providerEntries, ...tradeEntries, ...postEntries, ...professionEntries]
}
