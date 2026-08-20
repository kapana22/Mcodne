import { pageMetadata } from '@/lib/pageSeo'
import Landing from './HomeClient'
import { jsonLdString } from '@/lib/jsonLd'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { getCurrentUser } from '@/lib/auth'
import type { Me } from '@/lib/me'

// The home page reads the DB (live categories, below), and on Railway the DB is
// only reachable at RUNTIME — never during `next build`. Static/ISR would run
// the query at build time and fail the deploy. Same constraint as every other
// DB-touching page here.
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

export default async function Page() {
  // Live spheres, resolved SERVER-side and handed to the client component.
  //
  // WHY THIS MOVED HERE: HomeClient fetched /api/categories in a useEffect, so
  // the initial HTML carried only the 6-item hardcoded fallback. A crawler —
  // which reads that HTML first and may never run the effect — saw 6 of 15
  // category pages linked from the home page. The other 9 were reachable only
  // from /categories, which makes them second-class on their own site: Google
  // both crawls and draws sitelinks from what the home page points at.
  //
  // The client fetch still runs and still refines the TILES (it needs
  // expertCount, which this query deliberately doesn't fetch — see HomeClient).
  // This only guarantees the links exist in the HTML before any JS does.
  let liveCats: { slug: string; name: string }[] = []
  try {
    await ensureDbReady()
    liveCats = await prisma.category.findMany({
      where: { status: 'VISIBLE' },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true },
      take: 50,
    })
  } catch {
    // A DB blip must not take the home page down — HomeClient's own fallback
    // covers the empty case exactly as it did before.
    liveCats = []
  }

  // Resolve the viewer server-side so the header is right on the FIRST paint,
  // exactly like every server-rendered page does via <PublicHeader>. Home was
  // the one high-traffic surface still falling back to the client probe, so a
  // signed-in expert watched „გახდი ექსპერტი" render and then disappear. Free
  // here: this page is already force-dynamic for the query above. A session
  // blip must not take the page down — null just means „render as guest".
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
      <Landing initialCategories={liveCats} initialUser={initialUser} />
    </>
  )
}
