// THE PROVIDER'S PUBLIC PROFILE — /experts/<slug> (stage 5, 2026-08-19; moved
// out of /services/<slug> into the ONE namespace in stage 11, the same day).
//
// Source-text pins for the things that cannot be seen from a screenshot: the
// page resolves by slug AND id, refuses an unpublished row, never pulls a base64
// column into a page query, the photo route serves the work photos through the
// same refusal as the face, the catalogue card became a link, and the slug
// generator asks ONE question across BOTH tables.
//
// Run: node --import tsx --test tests/masterProfile.test.ts

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
const PHOTO = 'app/api/masters/[id]/photo/route.ts'

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
  assert.match(page, /lg:grid-cols-\[1fr_360px\]/, 'the two-column shape of the expert profile')
  // The breadcrumb is the same trail the catalogue draws, one step deeper.
  // TWO steps since stage 10 (2026-08-19): „სერვისები" was a door that is gone
  // and „ხელოსნები" was a second name for the one catalogue.
  const hero = read(`${DIR}/_providerHero.tsx`)
  assert.match(hero, /aria-label="ნავიგაცია"/)
  for (const href of ['"/"', '"/experts"']) assert.match(hero, new RegExp(`href=${href}`))
  assert.doesNotMatch(hero, /href="\/services/, 'the trail still links into the retired /services prefix')
  // …and since stage 11 the two steps are the REAL path: /experts → this page.
  assert.match(page, /name: 'ექსპერტები', item: `\$\{SITE_URL\}\/experts`/,
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
  assert.match(page, /permanentRedirect\(`\$\{masterPath\(provider\)\}\$\{queryOf\(await searchParams\)\}`\)/,
    'an id URL must 308 to the slug URL — carrying the query string, like the expert branch')
  // Nothing found in EITHER table is the one 404 this route has.
  assert.match(page, /if \(tutor === null\) notFound\(\)/)
  assert.match(page, /if \(!p\) notFound\(\)/, 'a row that vanished between the two reads must 404, never render blank')
})

test('unpublished, paused, or not admitted → not found; and the three readers agree', () => {
  // The profile's rule.
  const data = read(DATA)
  assert.match(data, /published: true/)
  assert.match(data, /available: true/)
  assert.match(data, /requestAccess: \{ active: true \}/)
  // The catalogue's rule carries `published` too — a card must never link to a 404.
  assert.match(read('app/experts/_masterData.ts'), /published: true/)
  // …and so does the photo route, or the profile would draw a portrait it refuses.
  assert.match(read(PHOTO), /published: true/)
})

test('no page or list query ever selects a base64 column', () => {
  const BLOB = /photoUrl:\s*true|workPhotos:\s*true|include:\s*\{[^}]*(photoUrl|workPhotos)/
  for (const f of ['app/experts/_masterData.ts', DATA, PAGE]) {
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
  assert.match(dir, /\/api\/masters\/\$\{row\.id\}\/photo\?n=\$\{n\}/)
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
  const card = read('app/experts/_masterCard.tsx')
  assert.match(card, /`\/experts\/\$\{m\.slug\}`/)
  assert.doesNotMatch(card, /`\/services\//, 'the card still addresses the retired namespace')
  assert.match(card, /m\.slug \? /, 'a slugless row must not become a link to nowhere')
  assert.match(card, /overlay=\{href \?/, 'the whole card opens the profile through EntityCard’s overlay slot')
  assert.match(read('app/experts/_masterData.ts'), /id: true, slug: true,/, 'the catalogue query must select the slug')
  // Cards born before slugs get theirs lazily, guarded and bounded.
  const data = read('app/experts/_masterData.ts')
  assert.match(data, /ensureMasterSlug\(r\.id\)/)
  assert.match(data, /slugless\.length <= 20/)
})

test('lib/masterSlug checks BOTH namespaces, and approval calls it guarded', () => {
  const lib = read('lib/masterSlug.ts')
  assert.match(lib, /prisma\.serviceProfile\.(findUnique|update)/)
  // ⚠️ INVERTED IN STAGE 11 (2026-08-19). This used to assert the OPPOSITE — „a
  // master slug must never be checked against TutorProfile" — and that was
  // right while the two profiles answered under two prefixes. They share ONE
  // now (/experts/<slug>), so a slug is an identity: minting the same one on
  // the other table would hand one URL to two people. The question is asked
  // once, in lib/slugSpace, and BOTH generators ask it.
  assert.match(lib, /import \{ slugReserved, slugTaken \} from '\.\/slugSpace'/)
  assert.match(lib, /if \(await slugTaken\(candidate\)\) continue/)
  const space = read('lib/slugSpace.ts')
  assert.match(space, /prisma\.tutorProfile\.findFirst\(\{ where: \{ slug \}/)
  assert.match(space, /prisma\.serviceProfile\.findFirst\(\{ where: \{ slug \}/)
  assert.match(lib, /export async function ensureMasterSlug\(serviceProfileId: string\)/)
  assert.match(lib, /company\?\.name \?\? profile\.user\?\.fullName/, 'the name is the firm’s or the person’s, in that order')
  // Never overwrites: an existing slug is returned, not regenerated.
  assert.match(lib, /if \(profile\.slug\) return profile\.slug/)
  // Approval: after the grant transaction, in a try/catch, non-fatal.
  const approve = read('app/api/master-applications/[id]/route.ts')
  assert.match(approve, /import \{ ensureMasterSlug \} from '@\/lib\/masterSlug'/)
  const i = approve.indexOf('await ensureMasterSlug(profile.id)')
  assert.ok(i > approve.indexOf('await prisma.$transaction('), 'the slug is assigned AFTER the grant transaction')
  assert.match(approve.slice(i - 400, i), /try \{/, 'the slug call must be guarded — it must never fail an approval')
})

test('the CTA is the intake, gated by the page, and the dual link goes to /experts/<slug>', () => {
  const page = read(PAGE)
  assert.match(page, /requestsOn\(\)/)
  assert.match(page, /\{on && \(/, 'the CTA mounts only when the subsystem exists')
  const cta = read(`${DIR}/_providerCta.tsx`)
  // ⚠️ THE ADDRESS NOW CARRIES THIS MASTER (2026-08-19) — `?to=<slug>`, so the
  // person reading the profile can hire the person on it instead of describing
  // the job to nobody. It is still ONE address, still stated in the model: the
  // CTA imports the builder rather than assembling a query string of its own.
  assert.match(cta, /import \{ requestHrefFor \} from '\.\/_providerData'/)
  assert.match(cta, /href=\{requestHrefFor\(master\)\}/)
  assert.match(cta, /გამოაგზავნე მოთხოვნა/)
  assert.match(read(DATA), /REQUEST_HREF = '\/request\?for=service'/)
  assert.match(read(DATA), /requestHrefFor[\s\S]{0,200}&to=\$\{encodeURIComponent\(p\.slug \|\| p\.id\)\}/,
    'the recipient is no longer carried, or is carried unencoded')
  // The other profile of the same person.
  assert.match(read(DATA), /tutor: \{ select: \{ slug: true \} \}/)
  assert.match(read(DATA), /`\/experts\/\$\{expertSlug\}`/)
  assert.match(read(`${DIR}/_providerHero.tsx`), /ექსპერტის პროფილი/)
})
