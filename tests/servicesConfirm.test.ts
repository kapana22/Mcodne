// „WE FILLED THIS IN — PLEASE CHECK IT." The one thing the migration could not
// do for anybody, and the rule that it must never try.
//
// Run: npx tsx tests/servicesConfirm.test.ts   (also in `npm run check`)
//
// WHY THIS FILE EXISTS. When consultations were removed (2026-08-24) the 27
// people who came across were seeded with their whole CATEGORY, because a
// provider with no services is invisible to routing and „nothing ticked" would
// have migrated them into silence. The cost is real and visible: all four
// lawyers claim all seven legal services, so they read as one person on a card
// and the filter narrows nothing.
//
// The obvious repair — derive each person's real list from the bio they wrote —
// was built, run against the live data, and DELIBERATELY NOT APPLIED. It works;
// that is not the problem. The problem is that a bio is evidence of what
// somebody DOES and never of what they do not, so it would have taken „დღგ"
// from an accountant who simply had not typed the word, and dropped them out of
// every queue that names it. Owner, the same day: „არაფერი არ უნდა შეცვალოს,
// წაშლა არ გვინდა, მათ უნდა შევიდნენ ისევ თავიან ექაუნთზე."
//
// So the mechanism is: change nothing, delete nothing, and ask the one person
// who can answer. What is pinned here is that it stays that way.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { completeness, type ProfileFacts } from '../lib/credits'
import { buildProfileChecks } from '../lib/profileScore'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Source with comments stripped — every negative assertion below would
 *  otherwise match the note that explains why the code does not do it. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')

/* ═══════════ A. nothing of theirs is rewritten ═══════════════════════════ */

test('A: no shipped code writes a provider’s services on their behalf', () => {
  // The ONE writer is the form's own endpoint, where the provider pressed save.
  const ALLOWED = new Set(['app/api/provider/service-profile/route.ts'])
  const offenders: string[] = []

  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${e}`
      if (statSync(join(ROOT, rel)).isDirectory()) { walk(rel); continue }
      if (!/\.tsx?$/.test(e)) continue
      if (ALLOWED.has(rel)) continue
      const src = code(rel)
      // `serviceProfile.update…{ services: … }` in any shape, on one line or
      // spread over several.
      if (/serviceProfile\s*\.\s*update(Many)?\(\s*\{[\s\S]{0,400}?\bservices\s*:/.test(src)) {
        offenders.push(rel)
      }
    }
  }
  for (const d of ['app', 'lib', 'components', 'scripts']) walk(d)

  assert.deepEqual(
    offenders, [],
    'these write a provider’s service list without the provider: their own words prove what they DO, ' +
    'never what they do not — narrowing on our side silently removes them from queues they belong in\n  ' +
    offenders.join('\n  '),
  )
})

test('A2: the migration seeds a category’s topics and never an academic one', () => {
  // `higher → ბუღალტერია` is what a student ticks to be TAUGHT accounting. Six
  // of the seeded categories lead with one, and 14 of 29 profiles carried it
  // until 2026-08-25 — first chip on the card, which is why every lawyer read
  // „სამართალი · ხელშეკრულება · +6" and looked like the same person.
  for (const f of ['lib/dbBoot.ts', 'prisma/manual-migrations/2026-08-24-services-only/up.sql']) {
    const src = read(f)
    const seed = src.slice(src.indexOf('_cat_topics'), src.indexOf('INSERT INTO "ServiceProfile"'))
    assert.ok(seed.length > 0, `${f}: the seed map moved — re-check this test`)
    for (const academic of ['accounting-l', 'law-l', 'management-l', 'finance-l', 'design-l', 'webdev-l']) {
      assert.doesNotMatch(
        seed, new RegExp(`'${academic}'`),
        `${f} seeds \`${academic}\` — that is the university SUBJECT, not the service`,
      )
    }
  }
})

/* ═══════════ B. the checklist can see the difference ═════════════════════ */

test('B: „has one" is not the question — an unconfirmed list is not done', () => {
  const seeded = { services: ['contract', 'court'], servicesConfirmedAt: null }
  const theirs = { services: ['contract'], servicesConfirmedAt: new Date() }

  const of = (p: Parameters<typeof buildProfileChecks>[0]) =>
    buildProfileChecks(p, null).find(c => c.id === 'services')!

  assert.equal(of(seeded).done, false,
    'a list the migration filled in reads as done — which is exactly the profile least likely to be true')
  assert.equal(of(theirs).done, true, 'a provider who saved their own list is still being asked')
  assert.notEqual(of(seeded).label, of(theirs).label,
    'the unconfirmed row must say WHY it is there — „აირჩიე" reads as „you did nothing"')
})

test('B2: confirming earns nothing — save must stay a free, honest yes', () => {
  const base: ProfileFacts = {
    hasPhoto: true, hasBio: true, hasProfessions: true,
    hasExperience: true, hasService: true, hasCertificate: true,
    servicesConfirmed: false,
  }
  assert.equal(
    completeness({ ...base, servicesConfirmed: true }),
    completeness(base),
    'money moved behind pressing save — a provider then has a reason to confirm a list they did not read',
  )
})

/* ═══════════ C. the note, and how it goes away ═══════════════════════════ */

test('C: the note is shown by the two workspace screens, above the rest', () => {
  // ⚠️ TWO SCREENS, AND THE SECOND ONE MOVED (2026-08-30). The note used to sit
  // on /work/services; that page and /work/profile are one editor now, and the
  // note is drawn by the editor component rather than by its page shell.
  for (const f of ['app/work/page.tsx', 'app/work/profile/_editor.tsx']) {
    assert.match(code(f), /<ConfirmServicesNote/, `${f} stopped asking`)
  }
  // ⚠️ /work reads the FACT, never its own query: tests/requestQueue §F holds
  // that page to one serviceProfile read, or the queue narrowing has two
  // sources that can disagree.
  assert.match(code('app/work/page.tsx'), /!facts\.servicesConfirmed/,
    '/work derives the flag some other way — profileFacts already reads the row')
})

test('C2: it goes on SAVE, never on dismiss', () => {
  const note = code('app/work/_components/ConfirmServicesNote.tsx')
  for (const dodge of ['dismiss', 'onClose', 'localStorage', 'setHidden']) {
    assert.doesNotMatch(note, new RegExp(dodge, 'i'),
      `the note can be dismissed — the one state we are trying to clear would clear without anybody looking`)
  }
  assert.match(
    code('app/api/provider/service-profile/route.ts'),
    /servicesConfirmedAt: new Date\(\)/,
    'saving the form no longer records that the list was looked at',
  )
})

test('C3: it says what we did, so „check this" has a reason attached', () => {
  const note = read('app/work/_components/ConfirmServicesNote.tsx')
  assert.match(note, /შევავსეთ/, 'the note stopped admitting that WE filled the list in')
  assert.match(note, /ფას/, 'the note stopped naming the price, which is the other half nobody can derive')
  // The retired word, pinned here too because this file is new copy on a screen.
  assert.doesNotMatch(code('app/work/_components/ConfirmServicesNote.tsx'), /სფერო/,
    '„სფერო" is retired — the menu says „კატეგორია" (tests/lexicon)')
})
