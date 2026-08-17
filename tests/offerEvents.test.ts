// THE FUTURE INVOICE — lib/offerEvents.
//
// Run: npx tsx tests/offerEvents.test.ts   (also in `npm run check`)
//
// These rules decide what an expert is charged. The pure half is tested here;
// the half that cannot be — „opened twice costs once" — is a UNIQUE constraint
// in the database precisely because a TypeScript test could only ever prove
// that ONE process behaves, and the failure mode is two concurrent polls.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  OFFER_EVENTS, BILLABLE_EVENTS, isOfferEvent, OFFER_EVENT_LABEL,
  timelineOf, minutesToView, chargeFor,
} from '../lib/offerEvents'

/* ═══════════ A. the vocabulary ═════════════════════════════════════════ */

test('§A every event has a Georgian label and nothing is billable by accident', () => {
  for (const e of OFFER_EVENTS) {
    assert.ok(OFFER_EVENT_LABEL[e], `${e} has no label — a raw code would reach a screen`)
  }

  // ⚠️ SENT AND DELIVERED ARE NOT BILLABLE, and that is the product decision,
  // not an oversight. Charging for the act of answering is the Bark model,
  // where the expert pays before the client has done anything — documented
  // result: roughly half of paid leads never respond.
  assert.ok(!BILLABLE_EVENTS.includes('SENT'), 'answering became billable — that is the Bark model')
  assert.ok(!BILLABLE_EVENTS.includes('DELIVERED'), 'delivery became billable')
  assert.ok(BILLABLE_EVENTS.includes('VIEWED'), 'the chosen trigger left the billable set')

  assert.ok(isOfferEvent('VIEWED'))
  assert.ok(!isOfferEvent('OPENED'), 'an unknown type passed validation')
})

/* ═══════════ B. the timeline reads in lifecycle order ══════════════════ */

test('§B the timeline never shows „chose somebody else" above „chose this one"', () => {
  // Written in one transaction, so the timestamps can tie or invert by
  // milliseconds. The ORDER is the lifecycle, not the clock.
  const rows = [
    { type: 'DECLINED', at: '2026-08-17T10:00:00.000Z' },
    { type: 'SENT', at: '2026-08-17T10:00:00.000Z' },
    { type: 'VIEWED', at: '2026-08-17T10:00:00.000Z' },
  ]
  assert.deepEqual(timelineOf(rows).map(r => r.type), ['SENT', 'VIEWED', 'DECLINED'])

  // A retired or corrupt type is dropped rather than rendered.
  assert.equal(timelineOf([{ type: 'NONSENSE', at: new Date() }]).length, 0)
})

/* ═══════════ C. the number this table exists to produce ════════════════ */

test('§C minutes-to-open is measured, and refuses to invent one', () => {
  const sent = '2026-08-17T10:00:00.000Z'
  assert.equal(minutesToView([
    { type: 'SENT', at: sent },
    { type: 'VIEWED', at: '2026-08-17T10:45:00.000Z' },
  ]), 45)

  // Never opened — this is the case that matters. Bark's users compute exactly
  // this by hand (~44% ever respond) and quote it back at them; null must mean
  // „never", not 0.
  assert.equal(minutesToView([{ type: 'SENT', at: sent }]), null)
  assert.equal(minutesToView([{ type: 'VIEWED', at: sent }]), null, 'no SENT should not read as instant')

  // A clock that moved backwards reports nothing rather than a negative wait.
  assert.equal(minutesToView([
    { type: 'SENT', at: '2026-08-17T10:45:00.000Z' },
    { type: 'VIEWED', at: '2026-08-17T10:00:00.000Z' },
  ]), null)
})

/* ═══════════ D. the charge ═════════════════════════════════════════════ */

test('§D the charge is 0 today, and the rule is a parameter', () => {
  const opened = [{ type: 'SENT', at: new Date() }, { type: 'VIEWED', at: new Date() }]
  const unopened = [{ type: 'SENT', at: new Date() }]

  // TODAY. The owner's decision (2026-08-17): „ახლა რადგან სტარტაპია 0 ლარი
  // იქნება ლიდი, მაგრამ მერე ეს ფასი გაიზრდება."
  assert.equal(chargeFor(opened, { on: 'VIEWED', priceGel: 0 }), 0)

  // …and the same recorded history, re-priced. This is how the FIRST real price
  // should be chosen: against a month of real events, not by picking a number.
  assert.equal(chargeFor(opened, { on: 'VIEWED', priceGel: 5 }), 5)
  assert.equal(chargeFor(unopened, { on: 'VIEWED', priceGel: 5 }), 0,
    'an offer nobody opened was charged — the whole point of the trigger')

  // Switching to the stronger signal is one constant. Thumbtack bills on the
  // reply and abandoned its open-based refund window; if „opened" turns out as
  // noisy here, this is the entire migration.
  assert.equal(chargeFor(opened, { on: 'REPLIED', priceGel: 5 }), 0)

  // A non-billable trigger cannot be priced by mistake.
  assert.equal(chargeFor(opened, { on: 'SENT', priceGel: 5 }), 0,
    'SENT became chargeable through the rule parameter')
})

/* ═══════════ E. the call sites that must keep writing ══════════════════ */

test('§E the billable moment is recorded inline, not in after()', () => {
  const chat = readFileSync('app/api/request-chat/route.ts', 'utf8')

  // ⚠️ THE POINT OF THE WHOLE TABLE. The old read receipt lives inside
  // `after()` with a bare `catch {}`; a billable event written the same way
  // would be lost in silence. If somebody moves this line for tidiness, the
  // invoice quietly stops being written.
  const viewedAt = chat.indexOf("'VIEWED'")
  const afterAt = chat.indexOf('after(async')
  assert.ok(viewedAt > 0, 'the VIEWED event is no longer recorded on a client read')
  assert.ok(viewedAt < afterAt, 'VIEWED moved into after() — a billable event must not be fire-and-forget')

  // The other three sites, so a refactor cannot quietly drop one.
  const offers = readFileSync('app/api/provider/offers/route.ts', 'utf8')
  assert.match(offers, /recordOfferEvent\([^)]*'SENT'/, 'SENT is no longer recorded')
  assert.match(offers, /'DELIVERED'/, 'DELIVERED is no longer recorded')

  const accept = readFileSync('app/api/requests/[ref]/accept/route.ts', 'utf8')
  assert.match(accept, /'ACCEPTED'/, 'ACCEPTED is no longer recorded')
  assert.match(accept, /'DECLINED'/, 'DECLINED is no longer recorded')
})

test('§E uniqueness is enforced by the database, not by a read-then-write', () => {
  const boot = readFileSync('lib/dbBoot.ts', 'utf8')
  assert.match(boot, /OfferEvent_offerId_type_key/,
    'the unique index is gone — „opened twice" would cost twice under concurrency')

  const lib = readFileSync('lib/offerEvents.ts', 'utf8')
  // The claim-don't-check rule: P2002 is the answer to „has this happened",
  // never a findFirst before the insert.
  assert.match(lib, /P2002/, 'the unique violation is no longer treated as the answer')
  assert.doesNotMatch(lib, /findFirst[\s\S]{0,200}offerEvent\.create/,
    'a read-then-write crept in — two concurrent polls would both insert')
})
