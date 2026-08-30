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
  OFFER_GROUPS, OFFER_TOPICS, isOfferableTopic, MAX_SERVICES,
  LIVE_OFFER_GROUPS, LIVE_OFFER_TOPICS,
  ServiceProfileInput, profileIsRoutable, profileGaps, MAX_WORK_PHOTOS,
  serviceLabels, areaLabels, priceHint, covers, sanitizeStored,
  vocabularyIsConsistent,
} from '../lib/serviceProfile'
import {
  CITIES, TOPIC_GROUPS, BROWSABLE_GROUPS, DORMANT_GROUP_IDS, topicById, groupIsLive, SUGGESTED_TOPICS,
} from '../lib/requestTopics'

/* ═══════════ A. the vocabulary is derived, never re-typed ═══════════════ */

test('§A the service vocabulary comes from the topics themselves', () => {
  assert.ok(OFFER_GROUPS.length > 0, 'no service groups — kinds: S disappeared')
  assert.ok(OFFER_TOPICS.length >= 20, `only ${OFFER_TOPICS.length} service topics`)

  // THE INVARIANT. Every id this table may hold is an id a request may carry.
  assert.ok(vocabularyIsConsistent(),
    'a service topic is no longer of kind SERVICE — the two vocabularies have split')

  // ⚠️ THE ROSTER IS THE WHOLE VOCABULARY SINCE 2026-08-24. It used to be the
  // eight SERVICE groups alone, and „nothing from the other side leaked in" was
  // the assertion — a plumber must not file themselves under „ქიმია". That
  // fence is what kept every professional off this table and forced the whole
  // consulting side into a second one. What is still refused is an id the
  // vocabulary does not contain at all.
  assert.ok(isOfferableTopic('contract'), 'a professional service is not selectable')
  assert.ok(isOfferableTopic('plumb-leak'))
  assert.ok(!isOfferableTopic('not-a-topic'), 'an unknown id is selectable')
})

/* ═══════════ B. an unknown id is REFUSED, not quietly dropped ═══════════ */

test('§B an id that is not a service is refused rather than stripped', () => {
  const base = { areas: ['TBILISI'], calloutFee: null, priceFrom: null, available: true }

  // The load-bearing case: one real id and one that is not in the vocabulary at
  // all. This is what a copy-pasted id or a drifted form actually looks like.
  const wrongId = ServiceProfileInput.safeParse({ ...base, services: ['plumb-leak', 'not-a-topic'] })
  assert.equal(wrongId.success, false, 'an id outside the vocabulary was saved')

  // ⚠️ AND IT MUST NOT SAVE THE GOOD ONES AND DROP THE BAD. Stripping would
  // leave the provider believing they are listed for something they are not.
  if (!wrongId.success) {
    assert.ok(wrongId.error.issues.length > 0)
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
  const tooMany = OFFER_TOPICS.slice(0, MAX_SERVICES + 1).map(t => t.id)
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

test('§B a price belongs to a service they actually offer', () => {
  /* ⚠️ THE COLUMN THE BONUS IS PAID FOR (2026-08-21). `priceList` became
   * editable at /work/services because lib/credits pays PROFILE_SERVICE for it
   * and `profileFacts` reads it — before that its only writer was the intake,
   * which is sealed at approval, so 20₾ of the grant had no field behind it.
   * An editable map needs the intake's own rule kept: a price against a service
   * they do not offer is a stale key left behind by an untick, or a crafted
   * body, and either way it is a row nobody can explain. */
  const base = { services: ['plumb-leak'], areas: ['TBILISI'], available: true, calloutFee: null, priceFrom: null }
  assert.equal(ServiceProfileInput.safeParse({ ...base, priceList: { 'plumb-leak': 60 } }).success, true)
  assert.equal(ServiceProfileInput.safeParse({ ...base, priceList: {} }).success, true)
  // Absent is „leave it alone" — this endpoint is a full replace and an older
  // client that never drew the field must not blank the map.
  assert.equal(ServiceProfileInput.safeParse(base).success, true)
  assert.equal(ServiceProfileInput.safeParse({ ...base, priceList: { 'clean-flat': 60 } }).success, false,
    'a price is accepted for a service the provider does not offer')
  assert.equal(ServiceProfileInput.safeParse({ ...base, priceList: { 'plumb-leak': 0 } }).success, false,
    'a zero price is stored — blank is what „ask me" means, not free')
})

test('§B a stored work photo travels back as a token, never as bytes', () => {
  /* Six base64 images is about a megabyte, so the editor is never sent the ones
   * it already holds (see the endpoint's GET). It keeps `kept:<n>` in their
   * place and the endpoint resolves it against the column — which only works if
   * the schema accepts the token and nothing else that is not an image. */
  const base = { services: ['plumb-leak'], areas: ['TBILISI'], available: true, calloutFee: null, priceFrom: null }
  const img = 'data:image/webp;base64,AAAA'
  assert.equal(ServiceProfileInput.safeParse({ ...base, workPhotos: ['kept:0', img] }).success, true)
  assert.equal(ServiceProfileInput.safeParse({ ...base, workPhotos: [] }).success, true)
  assert.equal(ServiceProfileInput.safeParse({ ...base, workPhotos: ['/api/masters/x/photo?n=0'] }).success, false,
    'a URL is accepted where an image belongs — the column would hold a link to itself')
  assert.equal(ServiceProfileInput.safeParse({ ...base, workPhotos: ['kept:9'] }).success, false,
    'a token past the ceiling is accepted')
  assert.equal(
    ServiceProfileInput.safeParse({ ...base, workPhotos: Array.from({ length: MAX_WORK_PHOTOS + 1 }, () => img) }).success,
    false, 'the editor may store more photos than the intake allows')
})

/* ═══════════ C. ready, not-ready, and off ══════════════════════════════ */

test('§C an empty profile is „not ready" and never routable', () => {
  const empty = { services: [], areas: [], available: true }
  assert.equal(profileIsRoutable(empty), false)

  // ⚠️ THE ASSERTION WAS `length === 2` AND IT PINNED A NUMBER (2026-08-29).
  // What it meant to pin is that every gap is ACTIONABLE — nameable on the
  // screen, with a control behind it. The city stopped being one the day
  // `CITIES` came down to Tbilisi alone: /work/services no longer draws the
  // block (the intake had already dropped it on 2026-08-20) and the PUT fills
  // the column in, so „აირჩიე ქალაქი" would have been an instruction with
  // nowhere to carry it out. So the rule is pinned instead of the count, and
  // this test now passes both before and after a second city opens.
  const cityIsAsked = CITIES.length > 1
  assert.equal(profileGaps(empty).length, cityIsAsked ? 2 : 1)
  assert.ok(profileGaps(empty).includes('აირჩიე ერთი სერვისი მაინც'),
    'the one thing a provider must decide stopped being reported')
  assert.equal(profileGaps(empty).includes('აირჩიე ქალაქი'), cityIsAsked,
    'the city is reported as a gap exactly when the screen offers a choice of cities')

  const half = { services: ['plumb-leak'], areas: [], available: true }
  // ROUTABILITY IS UNCHANGED, and deliberately: a row seeded before the PUT
  // started filling the column really does have nowhere to be routed until its
  // next save. What moved is only what we ASK somebody to go and do.
  assert.equal(profileIsRoutable(half), false, 'a master with no city was routable')
  assert.equal(profileGaps(half).length, cityIsAsked ? 1 : 0)

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
// ⚠️ ALL EIGHT TRADES ARE OPEN SINCE 2026-08-20 (owner: „მასშტაბურად უნდა
// მივიდეთ… სერვისებსაც, რაც ყოველდღიურად სჭირდება"). The gate itself is not
// retired and this test is not deleted: the mechanism is what matters, because
// the design rests on being able to narrow what is OFFERED without narrowing
// what is UNDERSTOOD. A matcher that only knows the open groups files „კარი
// გაფუჭდა" under OTHER and loses the signal that says which group to open next.
// If a trade is ever closed again, this number moves and the vocabulary does
// not — that is the whole assertion.
test('§L live groups gate the pickers but not the vocabulary', () => {
  // ⚠️ THE ROSTER IS EVERY LIVE GROUP SINCE 2026-08-24, not the eight trades.
  // What the gate still does is the point: it narrows what is OFFERED without
  // narrowing what is UNDERSTOOD.
  assert.equal(LIVE_OFFER_GROUPS.length, BROWSABLE_GROUPS.length, 'the picker and the browse list disagree about what is open')
  for (const g of LIVE_OFFER_GROUPS) {
    assert.ok(groupIsLive(g), `${g.id} is offered but not live`)
  }
  // ⚠️ THE MECHANISM IS PROVEN ON WHATEVER IS CLOSED TODAY. Every trade is open
  // now, so the closed set is the DORMANT one (positioning, not staffing) — and
  // the property under test is the same either way: a group that is not offered
  // must still be UNDERSTOOD. Its topics keep their ids, so a stored request
  // that names one still reads and the matcher still files it correctly instead
  // of dropping it into OTHER, where the signal that says which group to open
  // next is lost.
  const closed = TOPIC_GROUPS.filter(g => !BROWSABLE_GROUPS.includes(g))
  assert.ok(closed.length > 0, 'nothing is gated at all — the switch became decoration')
  for (const g of closed) {
    assert.ok(g.topics.length > 0, `${g.id} is closed and empty — it was gutted, not switched off`)
    for (const t of g.topics) {
      assert.ok(topicById(t.id) !== undefined, `${t.id} is closed AND unreadable — the gate leaked into the vocabulary`)
    }
  }
})

test('§L every browsable group is either non-service or live', () => {
  for (const g of BROWSABLE_GROUPS) {
    assert.ok(groupIsLive(g), `${g.id} is browsable but not live`)
  }
  // ⚠️ THERE ARE NOW TWO GATES, AND THEY ASK DIFFERENT QUESTIONS (2026-08-20).
  // LIVE_SERVICE_GROUP_IDS is about STAFFING — a trade needs somebody with a
  // van in this city. DORMANT_GROUP_IDS is about POSITIONING — the site leads
  // with professional services, so „მე-8 კლასის მათემატიკა" is written, kept,
  // and not offered. A non-service group is browsable unless positioning
  // closed it, which is why this can no longer assert „never gated".
  const nonService = TOPIC_GROUPS.filter(g => !g.kinds.includes('SERVICE'))
  for (const g of nonService) {
    const shouldShow = !DORMANT_GROUP_IDS.includes(g.id)
    assert.equal(BROWSABLE_GROUPS.includes(g), shouldShow,
      `${g.id}: browsable=${BROWSABLE_GROUPS.includes(g)} but dormant=${DORMANT_GROUP_IDS.includes(g.id)}`)
  }
  // Nothing is deleted by going dormant — the topics stay readable so a stored
  // request that names one still renders.
  for (const id of DORMANT_GROUP_IDS) {
    assert.ok(TOPIC_GROUPS.some(g => g.id === id), `${id} was DELETED rather than switched off`)
  }
})

test('§L the suggested chips only point at open groups', () => {
  // Six chips are the first thing on the wizard's what-step. One pointing into
  // a closed trade is the exact promise the gate exists to stop making, and it
  // would be made in the most prominent place on the screen.
  const live = new Set(LIVE_OFFER_TOPICS.map(t => t.id))
  for (const t of SUGGESTED_TOPICS) {
    assert.ok(live.has(t.id), `suggested chip „${t.label}" points at a closed group`)
  }
})
