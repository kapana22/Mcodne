// THE CATALOGUE — the SSR shell of the one public list of people (/experts).
//
// ⚠️ IT REPLACED THE PROFESSION HUB (stage 10, 2026-08-19). This address used to
// draw a grid of links to the /experts/<profession> landings; the catalogue
// lived at /tutors and the trades half at /masters, behind a door at /services.
// Owner: „სერვისები საერთოდ ხო ამოსაგდებია", „ექსპერტებზე გადაიტანე", „ტუტორები
// რატო უნდა იყოს სახელად". So the three pages are one page at this address, and
// nothing was lost: a hub of professions IS a pre-filtered catalogue, and the
// landings themselves are untouched at /experts/<profession> — the footer, the
// sitemap and the header still reach every one of them. /tutors, /masters and
// /services all 308 here (middleware.ts).
//
// Mirrors the proven /experts/[slug] split (server page.tsx + client.tsx): this
// component runs the default queries ON THE SERVER and hands the rows to the
// interactive client list, so real cards are in the initial HTML instead of an
// empty skeleton that only fills after a post-hydration /api/tutors fetch.
//
// MUST be force-dynamic: the queries read Postgres, and the DB is UNREACHABLE
// at `next build` time (only at runtime inside the container). Static/ISR would
// execute them at build and fail the deploy with "Can't reach database server",
// and it would freeze the editable SEO text at whatever the code defaults were
// that day. force-dynamic defers both to request time.
export const dynamic = 'force-dynamic'

import { pageMetadata } from '@/lib/pageSeo'
import { jsonLdString } from '@/lib/jsonLd'
import { requestsOn } from '@/lib/requests'
import { initialMe } from '@/lib/meServer'
import { REQUEST_HREF, filterCounts, queryProviders } from './_providers'
import { CatalogClient } from './client'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
//
// ⚠️ THE KEY STAYS `tutors`, THE PATH MOVED. A SiteText DB row is keyed by the
// string `seo.tutors.*`; renaming it would orphan whatever the admin typed
// (lib/siteTextDefs) — the same rule that kept `konsultacia` when that hub moved
// in stage 8. `masters` and `services` are RETIRED rows in lib/pageSeoDefs for
// exactly the same reason: their pages are gone, their rows are not.
export const generateMetadata = () => pageMetadata('tutors', '/experts')

export default async function ExpertsCatalogue() {
  // ⚠️ THE WHOLE ROSTER, UNFILTERED, IN ONE QUERY. It was two — one per profile
  // table — until 2026-08-24. `queryProviders`'s VISIBLE rule (available +
  // published + an active RequestAccess) is untouched; EVERY refinement,
  // including the typed query, is applied in the browser over this seed, so no
  // filter change costs a round trip. The session resolves here too, so the
  // shared header renders the correct auth state on first paint.
  // ⚠️ THE WHOLE IDENTITY, NOT FOUR FIELDS OF IT (2026-08-30). The third slot
  // was `getCurrentUser()`, out of which this page hand-built
  // `{ id, fullName, avatarUrl, role }` — leaving out `provider` and
  // `balanceTetri`, the two the header actually branches on. So on the busiest
  // page on the site a signed-in provider watched the request button appear and
  // vanish, and the balance pill arrive late, on every load. lib/meServer
  // carries the finding — and it stays INSIDE this Promise.all, because
  // awaiting it afterwards would put a second session read on the critical path
  // to fix a flicker.
  const [providersResult, tradeCounts, initialUser] = await Promise.all([
    queryProviders({ groups: [], topics: [], cities: [] }),
    // Roster-wide counts for the rail's rows — the same one query it has drawn
    // its numbers from since /masters.
    filterCounts(),
    initialMe(),
  ])
  const providers = providersResult.rows

  // ⚠️ THE FLAG IS READ ONCE, HERE, AND HANDED DOWN. The header's CTA and the
  // empty state's CTA are two doors into the same subsystem; reading the
  // variable in each part is how a page ends up showing one of them on a
  // deployment where the subsystem does not exist. `requestsOn` is the only
  // interpreter of FEATURE_REQUESTS (lib/requests).
  const on = requestsOn()

  // Structured data for the site's highest-traffic page. The list is the SSR
  // seed (the same rows in the initial HTML), so what a crawler reads here
  // matches what it sees rendered.
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ექსპერტები — მცოდნე',
    url: `${SITE_URL}/experts`,
    inLanguage: 'ka',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: providers.length,
      // Capped at 20: schema.org has no limit, but a 200-item blob would add
      // tens of KB to every response for no additional ranking value.
      itemListElement: providers.slice(0, 20).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/experts/${p.slug || p.id}`,
        name: p.name,
      })),
    },
  }
  // The same trail the visible breadcrumb draws (_hero.tsx).
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'ექსპერტები' },
    ],
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <CatalogClient
        initialProviders={providers}
        tradeCounts={tradeCounts}
        initialUser={initialUser}
        requestHref={on ? REQUEST_HREF : null}
      />
    </>
  )
}
