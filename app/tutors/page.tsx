// Thin SERVER page for /tutors — the SSR shell of the expert browse list.
//
// Mirrors the proven /tutors/[id] split (server page.tsx + client.tsx): this
// component runs the default expert query ON THE SERVER and hands the rows to
// the interactive client list as `initialTutors`, so real expert cards are in
// the initial HTML instead of an empty skeleton that only fills after a
// post-hydration /api/tutors fetch. Metadata stays in layout.tsx (unchanged).
//
// MUST be force-dynamic: queryTutors() reads Postgres, and the DB is
// UNREACHABLE at `next build` time (only at runtime inside the container).
// Static/ISR would execute the query at build and fail the deploy with
// "Can't reach database server". force-dynamic defers the query to request time.
export const dynamic = 'force-dynamic'

import { pageMetadata } from '@/lib/pageSeo'
import { queryTutors } from '@/lib/tutorsQuery'
import { socialMeta } from '@/lib/seo'
import { jsonLdString } from '@/lib/jsonLd'
import { getCurrentUser } from '@/lib/auth'
import { TutorsClient } from './client'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const TUTORS_DESC = 'იპოვე ქართველი ექსპერტი და დაჯავშნე ონლაინ კონსულტაცია — ბიზნესი, კარიერა, ფინანსური და იურიდიული საკითხები. ხელით შერჩეული ბაზა, ვიდეოსესია.'

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
export const generateMetadata = () => pageMetadata('tutors', '/tutors')

export default async function TutorsPage() {
  // Default unfiltered list — matches what the client fetched on first mount
  // with no params. Category / price / language filters are applied client-side
  // on top of this seed; only a free-text `?q=` triggers a client refetch.
  // Resolve the session server-side too so the shared header renders the
  // correct auth state on first paint (no client-side flip).
  const [initialTutors, user] = await Promise.all([
    // Fetch the full live set (client filters by category/price/lang in-memory),
    // so category deep-links don't dead-end once there are >40 live experts.
    queryTutors({ limit: 200 }),
    getCurrentUser(),
  ])
  const initialUser = user
    ? { id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl, role: user.role }
    : null
  // Structured data for the site's highest-traffic page, which had none.
  // The list is the SSR seed (the same rows in the initial HTML), so what a
  // crawler reads here matches what it sees rendered.
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ექსპერტები — მცოდნე',
    url: `${SITE_URL}/tutors`,
    inLanguage: 'ka',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: initialTutors.length,
      // Capped at 20: schema.org has no limit, but a 200-item blob would add
      // tens of KB to every response for no additional ranking value.
      itemListElement: initialTutors.slice(0, 20).map((t: { id: string; slug?: string | null; user?: { fullName?: string | null } | null }, i: number) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/tutors/${t.slug || t.id}`,
        name: t.user?.fullName ?? 'ექსპერტი',
      })),
    },
  }
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
      <TutorsClient initialTutors={initialTutors} initialUser={initialUser} />
    </>
  )
}
