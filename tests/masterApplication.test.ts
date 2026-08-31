// THE TRADESPERSON INTAKE — the rules, executed.
//
// This file exists because /join?can=WORK is the ONLY way supply enters the
// services vertical, and every failure in it is silent: an application that
// cannot be submitted looks like a person who changed their mind, and an
// approval that grants half its rows looks like a master who is simply quiet.
// Nothing in the product reports either one.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ProviderApplicationInput, MASTER, MASTER_KINDS, PROVIDER_KIND_LABEL,
  approvalBlockers, readyToApprove, PROVIDER_STATUS_TEXT,
} from '../lib/providerApplication'
import { LIVE_OFFER_TOPICS } from '../lib/serviceProfile'

const ok = () => ({
  kind: 'INDIVIDUAL' as const,
  fullName: 'გიორგი მაისურაძე',
  phone: '555123456',
  companyName: null,
  taxId: null,
  services: [LIVE_OFFER_TOPICS[0].id],
  areas: ['TBILISI'],
  about: 'თორმეტი წელია ვმუშაობ სანტექნიკაზე, ბოილერი და გათბობა.',
  yearsExp: 12,
  calloutFee: 30,
  priceFrom: null,
  photoUrl: null,
  workPhotos: [],
})

/* ═══════════ §A what may be submitted ═══════════════════════════════════ */

test('§A a plausible individual application parses', () => {
  const r = ProviderApplicationInput.safeParse(ok())
  assert.ok(r.success, r.success ? '' : JSON.stringify(r.error.issues))
})

test('§A a company must name itself', () => {
  // The one field that is conditionally required. Modelled as a refinement
  // rather than a non-null column so switching kind mid-form loses nothing —
  // see the schema comment.
  const bad = ProviderApplicationInput.safeParse({ ...ok(), kind: 'COMPANY', companyName: null })
  assert.equal(bad.success, false)
  const good = ProviderApplicationInput.safeParse({ ...ok(), kind: 'COMPANY', companyName: 'შპს რემონტი' })
  assert.ok(good.success)
})

test('§A an off-vocabulary service is refused, not dropped', () => {
  // A silently stripped id would leave somebody believing they are listed for
  // work that will never reach them — the exact failure lib/serviceProfile's
  // header describes.
  const r = ProviderApplicationInput.safeParse({ ...ok(), services: ['not-a-trade'] })
  assert.equal(r.success, false)
})

test('§A a request with no trade or no city cannot be submitted', () => {
  // Both are what routing matches on. An application missing either is a row
  // that can be approved into a master who matches nothing.
  assert.equal(ProviderApplicationInput.safeParse({ ...ok(), services: [] }).success, false)
  assert.equal(ProviderApplicationInput.safeParse({ ...ok(), areas: [] }).success, false)
})

test('§A the ceilings hold', () => {
  const tooMany = LIVE_OFFER_TOPICS.slice(0, MASTER.MAX_SERVICES + 1).map(t => t.id)
  if (tooMany.length > MASTER.MAX_SERVICES) {
    assert.equal(ProviderApplicationInput.safeParse({ ...ok(), services: tooMany }).success, false)
  }
  const photos = Array.from({ length: MASTER.MAX_WORK_PHOTOS + 1 }, () => 'data:image/webp;base64,AA')
  assert.equal(ProviderApplicationInput.safeParse({ ...ok(), workPhotos: photos }).success, false)
})

test('§A a zero price is refused rather than stored as free', () => {
  // The DB CHECK says the same thing. 0 is an empty input read as a number, not
  // an offer to work for nothing — and „ask me" is expressed as null.
  assert.equal(ProviderApplicationInput.safeParse({ ...ok(), calloutFee: 0 }).success, false)
  assert.ok(ProviderApplicationInput.safeParse({ ...ok(), calloutFee: null }).success)
})

test('§A a photo is NOT required to submit', () => {
  // ⚠️ THE SOFT GATE, ASSERTED FROM THE SUBMIT SIDE. If this ever starts
  // failing, somebody made the photo mandatory on the form — which is the
  // change that costs applicants at the step a zero-supply marketplace cannot
  // afford to lose them. See lib/providerApplication → approvalBlockers.
  assert.ok(ProviderApplicationInput.safeParse({ ...ok(), photoUrl: null }).success)
})

/* ═══════════ §B what may be approved ════════════════════════════════════ */

test('§B the same application without a photo cannot be APPROVED', () => {
  // The other half of the gate. Submit accepts it; approval does not.
  const a = { kind: 'INDIVIDUAL', photoUrl: null, services: ['plumb-leak'], areas: ['TBILISI'] }
  assert.equal(readyToApprove(a), false)
  assert.ok(approvalBlockers(a).some(b => b.includes('ფოტო')))
  assert.ok(readyToApprove({ ...a, photoUrl: 'data:image/webp;base64,AA' }))
})

test('§B a company is asked for a logo, not a face', () => {
  const b = approvalBlockers({ kind: 'COMPANY', photoUrl: null, services: ['plumb-leak'], areas: ['TBILISI'] })
  assert.ok(b.some(x => x.includes('ლოგო')), `expected a logo blocker, got ${JSON.stringify(b)}`)
})

test('§B work photos never block an approval', () => {
  // Requiring a portfolio would rank trades by how photogenic their output is.
  // Nothing in approvalBlockers reads them, and this is what says so.
  assert.ok(readyToApprove({
    kind: 'INDIVIDUAL', photoUrl: 'data:image/webp;base64,AA',
    services: ['plumb-leak'], areas: ['TBILISI'],
  }))
})

test('§B an approvable application always names a trade and a city', () => {
  for (const missing of [{ services: [] }, { areas: [] }]) {
    const a = { kind: 'INDIVIDUAL', photoUrl: 'data:image/webp;base64,AA', services: ['plumb-leak'], areas: ['TBILISI'], ...missing }
    assert.equal(readyToApprove(a), false, `approved a master who matches nothing: ${JSON.stringify(missing)}`)
  }
})

/* ═══════════ §C the words ═══════════════════════════════════════════════ */

test('§C every kind and every status has Georgian text', () => {
  for (const k of MASTER_KINDS) {
    assert.ok(PROVIDER_KIND_LABEL[k], `${k} has no label`)
  }
  for (const s of ['SUBMITTED', 'NEEDS_REVISION', 'APPROVED', 'REJECTED']) {
    assert.ok(PROVIDER_STATUS_TEXT[s], `${s} has no status line`)
  }
})
