// Seven page archetypes, and the shared parts they are built from
// (CLAUDE.md → THE PAGE ARCHETYPES; restructuring v2 §8, stage 3, 2026-08-18).
//
// Source-text pins for the de-duplication that stage 3 did: one card shell for
// both catalogues, one filter chip, one step indicator for the wizards, one
// PageHeader import path, breadcrumbs on the catalogues, no hand-written
// max-w in the intake wizards, and the two things that were removed
// (the tutor PageHeader re-export, /ask) stay removed.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))

test('archetype 2 — catalogue: one card shell, one chip, a breadcrumb, two empty states', () => {
  // ⚠️ ONE CARD SINCE 2026-08-24 — `_card.tsx` (the consultation one) went with
  // the product. The shell it renders through is what kept the two from
  // drifting; it is still the shared one.
  assert.match(read('app/experts/_providerCard.tsx'), /from '@\/components\/EntityCard'/,
    'the card no longer renders through EntityCard')
  assert.ok(has('components/EntityCard.tsx') && has('components/FilterChip.tsx'))
  // The chip moved with the refinements it undoes (2026-08-19): the hero no
  // longer filters at all, so the active-filter row in the results bar is where
  // FilterChip lives — and the whole 44px pill now removes the refinement,
  // instead of a 24px „×" nested inside an h-8 pill.
  assert.match(read('app/experts/_results.tsx'), /FilterChip/, 'the catalogue chips stopped using FilterChip')
  // ONE hero, ONE trail (stage 10, 2026-08-19): there is one catalogue at one
  // address, so the band no longer branches on which entrance you came through.
  const hero = read('app/experts/_hero.tsx')
  assert.match(hero, /aria-label="ნავიგაცია"/, 'the catalogue lost its breadcrumb — the archetype requires one')
  assert.match(hero, /ექსპერტები/, 'the catalogue lost its trail')
  // The filter rail folds on a phone (M2). Since the two catalogues became ONE
  // list (2026-08-19, lib/catalogItems) — and then ONE PAGE the same day — there
  // is one container and one server page. The whole shared shell (one rail, one
  // toggle, one view preference, one type filter) is pinned in
  // tests/catalog.test.ts.
  const shell = read('app/experts/client.tsx')
  assert.match(shell, /<MobileCollapse/, 'the catalogue does not fold its filter rail on a phone')
  assert.match(shell, /from '@\/components\/catalog\/MobileCollapse'/, 'the catalogue folds with a private copy')
  // ⚠️ AND THE TRIGGER IS IN THE RESULTS HEADER SINCE 2026-09-01, beside the
  // sort and the layout toggle — one 44px row on a phone, where it was three
  // stacked full-width bars. tests/catalog.test.ts pins the pair in full.
  assert.match(read('app/experts/_results.tsx'), /aria-controls=\{filters\.panelId\}/,
    'the phone lost the button that opens the filter rail')
  assert.match(read('app/experts/page.tsx'), /<CatalogClient/, 'the catalogue page stopped rendering its container')
  // Two empty states, distinguished — „nobody is here yet" (nothing loaded at
  // all) and „nobody matches this" (the filters emptied a non-empty list).
  const empties = shell
  // ⚠️ THE COLD ONE IS PER SIDE SINCE 2026-09-01. With the switch on the rail
  // („პროფესიული" / „ყოველდღიური"), the roster is never empty while the other
  // side holds 23 people — so the question „is anybody here at all" became a
  // question about the SIDE being read, or the everyday side would answer it
  // with „ვერ ვიპოვეთ — სცადე სხვა ფილტრი" over filters that narrowed nothing.
  assert.match(empties, /sidePool\.length === 0 \? \(/, 'the cold-marketplace empty state is gone')
  assert.match(empties, /providers\.filter\(m => m\.verticals\.includes\(filters\.vertical\)\)/,
    'the cold empty state stopped asking about the side the reader is on')
  assert.match(empties, /ვერ ვიპოვეთ — სცადე სხვა ფილტრი/, 'the filtered-to-zero empty state is gone')
})

test('archetype 4 — intake wizard: one stage rail, Container sizes, no hand max-w', () => {
  /* ⚠️ `components/StepIndicator.tsx` IS DELETED (2026-09-02), and the sentence
     that used to justify keeping it was simply not true.
     The intake shell stopped using it on 2026-08-31, from the owner's design
     canvas: the primitive draws numbered dots on a connector line, right for a
     run whose steps are named destinations, and the intake's three are
     PROPORTIONS of one form, which the canvas draws as three filled bars. The
     note then said „the component is untouched and still serves its other call
     sites" — measured on 2026-09-02, it had NONE. Not one file imported it or
     rendered it; the only mention left in the whole tree was the comment above
     the rail explaining that it was no longer used.
     So this line asserted the presence of a file whose only purpose had become
     satisfying this line. What the archetype is actually about is asserted
     below and is untouched: the run says where you are, ONCE, in an ordered
     list, and never as links — you cannot jump to „კონტაქტი" without answering
     what precedes it. */
  const shell = read('app/request/_shell.tsx')
  // Comment-stripped: the file EXPLAINS the removal above the rail and names
  // the component while doing so. A negative assertion read against prose that
  // records the reason fails on its own changelog.
  const shellCode = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(shellCode, /<StepIndicator/, 'the shell draws BOTH the bars and the dots — one control, or the reader gets two answers')
  assert.match(shell, /<ol className="flex items-center gap-3">/, 'the stage rail is no longer an ordered list')
  assert.match(shell, /stages\.map/, 'the stage rail stopped rendering the run’s own stages')
  /* ⚠️ THE RULE IS „NO JUMPING AHEAD", AND IT WAS PINNED AS „NOTHING IS
     TAPPABLE" (repinned 2026-09-01, owner: „ზევით რომ აქვს პროცესი ღილაკების…
     მანდ გადასვლა-გადმოსვლებიც უნდა ჰქონდეს კომფორტისთვის").
     Those are not the same assertion, and the difference is the whole feature:
     a FINISHED stage is an answer already given, and `Transcript` has offered
     exactly that jump since the wizard was written. What must stay impossible
     is reaching „კონტაქტი" over an unanswered question — so the shell hands
     `onStage` to `done` rows and to nothing else, which is what is asserted
     here instead of the blanket ban.
     A `<Link>` would still be wrong: it is a route change, and this run has one
     address. */
  const rail = shell.slice(shell.indexOf('<ol className="flex items-center gap-3">'))
  assert.doesNotMatch(rail, /<Link/, 'a stage became a link — the run lives at one address')
  // Every `onStage ?` on the rail must be guarded, and by `done` — counting
  // them is what makes „and by nothing else" an assertion rather than a hope.
  const guarded = rail.match(/\w+ && onStage \? \(/g) ?? []
  const all = rail.match(/onStage \? \(/g) ?? []
  assert.deepEqual([...new Set(guarded)], ['done && onStage ? ('],
    'a stage that is not finished became tappable — you cannot jump ahead in this form')
  assert.equal(all.length, guarded.length, 'the rail hands onStage to a row with no guard at all')
  for (const f of ['app/join/_provider/client.tsx', 'app/join/JoinClient.tsx', 'app/request/_shell.tsx']) {
    assert.doesNotMatch(read(f), /<Container[^>]*max-w-\[/, `${f} hand-writes a max-w on Container — pick a size instead`)
  }
  assert.match(read('app/join/_provider/client.tsx'), /<Container size="(narrow|content)"/)
  // The door itself is the wizard archetype too: the narrow column, and it
  // hands the profession question to the shared picker rather than a copy.
  // ⚠️ THE PICKER LIVES IN THE LEAF SINCE 2026-08-20 (`_door/DoorQuestion`),
  // because the PUBLIC door asks the same question before the sign-up wall and
  // two copies of it would answer differently within a week.
  // ⚠️ /join IS ONE PAGE SINCE 2026-08-31 („ერთ გვერდზე იყოს ყველაფერი"), so
  // JoinClient no longer draws a screen of its own — it renders the form, and
  // the narrow column is the form's (`_provider/client.tsx`). Same archetype,
  // one file further in.
  assert.match(read('app/join/_provider/client.tsx'), /<Container size="(narrow|content)"/)
  assert.match(read('app/join/_door/DoorQuestion.tsx'), /<ProfessionPicker/)
  assert.doesNotMatch(read('app/join/JoinClient.tsx'), /<ProfessionPicker/, 'the door grew a second copy of the question')
})

test('archetypes 5/6 — workspace and form pages open with the shared PageHeader', () => {
  assert.equal(has('components/work/PageHeader.tsx'), false, 'the tutor PageHeader re-export is back — import @/components/PageHeader directly')
  // ⚠️ THE HEADER MOVED WITH THE SPLIT (2026-08-30). /settings is a server page
  // that resolves the session and hands it to the client half, so the markup —
  // and the shared PageHeader with it — lives in app/settings/client.tsx now.
  assert.match(read('app/settings/client.tsx'), /<PageHeader/)
  // ⚠️ `app/work/(expert)/bookings/page.tsx` WAS HERE AND IS GONE (2026-08-19).
  // The expert's booking LIST became the one list of work at /work/jobs; the
  // client's own list („app/me/bookings") went with the product on 2026-08-24.
  //
  // ⚠️ AND `app/me/requests/page.tsx` LEFT THIS LIST ON 2026-08-30 — it is a
  // redirect now, not a page. „მთავარი" and „მოთხოვნები" were one thing said
  // twice, so the home became the list; /me/favorites stands in for the client
  // room in this archetype, because it is the room's remaining titled page.
  for (const f of ['app/work/page.tsx', 'app/work/jobs/page.tsx', 'app/me/favorites/page.tsx']) {
    assert.match(read(f), /from '@\/components\/PageHeader'/, `${f} imports PageHeader from somewhere else`)
  }
})

test('archetype 1 — the home page is a marketing landing that closes on the supply band', () => {
  const home = read('app/HomeClient.tsx')
  assert.match(home, /<ClosingBand/)
  assert.doesNotMatch(home, /<JourneyBand|<ExpertCta/, 'the two closing CTAs are separate sections again')
  // ⚠️ `<RequestBand` WAS PINNED HERE UNTIL 2026-08-21 („the request band is the
  // owner’s own call (2026-08-17) — it stays"). It was, and it was superseded by
  // the owner’s own design canvas („მცოდნე — მთავარი გვერდი"), which composes
  // the page as hero → roster → spheres → steps → supply and carries the intake
  // in the header instead. Re-pinning the band would be a test out-voting the
  // person it was written for.
  //
  // WHAT IS ACTUALLY WORTH PINNING is what the removal could have broken: the
  // intake must still be reachable from the home page. It is — the header’s one
  // filled action — so assert THAT, at the level a reader would notice.
  assert.match(home, /<PublicTopBar/, 'the home page must render the shared header, which carries /request')
  const bar = read('components/PublicTopBar.tsx')
  assert.match(bar, /href: '\/request'/, 'the intake lost its last door on the home page')
})

test('/ask is gone and redirects, permanently, to the catalogue search', () => {
  assert.equal(has('app/ask'), false, 'app/ask came back — it was merged into /tutors?q=')
  const mw = read('middleware.ts')
  assert.match(mw, /\/ask/)
  assert.match(mw, /\/tutors\?q=|\/tutors/)
  for (const f of ['app/_home/hero.tsx', 'app/experts/client.tsx', 'components/BottomNav.tsx']) {
    assert.doesNotMatch(read(f).replace(/\/\/[^\n]*/g, ''), /['"`]\/ask/, `${f} still links to /ask`)
  }
})
