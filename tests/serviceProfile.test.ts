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
  ServiceProfileInput, profileIsRoutable, profileGaps,
  serviceLabels, areaLabels, priceHint, covers, sanitizeStored,
  vocabularyIsConsistent,
} from '../lib/serviceProfile'
import { CITIES } from '../lib/requestTopics'

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
