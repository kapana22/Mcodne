// THE ONE NAMESPACE — /experts/[slug]. Four different pages answer here, and
// this file is the resolver that decides which (stage 11, 2026-08-19).
//
// ⚠️ THE PRECEDENCE, IN ORDER, AND IT IS NOT ARBITRARY:
//
//   1. PROFESSION LANDING   /experts/<profession>  lib/professionSeo → part ./_profession
//   2. TRADE LANDING        /experts/<trade>       lib/serviceProfile → resolveTrade, part ./_tradeLanding
//   3. EXPERT PROFILE       /experts/<slug|id>     TutorProfile      → part ./client
//   4. PROVIDER PROFILE     /experts/<slug|id>     ServiceProfile    → parts ./_provider*
//   5. notFound()
//
// THE TWO CODE-OWNED LISTS COME FIRST because they are FIXED lists in source
// (fifteen profession slugs, forty-seven trade ids) while both profile slugs
// are GENERATED from people's names — and both generators RESERVE every id in
// both lists (lib/slugSpace → RESERVED_SLUGS), so no profile can ever be minted
// onto one. The reverse order would let a database row shadow a page that
// exists in code and that nobody could then reach. Landing 1 before landing 2
// is arbitrary only because it can be: the two vocabularies do not overlap
// (asserted in tests/oneNamespace.test.ts).
//
// THE TWO PROFILES ARE ORDERED BY NOTHING BUT HISTORY, and that is safe for a
// reason that did not exist until today: since stage 11 a slug is unique across
// BOTH tables (lib/slugSpace → slugTaken), so at most one of them can answer.
// Before it, TutorProfile answered under /experts and ServiceProfile under
// /services — two prefixes, two namespaces, „ana-gagoshidze" legitimately on
// both sides. Two profile spaces contradict CLAUDE.md → THE PRODUCT MODEL („one
// provider; a consultation is one KIND of service"), so the second prefix was
// collapsed into this one: /services/<anything> now 308s here (middleware.ts).
// Measured before the merge: 26 expert slugs, 7 provider slugs, 0 collisions —
// nothing had to be renamed, and nothing here ever renames a slug.
//
// Responsibilities of this file (and nothing more):
//   1. the precedence above;
//   2. generateMetadata — per-page title/description/OG so a shared link
//      unfurls with the real name instead of the generic site title (profiles
//      are the marketplace's main organic-growth asset);
//   3. notFound() for params that resolve to nothing (a real 404 instead of a
//      client error screen with a 200 status);
//   4. application/ld+json — Person / LocalBusiness + BreadcrumbList;
//      aggregateRating only when a REAL rating exists (never fabricate).
//
// The interactive EXPERT profile lives in ./client.tsx ('use client') and keeps
// its own /api/experts/[slug] fetching exactly as before — this wrapper passes
// no props and does not rewire that data flow. The PROVIDER profile is server
// -rendered from ./_providerData and drawn by ./_providerHero / _providerBlocks
// / _providerCta; it has no client half because it has nothing interactive.
//
// Pinned by tests/oneNamespace.test.ts, tests/taxonomy.test.ts,
// tests/expertsRoute.test.ts and tests/masterProfile.test.ts.
//
// MUST be force-dynamic: the provider branch and the trade count read Postgres,
// which is unreachable at `next build`.
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { initialMe } from '@/lib/meServer'
import { jsonLdString } from '@/lib/jsonLd'
import { socialMeta } from '@/lib/seo'
import { avatarSrc } from '@/lib/avatarSrc'
import { professionBySlug } from '@/lib/professionSeo'
import { requestsOn } from '@/lib/requests'
import { providerKey, responseStatsFor } from '@/lib/responseStats'
import { resolveTrade, tradeTopicIds, TRADE_LANDING_MIN } from '@/lib/serviceProfile'
import { queryProviders } from '@/app/experts/_providers'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { Container } from '@/components/Container'
import { ProfessionLanding, professionMetadata } from './_profession'
import { resolveProvider, getProviderProfile, providerPath, countProvidersCovering } from './_providerData'
import { ProviderBreadcrumb, ProviderHero } from './_providerHero'
import { PricedServicesBlock, AboutBlock, CredentialsBlock, WorkBlock, ReviewsBlock } from './_providerBlocks'
import { ProviderCta } from './_providerCta'
import { TradeLanding, tradeLabel } from './_tradeLanding'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

type Params = { slug: string }

// Bio excerpt for meta description — first ~155 chars, cut at a word edge.
function excerpt(text: string | null | undefined, max = 155): string | null {
  const t = text?.replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 100))}…`
}

// OG/JSON-LD images must be absolute URLs — data-URI initials placeholders and
// relative upload paths are skipped rather than mangled.
/**
 * The expert's photo as a URL a CRAWLER can fetch — for og:image and for the
 * Person JSON-LD, which both read this one function.
 *
 * ⚠️ IT USED TO GIVE UP ON 19 OF 24 EXPERTS. Avatars live in Postgres as
 * `data:` URIs, this returned null for them, and socialMeta fell back to the
 * generic /og.png — so almost every profile shared, and appeared in search, as
 * the same house image with no face on it. The old comment described that as a
 * limitation; it stopped being one when /api/avatars/[id] shipped.
 *
 * `avatarSrc` turns the stored blob into that route's URL, carrying the `?v=`
 * fingerprint so the link changes the moment the photo does. Made absolute
 * because og:image and schema.org both require it.
 *
 * ⚠️ /api/avatars/ MUST STAY ALLOWED IN app/robots.ts. Everything under /api is
 * Disallowed; that one prefix is explicitly re-allowed, and without it these
 * tags would point at a URL the crawler is forbidden to open.
 *
 * An expert who signed in with Google already has a hosted URL — passed through
 * untouched, since a redirect through our route would only add a hop.
 */
function absoluteAvatar(userId: string | null | undefined, url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//.test(url)) return url
  const src = avatarSrc(userId, url)
  // `&s=512` — the full stored resolution. The route defaults to 384, which is
  // sized for a ≤128px card; a search thumbnail wants every pixel we actually
  // have. See SERVE_SIZES in app/api/avatars/[id]/route.ts.
  return src && src.startsWith('/') ? `${SITE_URL}${src}${src.includes('?') ? '&' : '?'}s=512` : null
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { slug: param } = await params
  // ── 1. the profession landing — see the header ──────────────────────────
  const prof = professionBySlug[param]
  if (prof) return professionMetadata(prof)
  // ── 2. the trade landing ────────────────────────────────────────────────
  // Canonical is the trade's own address whether it is a landing or the door;
  // the sitemap decides what to submit.
  const trade = resolveTrade(param)
  if (trade) {
    const label = tradeLabel(trade)
    const canonical = `${SITE_URL}/experts/${param}`
    const title = `${label} — სერვისები | მცოდნე`
    const description = `${label}: სერვისები მცოდნეზე. აღწერე, რა გჭირდება, და მიიღე შეთავაზებები.`
    return { title, description, alternates: { canonical }, ...socialMeta({ title, description, url: canonical }) }
  }
  // ── 3. the provider profile ─────────────────────────────────────────────
  {
    const provider = await resolveProvider(param)
    const pp = provider ? await getProviderProfile(provider.id) : null
    if (pp) {
      // Canonical is ALWAYS the slug URL when one exists — otherwise an
      // id-form link would self-canonicalise and compete with it.
      const providerCanonical = `${SITE_URL}${providerPath(pp)}`
      const title = `${pp.name} — სერვისი | მცოდნე`
      const description =
        excerpt(pp.about) || [pp.services.join(', '), pp.areas.join(', ')].filter(Boolean).join(' · ') || title
      // The face through the photo route — allowed in app/robots.ts. socialMeta
      // falls back to /og.png when there is none.
      const image = pp.photoSrc ? `${SITE_URL}${pp.photoSrc}` : null
      return {
        title,
        description,
        alternates: { canonical: providerCanonical },
        ...socialMeta({ title, description, url: providerCanonical, image, type: 'article' }),
      }
    }
  }

  // Nothing resolved — generic, and self-canonical to the address that was
  // asked for. The page itself 404s; this only decides what a crawler that
  // already has the URL is told about it.
  const canonical = `${SITE_URL}/experts/${param}`
  const title = 'ექსპერტი — მცოდნე'
  const description = 'იპოვე ექსპერტი მცოდნეზე და აღწერე, რა გჭირდება.'
  return {
    title,
    description,
    alternates: { canonical },
    ...socialMeta({ title, description, url: canonical }),
  }
}

export default async function ProviderProfileRoute(
  { params, searchParams }: {
    params: Promise<Params>
    searchParams: Promise<Record<string, string | string[] | undefined>>
  },
) {
  const { slug: param } = await params

  // ── 1. THE PROFESSION LANDING — see the header. A fixed list, no DB. ─────
  const prof = professionBySlug[param]
  if (prof) return <ProfessionLanding p={prof} />

  // ── 2. THE TRADE LANDING — the second fixed list, still no profile DB read.
  // ≥ TRADE_LANDING_MIN → the catalogue filtered to this trade; below it → the
  // door only, and NO list query at all (the door draws none).
  const trade = resolveTrade(param)
  if (trade) {
    const topicIds = tradeTopicIds(trade)
    // ⚠️ `initialMe`, NOT `getCurrentUser` (2026-08-30) — and still inside the
    // Promise.all. The hand-built object below carried four fields and left out
    // `provider` and `balanceTetri`, the two the header branches on, so a
    // provider browsing a trade landing saw the request button drawn and then
    // removed. lib/meServer carries the finding.
    const [count, initialUser] = await Promise.all([countProvidersCovering(topicIds), initialMe()])
    const result = count >= TRADE_LANDING_MIN
      ? await queryProviders(trade.topic ? { groups: [], topics: [trade.topic.id], cities: [] } : { groups: [trade.group.id], topics: [], cities: [] })
      : null
    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        // The same two steps the visible trail draws (./_tradeLanding).
        { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'ექსპერტები', item: `${SITE_URL}/experts` },
        { '@type': 'ListItem', position: 3, name: tradeLabel(trade) },
      ],
    }
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
        <PublicTopBar initialUser={initialUser} />
        <TradeLanding trade={trade} result={result} requestsEnabled={requestsOn()} />
        <Footer />
      </>
    )
  }

  // ── 3. THE PROVIDER PROFILE — the last thing this address can be.
  // Anything the visibility rule hides — unpublished, paused, not admitted —
  // falls through to a 404, exactly as it always did.
  const provider = await resolveProvider(param)
  if (provider) {
    // id→slug 308, carrying the query string: every deep-link into a profile
    // carries its intent there (?utm_*, and whatever the next one is), and a
    // redirect to a bare path silently drops all of it.
    if (provider.slug && param !== provider.slug) {
      permanentRedirect(`${providerPath(provider)}${queryOf(await searchParams)}`)
    }
    return providerProfile(provider)
  }

  notFound()
}

/**
 * The query string, rebuilt from Next's parsed searchParams — used by BOTH
 * id→slug 308s on this route. Every deep-link into a profile carries its
 * intent there (?intent=message, ?rebook=1, ?preview=1, ?utm_*), and a
 * redirect to a bare path silently drops all of it.
 */
function queryOf(sp: Record<string, string | string[] | undefined>): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach(x => out.append(k, x))
    else if (v !== undefined) out.set(k, v)
  }
  const qs = out.toString()
  return qs ? `?${qs}` : ''
}

/**
 * STEP 4 OF THE PRECEDENCE — the provider's public profile, moved here from
 * app/services/[slug]/page.tsx in stage 11 (2026-08-19) with every behaviour
 * intact: the Profile archetype (breadcrumb, hero, blocks, reviews, CTA), the
 * two-column shape the expert profile uses, the photo ROUTE and never the
 * base64 column, and the intake CTA mounted only when `requestsOn()`.
 *
 * ⚠️ SLUG OR ID, AND THE ID REDIRECTS — in the CALLER, before this runs
 * (`_providerData → resolveProvider` accepts both forms; reached by cuid while a
 * slug exists it 308s to the slug, so one profile has one address).
 *
 * Unknown, unpublished, paused, or not admitted never reaches here: the caller
 * only calls this with a row the VISIBLE rule already admitted, and a second
 * read that disagrees (a row hidden between the two queries) is notFound().
 */
async function providerProfile(provider: { id: string; slug: string | null }) {
  // ⚠️ `initialMe`, NOT `getCurrentUser` — see the trade landing above and
  // lib/meServer. A provider's own public page is exactly where they look.
  const [p, initialUser] = await Promise.all([getProviderProfile(provider.id), initialMe()])
  if (!p) notFound()

  // ⚠️ THE FLAG IS READ ONCE, HERE, AND HANDED DOWN — see app/experts/page.tsx.
  const on = requestsOn()

  /* 🔒 „პასუხობს 2 საათში" IS MEASURED OR IT IS NOT PRINTED (2026-08-31). The
     design canvas asks the rail for three facts about how this person answers;
     two of them are medians over their own answered leads, derived from the
     offer journal (lib/responseStats) rather than from `responseMedianMin`,
     which is a column NOTHING has ever written to. One query, one provider.
     A failure here costs the rail two rows and never the page. */
  let stat
  try {
    stat = (await responseStatsFor([p])).get(providerKey(p) ?? '')
  } catch {
    stat = undefined
  }

  const url = `${SITE_URL}${providerPath(p)}`
  const image = p.photoSrc ? `${SITE_URL}${p.photoSrc}` : null
  const description = excerpt(p.about)
  // A firm is a LocalBusiness, a person is a Person. Minimal and real: name,
  // address, what they do, where. No rating, no offer — neither exists yet.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': p.isCompany ? 'LocalBusiness' : 'Person',
    name: p.name,
    url,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(p.services.length ? { knowsAbout: p.services } : {}),
    ...(p.areas.length ? { areaServed: p.areas } : {}),
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      // The same two steps the visible trail draws (./_providerHero →
      // ProviderBreadcrumb) — and since stage 11 they are the real path.
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'ექსპერტები', item: `${SITE_URL}/experts` },
      { '@type': 'ListItem', position: 3, name: p.name },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <PublicTopBar initialUser={initialUser} />

      <main>
        <Container size="wide" className="py-5 pb-16 sm:py-7 sm:pb-20">
          <ProviderBreadcrumb name={p.name} />

          {/* ⚠️ THE HERO IS ITS OWN FULL-WIDTH CARD ABOVE THE COLUMNS
              (2026-08-31, from the owner's design canvas → Public Profile). It
              used to sit INSIDE the left column with the rail beside it, which
              cost the identity — a name, a face and four chips — a third of the
              page it is the title of. The canvas gives it the whole width and
              starts the two columns underneath. */}
          <div className="mt-4">
            <ProviderHero p={p} />
          </div>

          {/* Two columns from `lg`, one below it. `min-w-0` on every track: a
              grid track will not shrink below its content's intrinsic width,
              and one long name would scroll the page sideways at 390px. On a
              phone the DOM order IS the reading order — hero, then the price
              and the action, then what they sell, then who they are. */}
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            {/* ⚠️ THE RAIL IS FIRST IN THE DOM AND SECOND ON SCREEN, and that
                is deliberate rather than a CSS accident. `lg:order-2` moves it
                right on a desktop; on a phone it stays where it is written,
                directly under the identity — which is where „what does this
                cost and how do I start" belongs on a 390px screen. */}
            <aside className="min-w-0 lg:order-2">
              <div className="lg:sticky lg:top-[104px]">
                {/* ⚠️ THE PRICE AND THE FACTS ARE NOT GATED ON THE FLAG, THE
                    BUTTON IS. A price is CONTENT, not a feature of the requests
                    subsystem — the rail is drawn either way and `enabled`
                    decides whether it carries an action. */}
                <ProviderCta provider={p} stat={stat} enabled={on} />
              </div>
            </aside>

            <div className="flex min-w-0 flex-col gap-5 lg:order-1">
              {/* What they sell, then the person, then the proof, then what
                  others said. The priced list is the page's centre and it is
                  back in the wide column (see _providerBlocks → LIST_ROWS). */}
              <PricedServicesBlock p={p} ordering={on} />
              <AboutBlock p={p} />
              <WorkBlock p={p} />
              <CredentialsBlock p={p} />
              <ReviewsBlock p={p} />
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </>
  )
}
