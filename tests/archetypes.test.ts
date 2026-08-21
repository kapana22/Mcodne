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
  for (const f of ['app/experts/_card.tsx', 'app/experts/_masterCard.tsx']) {
    assert.match(read(f), /from '@\/components\/EntityCard'/, `${f} no longer renders through EntityCard — the two catalogues will drift apart again`)
  }
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
  assert.match(read('app/experts/page.tsx'), /<CatalogClient/, 'the catalogue page stopped rendering its container')
  // Two empty states, distinguished — „nobody is here yet" (nothing loaded at
  // all) and „nobody matches this" (the filters emptied a non-empty list).
  const empties = shell
  assert.match(empties, /items\.length === 0 \? \(/, 'the cold-marketplace empty state is gone')
  assert.match(empties, /ვერ ვიპოვეთ — სცადე სხვა ფილტრი/, 'the filtered-to-zero empty state is gone')
})

test('archetype 4 — intake wizard: one StepIndicator, Container sizes, no hand max-w', () => {
  assert.ok(has('components/StepIndicator.tsx'))
  assert.match(read('app/join/_expert/ApplyClient.tsx'), /<StepIndicator/)
  assert.match(read('app/request/_shell.tsx'), /<StepIndicator[^>]*variant="list"/)
  for (const f of ['app/join/_master/client.tsx', 'app/join/JoinClient.tsx', 'app/request/_shell.tsx']) {
    assert.doesNotMatch(read(f), /<Container[^>]*max-w-\[/, `${f} hand-writes a max-w on Container — pick a size instead`)
  }
  assert.match(read('app/join/_master/client.tsx'), /<Container size="(narrow|content)"/)
  // The door itself is the wizard archetype too: the narrow column, and it
  // hands the profession question to the shared picker rather than a copy.
  // ⚠️ THE PICKER LIVES IN THE LEAF SINCE 2026-08-20 (`_door/DoorQuestion`),
  // because the PUBLIC door asks the same question before the sign-up wall and
  // two copies of it would answer differently within a week.
  assert.match(read('app/join/JoinClient.tsx'), /<Container as="main" size="narrow"/)
  assert.match(read('app/join/_door/DoorQuestion.tsx'), /<ProfessionPicker/)
  assert.doesNotMatch(read('app/join/JoinClient.tsx'), /<ProfessionPicker/, 'the door grew a second copy of the question')
})

test('archetypes 5/6 — workspace and form pages open with the shared PageHeader', () => {
  assert.equal(has('components/tutor/PageHeader.tsx'), false, 'the tutor PageHeader re-export is back — import @/components/PageHeader directly')
  assert.match(read('app/settings/page.tsx'), /<PageHeader/)
  // ⚠️ `app/work/(expert)/bookings/page.tsx` WAS HERE AND IS GONE (2026-08-19).
  // The expert's booking LIST became the one list of work at /work/jobs (the
  // detail page under it did not move); the archetype it stood for is the same
  // one, so the assertion follows the page rather than being dropped.
  for (const f of ['app/work/page.tsx', 'app/work/jobs/page.tsx', 'app/me/bookings/page.tsx']) {
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
