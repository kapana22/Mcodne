import { pageMetadata } from '@/lib/pageSeo'
import Landing from './HomeClient'
import { jsonLdString } from '@/lib/jsonLd'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { getCurrentUser } from '@/lib/auth'
import { queryTutors } from '@/lib/tutorsQuery'
import { queryMasters } from './experts/_masterData'
import { expertCountsBySphere } from '@/lib/categoryCounts'
import { ABROAD_CATEGORY_SLUG } from '@/lib/abroad'
import { homeItems } from '@/lib/homeCatalogue'
import type { CatalogueCardItem } from '@/components/home/CatalogueGrid'
import type { HomeCat } from './_home/data'
import type { Me } from '@/lib/me'

// The home page reads the DB (the roster, the spheres and their counts), and on
// Railway the DB is only reachable at RUNTIME — never during `next build`.
// Static/ISR would run the queries at build time and fail the deploy. Same
// constraint as every other DB-touching page here.
export const dynamic = 'force-dynamic'

// Home is a client component (HomeClient) for its interactivity, so this thin
// server wrapper carries the SEO: a strong title/description, a self-canonical,
// and Organization + WebSite JSON-LD (brand knowledge panel + sitelinks search
// box). Without this the homepage inherited the weak layout defaults.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const DESC = 'დაჯავშნე ონლაინ კონსულტაცია ქართველ ექსპერტთან — ბიზნესი, ფინანსები, კარიერა და სამართალი. ხელით შერჩეული ბაზა, ვიდეოსესია, გამჭვირვალე ფასი.'

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
export const generateMetadata = () => pageMetadata('home', '/')

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'მცოდნე',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      description: DESC,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'მცოდნე',
      url: SITE_URL,
      inLanguage: 'ka-GE',
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/experts?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
}

/**
 * The spheres the home tiles render — VISIBLE, browsable, and POPULATED, with
 * the number of people behind each.
 *
 * ⚠️ POPULATED ONLY, and the count on the tile is why. A tile that leads to
 * „ვერ ვიპოვეთ" is a dead end the visitor built for us; printing the measured
 * number beside the name is that same promise made checkable BEFORE the click.
 * `expertCountsBySphere` is the fold the catalogue's own filter counts with, so
 * the tile and the page it opens can never disagree.
 *
 * ⚠️ THE WHOLE TREE IS READ, NOT JUST THE VISIBLE ROWS: the fold needs a
 * redirected category's parent to know which sphere its experts belong to. Only
 * spheres are ever returned. Same shape as app/api/categories, deliberately —
 * this replaces the client fetch that route existed here to serve.
 */
async function homeCategories(): Promise<HomeCat[]> {
  const all = await prisma.category.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, slug: true, name: true, status: true, parentId: true },
  })
  const counts = await expertCountsBySphere(all)
  return all
    // The /abroad marker is not a sphere anybody should be filed under
    // (lib/abroad) and never belongs in a browse list.
    .filter(c => c.status === 'VISIBLE' && c.slug !== ABROAD_CATEGORY_SLUG)
    .map(c => ({ slug: c.slug, name: c.name, expertCount: counts.get(c.id) ?? 0 }))
    .filter(c => (c.expertCount ?? 0) > 0)
    // ⚠️ BUSIEST FIRST, not the admin's display order. Only six of these reach
    // the home page, and `order`/`name` decided which six by a rule that has
    // nothing to do with what a visitor can actually book — measured
    // 2026-08-21 it led with „ბიზნესი · 1" and pushed „ბუღალტერია და
    // გადასახადები · 7" into second place. The catalogue's own rail already
    // sorts by count (CLAUDE.md §1); this is the same rule one screen earlier.
    // The name breaks ties so the order is stable between requests.
    .sort((a, b) => (b.expertCount ?? 0) - (a.expertCount ?? 0) || a.name.localeCompare(b.name, 'ka'))
}

export default async function Page() {
  // ⚠️ EVERYTHING THE PAGE SHOWS, RESOLVED HERE. Until 2026-08-21 the roster and
  // the spheres were fetched by the sections themselves in useEffect, so the
  // initial HTML carried skeletons and a hardcoded six — and a crawler, which
  // reads that HTML and may never run the effect, saw neither the real experts
  // nor the real category links. The queries are the SAME ones /experts runs,
  // so the two surfaces can never describe different catalogues.
  //
  // BOTH HALVES, because the catalogue is one list: a provider lives in a
  // second table with no list endpoint at all, which is why the old client
  // fetch could only ever show the consulting half. `queryMasters` is called
  // UNFILTERED and its VISIBLE rule is untouched.
  //
  // A DB blip must not take the home page down — every branch degrades to an
  // empty list, and each section draws nothing rather than an error.
  let items: CatalogueCardItem[] = []
  let categories: HomeCat[] = []
  try {
    await ensureDbReady()
    const [tutors, masters, cats] = await Promise.all([
      // Enough to fill six cards after the service half has led — not the
      // catalogue's 200: this page renders six of them and pays for the rest in
      // SSR payload.
      queryTutors({ limit: 12 }),
      queryMasters({ groups: [], topics: [], cities: [] }),
      homeCategories(),
    ])
    items = homeItems(tutors, masters.rows)
    categories = cats
  } catch {
    items = []
    categories = []
  }

  // Resolve the viewer server-side so the header is right on the FIRST paint,
  // exactly like every server-rendered page does via <PublicHeader>. Home was
  // the one high-traffic surface still falling back to the client probe, so a
  // signed-in expert watched „დაარეგისტრირე სერვისი" render and then disappear.
  // Free here: this page is already force-dynamic for the queries above. A
  // session blip must not take the page down — null just means „render as guest".
  let initialUser: Me | null = null
  try {
    const u = await getCurrentUser()
    if (u) {
      initialUser = {
        id: u.id,
        fullName: u.fullName,
        avatarUrl: u.avatarUrl,
        role: u.role as NonNullable<Me>['role'],
      }
    }
  } catch {
    initialUser = null
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <Landing categories={categories} items={items} initialUser={initialUser} />
    </>
  )
}
