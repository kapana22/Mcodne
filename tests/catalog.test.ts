/*
 * ONE CATALOGUE, ONE ADDRESS (2026-08-19).
 *
 * Run with:  npx tsx tests/catalog.test.ts
 *
 * WHY THIS FILE EXISTS. Owner, the morning of 2026-08-19: „სერვისები და
 * ექპერტები უნდა გაერთიანდეს და პატარა გადასართავი ექნება. ექპერტები როგორც
 * არიან იმ ქარდით წამოიღე სერვისებიც. და მიეც საშვალება მომხარებელს ორი
 * ვარიანტი ქონდეს განლაგებისთვის." That day the two catalogues were given one
 * shell — one rail, one card, one layout toggle — and this file was the
 * sentence that stopped them drifting apart again.
 *
 * ⚠️ THE SAME EVENING IT BECAME ONE LIST. Owner, twice more: „მოვიფიქროთ რომ
 * იდენტურია უბრალოდ და ფილტრაციასავით უნდა იყოს — ვიღაცას კონსულტაცია აქვს,
 * ვიღაცას სერვისი, და ფილტრაცია დამატებოდა", and then the model itself:
 * „ექსპერტები და სერვისები ხო ერთია — ექსპერტს აქვს სერვისი რეალურად და
 * პარალელურად აკეთებს კონსულტაციასაც. მთელი პრინციპი ეს იყო."
 *
 * ⚠️ AND THE SAME DAY IT BECAME ONE PAGE. Owner: „სერვისები საერთოდ ხო
 * ამოსაგდებია", „ექსპერტებზე გადაიტანე", „ტუტორები რატო უნდა იყოს სახელად",
 * „სათაურში ჩემი აზრით ექსპერტები უნდა დარჩეს მარტო". /tutors, /masters and the
 * /services door all 308 to ONE address, /experts. There is no `preset` and no
 * `basePath`: the page opens on everybody and `?type=` narrows it.
 *
 * ⚠️ AND ON 2026-08-24 THE MERGE STOPPED BEING A MERGE. The consultation
 * product was removed and its 27 people migrated into the one provider table,
 * so there is one roster, one card and one predicate. Everything this file
 * pinned about keeping two halves in step — the `?type=` axis, `toCatalogItems`,
 * „one person is one card even holding both", the per-half sort fallbacks and
 * the cross-kind dead end — is gone with the split it protected.
 *
 * It reads SOURCE for the chrome facts (which component draws the rail, how
 * wide it is, whether it sticks, what the containers' classes are) and it
 * EXECUTES lib/catalogItems for the model — the mapper is pure precisely so
 * that „one person, one card" can be asserted rather than hoped for.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LIVE_OFFER_GROUPS } from '../lib/serviceProfile'
import { LIVE_SERVICE_GROUP_IDS } from '../lib/requestTopics'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))

/* ONE container, ONE rail, ONE results chrome, ONE server page. Everything
 * lives in app/experts/ — including the job half's MODEL and CARD
 * (`_providers` / `_providerCard`, which /experts/<slug> and /experts/<trade>
 * read too), which moved out of app/masters when that folder went. */
const SHELL = 'app/experts/client.tsx'
const RAIL = 'app/experts/_filters.tsx'
const RESULTS = 'app/experts/_results.tsx'
const HERO = 'app/experts/_hero.tsx'
const PAGE = 'app/experts/page.tsx'
const WORK_DATA = 'app/experts/_providers.ts'
const WORK_CARD = 'app/experts/_providerCard.tsx'

const {
  byPrice, matchesQuery, parseTrades, parseCities, tradeTopicIds,
} = require('../lib/catalogItems') as typeof import('../lib/catalogItems')

/** Prose explains what markup is NOT there; a negative assertion must not be
 *  failed by the comment that records the reason. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const { verticalsOfTopics } = require('../lib/requestTopics') as typeof import('../lib/requestTopics')

// ⚠️ THE RAIL IS A .tsx AND IT IS REQUIRED FOR ITS FUNCTIONS, NOT ITS MARKUP.
// The filter model, its predicate and the two side helpers live beside the
// components that draw them, and pinning behaviour beats pinning a regex over
// the source. Loading the module runs the JSX in its import graph
// (components/Icon), which reaches for a `React` binding only Next's compiler
// injects — the same one global tests/b2b.test.ts needs for the same reason.
;(globalThis as any).React ??= require('react')
const {
  EMPTY_FILTERS, passesFilters, sideFilters, verticalOfTrades,
} = require('../app/experts/_filters') as typeof import('../app/experts/_filters')

/* ═══════════ the shell ═══════════════════════════════════════════════════ */

test('one filter panel, from components/catalog, for the whole catalogue', () => {
  assert.ok(has('components/catalog/FilterPanel.tsx'), 'the shared filter rail is gone')
  assert.match(read(RAIL), /from '@\/components\/catalog\/FilterPanel'/,
    'the rail stopped rendering through the shared FilterPanel')
  assert.match(read(RAIL), /<FilterRow/, 'the rail no longer draws FilterRow')
  // The panel is written once: header, body, footer, and the drawn 18px box.
  const panel = read('components/catalog/FilterPanel.tsx')
  assert.match(panel, /aria-label="ფილტრი"/)
  assert.match(panel, /ფილტრის მოხსნა/)
  assert.match(panel, /role="checkbox"/, 'the drawn box lost the state a screen reader reads')
})

test('the rail is 240px and sticky from lg, and folds below it', () => {
  const shell = read(SHELL)
  // ⚠️ 264px SINCE 2026-08-31 (the owner's design canvas → Catalogue), and the
  // content track is `minmax(0,1fr)` rather than `1fr` — see the next test for
  // why that spelling is the sideways-scroll fix rather than a synonym.
  assert.match(shell, /lg:grid-cols-\[264px_minmax\(0,1fr\)\]/, 'the catalogue is not the two-column shell any more')
  assert.match(shell, /<MobileCollapse/, 'the rail does not fold on a phone')
  assert.match(shell, /from '@\/components\/catalog\/MobileCollapse'/, 'the rail folds with a private copy')
  // Sticky lives in the shared panel, once — `lg:` so it only sticks where
  // there is a column to stick in.
  assert.match(read('components/catalog/FilterPanel.tsx'), /lg:sticky/,
    'the rail stopped sticking — it scrolls away from the results it refines')
  // And the fold is a `lg:hidden` TRIGGER + a `lg:block` panel: on a desktop
  // the rail is simply always there and the button is not drawn at all.
  //
  // ⚠️ THE TWO HALVES LIVE IN TWO FILES SINCE 2026-09-01, and the split is the
  // phone's whole point (owner: „ტელეფონის დიზაინსაც მიხედე"). The panel stays
  // in the rail column; the trigger joined the sort and the layout toggle in
  // the results header, so a phone has ONE 44px row of controls instead of
  // three stacked full-width bars. Comment-stripped, because both files EXPLAIN
  // the other half and a prose mention must not pass for the markup.
  const collapse = stripComments(read('components/catalog/MobileCollapse.tsx'))
  assert.match(collapse, /lg:block/, 'the panel stopped being drawn on a desktop')
  assert.doesNotMatch(collapse, /<button/, 'the fold grew its own trigger back — there is one, in the results header')
  const bar = stripComments(read('app/experts/_results.tsx'))
  assert.match(bar, /lg:hidden h-11/, 'the results header lost the phone\'s filter trigger')
  assert.match(bar, /aria-controls=\{filters\.panelId\}/, 'the trigger no longer names the panel it opens')
  // ⚠️ ONE STATE. The trigger and the panel are in two components, so the
  // boolean is the container's — a `useState` inside either one is two answers
  // to „are the filters open".
  assert.doesNotMatch(collapse, /useState/, 'the fold owns its own open state again')
  assert.match(read(SHELL), /const \[filtersOpen, setFiltersOpen\] = useState/)
  // …and arriving ON a narrowed view still opens it, which is the one thing the
  // fold's own `useState(activeCount > 0)` used to do for free. The INITIAL
  // value, not an effect — an effect would re-open it under the reader who just
  // closed it, and it is a cascading render the linter is right about.
  assert.match(read(SHELL), /useState\(\(\) => anyRefined\(filters\)\)/,
    'a phone that arrives on „ელექტრიკოსი თბილისში" no longer shows what is ticked')
})

test('BOTH grid tracks carry min-w-0', () => {
  // A grid item's default `min-width` is `auto`: a `1fr` track will not shrink
  // below its content's intrinsic width, and one untruncatable name pushes the
  // page sideways at 390px. Caught in a screenshot on /masters once already,
  // and the canon is explicit that the body must never scroll horizontally.
  const src = read(SHELL)
  const grid = src.slice(src.indexOf('lg:grid-cols-[264px_minmax(0,1fr)]'))
  const tracks = (grid.match(/className="min-w-0"/g) ?? []).length
  assert.ok(tracks >= 2, `${tracks} of the 2 grid tracks carry min-w-0 — the page will scroll sideways on a phone`)
})

/* ═══════════ the merge ══════════════════════════════════════════════════ */

test('there is no type axis left to put in the rail', () => {
  // ⚠️ IT WAS THE FIRST SECTION, THEN THE LAST, AND NEITHER WAS RIGHT: a
  // category already answered it („სანტექნიკა" IS a service, „ფსიქოლოგია" IS a
  // consultation), and the word „სერვისი" ended up meaning two different things
  // on one screen — a group heading and a checkbox. Owner: „ფილტრაციები და
  // კატეგორიები არეულად არის." It survived as `?type=` and inside the item
  // filter until 2026-08-24, when the second half it narrowed was removed.
  // Comment-stripped: this file's header EXPLAINS what was removed and names
  // the field while doing so — a negative assertion must not be failed by the
  // prose that records the reason.
  const rail = read(RAIL).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(rail, /KIND_SECTION_TITLE|types:/, 'the type section came back to the rail')
  assert.doesNotMatch(read(SHELL), /resolveTypes|typeParam|toggleType/, 'the type narrowing came back')
  assert.doesNotMatch(read('lib/catalogItems.ts'), /CONSULT|Capability/, 'the capability axis came back to the catalogue model')
})

test('ONE server page at /experts, loading the whole roster, and no second catalogue', () => {
  // ⚠️ THE TWO OLD FOLDERS ARE GONE. Leaving either behind means a second list
  // that can drift from this one, which is the failure this whole file exists
  // to prevent; both addresses 308 here (tests/redirects.test.ts executes it).
  assert.ok(!has('app/tutors'), 'app/tutors is back — the catalogue lives at /experts')
  assert.ok(!has('app/masters'), 'app/masters is back — there is one catalogue')
  assert.match(read(PAGE), /<CatalogClient/, 'the page does not render the catalogue container')
  assert.doesNotMatch(read(PAGE), /redirect\(/, 'the catalogue URL must answer, never redirect')
  // The roster is loaded UNFILTERED — the browser narrows it — and its VISIBLE
  // rule is untouched (pinned in full by tests/providerProfile.test.ts).
  assert.match(read(PAGE), /queryProviders\(\{\s+groups:\s+\[\],\s+topics:\s+\[\],\s+cities:\s+\[\]\s+\}\)/)
  assert.match(read(WORK_DATA), /available: true/)
  assert.match(read(WORK_DATA), /published: true/)
  assert.match(read(WORK_DATA), /requestAccess: \{ active: true \}/)
  // The page reads FEATURE_REQUESTS ONCE and hands the CTA its address, so the
  // header's door and the empty state's door cannot disagree.
  assert.match(read(PAGE), /const on = requestsOn\(\)/)
  assert.match(read(PAGE), /requestHref=\{on \? REQUEST_HREF : null\}/)
})

test('every refinement is in the URL, so a narrowed view is linkable and Back works', () => {
  const shell = read(SHELL)
  // The two parameters keep the names /masters always used, so every filtered
  // link ever sent still resolves.
  assert.match(shell, /url\.set\('trade',\s+filters\.trades\.join\(','\)\)/)
  assert.match(shell, /url\.set\('city',\s+filters\.cities\.join\(','\)\)/)
  assert.match(shell, /parseTrades\(p\?\.get\('trade'\)\)/)
  assert.match(shell, /parseCities\(p\?\.get\('city'\)\)/)
  // …and the parsers drop anything the vocabulary does not know rather than
  // querying for it.
  assert.deepEqual(parseTrades('plumbing,nonsense'), ['plumbing'])
  assert.deepEqual(parseCities('TBILISI,ATLANTIS'), ['TBILISI'])
  assert.ok((tradeTopicIds(['plumbing']) as Set<string>).has('plumb-leak'), 'a group no longer expands to its topics')
  assert.equal(tradeTopicIds([]), null, 'an empty selection must mean „no narrowing", not „match nothing"')
  // And there is exactly ONE address to write back into.
  assert.match(shell, /const CATALOG_PATH = '\/experts'/)
  assert.match(shell, /router\.replace\(qs\s+\?\s+`\$\{CATALOG_PATH\}\?\$\{qs\}`\s+:\s+CATALOG_PATH/)
  // Comment-stripped: the file's header EXPLAINS that the prop is gone, and a
  // negative assertion must not be failed by the prose that records the reason.
  const shellCode = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(shellCode, /basePath/, 'the container takes an address as a prop again — there is one page')
  assert.doesNotMatch(shellCode, /\bpreset\b/, 'the container branches on a preset again — there is one page')
})

test('ONE taxonomy per side, and the switch is what chooses between them', () => {
  /* ⚠️ ONE RAIL, ONE SWITCH, ONE LIST (2026-09-01) — and the history is four
     steps now.

     It was „კატეგორია" (expert spheres) and „სერვისი" (trades): two headings
     answering the SAME question, so a plumber and an accountant were filed
     apart with no way to know which. They became ONE list ordered by count.
     Count turned out to be the wrong ordering for this site, so they became two
     NAMED blocks in the product's own order — „პროფესიული სერვისები" above
     „ყოველდღიური სერვისები" — and stayed that way for eleven days.

     Stacking is what the owner then named as the problem: „ჩვენ ხო გვაქვს ორი
     მთავარი კატეგორია — ვინც ადგილზე მიდის და ვინც პროფესიოლია — და ეს მინდა
     იყოს გადამრთველი, რომ არევა არ მოხდეს ამათი და კომფორტულად იყოს." Both
     vocabularies on screen at once, counted by two different queries over two
     different columns, is the mixing; a switch is the un-mixing. Professional
     still leads — it is the side the switch opens on (EMPTY_FILTERS).

     What is pinned here is the PROPERTY, not the fix: each side still draws its
     own vocabulary and writes its own state field, and they are never both
     drawn at once. Do not merge them into one flat list — that has been tried
     twice and was wrong twice, and the switch is not a third attempt at it. */
  const rail = read(RAIL)
  assert.doesNotMatch(rail, /FilterGroup title="კატეგორია"/, 'the rail went back to one unnamed category list')
  assert.match(rail, /<VerticalSwitch|export const VerticalSwitch/, 'the switch is gone — the two sides are stacked again')
  // The professional side is the admin categories, the everyday side the trade
  // groups, and each writes the field that filters ITS OWN column.
  assert.match(rail, /liveCats/, 'the professional side lost the admin categories')
  assert.match(rail, /EVERYDAY_OFFER_GROUPS/, 'the everyday side lost the trades')
  assert.match(rail, /cats: toggleIn\(filters\.cats/)
  assert.match(rail, /trades: toggleIn\(filters\.trades/)
  assert.match(rail, /\.sort\(\(a, b\) => b\.count - a\.count\)/, 'rows are no longer ordered by what has people')
  // Comment-stripped: the file's own prose explains what the two headings were.
  const code = rail.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(code, /FilterGroup title="(პროფესიული|ყოველდღიური) სერვისები"/,
    'the two blocks came back as headings — the switch exists so only one list is drawn')
  for (const section of ['title="ფასი"', 'title="სერვისი"', 'title="ენა"', 'title="მინ. რეიტინგი"', 'title="ქალაქი"']) {
    assert.ok(rail.indexOf(section) > -1, `the section ${section} is gone`)
  }
})

test('the switch SPLITS the roster — a side never shows the other side\'s people', () => {
  /* ⚠️ THE POINT OF THE WHOLE CHANGE, and it is a claim about the RESULT SET
     rather than about the rail: „რომ არევა არ მოხდეს ამათი". A switch that only
     swapped which checkboxes are drawn, while the cards underneath stayed the
     same twenty-three people, would be decoration. */
  const plumber = provider('p', { serviceIds: ['plumb-leak'], verticals: ['SERVICE'] })
  const lawyer = provider('l', { serviceIds: ['contract'], verticals: ['EXPERT'] })
  const both = provider('b', { serviceIds: ['plumb-leak', 'contract'], verticals: ['SERVICE', 'EXPERT'] })
  const on = (v: 'SERVICE' | 'EXPERT') => ({ ...EMPTY_FILTERS, vertical: v })
  assert.deepEqual(
    [plumber, lawyer, both].filter(m => passesFilters(m, on('EXPERT'))).map((m: { id: string }) => m.id),
    ['l', 'b'], 'the professional side is showing everyday providers, or hiding somebody who does both')
  assert.deepEqual(
    [plumber, lawyer, both].filter(m => passesFilters(m, on('SERVICE'))).map((m: { id: string }) => m.id),
    ['p', 'b'], 'the everyday side is showing professionals, or hiding somebody who does both')

  // ⚠️ A PROVIDER WHO TICKED NOTHING IS NOT NOWHERE. Their card still has a
  // category, a headline and a face; dropping them out of both sides would
  // delete a real person over an unfilled field.
  assert.deepEqual(verticalsOfTopics([]), ['EXPERT'])
  assert.deepEqual(verticalsOfTopics(['plumb-leak']), ['SERVICE'])
  assert.deepEqual(verticalsOfTopics(['contract']), ['EXPERT'])
  assert.deepEqual(verticalsOfTopics(['plumb-leak', 'contract']).sort(), ['EXPERT', 'SERVICE'])

  /* ⚠️ SWITCHING SIDES DROPS THE OTHER SIDE'S PICKS. „სამართალი" is a Category
     slug only the professional list draws and only a professional row carries:
     carried across the switch it survives as a filter with no row that could
     untick it, and every everyday provider fails it — the reader taps the
     switch and gets an empty page refined by something invisible. The
     side-neutral refinements are questions about a PERSON and they cross. */
  const refined: typeof EMPTY_FILTERS = {
    ...EMPTY_FILTERS, vertical: 'EXPERT', cats: ['law'], trades: ['plumbing'],
    langs: ['ქართული'], minRating: 4.5, price: [50, 100], cities: ['TBILISI'],
  }
  const crossed = sideFilters(refined, 'SERVICE')
  assert.deepEqual(crossed.cats, [], 'a Category slug crossed the switch as an invisible filter')
  assert.deepEqual(crossed.trades, ['plumbing'], 'the everyday side lost its own picks on the way in')
  assert.equal(crossed.vertical, 'SERVICE')
  assert.deepEqual(crossed.langs, ['ქართული'], 'language stopped crossing — it is a question about a person')
  assert.equal(crossed.minRating, 4.5)
  assert.deepEqual(crossed.price, [50, 100])
  assert.deepEqual(crossed.cities, ['TBILISI'])
  assert.deepEqual(sideFilters(refined, 'EXPERT').trades, [], 'a trade id crossed back the other way')

  // ⚠️ EVERY /experts?trade=… LINK EVER SENT PREDATES THE SWITCH, so the switch
  // has to be able to read one: a link to სანტექნიკა must open on the everyday
  // side rather than land on the professional one with its own filter hidden.
  assert.equal(verticalOfTrades(['plumbing']), 'SERVICE')
  assert.equal(verticalOfTrades(['law']), 'EXPERT')
  assert.equal(verticalOfTrades([]), null, 'an empty selection must not choose a side for anybody')

  // And „ფილტრის მოხსნა" is not a way out of the side you are on.
  assert.match(read(SHELL), /vertical: filters\.vertical/,
    'clearing the filters now moves the reader to the other half of the site')
})

test('the two filter blocks never name the same thing twice', () => {
  /* ⚠️ WHAT WENT WRONG. The everyday block drew ALL of LIVE_OFFER_GROUPS — 28
     groups, 20 of them professional — while the block above it drew the admin
     categories, whose slugs are the same words. Thirteen slugs were listed in
     both: business, law, marketing, it, design, psychology, career, media,
     relocation, grants, logistics, health, agriculture. Worse, the two are
     counted by different queries over different columns, so „მარკეტინგი და
     გაყიდვები" carried 6 in one block and 5 in the other on the live rail.
     This asserts the PROPERTY rather than the fix: whatever either block is
     fed from later, the two vocabularies may not intersect. */
  const everyday = LIVE_OFFER_GROUPS.filter(g => LIVE_SERVICE_GROUP_IDS.includes(g.id))
  assert.ok(everyday.length > 0, 'the everyday block has nothing to draw')

  // The professional block is fed by Category rows, whose slugs the seed and
  // the admin both write. These are the ones that exist today; the guarantee is
  // that no group id in the everyday block collides with any of them.
  const categorySlugs = new Set([
    'business', 'tax', 'law', 'marketing', 'it', 'psychology', 'design', 'career',
    'media', 'grants', 'relocation', 'logistics', 'health', 'agriculture',
    'real-estate', 'tourism', 'remonti', 'swavleba', 'medicine', 'architecture',
  ])
  const clash = everyday.filter(g => categorySlugs.has(g.id)).map(g => g.id)
  assert.deepEqual(clash, [], `these ids are drawn in BOTH filter blocks: ${clash.join(', ')}`)

  // And the everyday block is exactly the everyday half — not the whole roster,
  // which is the shape that caused the overlap.
  assert.ok(everyday.length < LIVE_OFFER_GROUPS.length,
    'the everyday block is drawing the entire roster again')
})

/* ═══════════ the model ══════════════════════════════════════════════════ */

const provider = (id: string, over: Record<string, unknown> = {}) => ({
  id, userId: `u-${id}`, companyId: null, slug: `s-${id}`, name: `provider-${id}`, isCompany: false,
  areas: '', areaIds: [], price: null, priceValue: 50, about: null, services: [],
  serviceIds: ['plumb-leak'], photoSrc: null, createdAt: '2026-02-01T00:00:00.000Z',
  headline: null, professions: [], verified: false, langs: [], rating: 0, catSlug: null,
  // Every row carries its side since 2026-09-01 (app/experts/_providers →
  // verticalsOfTopics). The default matches `serviceIds` above.
  verticals: ['SERVICE'], ...over,
}) as never

test('the typed query matches the words on the card, and nothing else', () => {
  // ⚠️ IT WAS A POSTGRES TRIGRAM SEARCH ON THE CONSULTATION HALF AND A
  // SUBSTRING MATCH ON THE OTHER (2026-08-24). One roster, one rule: the name,
  // the headline, the sentence, the services and the professions — every one of
  // them printed on the card, so a hit is never a result the reader cannot see.
  const p = provider('a', { name: 'ნინო', headline: 'ბუღალტერი', services: ['დეკლარაცია'], professions: ['ბუღალტერი'] })
  assert.equal(matchesQuery(p, 'ნინო'), true)
  assert.equal(matchesQuery(p, 'დეკლარაცია'), true, 'a service the card lists no longer matches')
  assert.equal(matchesQuery(p, 'ბუღალტერი'), true, 'a profession the profile claims no longer matches')
  assert.equal(matchesQuery(p, 'სანტექნიკოსი'), false)
  assert.equal(matchesQuery(p, '   '), true, 'an empty query must not narrow anything')
})

test('a price sort never invents a number for somebody who quotes per job', () => {
  // Somebody with no floor sorts LAST in BOTH directions rather than posing as
  // ₾0 — which would put them at the top of „cheapest first".
  const rows = [provider('a', { priceValue: 200 }), provider('b', { priceValue: 50 }), provider('c', { priceValue: null })]
  assert.deepEqual([...rows].sort(byPrice(1)).map((r: { id: string }) => r.id), ['b', 'a', 'c'])
  assert.deepEqual([...rows].sort(byPrice(-1)).map((r: { id: string }) => r.id), ['a', 'b', 'c'])
  const shell = read(SHELL)
  assert.match(shell, /case\s+'price-a':\s*out\s+=\s+\[\.\.\.out\]\.sort\(byPrice\(1\)\)/)
  assert.match(shell, /case\s+'price-d':\s*out\s+=\s+\[\.\.\.out\]\.sort\(byPrice\(-1\)\)/)
})

/* ═══════════ what the merge must NOT have cost ═════════════════════════ */

test('neither list query names a base64 column', () => {
  // ⚠️ THE IMAGE IS THE COLUMN (no object storage): 60 rows of `photoUrl` is a
  // twelve-megabyte page and nothing breaks visibly. Both halves are now loaded
  // on BOTH presets, so this doubled in importance the day they merged.
  const BLOB = /photoUrl:\s*true|workPhotos:\s*true|include:\s*\{[^}]*(photoUrl|workPhotos)/
  for (const f of [WORK_DATA, PAGE]) {
    assert.doesNotMatch(read(f), BLOB, `${f} selects a base64 column into a list`)
  }
  // The card points at the route instead, with a cache-busting stamp.
  assert.match(read(WORK_DATA), /\/api\/providers\/\$\{r\.id\}\/photo\?v=/)
})

test('ONE card, rendered through EntityCard', () => {
  // ⚠️ THERE WERE TWO — the expert's and the trades provider's — and this test
  // held them to the same shell so they could not drift into two products. One
  // roster since 2026-08-24, one card, and the shell is still the shared one.
  assert.ok(!has('app/experts/_card.tsx'), 'the consultation card came back')
  assert.match(read(WORK_CARD), /from '@\/components\/EntityCard'/,
    'the card no longer renders through EntityCard')
  const shell = read(SHELL)
  assert.match(shell, /<ProviderCard[^>]*m=\{m\}/, 'the card left the list')
  assert.match(shell, /from '@\/app\/experts\/_providerCard'/)
  // ONE ADDRESS SPACE since stage 11: the profile answers at /experts/<slug>.
  assert.match(read(WORK_CARD), /`\/experts\/\$\{m\.slug\}`/, 'the card lost /experts/<slug>')
  // And no new door to the intake (inventoried by tests/requests.test.ts).
  // Comments stripped: the card DISCUSSES the intake at length (why it must not
  // link to it), and a comment is not a door.
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(code(WORK_CARD), /['"`]\/request/)
})

test('the results header says how many are on screen', () => {
  const results = read(RESULTS)
  assert.match(results, /ნაჩვენებია <span[^>]*>\{total\}/,
    'the merged list stopped saying how many cards are below it')
  // ⚠️ THE SEARCH FIELD LEFT THIS HEADER ON 2026-08-31 and is in the page's
  // band now (app/experts/_hero) — the owner's design canvas puts it there, and
  // the home page's hero handing a typed query to this page is what settled it:
  // the field a query lands in cannot be the fourth control down. What is
  // asserted is that the field still EXISTS on the page and still registers
  // itself for the site-wide „/" and ⌘K, which is the property that would
  // actually break a reader.
  assert.doesNotMatch(results, /aria-label="ძებნა"/, 'the search field is back in the results header — it belongs in the band')
  const hero = read('app/experts/_hero.tsx')
  assert.match(hero, /aria-label="ძებნა"/, 'the catalogue lost its search field entirely')
  assert.match(hero, /registerSearchInput/, 'the „/" and ⌘K shortcuts no longer land on the catalogue search')
  assert.match(results, /aria-label="სორტირება"/, 'the sort select left the results header')
  // ⚠️ THE CROSS-KIND DEAD END IS GONE WITH THE SPLIT (2026-08-24). „ამ
  // ფილტრით არავინ არის — მოხსენი ფილტრი" existed because ticking a
  // consultation refinement AND a job refinement asked for somebody whose one
  // offering was two different things. There is one kind of row; every empty
  // result is „try another filter" again, and that is honest advice now.
  assert.match(read(SHELL), /ვერ ვიპოვეთ — სცადე სხვა ფილტრი/)
})

test('one rail, and every row is state — the refinements are still addresses', () => {
  // ⚠️ THE MECHANISM CHANGED WITH THE MERGE. /masters used to resolve every
  // refinement on the server, so each row was a `<Link>`; there is one loaded
  // list now, so every row is a button over it. The GUARANTEE that made links
  // right is kept by other means: the container writes the whole selection back
  // into the URL, so every view is an address somebody can send and Back walks
  // through them (asserted above). What must not come back is a link that
  // reloads the page to reach state the page already holds.
  const rail = read(RAIL)
  assert.doesNotMatch(rail, /<FilterRow[^>]*\shref=/, 'the rail invented addresses for client-side state')
  assert.match(rail, /<FilterRow[\s\S]{0,400}?onClick=\{\(\)\s+=>\s+setFilters\(/, 'the rail rows stopped being buttons')
  // And the shared row still supports BOTH mechanisms — the trade landing and any
  // future server-resolved rail would need the link arm.
  assert.match(read('components/catalog/FilterPanel.tsx'), /href \?/,
    'FilterRow no longer branches on href — one of the two mechanisms is gone')
})

test('the catalogue filters in ONE place — no dropdown bar, no second drawer', () => {
  const hero = read(HERO)
  assert.doesNotMatch(hero, /<FilterBox/, 'the horizontal dropdown filter bar is back in the hero')
  // ⚠️ THIS USED TO FORBID EVERY `<input>` IN THE BAND, on the reasoning that
  // the search field „belongs with the results". The field moved back into the
  // band on 2026-08-31 (the owner's design canvas → Catalogue) and the rule it
  // was really protecting is untouched: what must not return is a SECOND
  // REFINEMENT SURFACE above the results — the row of labelled dropdown boxes
  // (კატეგორია / ფასი / ენა / შეფასება) that stood here until 2026-08-19 and
  // duplicated the rail. Search is not a refinement: it replaces the set rather
  // than narrowing it. So: exactly ONE field, and no checkbox or select.
  const fields = (hero.match(/<input/g) ?? []).length
  assert.equal(fields, 1, `the band carries ${fields} fields — one search box, or the dropdown filter bar is back`)
  assert.doesNotMatch(hero, /<select|type="checkbox"/, 'a refinement control is back in the band — the rail is the one filter surface')
  const client = read(SHELL)
  assert.doesNotMatch(client, /<Sheet/, 'the phone filters drawer is back — one rail serves both widths')
  assert.doesNotMatch(client, /FiltersPanel/, 'the drawer’s copy of the refinements is back')
})

test('the layout toggle: two pressed-state buttons, 40×40, in the results header', () => {
  assert.ok(has('components/catalog/ViewToggle.tsx'))
  const toggle = read('components/catalog/ViewToggle.tsx')
  assert.match(toggle, /aria-pressed=/, 'the toggle does not announce which layout is on')
  assert.match(toggle, /Icon\.grid/)
  assert.match(toggle, /Icon\.list/)
  assert.match(toggle, /'ბადე'/)
  assert.match(toggle, /'სია'/)
  // The canon's blessed icon-button size, and the 40px tap floor exactly.
  // 🔒 the 40px tap floor, not one spelling of it: `w-10 h-10`, `size-10` and
  // `min-w-10 min-h-10` all satisfy the contract and a restyle may pick any.
  assert.match(toggle, /(w-10 h-10|size-10|min-w-10)/, 'the toggle buttons fell below the 40px tap floor')
  assert.match(read(RESULTS), /<ViewToggle/, 'the catalogue has no layout toggle')
})

test('one preference key, one default, for the whole site', () => {
  const hook = read('components/catalog/useCatalogView.ts')
  assert.match(hook, /CATALOG_VIEW_KEY = 'mcodne:catalog-view'/, 'the storage key changed — every reader loses their choice')
  assert.match(hook, /localStorage/, 'the choice is no longer remembered')
  // Nobody re-types the key or the default.
  for (const f of [RESULTS, SHELL, PAGE]) {
    assert.doesNotMatch(read(f), /mcodne:catalog-view/, `${f} hand-writes the storage key`)
  }
  assert.match(read(SHELL), /useCatalogView\(\)/)
})

test('the two result containers are written once, and the card is told which', () => {
  const hook = read('components/catalog/useCatalogView.ts')
  // The two views must stay a GRID and a COLUMN. Which gap or breakpoint they
  // use is a restyle, and pinning it here made the gate fail for a taste change.
  assert.match(hook, /grid: '[^']*grid-cols/, 'the grid view is no longer a grid')
  assert.match(hook, /list: '[^']*flex-col/, 'the list view is no longer a column of rows')
  // The shell reads that map rather than re-typing either class list, and the
  // same `view` reaches BOTH cards so the box and its contents agree.
  const shell = read(SHELL)
  assert.match(shell, /className=\{VIEW_CLASS\[view\]\}/)
  assert.match(shell, /<ProviderCard[^>]*view=\{view\}/)
})
