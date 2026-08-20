// WHAT A MASTER IS FILED UNDER — lib/serviceProfile.
//
// Run: npx tsx tests/serviceProfile.test.ts   (also in `npm run check`)
//
// The one thing worth testing here is the thing the whole stage rests on: the
// ids in a ServiceProfile are TOPIC IDS from the request vocabulary. If that
// ever stops being true the failure is silent — a provider is listed for
// something no request can carry, hears nothing, and neither they nor we get an
// error. Everything below exists to make that loud.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SERVICE_GROUPS, SERVICE_TOPICS, isServiceTopic, MAX_SERVICES,
  LIVE_SERVICE_GROUPS, LIVE_SERVICE_TOPICS,
  ServiceProfileInput, profileIsRoutable, profileGaps,
  serviceLabels, areaLabels, priceHint, covers, sanitizeStored,
  vocabularyIsConsistent,
} from '../lib/serviceProfile'
import {
  CITIES, TOPIC_GROUPS, BROWSABLE_GROUPS, groupIsLive, SUGGESTED_TOPICS,
} from '../lib/requestTopics'

/* ═══════════ A. the vocabulary is derived, never re-typed ═══════════════ */

test('§A the service vocabulary comes from the topics themselves', () => {
  assert.ok(SERVICE_GROUPS.length > 0, 'no service groups — kinds: S disappeared')
  assert.ok(SERVICE_TOPICS.length >= 20, `only ${SERVICE_TOPICS.length} service topics`)

  // THE INVARIANT. Every id this table may hold is an id a request may carry.
  assert.ok(vocabularyIsConsistent(),
    'a service topic is no longer of kind SERVICE — the two vocabularies have split')

  // …and nothing from the other side leaked in. „ქიმია" is a LEARNING topic and
  // a plumber must not be able to file themselves under it.
  assert.ok(!isServiceTopic('chemistry'), 'a learning topic is selectable as a service')
  assert.ok(!isServiceTopic('contract'), 'a consultation topic is selectable as a service')
  assert.ok(isServiceTopic('plumb-leak'))
})

/* ═══════════ B. an unknown id is REFUSED, not quietly dropped ═══════════ */

test('§B an id that is not a service is refused rather than stripped', () => {
  const base = { areas: ['TBILISI'], calloutFee: null, priceFrom: null, available: true }

  // The load-bearing case: a real topic, of the wrong kind. This is what a
  // copy-pasted id or a drifted form actually looks like — not gibberish.
  const wrongKind = ServiceProfileInput.safeParse({ ...base, services: ['plumb-leak', 'chemistry'] })
  assert.equal(wrongKind.success, false, 'a LEARNING topic saved as a service')

  const nonsense = ServiceProfileInput.safeParse({ ...base, services: ['not-a-topic'] })
  assert.equal(nonsense.success, false)

  // ⚠️ AND IT MUST NOT SAVE THE GOOD ONES AND DROP THE BAD. Stripping would
  // leave the master believing they are listed for something they are not.
  if (!wrongKind.success) {
    assert.ok(wrongKind.error.issues.length > 0)
  }

  const ok = ServiceProfileInput.safeParse({ ...base, services: ['plumb-leak', 'plumb-boiler'] })
  assert.equal(ok.success, true, ok.success ? '' : JSON.stringify(ok.error.issues))
})

test('§B a duplicate, an over-long list and a bad city are each refused', () => {
  const base = { areas: ['TBILISI'], calloutFee: null, priceFrom: null, available: true }

  assert.equal(
    ServiceProfileInput.safeParse({ ...base, services: ['plumb-leak', 'plumb-leak'] }).success,
    false, 'the same service twice was accepted')

  // „send me everything" is the lead-mill shape the cap exists to refuse.
  const tooMany = SERVICE_TOPICS.slice(0, MAX_SERVICES + 1).map(t => t.id)
  assert.equal(ServiceProfileInput.safeParse({ ...base, services: tooMany }).success, false,
    `${MAX_SERVICES + 1} services were accepted over a cap of ${MAX_SERVICES}`)

  assert.equal(
    ServiceProfileInput.safeParse({
      services: ['plumb-leak'], areas: ['ATLANTIS'],
      calloutFee: null, priceFrom: null, available: true,
    }).success,
    false, 'a city that is not in CITIES was accepted')

  // Every real city must pass — otherwise the picker offers what the schema refuses.
  const allCities = ServiceProfileInput.safeParse({
    services: ['plumb-leak'], areas: CITIES.map(c => c.id),
    calloutFee: null, priceFrom: null, available: true,
  })
  assert.equal(allCities.success, true, 'the full city list was refused')
})

test('§B a price of zero is refused and null stays legal', () => {
  const base = { services: ['plumb-leak'], areas: ['TBILISI'], available: true }
  // Null means „ask me", which is a normal way to work.
  assert.equal(ServiceProfileInput.safeParse({ ...base, calloutFee: null, priceFrom: null }).success, true)
  // Zero would render as „გამოძახება 0₾", i.e. free — which is not what an
  // unfilled field means. That is what null is for.
  assert.equal(ServiceProfileInput.safeParse({ ...base, calloutFee: 0, priceFrom: null }).success, false)
  assert.equal(ServiceProfileInput.safeParse({ ...base, calloutFee: -5, priceFrom: null }).success, false)
  assert.equal(ServiceProfileInput.safeParse({ ...base, calloutFee: 30, priceFrom: 50 }).success, true)
})

/* ═══════════ C. ready, not-ready, and off ══════════════════════════════ */

test('§C an empty profile is „not ready" and never routable', () => {
  const empty = { services: [], areas: [], available: true }
  assert.equal(profileIsRoutable(empty), false)
  // Two gaps, each nameable on the screen — „not ready" has to be actionable.
  assert.equal(profileGaps(empty).length, 2)

  const half = { services: ['plumb-leak'], areas: [], available: true }
  assert.equal(profileIsRoutable(half), false, 'a master with no city was routable')
  assert.equal(profileGaps(half).length, 1)

  const ready = { services: ['plumb-leak'], areas: ['TBILISI'], available: true }
  assert.equal(profileIsRoutable(ready), true)
  assert.deepEqual(profileGaps(ready), [])

  // The master's own switch. Distinct from the admin's RequestAccess.active.
  assert.equal(profileIsRoutable({ ...ready, available: false }), false)
})

/* ═══════════ D. the routing predicate stage 3 will query with ══════════ */

test('§D covers() matches on the topic AND the city', () => {
  const plumber = { services: ['plumb-leak', 'plumb-boiler'], areas: ['TBILISI'], available: true }

  assert.equal(covers(plumber, { topic: 'plumb-leak', city: 'TBILISI' }), true)
  // The right trade in the wrong city is not a match — that is the whole reason
  // areas exist rather than routing on the service alone.
  assert.equal(covers(plumber, { topic: 'plumb-leak', city: 'BATUMI' }), false)
  // The right city and a trade they do not do.
  assert.equal(covers(plumber, { topic: 'clean-flat', city: 'TBILISI' }), false)
  // Switched off.
  assert.equal(covers({ ...plumber, available: false }, { topic: 'plumb-leak', city: 'TBILISI' }), false)

  // ⚠️ A row with no city matches on the service alone. A request written
  // before the column existed must not become unroutable because of a field it
  // never carried.
  assert.equal(covers(plumber, { topic: 'plumb-leak', city: null }), true)
  assert.equal(covers(plumber, { topic: 'plumb-leak' }), true)
})

/* ═══════════ E. a stored row survives the vocabulary moving ════════════ */

test('§E a retired id is dropped on read rather than rendered raw', () => {
  const stored = {
    services: ['plumb-leak', 'a-trade-we-retired'],
    areas: ['TBILISI', 'NARNIA'],
  }
  const clean = sanitizeStored(stored)
  assert.deepEqual(clean.services, ['plumb-leak'])
  assert.deepEqual(clean.areas, ['TBILISI'])
})

/* ═══════════ F. how it reads back ══════════════════════════════════════ */

test('§F labels come out in the catalogue’s order, not the order ticked', () => {
  // Ticked backwards on purpose: two masters with the same trades must read
  // identically, so a client compares trades and not click sequence.
  const ticked = ['plumb-drain', 'plumb-leak']
  const labels = serviceLabels(ticked)
  assert.equal(labels.length, 2)
  assert.equal(labels[0], 'ონკანი და მილი', 'the catalogue order was not applied')

  // Never an id — a raw id on a provider card is a debug view.
  for (const l of labels) assert.ok(!l.includes('-'), `an id leaked into a label: ${l}`)

  assert.deepEqual(areaLabels(['BATUMI', 'TBILISI']), ['თბილისი', 'ბათუმი'])
})

test('§F an unpriced master says nothing rather than „—"', () => {
  assert.equal(priceHint({ calloutFee: null, priceFrom: null }), null)
  assert.equal(priceHint({ calloutFee: 30, priceFrom: null }), 'გამოძახება 30₾')
  assert.equal(priceHint({ calloutFee: null, priceFrom: 50 }), 'სამუშაო 50₾-დან')
  assert.equal(priceHint({ calloutFee: 30, priceFrom: 50 }), 'გამოძახება 30₾ · სამუშაო 50₾-დან')
})

/* ═══════════ §L the launch gate ═════════════════════════════════════════ */
// The four open trades are a SUPPLY decision, and the whole design rests on it
// narrowing what is OFFERED without narrowing what is UNDERSTOOD. Both halves
// are asserted here, because losing either one is silent: a picker that draws
// all eight promises work nobody can do, and a matcher that only knows four
// files „კარი გაფუჭდა" under OTHER and loses the signal that would tell us
// which group to open next.
test('§L live groups gate the pickers but not the vocabulary', () => {
  assert.equal(LIVE_SERVICE_GROUPS.length, 4, 'the launch set is four groups')
  assert.ok(
    LIVE_SERVICE_GROUPS.length < SERVICE_GROUPS.length,
    'nothing is gated — the closed groups vanished from the catalogue instead',
  )
  for (const g of LIVE_SERVICE_GROUPS) {
    assert.ok(g.kinds.includes('SERVICE'), `${g.id} is live but not a service group`)
  }
  // The gate must not touch validation. A master seeded by hand into a closed
  // group has to keep saving — see the comment on LIVE_SERVICE_GROUPS.
  const closed = SERVICE_GROUPS.filter(g => !LIVE_SERVICE_GROUPS.includes(g))
  assert.ok(closed.length > 0, 'no closed groups to check')
  for (const g of closed) {
    for (const t of g.topics) {
      assert.ok(isServiceTopic(t.id), `${t.id} is closed AND unsavable — the gate leaked into the schema`)
    }
  }
})

test('§L every browsable group is either non-service or live', () => {
  for (const g of BROWSABLE_GROUPS) {
    assert.ok(groupIsLive(g), `${g.id} is browsable but not live`)
  }
  // Consultation and learning are never gated: the gate is about staffing a
  // city with vans, and an online consultation needs none.
  const nonService = TOPIC_GROUPS.filter(g => !g.kinds.includes('SERVICE'))
  for (const g of nonService) {
    assert.ok(BROWSABLE_GROUPS.includes(g), `${g.id} was gated and it is not a trade`)
  }
})

test('§L the suggested chips only point at open groups', () => {
  // Six chips are the first thing on the wizard's what-step. One pointing into
  // a closed trade is the exact promise the gate exists to stop making, and it
  // would be made in the most prominent place on the screen.
  const live = new Set(LIVE_SERVICE_TOPICS.map(t => t.id))
  for (const t of SUGGESTED_TOPICS) {
    if (isServiceTopic(t.id)) {
      assert.ok(live.has(t.id), `suggested chip „${t.label}" points at a closed trade`)
    }
  }
})
