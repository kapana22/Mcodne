// WHO STILL GETS A PHONE CALL FIRST — lib/requestTriage.
//
// Run: npx tsx tests/requestTriage.test.ts   (also in `npm run check`)
//
// ⚠️ THE RISK THIS FILE GUARDS IS ONE-DIRECTIONAL. A request wrongly HELD costs
// somebody a wait, which is what the whole product used to be and is
// recoverable by an operator. A request wrongly RELEASED is broadcast to every
// expert in a sphere and cannot be recalled. So every test below asks „does the
// suspicious thing still get held", and the one that asks the opposite asks it
// about a request with nothing wrong with it at all.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  triageFlags, mayAutoVerify, triageNote, TRIAGE_LABEL, REPEAT_LIMIT,
} from '../lib/requestTriage'

/** An ordinary, unremarkable request — the baseline every case varies from. */
const ok = {
  kind: 'SERVICE' as const,
  budgetBand: 's2',
  topic: 'plumb-leak',
  description: 'ონკანი წვეთავს სამზარეულოში, მესამე სართული',
  phone: '551234567',
  recentFromPhone: 0,
}

test('§A an ordinary request routes without waiting for anybody', () => {
  assert.deepEqual(triageFlags(ok), [])
  assert.equal(mayAutoVerify(ok), true)
  assert.equal(triageNote([]), null)
})

test('§B a below-floor budget is still held', () => {
  // The floor exists because nobody here can serve it. Routing it would spend
  // every expert's attention on work that will be refused.
  const flags = triageFlags({ ...ok, budgetBand: 's0' })
  assert.ok(flags.includes('BELOW_FLOOR'))
  assert.equal(mayAutoVerify({ ...ok, budgetBand: 's0' }), false)
})

test('§C „სხვა" is held, because there is nothing to route it on', () => {
  // No topic → no sphere, no service list, nothing to match against. It is also
  // the most valuable row in the table: it names a service the catalogue does
  // not carry. A person reads it and the vocabulary grows.
  for (const topic of ['other', '']) {
    const flags = triageFlags({ ...ok, topic })
    assert.ok(flags.includes('NO_TOPIC'), `topic ${JSON.stringify(topic)} was released`)
  }
})

test('§D contact details and links in the description are held', () => {
  // Somebody arranging to be reached around the platform, or advertising. Not
  // proof of either — which is exactly why it is a call and not a refusal.
  assert.ok(triageFlags({ ...ok, description: 'დამირეკე 599 12 34 56' }).includes('CONTACT_IN_TEXT'))
  assert.ok(triageFlags({ ...ok, description: 'მომწერე test@example.com' }).includes('CONTACT_IN_TEXT'))
  assert.ok(triageFlags({ ...ok, description: 'იხილე https://example.com' }).includes('LINK_IN_TEXT'))
  assert.ok(triageFlags({ ...ok, description: 'www.example.com' }).includes('LINK_IN_TEXT'))
  // …and an ordinary sentence with digits in it is NOT a contact. „მესამე
  // სართული, 2 ოთახი" must route.
  assert.deepEqual(triageFlags({ ...ok, description: 'მესამე სართული, 2 ოთახი' }), [])
})

test('§E a burst from one number is held, a second request is not', () => {
  // A household genuinely might need a plumber and a cleaner in one evening.
  assert.deepEqual(triageFlags({ ...ok, recentFromPhone: REPEAT_LIMIT - 1 }), [])
  assert.ok(triageFlags({ ...ok, recentFromPhone: REPEAT_LIMIT }).includes('REPEAT_SENDER'))
})

test('§F an obviously fake number is held; a foreign one is too, not refused', () => {
  assert.ok(triageFlags({ ...ok, phone: '555555555' }).includes('SUSPECT_PHONE'))
  assert.ok(triageFlags({ ...ok, phone: '123456789' }).includes('SUSPECT_PHONE'))
  assert.ok(triageFlags({ ...ok, phone: '12345' }).includes('SUSPECT_PHONE'))
  // Real Georgian mobiles pass.
  assert.deepEqual(triageFlags({ ...ok, phone: '+995 599 12 34 56' }), [])
  assert.deepEqual(triageFlags({ ...ok, phone: '577 00 11 22' }), [])
})

test('§G every flag has words the operator can read', () => {
  const flags = triageFlags({ ...ok, budgetBand: 's0', topic: 'other', recentFromPhone: 9 })
  assert.ok(flags.length >= 3)
  const note = triageNote(flags)
  assert.ok(note && note.length > 0)
  // Never a raw code in the operator's note.
  for (const f of flags) assert.ok(note!.includes(TRIAGE_LABEL[f]), `${f} rendered as a code`)
})

test('§H the endpoint still refuses to route a below-floor request', () => {
  // ⚠️ THE ORDER MATTERS AND IS EASY TO BREAK. `rejected` must beat
  // auto-verification: a request under the floor is answered, never broadcast.
  // Asserted against the source because the alternative is a live database.
  const src = readFileSync('app/api/requests/route.ts', 'utf8')
  assert.match(src, /const autoVerified = !rejected && flags\.length === 0/,
    'auto-verification stopped deferring to the budget floor')
  assert.match(src, /status: rejected \? 'REJECTED' : autoVerified \? 'VERIFIED' : 'NEW'/,
    'the status ladder changed — check that REJECTED still wins')
  // An auto-verified row without `verifiedAt` would never be nudged and never
  // close: every timer in lib/requestRouting measures from that column.
  assert.match(src, /autoVerified \? \{ verifiedAt: new Date\(\) \}/,
    'an auto-verified request no longer stamps verifiedAt — the lifecycle clock would never start')
  // …and it must actually be told to somebody.
  assert.match(src, /if \(autoVerified\)[\s\S]{0,200}mailVerifiedRequest/,
    'an auto-verified request is no longer routed to the experts')
})
