/*
 * WHAT A PROVIDER SEES IN THE OPEN QUEUE — lib/requestRouting → queueScope.
 *
 * Run: npx tsx tests/requestQueue.test.ts   (also in `npm run check`)
 *
 * ⚠️ THE MEASURED FAILURE THIS FILE EXISTS FOR, 2026-08-21. Of 12 verified
 * requests with room left, a provider with NO ServiceProfile saw all 12 —
 * ქიმია, მათემატიკა and ეროვნული გამოცდები included. That was every expert
 * holding only CONSULT, every company member and every admin, because the
 * narrowing took a ServiceProfile and read its absence as „no filter".
 * Owner: „რეალურად უსარგებლო მოთხოვნები არ უნდა შედიოდეს — თუ ქიმიის
 * მასწავლებელს ეძებენ, არ უნდა მიუვიდეს დამლაგებელს."
 *
 * Everything below CALLS the functions. There is no source regex except §F,
 * which is checking that a fourth copy of the rule has not appeared — a fact
 * about the tree that no unit call can see.
 *
 *   A. the trades half still behaves exactly as it did;
 *   B. an expert is narrowed by sphere ∪ profession — the mail's own two facts;
 *   C. a teacher gets LEARNING and a cleaner never does;
 *   D. no offer means no queue, and the scope says WHICH silence;
 *   E. the admin is a fallback and never an override;
 *   F. one narrowing, three readers, and it cannot collide with their `OR`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  queueScope, queueWhere, topicsForProfessions, routeRequest,
  type QueueOffer,
} from '../lib/requestRouting'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** The two real ServiceProfiles on production, 2026-08-21. */
const CLEANER: QueueOffer = {
  service: { services: ['clean-flat', 'clean-deep', 'clean-office', 'clean-repair', 'clean-sofa', 'clean-window'], areas: ['TBILISI'], available: true },
  expert: null, isAdmin: false,
}
const PLUMBER: QueueOffer = {
  service: { services: ['plumb-boiler', 'plumb-leak'], areas: ['TBILISI'], available: true },
  expert: null, isAdmin: false,
}
const expert = (categorySlug: string | null, professions: string[], categoryId: string | null = categorySlug && `cat-${categorySlug}`): QueueOffer =>
  ({ service: null, expert: { categoryId, categorySlug, professions }, isAdmin: false })

/** The topic ids a scope will admit, for the assertions that are about the
 *  vocabulary rather than about SQL. */
function topicsOf(o: QueueOffer): Set<string> {
  const s = queueScope(o)
  const out = new Set<string>()
  if (s.mode !== 'FILTERED') return out
  for (const t of s.work?.topics ?? []) out.add(t)
  for (const t of s.topics) out.add(t)
  return out
}

/* ═══════════ A. the trades half is untouched ═══════════════════════════ */

test('§A a master is narrowed to the trades they ticked and the cities they travel to', () => {
  const s = queueScope(CLEANER)
  assert.equal(s.mode, 'FILTERED')
  if (s.mode !== 'FILTERED') return
  assert.deepEqual(s.work, { topics: CLEANER.service!.services, areas: ['TBILISI'] })
  // No expert facts to add: they have no TutorProfile.
  assert.deepEqual(s.topics, [])
  assert.equal(s.categoryId, null)

  // …and it reaches the database as the topic+city pair it always was.
  const w = queueWhere(s) as any
  assert.deepEqual(w.AND[0].OR[0], { topic: { in: CLEANER.service!.services }, city: { in: ['TBILISI'] } })
})

test('§A the ban the owner asked for: a school subject is not in a master\'s queue', () => {
  for (const [name, who] of [['cleaner', CLEANER], ['plumber', PLUMBER]] as const) {
    const mine = topicsOf(who)
    for (const subject of ['chemistry', 'math', 'nat-exams', 'physics', 'english']) {
      assert.ok(!mine.has(subject), `${name} was shown „${subject}"`)
    }
  }
})

test('§A a master with no city is matched on the trade alone, not on nothing', () => {
  // `city` has a default today; a row written before it did must stay routable.
  const w = queueWhere(queueScope({ ...PLUMBER, service: { ...PLUMBER.service!, areas: [] } })) as any
  assert.deepEqual(w.AND[0].OR[0], { topic: { in: ['plumb-boiler', 'plumb-leak'] } })
})

/* ═══════════ B. the expert half = the mail's own two facts ═════════════ */

test('§B the queue narrows an expert by SPHERE — the same column the mail compares', () => {
  const lawyer = expert('law', [])
  const s = queueScope(lawyer)
  assert.equal(s.mode, 'FILTERED')
  if (s.mode !== 'FILTERED') return
  // The sphere is compared column to column, because ServiceRequest.categoryId
  // is derived from the topic at write time — exactly what routeRequest does.
  assert.equal(s.categoryId, 'cat-law')
  assert.deepEqual(
    routeRequest('cat-law', [{ userId: 'me', categoryId: 'cat-law' }]).recipients, ['me'],
    'the mail and the queue stopped using the same sphere fact')
})

test('§B …and by PROFESSION, whole label, never a substring', () => {
  const accountant = expert('tax', ['ბუღალტერი'])
  const mine = topicsOf(accountant)
  assert.ok(mine.has('vat'), 'a ბუღალტერი is not shown a დღგ question')
  assert.ok(mine.has('declaration'))
  // The mail agrees, and that is the point of reusing the fact rather than
  // inventing a second rule.
  assert.deepEqual(
    routeRequest(null, [{ userId: 'me', categoryId: null, professions: ['ბუღალტერი'] }], { topic: 'vat', city: null }).recipients,
    ['me'])

  // „იურისტი" must not catch „კორპორატიული იურისტი" — two entries in the
  // owner's list, and the corporate lawyer's request names the corporate one.
  assert.ok(!topicsForProfessions(['იურისტი']).includes('corp-law'))
  assert.ok(topicsForProfessions(['კორპორატიული იურისტი']).includes('corp-law'))
  // Trimmed and case-insensitive, like the mail.
  assert.deepEqual(topicsForProfessions(['  ბუღალტერი ']), topicsForProfessions(['ბუღალტერი']))
  assert.deepEqual(topicsForProfessions([]), [])
})

test('§B an expert is never shown a trade', () => {
  for (const who of [expert('law', ['ადვოკატი']), expert('tax', ['ბუღალტერი']), expert('psychology', ['ფსიქოლოგი'])]) {
    const mine = topicsOf(who)
    for (const trade of ['clean-flat', 'plumb-leak', 'elec-wiring', 'rep-paint']) {
      assert.ok(!mine.has(trade), `an expert was shown „${trade}"`)
    }
  }
})

/* ═══════════ C. teaching ═══════════════════════════════════════════════ */

test('§C somebody filed under სწავლება is shown LEARNING, including ქიმია', () => {
  const teacher = expert('swavleba', [])
  const mine = topicsOf(teacher)
  // ⚠️ THE CASE THE OWNER NAMED. The sphere table holds no school subject, so
  // topic-level sphere agreement can never reach ქიმია for anybody — the fact
  // does not exist to compare. The owner's launch list (lib/launchTaxonomy)
  // files სწავლება under side 'LEARN', and that IS the fact „this person
  // teaches".
  assert.ok(mine.has('chemistry'), 'a chemistry request reaches nobody at all')
  assert.ok(mine.has('math'))
  assert.ok(mine.has('nat-exams'))
  assert.ok(mine.has('english'))
  // …and still not a trade.
  assert.ok(!mine.has('clean-flat'))
  assert.ok(!mine.has('plumb-leak'))
})

test('§C a teaching PROFESSION counts even under another sphere', () => {
  // „პროგრამირების მასწავლებელი" is filed under swavleba in lib/professions
  // while the person may sit in the `it` sphere. CategoryNode ∪ profession, exactly
  // as the mail unions them — leaving one half out would be a second rule.
  assert.ok(topicsOf(expert('it', ['პროგრამირების მასწავლებელი'])).has('chemistry'))
  assert.ok(!topicsOf(expert('it', [])).has('chemistry'))
})

test('§C a consulting sphere does not become a teaching one', () => {
  for (const slug of ['law', 'tax', 'psychology', 'business']) {
    assert.ok(!topicsOf(expert(slug, [])).has('chemistry'), `„${slug}" was treated as teaching`)
  }
})

/* ═══════════ D. no offer, and which silence ════════════════════════════ */

test('§D nobody with nothing to offer is shown the platform', () => {
  // The measured bug: each of these saw all 12 open requests.
  const nothing: QueueOffer = { service: null, expert: null, isAdmin: false }
  // ⚠️ NO `fix` SINCE 2026-08-30. The variant carried „SERVICES" | „PROFILE" to
  // tell the queue's empty state WHICH of two editors owned the missing field.
  // /work/services and /work/profile became one editor („ჩემი გვერდი") that
  // day, so the discriminator had one destination and no reader — see
  // lib/requestRouting. What the three cases below pin is unchanged and is the
  // thing that mattered: each of these is UNLISTED and matches no topic.
  assert.deepEqual(queueScope(nothing), { mode: 'UNLISTED' })
  assert.deepEqual(queueWhere(queueScope(nothing)), { AND: [{ topic: { in: [] } }] })

  // A master who ticked nothing is the same silence — profileIsRoutable has
  // said „not ready, not broken" about this row since the day it was written.
  const untick: QueueOffer = { service: { services: [], areas: ['TBILISI'], available: true }, expert: null, isAdmin: false }
  assert.deepEqual(queueScope(untick), { mode: 'UNLISTED' })

  // An expert with neither sphere nor profession is the same silence too — and
  // that these two USED to be told apart is exactly what stopped being true.
  assert.deepEqual(queueScope(expert(null, [], null)), { mode: 'UNLISTED' })
})

test('§D „off" is its own silence, and it is not „unlisted"', () => {
  const off: QueueOffer = { service: { ...CLEANER.service!, available: false }, expert: null, isAdmin: false }
  assert.deepEqual(queueScope(off), { mode: 'PAUSED' })
  assert.deepEqual(queueWhere(queueScope(off)), { AND: [{ topic: { in: [] } }] })

  // ⚠️ AND IT SILENCES THE TRADES HALF ONLY. „I am not taking service work" is
  // the switch in „ჩემი სერვისები"; it says nothing about consultations, so
  // somebody who sells both keeps their expert queue.
  const both = queueScope({ service: { ...CLEANER.service!, available: false }, expert: { categoryId: 'cat-law', categorySlug: 'law', professions: [] }, isAdmin: false })
  assert.equal(both.mode, 'FILTERED')
  if (both.mode !== 'FILTERED') return
  assert.equal(both.work, null, 'a paused master kept their trades queue')
  assert.equal(both.categoryId, 'cat-law')
})

/* ═══════════ E. the admin ══════════════════════════════════════════════ */

test('§E an admin keeps the whole queue when there is nothing to narrow by', () => {
  // They are the only person who can answer „why did this provider not get
  // that request", and the shell already prints „ხედავ როგორც ადმინი" above
  // the screen, so the unnarrowed view is labelled where it is read.
  assert.deepEqual(queueScope({ service: null, expert: null, isAdmin: true }), { mode: 'ALL' })
  assert.deepEqual(queueWhere({ mode: 'ALL' }), {}, 'ALL stopped spreading to nothing')
})

test('§E …and it is a FALLBACK, never an override', () => {
  // An admin who has ticked trades is ACTING as that provider — handing them
  // the platform-wide list would hide the narrowing they signed in to test.
  const s = queueScope({ ...CLEANER, isAdmin: true })
  assert.equal(s.mode, 'FILTERED')
  // …and their own switch still outranks the role.
  assert.deepEqual(queueScope({ service: { ...CLEANER.service!, available: false }, expert: null, isAdmin: true }), { mode: 'PAUSED' })
})

/* ═══════════ F. one narrowing, three readers ═══════════════════════════ */

test('§F the fragment cannot collide with the caller\'s own OR', () => {
  // ⚠️ THE HAZARD IS REAL AND SILENT. The queue page's `where` already owns a
  // top-level `OR` — „open to anybody, plus the ones addressed to me". A bare
  // `OR` here would overwrite that key on the spread and either leak an
  // addressed request into strangers' queues or drop it out of its owner's.
  for (const o of [CLEANER, PLUMBER, expert('law', ['ადვოკატი']), expert('swavleba', []),
                   { service: null, expert: null, isAdmin: false } as QueueOffer]) {
    const keys = Object.keys(queueWhere(queueScope(o)))
    assert.ok(keys.every(k => k === 'AND'), `the fragment introduced a top-level ${keys.join('/')}`)
  }
})

test('§F the badge, the home board and the list read ONE narrowing', () => {
  // They disagreed once (2026-08-18): the badge counted every open request on
  // the platform while the list beside it filtered by the viewer's trades, so
  // a master who had switched themselves off saw „შენ თავი გამორთე" with a
  // number next to it insisting work was waiting.
  //
  // ⚠️ THE COUNT MOVED BEHIND ONE HELPER (2026-08-29). It is drawn in FOUR
  // places now — the rail badge and the „ახალი" stage on each of the three
  // screens the flow is spread over — so four copies of the same three lines
  // would be four chances to drift. `openRequestCount` (lib/requestsServer) is
  // the single caller of `queueWhere` for all of them, so a file satisfies this
  // by reading EITHER: the helper, or the narrowing directly.
  const READERS = [
    'app/work/layout.tsx',
    'app/work/page.tsx',
    'app/work/(provider)/requests/page.tsx',
    'app/work/(provider)/offers/page.tsx',
    'app/work/jobs/page.tsx',
  ]
  for (const f of READERS) {
    const src = read(f)
    assert.ok(src.includes('queueWhere(') || src.includes('openRequestCount('),
      `${f} stopped reading the shared narrowing`)
    assert.ok(!/prisma\.serviceProfile\./.test(src), `${f} grew its own service-profile query — that is the second source`)
  }
  // …and the helper itself is the one place that spells the narrowing out.
  const helper = read('lib/requestsServer.ts')
  assert.ok(helper.includes('queueWhere(await providerQueueScope(user))'),
    'openRequestCount stopped applying the queue narrowing — every reader of it is now wrong')
})
