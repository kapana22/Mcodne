// THE PROVIDER'S PUBLIC PROFILE — /experts/<slug> (stage 5, 2026-08-19; moved
// out of /services/<slug> into the ONE namespace in stage 11, the same day).
//
// Source-text pins for the things that cannot be seen from a screenshot: the
// page resolves by slug AND id, refuses an unpublished row, never pulls a base64
// column into a page query, the photo route serves the work photos through the
// same refusal as the face, the catalogue card became a link, and the slug
// generator asks ONE question across BOTH tables.
//
// Run: node --import tsx --test tests/providerProfile.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))

const DIR = 'app/experts/[slug]'
const PAGE = `${DIR}/page.tsx`
const DATA = `${DIR}/_providerData.ts`
const PHOTO = 'app/api/providers/[id]/photo/route.ts'

/** The whole route directory as one string — tests read screens as source
 *  text and must read the DIRECTORY, never one filename (CLAUDE.md). */
const routeDir = () =>
  readdirSync(join(ROOT, DIR)).filter(f => /\.tsx?$/.test(f)).map(f => read(`${DIR}/${f}`)).join('\n')

test('the profile exists as a container plus parts, and is the Profile archetype', () => {
  for (const f of [PAGE, DATA, `${DIR}/_providerHero.tsx`, `${DIR}/_providerBlocks.tsx`, `${DIR}/_providerCta.tsx`]) {
    assert.ok(has(f), `${f} is missing`)
  }
  // ⚠️ AND THE OLD ADDRESS IS NOT A ROUTE AT ALL (stage 11). Two profile
  // spaces contradict CLAUDE.md → THE PRODUCT MODEL; the whole /services
  // prefix 308s into /experts now, so a second folder answering here would be
  // the split coming back.
  assert.ok(!has('app/services'), 'app/services is back — one provider, one namespace')
  const page = read(PAGE)
  // Breadcrumb, hero, blocks, reviews, CTA — with the public furniture.
  assert.match(page, /<ProviderBreadcrumb/)
  assert.match(page, /<ProviderHero/)
  assert.match(page, /<AboutBlock/)
  assert.match(page, /<WorkBlock/)
  assert.match(page, /<ReviewsBlock/)
  assert.match(page, /<ProviderCta/)
  assert.match(page, /<PublicTopBar/)
  assert.match(page, /<Footer/)
  // ⚠️ THE COLUMNS ARE 1fr + 340px SINCE 2026-08-31 (the owner's design canvas
  // → Public Profile), AND THE HERO IS NO LONGER INSIDE THEM. What is pinned is
  // the SHAPE that matters — a content column and a rail — not the exact
  // pixels, which are the canvas's to move. `minmax(0,1fr)` rather than `1fr`
  // is load-bearing: a grid track will not shrink below its content's intrinsic
  // width, and one long provider name scrolled the page sideways at 390px.
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/, 'the two-column shape of the profile')
  // The breadcrumb is the same trail the catalogue draws, one step deeper.
  // TWO steps since stage 10 (2026-08-19): „სერვისები" was a door that is gone
  // and „ხელოსნები" was a second name for the one catalogue.
  const hero = read(`${DIR}/_providerHero.tsx`)
  assert.match(hero, /aria-label="ნავიგაცია"/)
  for (const href of ['"/"', '"/experts"']) assert.match(hero, new RegExp(`href=${href}`))
  assert.doesNotMatch(hero, /href="\/services/, 'the trail still links into the retired /services prefix')
  // …and since stage 11 the two steps are the REAL path: /experts → this page.
  assert.match(page, /name:\s+'ექსპერტები',\s+item:\s+`\$\{SITE_URL\}\/experts`/,
    'the BreadcrumbList no longer names the parent the URL actually has')
  // Reviews are the honest empty state until stage 7 — never a fabricated list.
  const blocks = read(`${DIR}/_providerBlocks.tsx`)
  // ⚠️ THE EMPTY STATE WAS REMOVED (2026-08-20), not lost. Measured that day:
  // 0 reviews on the whole site, so every provider profile drew a heading, a
  // bordered box and an icon to announce an absence — three elements saying
  // „unfinished" on the one page whose job is to make somebody trustworthy.
  // An empty state earns its place when the reader can FILL it; nobody can
  // review a provider they have not hired. What is pinned now is the ABSENCE
  // of the section, plus the two properties that always mattered: reviews come
  // through the offer, and no photo column is ever selected.
  assert.match(blocks, /if \(p\.reviews\.length === 0\) return null/)
  // The model is a leaf.
  assert.doesNotMatch(read(DATA), /from '\.\//, '_data imports a sibling — the model must stay a leaf')
  // Metadata title and canonical.
  assert.match(page, /— სერვისი \| მცოდნე/)
  assert.match(page, /alternates: \{ canonical \}/)
})

test('it resolves by slug AND by id, and the id form redirects to the slug', () => {
  const data = read(DATA)
  assert.match(data, /OR: \[\{ slug: param \}, \{ id: param \}\]/, 'the resolver must accept both forms')
  const page = read(PAGE)
  assert.match(page, /permanentRedirect\(`\$\{providerPath\(provider\)\}\$\{queryOf\(await\s+searchParams\)\}`\)/,
    'an id URL must 308 to the slug URL — carrying the query string, like the expert branch')
  // Nothing found is the one 404 this route has. ⚠️ IT WAS „nothing found in
  // EITHER table" until 2026-08-24 — there was a second profile table to fall
  // through to first.
  assert.match(page, /notFound\(\)\n\}/, 'the resolver lost its 404')
  assert.match(page, /if \(!p\) notFound\(\)/, 'a row that vanished between the two reads must 404, never render blank')
})

test('unpublished, paused, suspended or not admitted → not found; and the three readers agree', () => {
  const CATALOGUE = 'app/experts/_providers.ts'
  // ONE RULE, THREE READERS, and the whole point is that they cannot drift: a
  // page reachable for somebody the photo route refuses draws a broken
  // portrait, and a card that links to a 404 is worse than no card.
  for (const f of [DATA, CATALOGUE, PHOTO]) {
    const src = read(f)
    assert.match(src, /published: true/, `${f} lost \`published\``)
    assert.match(src, /available: true/, `${f} lost \`available\``)
    assert.match(src, /requestAccess: \{ active: true \}/, `${f} lost the allowlist clause`)
    // ⚠️ ADDED 2026-08-24, AND IT WAS MISSING FROM ALL THREE. The old catalogue
    // merged two rosters and only the CONSULTATION half filtered
    // `user.suspendedAt: null` (lib/tutorsQuery). Deleting that half left the
    // trades rule — which had never carried the clause — covering all 29
    // providers, so suspending somebody stopped removing them: card, profile
    // and portrait all stayed up, while the sitemap, the category counts and
    // the certificate route DID drop them. The site disagreed with itself
    // about who is public, and the admin's one emergency control did nothing.
    assert.match(
      src,
      /suspendedAt: null/,
      `${f} does not exclude a SUSPENDED account — suspension is the admin's one take-this-person-down-now control and it must work on every reader at once`,
    )
    // Inside the OR, never beside it: a company profile has no user row, and a
    // hoisted `user: { is: … }` matches nothing, which would delete every
    // company from the catalogue.
    assert.match(
      src,
      /\{ user: \{ is: \{ suspendedAt: null, requestAccess: \{ active: true \} \} \} \}/,
      `${f} hoisted the suspension clause out of the OR — that silently drops every company profile`,
    )
  }
})

test('no page or list query ever selects a base64 column', () => {
  const BLOB = /photoUrl:\s*true|workPhotos:\s*true|include:\s*\{[^}]*(photoUrl|workPhotos)/
  for (const f of ['app/experts/_providers.ts', DATA, PAGE]) {
    assert.doesNotMatch(read(f), BLOB, `${f} selects a base64 column into a page — count it and point at the photo route`)
  }
  // The route reads ONE image per response: the face by column, a work photo by
  // array element in SQL — never the whole array.
  const photo = read(PHOTO)
  assert.doesNotMatch(photo, /workPhotos:\s*true/, 'the photo route pulls all six work photos to serve one')
  assert.match(photo, /"workPhotos"\[\$2\]/)
  // The profile asks WHICH photos are servable, as booleans and indices.
  const data = read(DATA)
  assert.match(data, /WITH ORDINALITY/)
  assert.match(data, /NOT LIKE 'data:image\/svg%'/, 'the page must skip what the route refuses, or it draws a broken image')
  // Every <img> in the route directory points at the photo route.
  const dir = routeDir()
  assert.match(dir, /\/api\/providers\/\$\{row\.id\}\/photo\?n=\$\{n\}/)
  assert.doesNotMatch(dir, /src=\{?["'`]data:/, 'a data: URI is inlined into the profile page')
})

test('the photo route refuses SVG and serves ?n=<index> through the same refusal', () => {
  const photo = read(PHOTO)
  assert.match(photo, /searchParams\.get\('n'\)/)
  assert.match(photo, /\/svg\/i\.test\(mime\)\) return notFound\(\)/)
  // One refusal, one header block — `?n=` must not have grown a second path
  // that skips them: the SVG test and the headers appear once, after the pick.
  assert.equal(photo.match(/svg\/i\.test\(mime\)/g)?.length, 1)
  assert.equal(photo.match(/'x-content-type-options': 'nosniff'/g)?.length, 1)
  assert.match(photo, /"default-src 'none'; sandbox"/)
  // The index is bounded by the intake's cap, and a bad index is a 404 — never
  // a silent fall-back to the face.
  assert.match(photo, /MAX_WORK_INDEX = 5/)
  assert.match(photo, /if \(n === 'bad'\) return notFound\(\)/)
})

test('the catalogue card is a link to /experts/<slug> — only when the row has one', () => {
  const card = read('app/experts/_providerCard.tsx')
  assert.match(card, /`\/experts\/\$\{m\.slug\}`/)
  assert.doesNotMatch(card, /`\/services\//, 'the card still addresses the retired namespace')
  assert.match(card, /m\.slug \? /, 'a slugless row must not become a link to nowhere')
  assert.match(card, /overlay=\{href \?/, 'the whole card opens the profile through EntityCard’s overlay slot')
  assert.match(read('app/experts/_providers.ts'), /id: true, slug: true,/, 'the catalogue query must select the slug')
  // Cards born before slugs get theirs lazily, guarded and bounded.
  const data = read('app/experts/_providers.ts')
  assert.match(data, /ensureProviderSlug\(r\.id\)/)
  assert.match(data, /slugless\.length <= 20/)
})

test('lib/providerSlug checks BOTH namespaces, and approval calls it guarded', () => {
  const lib = read('lib/providerSlug.ts')
  assert.match(lib, /prisma\.serviceProfile\.(findUnique|update)/)
  // ⚠️ INVERTED IN STAGE 11 (2026-08-19). This used to assert the OPPOSITE — „a
  // master slug must never be checked against TutorProfile" — and that was
  // right while the two profiles answered under two prefixes. They share ONE
  // now (/experts/<slug>), so a slug is an identity: minting the same one on
  // the other table would hand one URL to two people. The question is asked
  // once, in lib/slugSpace, and BOTH generators ask it.
  assert.match(lib, /import\s+\{\s+slugReserved,\s+slugTaken\s+\}\s+from\s+'\.\/slugSpace'/)
  assert.match(lib, /if \(await slugTaken\(candidate\)\) continue/)
  const space = read('lib/slugSpace.ts')
  // ⚠️ IT ASKED BOTH TABLES UNTIL 2026-08-24. One table now, plus the reserved
  // list — which is the half no unique index could ever cover.
  assert.match(space, /prisma\.serviceProfile\.findFirst\(\{\s+where:\s+\{\s+slug\s+\}/)
  assert.match(lib, /export\s+async\s+function\s+ensureProviderSlug\(serviceProfileId:\s+string\)/)
  assert.match(lib, /company\?\.name \?\? profile\.user\?\.fullName/, 'the name is the firm’s or the person’s, in that order')
  // Never overwrites: an existing slug is returned, not regenerated.
  assert.match(lib, /if \(profile\.slug\) return profile\.slug/)
  // Approval: after the grant transaction, in a try/catch, non-fatal.
  const approve = read('app/api/provider-applications/[id]/route.ts')
  assert.match(approve, /import\s+\{\s+ensureProviderSlug\s+\}\s+from\s+'@\/lib\/providerSlug'/)
  const i = approve.indexOf('await ensureProviderSlug(profile.id)')
  assert.ok(i > approve.indexOf('await prisma.$transaction('), 'the slug is assigned AFTER the grant transaction')
  assert.match(approve.slice(i - 400, i), /try \{/, 'the slug call must be guarded — it must never fail an approval')
})

test('the CTA is the intake, gated by the page, and the dual link goes to /experts/<slug>', () => {
  const page = read(PAGE)
  assert.match(page, /requestsOn\(\)/)
  // ⚠️ THE GATE MOVED INWARD (2026-08-20) and it is narrower now, on purpose.
  // The whole aside used to be `{on && (…)}`. When the price list moved into
  // that aside — under the actions, where price belongs beside what you press —
  // the flag would have deleted the page's entire OFFER on a deployment with
  // the intake off. A price is CONTENT; only the button that opens the intake
  // is a feature of it.
  // ⚠️ THE GATE MOVED INWARD AGAIN ON 2026-08-31, one step further, and the
  // invariant got STRONGER rather than weaker. The rail used to be `{on &&
  // <ProviderCta …>}`, so a deployment with the intake off lost the whole card.
  // The canvas puts „ფასი იწყება — 60₾" and the three response facts in that
  // card, and those are CONTENT by exactly the argument this test already made
  // about the price list: only the BUTTON belongs to the requests subsystem.
  // So the card always renders and carries the flag as `enabled`.
  assert.match(page, /<ProviderCta[\s\S]{0,120}enabled=\{on\}/,
    'the CTA card stopped receiving the subsystem flag — its button would show on a deployment without the intake')
  assert.doesNotMatch(page, /\{on && <ProviderCta/,
    'the whole rail is gated on the flag again — the price and the facts must survive the intake being off')
  assert.match(read(`${DIR}/_providerCta.tsx`), /\{enabled && \(\s*<Btn/,
    'the rail draws its intake button without checking the flag it was handed')
  assert.match(page, /<PricedServicesBlock\s+p=\{p\}\s+ordering=\{on\}\s+\/>/,
    'the price list is gated on the flag again — prices must survive the intake being off')
  const cta = read(`${DIR}/_providerCta.tsx`)
  // ⚠️ THE ADDRESS NOW CARRIES THIS MASTER (2026-08-19) — `?to=<slug>`, so the
  // person reading the profile can hire the person on it instead of describing
  // the job to nobody. It is still ONE address, still stated in the model: the
  // CTA imports the builder rather than assembling a query string of its own.
  assert.match(cta, /import\s+\{\s+requestHrefFor\s+\}\s+from\s+'\.\/_providerData'/)
  assert.match(cta, /href=\{requestHrefFor\(provider\)\}/)
  // ⚠️ „მიიღე შეთავაზება" SINCE 2026-08-31, and this is the THIRD wording. The
  // word changed, not the property: this line exists so the card keeps ONE
  // primary and that primary is the intake. „გამოაგზავნე მოთხოვნა" was tender
  // language for an addressed request; „დატოვე მოთხოვნა" (2026-08-21) carried
  // the return; the canvas's names what the reader GETS, and it is the same
  // verb the home page's hero uses, so one journey says one thing twice.
  assert.match(cta, /მიიღე შეთავაზება/)
  // …and the card now SAYS the request is addressed. That is not decoration:
  // `offerLimit: 1` has made it exclusive since 2026-08-20 and no screen said so.
  // …and the card still SAYS the request is addressed. That is not decoration:
  // `offerLimit: 1` has made it exclusive since 2026-08-20 and no screen said
  // so. The sentence is shorter than it was (the canvas's line) and this is the
  // clause that had to survive the trim.
  assert.match(cta, /პირდაპირ ამ პროფილს მიდის/,
    'the CTA stopped telling the client their request goes to this provider alone')
  assert.match(read(DATA), /REQUEST_HREF = '\/request\?for=service'/)
  assert.match(read(DATA), /requestHrefFor[\s\S]{0,200}&to=\$\{encodeURIComponent\(p\.slug\s+\|\|\s+p\.id\)\}/,
    'the recipient is no longer carried, or is carried unencoded')
  // ⚠️ „THE OTHER PROFILE OF THE SAME PERSON" WAS PINNED HERE UNTIL 2026-08-24
  // — the link a dual provider followed to their consultation page. There is
  // one profile, so there is nothing to cross-link to.
  assert.doesNotMatch(read(`${DIR}/_providerHero.tsx`), /ექსპერტის პროფილი/,
    'the cross-link to a second profile came back')
})
