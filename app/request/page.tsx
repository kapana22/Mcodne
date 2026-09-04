// /request — the client's wizard. HIDDEN behind FEATURE_REQUESTS (lib/requests).
//
// Thin route shell: metadata and the gate, nothing else. The wizard itself is
// ./RequestWizard.tsx with its steps in `_step*.tsx` siblings and the rules in
// ./_model — the container + parts shape every big screen here uses.
//
// No data is fetched here anymore: the old one-page form loaded the Category
// list for its dropdown, and the wizard deliberately does not ask that question
// — the topic vocabulary is lib/requestTopics (in the bundle, 132 entries) and
// the sphere is DERIVED from the chosen topic server-side. Nobody filling this
// form should have to know the catalogue's filing system.
//
// HIDDEN MEANS HIDDEN, on five independent axes:
//   1. The middleware 404s the whole path when FEATURE_REQUESTS is not „on" —
//      for everyone, admins included.
//   2. requestsViewer() false → notFound(), so the route 404s for anyone the
//      allowlist does not admit. 404 and NOT 403: a 403 confirms the page is
//      there, and a redirect to /signin tells an anonymous visitor it is real
//      and worth returning to with an account.
//      ⚠️ ONE AUDIENCE GETS A REDIRECT INSTEAD (2026-08-31): somebody who SELLS
//      here goes to /work. They are not being hidden from — they are being told
//      which side they are on. See the guard in the body.
//   3. robots: noindex, nofollow — nofollow deliberately, matching /business
//      and /abroad: a crawler that reached this page must not walk out of it.
//   4. absent from app/sitemap.ts (STATIC_ROUTES is an allowlist) and from
//      /rss.xml. Deliberately ALSO absent from app/robots.ts: that file is
//      public, so a Disallow line would publish the exact URL this page exists
//      to keep unlisted.
//   5. NOTHING links here — not the header, not the footer, not BottomNav, not
//      the home page. The URL is the entry point, on purpose.
//      tests/requests.test.ts scans the tree and fails if that stops being true.

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requestsViewer, coveredTopicIds } from '@/lib/requestsServer'
import { isVertical, PROVIDER_ROUTE } from '@/lib/requests'
import { resolveRequestTarget } from '@/lib/requestTarget'
import { RequestWizard } from './RequestWizard'
import { topicById } from '@/lib/requests'
import type { CatTile } from './_stepWhat'
import { prisma } from '@/lib/prisma'
import { expertCountsByCategory, priceFloorsByCategory } from '@/lib/categoryCounts'

// A dark page must never be pre-rendered into the build's static output — and
// the gate reads the session, which is per-request by definition.
export const dynamic = 'force-dynamic'

/** The spheres, by the home page's own rule (app/page → homeCategories):
 *  VISIBLE, populated, busiest first.
 *
 *  ⚠️ THE `expertCount > 0` FILTER IS THE WHOLE GUARD. A tile that opens onto
 *  an empty sphere is a dead end the visitor built for us, and the catalogue
 *  refuses it in two other places already (app/page and app/experts/client).
 *  The count is never printed — owner, 2026-09-02: „არასად არ ეწეროს ეგ ინფო"
 *  — it only decides whether the tile exists at all. */
async function sphereTiles(): Promise<CatTile[]> {
  const all = await prisma.category.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, slug: true, name: true, status: true, parentId: true },
  })
  const [counts, floors] = await Promise.all([
    expertCountsByCategory(all),
    priceFloorsByCategory(all),
  ])
  return all
    .filter(c => c.status === 'VISIBLE')
    .map(c => ({
      slug: c.slug,
      name: c.name,
      count: counts.get(c.id) ?? 0,
      priceFrom: floors.get(c.id) ?? null,
    }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ka'))
    .map(({ slug, name, priceFrom }) => ({ slug, name, priceFrom }))
}

export const metadata: Metadata = {
  title: 'მოთხოვნა — მცოდნე',
  // noindex AND nofollow — see the header. No canonical and no OG card: those
  // are for a page you want shared.
  robots: { index: false, follow: false },
}

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await requestsViewer()

  // 🔒 A SELLER DOES NOT ORDER HERE (owner, 2026-08-31: „მინდა რომ ვისაც სერვისი
  // აქვს იმას არ შეძლოს სერვისის დაკვეთა — ირევა ძალიან კოდი"). Checked BEFORE
  // `clientAllowed`, which is false for exactly this person: the order is what
  // decides whether they get an explanation or a wall.
  //
  // ⚠️ A REDIRECT, NOT THE 404 THE REST OF THIS ROUTE ANSWERS WITH, and the
  // difference is who is asking. The 404 exists so a stranger cannot learn the
  // subsystem is here; a provider answers requests in /work every day and has
  // nothing left to learn. Sending them to their own workspace says which side
  // of the marketplace they are on, in one move, with no copy to write — and it
  // is the same answer wherever they clicked from, which is the point: the
  // catalogue's CTA and a provider's profile still carry an intake link for the
  // anonymous majority who are the ones it is for.
  if (viewer.sells) redirect(PROVIDER_ROUTE)

  if (!viewer.clientAllowed) notFound()

  // ⚠️ `?q=` IS A HANDOVER, NOT A FILTER. The home band asks „რა გჭირდება" in
  // its own field and sends the words here; without this the first thing the
  // wizard did was show an empty search box to somebody who had just typed the
  // answer into one. Retyping at step one is the cheapest way to lose a person.
  //
  // It only SEEDS the search — it never picks a topic. What somebody typed is
  // their words, not a vocabulary id, and quietly choosing „ხელშეკრულება"
  // because they wrote „ხელშეკრულებაზე მჭირდება იურისტი" is the wizard putting
  // an answer in their mouth. They still tap the hit they meant.
  /* ⚠️ `?topic=` IS THE HANDOVER `?q=` COULD NOT BE (2026-09-04). The note above
     refuses to pick a topic FROM WORDS, and that refusal stands: „ხელშეკრულებაზე
     მჭირდება იურისტი" is somebody's sentence, not a vocabulary id, and choosing
     for them would be the wizard putting an answer in their mouth.
     This is the other case. The home band now shows matching topics as you type
     and carries a row of common ones beneath the field, so a person arriving
     with this parameter TAPPED the topic by name — the same act the wizard asks
     of them on screen one, done one screen earlier. Making them tap it twice is
     the retyping problem the `?q=` note is about.
     Validated through the vocabulary, never trusted: an unknown id is dropped
     and the run starts where it always did. */
  const sp = await searchParams
  const topicParam = typeof sp.topic === 'string' ? sp.topic : ''
  const initialTopic = topicById(topicParam)?.id ?? ''
  /* A sphere rather than a topic — what the home band's profession chips carry.
     „ფინანსისტი" matches no topic label (measured: four of the fifteen
     professions find nothing through search), so sending the WORD would be a
     dead end; the sphere they work in always exists. Checked against the tiles
     this page already resolved, so a slug that is hidden, empty or invented
     simply does not filter anything. */
  const categoryParam = typeof sp.category === 'string' ? sp.category : ''
  const raw = typeof sp.q === 'string' ? sp.q : ''
  // Bounded before it reaches a component: this is a URL anybody can craft, and
  // the search box has no business rendering a novel.
  const initialQuery = raw.trim().slice(0, 60)

  // ⚠️ `?for=service` IS THE DOOR — the one thing the owner approved as option
  // „ა" (2026-08-18): the entry point picks the vertical and the wizard never
  // asks again. The trades surfaces set it (the catalogue's CTA via
  // `REQUEST_HREF`, /experts/<trade>, /experts/<slug>, the home band's trade
  // tiles); every other entry leaves it off and gets the expert side.
  //
  // Validated through `isVertical` rather than cast: this is a URL anybody can
  // craft, and an unrecognised value must fall back to a working screen rather
  // than index into VERTICAL_COPY with undefined and blank the first question.
  const forParam = typeof sp.for === 'string' ? sp.for.trim().toUpperCase() : ''
  const vertical = isVertical(forParam) ? forParam : 'EXPERT'

  // ⚠️ `?to=<slug>` IS WHO IT GOES TO (2026-08-19) — the parameter that turns
  // this form from „post into the void and hope" into „hire this person". A
  // profile CTA carries its own slug (app/experts/[slug]/_providerCta, the expert rail),
  // this resolves it against the SAME visibility rule the catalogue uses, and
  // the wizard names the recipient in its chrome.
  //
  // ⚠️ AN UNKNOWN, HIDDEN OR MISTYPED `to` IS SIMPLY IGNORED — never a 404. The
  // form has to work for everybody who reaches it, and taking the whole intake
  // away because a decoration did not resolve is the trade nobody would make.
  // See lib/requestTarget — one namespace since 2026-08-24, so nothing has to
  // decide which table is asked first.
  const target = await resolveRequestTarget(typeof sp.to === 'string' ? sp.to : null)

  // The three fields the contact screen would otherwise ask a signed-in person
  // to retype. Passed down rather than fetched by the wizard — see the prop's
  // note in RequestWizard, and app/request/_model → withAccountContact for the
  // fill rule (empty fields only, never an overwrite).
  const covered = await coveredTopicIds()
  const tiles = await sphereTiles()

  return (
    <RequestWizard
      initialQuery={initialQuery}
      /* ⚠️ THE SPHERES THE FIRST SCREEN DRAWS. Resolved here and not in the
         wizard because `priceFrom` is a MEASUREMENT — the cheapest floor
         anybody in that sphere actually named — and a client component cannot
         ask the database for one. The header note above says „no data is
         fetched here anymore"; that stopped being true today and this is why. */
      tiles={tiles}
      initialTopic={initialTopic}
      initialCategory={tiles.some(t => t.slug === categoryParam) ? categoryParam : ''}
      vertical={vertical}
      // ⚠️ WHAT ANYBODY ACTUALLY DOES, read fresh on every open. The wizard
      // offered 148 topics against 46 with a live provider until 2026-08-30 —
      // see lib/requestsServer → coveredTopicIds for the measurement and for
      // why this is derived rather than listed.
      covered={covered}
      // Only what the browser has any use for: a public slug, a name to print,
      // a photo route and the topics that narrow one screen. Never the user id
      // the INVITED offer is written with — the endpoint resolves that itself.
      to={target
        ? { slug: target.slug, name: target.name, photoSrc: target.photoSrc, topics: target.topics }
        : null}
      account={viewer.user
        ? { fullName: viewer.user.fullName, phone: viewer.user.phone, email: viewer.user.email }
        : null}
    />
  )
}
