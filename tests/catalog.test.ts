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
  assert.match(shell, /lg:grid-cols-\[240px_1fr\]/, 'the catalogue is not the two-column shell any more')
  assert.match(shell, /<MobileCollapse/, 'the rail does not fold on a phone')
  assert.match(shell, /from '@\/components\/catalog\/MobileCollapse'/, 'the rail folds with a private copy')
  // Sticky lives in the shared panel, once — `lg:` so it only sticks where
  // there is a column to stick in.
  assert.match(read('components/catalog/FilterPanel.tsx'), /lg:sticky/,
    'the rail stopped sticking — it scrolls away from the results it refines')
  // And the fold is `lg:hidden` button + `lg:block` panel: on a desktop the
  // rail is simply always there.
  const collapse = read('components/catalog/MobileCollapse.tsx')
  assert.match(collapse, /lg:hidden/)
  assert.match(collapse, /lg:block/)
})

test('BOTH grid tracks carry min-w-0', () => {
  // A grid item's default `min-width` is `auto`: a `1fr` track will not shrink
  // below its content's intrinsic width, and one untruncatable name pushes the
  // page sideways at 390px. Caught in a screenshot on /masters once already,
  // and the canon is explicit that the body must never scroll horizontally.
  const src = read(SHELL)
  const grid = src.slice(src.indexOf('lg:grid-cols-[240px_1fr]'))
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

test('one taxonomy, and every section is always drawn', () => {
  // ⚠️ ONE RAIL, TWO NAMED BLOCKS, IN THE PRODUCT'S ORDER (2026-08-20).
  //
  // The history in three steps. It was „კატეგორია" (expert spheres) and
  // „სერვისი" (trades) — two headings answering the SAME question, so a plumber
  // and an accountant were filed apart with no way to know which. They became
  // ONE list ordered by count. Count then turned out to be the wrong ordering
  // for this site: the everyday trades fell to the bottom with zeros beside
  // them while the professional rows sat above, and a visitor read that as a
  // ranking of what mattered.
  //
  // Now the blocks are named and their ORDER is fixed by the product, not by
  // the roster: „პროფესიული სერვისები" first because that is what the site
  // leads with, „ყოველდღიური სერვისები" second because it is the other half of
  // what it sells. Count still orders rows INSIDE a block, where it means „here
  // is somebody to answer" rather than „this half matters more".
  //
  // Do not merge them back into one flat list, and do not sort the blocks
  // themselves — both changes have been made once and both were wrong.
  const rail = read(RAIL)
  assert.doesNotMatch(rail, /FilterGroup title="კატეგორია"/, 'the rail went back to one unnamed category list')
  const proIdx = rail.indexOf('FilterGroup title="პროფესიული სერვისები"')
  const dayIdx = rail.indexOf('FilterGroup title="ყოველდღიური სერვისები"')
  assert.ok(proIdx > -1, 'the professional block is gone')
  assert.ok(dayIdx > -1, 'the everyday block is gone')
  assert.ok(proIdx < dayIdx, 'the services block is drawn before the professional one')
  // Each block draws its own taxonomy…
  const pro = rail.slice(proIdx, dayIdx)
  const day = rail.slice(dayIdx)
  assert.match(pro, /liveCats/, 'the professional block lost the admin categories')
  assert.match(day, /EVERYDAY_OFFER_GROUPS/, 'the everyday block lost the trades')
  assert.match(pro, /\.sort\(\(a, b\) => b\.count - a\.count\)/, 'rows inside a block are no longer ordered by what has people')
  assert.match(day, /\.sort\(\(a, b\) => b\.count - a\.count\)/, 'rows inside a block are no longer ordered by what has people')
  // …and each still writes its own state field, because they filter different
  // columns; a reader cannot tell, and should not have to.
  assert.match(pro, /cats: toggleIn\(filters\.cats/)
  assert.match(day, /trades: toggleIn\(filters\.trades/)
  for (const section of ['title="ფასი"', 'title="ენა"', 'title="მინ. რეიტინგი"', 'title="ქალაქი"']) {
    assert.ok(rail.indexOf(section) > -1, `the section ${section} is gone`)
  }
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
  headline: null, professions: [], verified: false, langs: [], rating: 0, catSlug: null, ...over,
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
  assert.match(results, /aria-label="ძებნა"/, 'the search field left the results header')
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
  assert.doesNotMatch(hero, /<input/, 'the search field is back in the hero — it belongs with the results')
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
