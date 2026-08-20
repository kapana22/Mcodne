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
 * So the kind is a property of what somebody OFFERS, not of who they are; the
 * pill switch that used to swap the two catalogues is a rail section; and one
 * person is one card even when they hold both halves.
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

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))

/* ONE container, ONE rail, ONE results chrome, ONE server page. Everything
 * lives in app/experts/ — including the job half's MODEL and CARD
 * (`_masterData` / `_masterCard`, which /experts/<slug> and /experts/<trade>
 * read too), which moved out of app/masters when that folder went. */
const SHELL = 'app/experts/client.tsx'
const RAIL = 'app/experts/_filters.tsx'
const RESULTS = 'app/experts/_results.tsx'
const HERO = 'app/experts/_hero.tsx'
const PAGE = 'app/experts/page.tsx'
const WORK_DATA = 'app/experts/_masterData.ts'
const WORK_CARD = 'app/experts/_masterCard.tsx'

const {
  resolveTypes, toggleType, typeParam, toCatalogItems, byPrice, KIND_LABEL,
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
  assert.match(read('components/catalog/FilterPanel.tsx'), /lg:sticky lg:top-24/,
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

test('the type is a mechanism, not a control — no section for it in the rail', () => {
  // It was the FIRST section, then the LAST, and neither was right: a category
  // already answers it („სანტექნიკა" IS a service, „ფსიქოლოგია" IS a
  // consultation), and the word „სერვისი" ended up meaning two different things
  // on one screen — a group heading and a checkbox. Owner: „ფილტრაციები და
  // კატეგორიები არეულად არის." The narrowing survives as `?type=` and inside
  // the item filter; it simply has no control of its own.
  const rail = read(RAIL)
  assert.doesNotMatch(rail, /KIND_SECTION_TITLE/, 'the type section came back to the rail')
  assert.doesNotMatch(rail, /onClick=\{\(\) => setFilters\(\{ \.\.\.filters, types:/, 'the rail toggles the type again')
  // …and the mechanism is still there, so a link can still narrow.
  assert.match(read('lib/catalogItems.ts'), /export function toggleType/)
  assert.match(read(SHELL), /types:/, 'the client stopped carrying the type narrowing')
})

test('never zero types selected — unticking the last one turns BOTH on', () => {
  // An empty selection is an empty page with no way back except the reset link:
  // a state a filter must not be able to reach by its own rules. „Neither" and
  // „both" mean the same thing to the query, so the empty selection resolves to
  // the full one and the rail redraws with both boxes ticked.
  assert.deepEqual(toggleType(['CONSULT'], 'CONSULT'), ['CONSULT', 'WORK'])
  assert.deepEqual(toggleType(['WORK'], 'WORK'), ['CONSULT', 'WORK'])
  assert.deepEqual(toggleType(['CONSULT'], 'WORK'), ['CONSULT', 'WORK'])
  assert.deepEqual(toggleType(['CONSULT', 'WORK'], 'WORK'), ['CONSULT'])
  // …and the same guarantee on the way in from a URL.
  // …and on the way in from a URL the default is EVERYTHING: each address used
  // to open on its own half, which left two catalogues wearing one skin.
  assert.deepEqual(resolveTypes(''), ['CONSULT', 'WORK'])
  assert.deepEqual(resolveTypes('nonsense'), ['CONSULT', 'WORK'])
  assert.deepEqual(resolveTypes(null), ['CONSULT', 'WORK'])
  assert.deepEqual(resolveTypes('WORK'), ['WORK'], 'an explicit ?type= still narrows')
})

test('ONE server page at /experts, loading BOTH halves, and no second catalogue', () => {
  // ⚠️ THE TWO OLD FOLDERS ARE GONE. Leaving either behind means a second list
  // that can drift from this one, which is the failure this whole file exists
  // to prevent; both addresses 308 here (tests/redirects.test.ts executes it).
  assert.ok(!has('app/tutors'), 'app/tutors is back — the catalogue lives at /experts')
  assert.ok(!has('app/masters'), 'app/masters is back — there is one catalogue')
  assert.match(read(PAGE), /<CatalogClient/, 'the page does not render the catalogue container')
  assert.doesNotMatch(read(PAGE), /redirect\(/, 'the catalogue URL must answer, never redirect')
  // Both halves are loaded: there is one list, so ticking either type must not
  // need a round trip.
  assert.match(read(PAGE), /queryTutors\(/, 'the page does not load the consultation half')
  assert.match(read(PAGE), /queryMasters\(/, 'the page does not load the job half')
  // The job half is loaded UNFILTERED — the browser narrows it now — and its
  // VISIBLE rule is untouched (pinned in full by tests/masterProfile.test.ts).
  assert.match(read(PAGE), /queryMasters\(\{ groups: \[\], topics: \[\], cities: \[\] \}\)/)
  assert.match(read(WORK_DATA), /available: true/)
  assert.match(read(WORK_DATA), /published: true/)
  assert.match(read(WORK_DATA), /requestAccess: \{ active: true \}/)
  // The page reads FEATURE_REQUESTS ONCE and hands the CTA its address, so the
  // header's door and the empty state's door cannot disagree.
  assert.match(read(PAGE), /const on = requestsOn\(\)/)
  assert.match(read(PAGE), /requestHref=\{on \? REQUEST_HREF : null\}/)
})

test('the type is in the URL, so a narrowed view is linkable and Back works', () => {
  // Silent while BOTH halves are shown — that is what the bare address already
  // means, and the same rule `sort` follows for its default, so a shared link
  // never carries a choice the sender did not make.
  assert.equal(typeParam(['CONSULT', 'WORK']), null)
  assert.equal(typeParam(['CONSULT']), 'CONSULT')
  assert.equal(typeParam(['WORK']), 'WORK')
  // …and whatever it omits, resolveTypes must default back to.
  assert.deepEqual(resolveTypes(typeParam(['CONSULT', 'WORK'])), ['CONSULT', 'WORK'])
  const shell = read(SHELL)
  assert.match(shell, /const type = typeParam\(filters\.types\)[\s\S]{0,120}url\.set\('type', type\)/,
    'the type selection stopped reaching the URL — a narrowed view would not be a link')
  assert.match(shell, /resolveTypes\(p\?\.get\('type'\)\)/, 'the URL no longer seeds the type')
  // The job half's two parameters keep the names /masters always used, so every
  // filtered link ever sent still resolves.
  assert.match(shell, /url\.set\('trade', filters\.trades\.join\(','\)\)/)
  assert.match(shell, /url\.set\('city', filters\.cities\.join\(','\)\)/)
  assert.match(shell, /parseTrades\(p\?\.get\('trade'\)\)/)
  assert.match(shell, /parseCities\(p\?\.get\('city'\)\)/)
  // And there is exactly ONE address to write back into.
  assert.match(shell, /const CATALOG_PATH = '\/experts'/)
  assert.match(shell, /router\.replace\(qs \? `\$\{CATALOG_PATH\}\?\$\{qs\}` : CATALOG_PATH/)
  // Comment-stripped: the file's header EXPLAINS that the prop is gone, and a
  // negative assertion must not be failed by the prose that records the reason.
  const shellCode = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(shellCode, /basePath/, 'the container takes an address as a prop again — there is one page')
  assert.doesNotMatch(shellCode, /\bpreset\b/, 'the container branches on a preset again — there is one page')
})

test('one taxonomy, and every section is always drawn', () => {
  // ⚠️ TWO SECTIONS ANSWERED THE SAME QUESTION. „კატეგორია" held the expert
  // spheres and „სერვისი" held the trades, so a plumber and an accountant were
  // filed under different headings with no way to know which. They are one list
  // now, ordered by count, with the trades' narrower topics nested under a
  // ticked row. The rail also never rearranges itself: sections do not appear
  // and disappear with what is ticked.
  const rail = read(RAIL)
  assert.match(rail, /const showConsult = true/, 'the consultation sections are conditional again')
  assert.match(rail, /const showWork = true/, 'the job sections are conditional again')
  assert.doesNotMatch(rail, /FilterGroup title="სერვისი"/, 'the trades are a separate section again')
  assert.match(rail, /FilterGroup title="კატეგორია"/)
  // Both taxonomies live inside that one section…
  const cat = rail.slice(rail.indexOf('FilterGroup title="კატეგორია"'), rail.indexOf('</FilterGroup>', rail.indexOf('FilterGroup title="კატეგორია"')))
  assert.match(cat, /liveCats\.map/, 'the spheres left the one category list')
  assert.match(cat, /LIVE_SERVICE_GROUPS\.map/, 'the trades left the one category list')
  assert.match(cat, /\.sort\(\(a, b\) => b\.count - a\.count\)/, 'the one list is no longer ordered by what has people')
  // …and each half still writes its own state field, because they filter
  // different columns.
  assert.match(cat, /cats: toggleIn\(filters\.cats/)
  assert.match(cat, /trades: toggleIn\(filters\.trades/)
  for (const section of ['title="ფასი"', 'title="ენა"', 'title="მინ. რეიტინგი"', 'title="ქალაქი"']) {
    assert.ok(rail.indexOf(section) > -1, `the section ${section} is gone`)
  }
})

/* ═══════════ the model ══════════════════════════════════════════════════ */

const tutor = (id: string, userId: string | null, over: Record<string, unknown> = {}) => ({
  id, userId, name: `expert-${id}`, price: 100, consultations: [], sessions: 7,
  createdAt: '2026-01-01T00:00:00.000Z', langs: ['ქართული'], rating: 0, catSlug: null,
  superExpert: false, professions: [], ...over,
}) as any

const master = (id: string, userId: string | null, over: Record<string, unknown> = {}) => ({
  id, userId, companyId: null, slug: `s-${id}`, name: `master-${id}`, isCompany: false,
  areas: '', areaIds: [], price: null, priceValue: 50, about: null, services: [],
  serviceIds: ['plumb-leak'], photoSrc: null, createdAt: '2026-02-01T00:00:00.000Z', ...over,
}) as any

test('the merged mapper is PURE and covers both kinds', () => {
  const items = toCatalogItems([tutor('t1', 'u1')], [master('s1', 'u2')])
  assert.equal(items.length, 2)
  assert.deepEqual(items[0].kinds, ['CONSULT'])
  assert.deepEqual(items[1].kinds, ['WORK'])
  // Each side carries its ORIGINAL row whole — the two cards render from them
  // and keep every behaviour they have.
  assert.equal(items[0].consult?.id, 't1')
  assert.equal(items[0].work, null)
  assert.equal(items[1].work?.id, 's1')
  assert.equal(items[1].consult, null)
  // Consultations first, then jobs: the curated order the seed arrived in.
  assert.deepEqual(items.map(i => i.key), ['u:u1', 'u:u2'])
  // Pure: same input, same output, and the inputs are not mutated.
  const again = toCatalogItems([tutor('t1', 'u1')], [master('s1', 'u2')])
  assert.deepEqual(again.map(i => i.key), items.map(i => i.key))
  assert.deepEqual(toCatalogItems([], []), [])
})

test('ONE PERSON IS ONE CARD, even holding both halves', () => {
  // ⚠️ NOT EXERCISABLE TODAY, AND THAT IS EXACTLY WHY IT IS PINNED. Measured
  // 2026-08-19: 26 experts, 6 masters, zero people holding both. Owner:
  // „ექსპერტს აქვს სერვისი რეალურად და პარალელურად აკეთებს კონსულტაციასაც." The
  // day somebody turns on their second capability (lib/capabilities →
  // enableCapabilityHref), a concatenation would print them twice and nothing
  // on screen would say the two cards are one person.
  const items = toCatalogItems(
    [tutor('t1', 'both'), tutor('t2', 'u2')],
    [master('s1', 'both'), master('s2', 'u3')],
  )
  assert.equal(items.length, 3, 'the person holding both halves was printed twice')
  const both = items.find(i => i.key === 'u:both')!
  assert.deepEqual(both.kinds, ['CONSULT', 'WORK'], 'the merged person lost one of their halves')
  assert.equal(both.consult?.id, 't1')
  assert.equal(both.work?.id, 's1')
  // The identity is the USER. A row with no user falls back to its own table's
  // id, so a company's profile is still exactly one card.
  const anon = toCatalogItems([tutor('t9', null)], [master('s9', null, { companyId: 'c9' })])
  assert.deepEqual(anon.map(i => i.key), ['t:t9', 'c:c9'])
  // And a person with both must survive BOTH single-kind filters — filtering
  // means „offers this kind", never „is this kind".
  assert.ok(both.kinds.includes('CONSULT') && both.kinds.includes('WORK'))
  // …and the CARD does not print that as a badge beside the name: a card says
  // what somebody DOES (the chips), never what kind of person they are.
  // Owner, 2026-08-19, on seeing the „სამუშაო" badge: „ეს მოგწონს ახლა?" — no.
  assert.doesNotMatch(read('app/experts/client.tsx'), /kinds=\{labels\}/,
    'the card labels the person by type again')
  // ⚠️ AND NOTHING PRINTS THAT AS A BADGE. The shell used to hand the card
  // `kinds` so a chip beside the name read „სამუშაო" — labelling the human by
  // type, which is the one thing this model says not to do. The kinds stay in
  // the ITEM (the filter reads them); the CARD says what the person does.
})

test('every sort means something on both halves', () => {
  // A price sort across two halves needs one rule, and it is written down:
  // somebody who quotes per job has no number and sorts LAST in BOTH
  // directions, rather than posing as ₾0.
  const items = toCatalogItems(
    [tutor('t1', 'u1', { price: 200 })],
    [master('s1', 'u2', { priceValue: 50 }), master('s2', 'u3', { priceValue: null })],
  )
  const asc = [...items].sort(byPrice(1)).map(i => i.key)
  const desc = [...items].sort(byPrice(-1)).map(i => i.key)
  assert.deepEqual(asc, ['u:u2', 'u:u1', 'u:u3'])
  assert.deepEqual(desc, ['u:u1', 'u:u2', 'u:u3'])
  // The job half has no session count — 0, never an invented number — and it
  // carries a real date, so „ახლის მიხედვით" is not a consultation-only sort.
  assert.equal(items[1].sessions, 0)
  assert.ok(items[1].createdAt > 0, 'a job row with no date would sink to the bottom of the default sort')
  const shell = read(SHELL)
  assert.match(shell, /case 'price-a':\s*out = \[\.\.\.out\]\.sort\(byPrice\(1\)\)/)
  assert.match(shell, /case 'price-d':\s*out = \[\.\.\.out\]\.sort\(byPrice\(-1\)\)/)
  assert.match(shell, /case 'new':\s*if \(!rankedByRelevance\) out = \[\.\.\.out\]\.sort\(\(a, b\) => b\.createdAt - a\.createdAt\)/)
})

/* ═══════════ what the merge must NOT have cost ═════════════════════════ */

test('neither list query names a base64 column', () => {
  // ⚠️ THE IMAGE IS THE COLUMN (no object storage): 60 rows of `photoUrl` is a
  // twelve-megabyte page and nothing breaks visibly. Both halves are now loaded
  // on BOTH presets, so this doubled in importance the day they merged.
  const BLOB = /photoUrl:\s*true|workPhotos:\s*true|include:\s*\{[^}]*(photoUrl|workPhotos)/
  for (const f of [WORK_DATA, 'lib/tutorsQuery.ts', PAGE]) {
    assert.doesNotMatch(read(f), BLOB, `${f} selects a base64 column into a list`)
  }
  // The card points at the route instead, with a cache-busting stamp.
  assert.match(read(WORK_DATA), /\/api\/masters\/\$\{r\.id\}\/photo\?v=/)
})

test('both cards still render through EntityCard, and both are in the one list', () => {
  for (const f of ['app/experts/_card.tsx', WORK_CARD]) {
    assert.match(read(f), /from '@\/components\/EntityCard'/,
      `${f} no longer renders through EntityCard — the two halves will drift apart again`)
  }
  const shell = read(SHELL)
  assert.match(shell, /<TutorCard[^>]*t=\{it\.consult\}/, 'the consultation card left the merged list')
  assert.match(shell, /<MasterCard[^>]*m=\{it\.work\}/, 'the job card left the merged list')
  assert.match(shell, /from '@\/app\/experts\/_masterCard'/)
  // Each keeps its own footer and its own destination — the merge did not
  // flatten them into a card with neither. ⚠️ ONE ADDRESS SPACE since stage 11:
  // the master's profile answers at /experts/<slug>, like the expert's.
  assert.match(read(WORK_CARD), /`\/experts\/\$\{m\.slug\}`/, 'the master card lost /experts/<slug>')
  assert.match(read('app/experts/_card.tsx'), /vt-photo-\$\{t\.id\}/, 'the expert card lost its shared-element photo')
  // And no new door to the intake was opened by the merge (inventoried by
  // tests/requests.test.ts): the two gated CTAs stay where they were.
  // Comments stripped: both cards DISCUSS the intake at length (why they must
  // not link to it), and a comment is not a door.
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(code(WORK_CARD), /['"`]\/request/)
  assert.doesNotMatch(code('app/experts/_card.tsx'), /['"`]\/request/)
})

test('the results header says how many are on screen', () => {
  const results = read(RESULTS)
  assert.match(results, /ნაჩვენებია <span[^>]*>\{total\}/,
    'the merged list stopped saying how many cards are below it')
  assert.match(results, /aria-label="ძებნა"/, 'the search field left the results header')
  assert.match(results, /aria-label="სორტირება"/, 'the sort select left the results header')
  // The dead end the merge created has its own words: no other value of either
  // filter helps, so „try another filter" would be bad advice.
  assert.match(read(SHELL), /ამ ფილტრით არავინ არის — მოხსენი ფილტრი/)
  assert.match(read(SHELL), /crossKindDeadEnd = consultRefined\(filters\) && workRefined\(filters\)/)
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
  assert.match(rail, /<FilterRow[\s\S]{0,400}?onClick=\{\(\) => setFilters\(/, 'the rail rows stopped being buttons')
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
  assert.match(toggle, /w-10 h-10/, 'the toggle buttons fell below the 40px tap floor')
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
  assert.match(hook, /grid: 'grid gap-4 sm:grid-cols-2'/, 'the grid view is no longer the catalogue grid')
  assert.match(hook, /list: 'flex flex-col gap-3'/, 'the list view is no longer a column of rows')
  // The shell reads that map rather than re-typing either class list, and the
  // same `view` reaches BOTH cards so the box and its contents agree.
  const shell = read(SHELL)
  assert.match(shell, /className=\{VIEW_CLASS\[view\]\}/)
  assert.match(shell, /<TutorCard[^>]*view=\{view\}/)
  assert.match(shell, /<MasterCard[^>]*view=\{view\}/)
})
