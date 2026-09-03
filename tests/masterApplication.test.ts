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
  // ⚠️ THE PRICE PAIR, SINCE 2026-09-01. `priceFrom: null` was a complete
  // answer here because a price was optional; it now means „not answered yet"
  // unless „ფასი შეთანხმებით" says otherwise, and the schema refuses a body
  // that has said neither (owner: „ერთი ფასი და „შეთანხმებით"").
  priceFrom: null,
  priceOnAsk: true,
  // ⚠️ A PHOTO, SINCE 2026-09-01. It was `null` here because the schema took a
  // nullable one — the „soft gate": apply without, be approved with. The owner
  // reversed that (see the `photoUrl` note in lib/providerApplication): a
  // confirmation screen that says „გამოგზავნილია" and then lists two more jobs
  // leaves the applicant unable to tell whether they are done. The question is
  // asked in the form now, so a valid body carries one.
  photoUrl: 'data:image/webp;base64,AA',
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

test('§A a malformed phone is refused at the provider door', () => {
  // `/join` used a length-only rule while signup and the client request form
  // used the shared phone validator. A made-up string could therefore look
  // complete until an operator tried to call it.
  assert.equal(ProviderApplicationInput.safeParse({ ...ok(), phone: '123456789' }).success, false)
  assert.ok(ProviderApplicationInput.safeParse({ ...ok(), phone: '555123456' }).success)
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
  assert.equal(ProviderApplicationInput.safeParse({ ...ok(), photoUrl: null }).success, false,
    'a body with no photo must be refused at the door now — the form asks for it')
})

/* ═══════════ §B what may be approved ════════════════════════════════════ */

// ⚠️ EVERY §B FIXTURE CARRIES A DESCRIPTION SINCE 2026-09-01, and that is the
// point rather than boilerplate: `about` moved OUT of the apply schema and INTO
// approvalBlockers that day (owner — register with the minimum, fill the rest
// in later). These cases are about the PHOTO, so the description has to be
// present in all of them or the photo stops being the only variable. The new
// rule gets its own case at the end of §B.
const ABOUT = 'ვმუშაობ ამ სფეროში წლებია და კლიენტებს ვეხმარები კონკრეტულ ამოცანებში.'

test('§B the same application without a photo cannot be APPROVED', () => {
  // The other half of the gate. Submit accepts it; approval does not.
  const a = { kind: 'INDIVIDUAL', photoUrl: null, services: ['plumb-leak'], areas: ['TBILISI'], about: ABOUT }
  assert.equal(readyToApprove(a), false)
  assert.ok(approvalBlockers(a).some(b => b.includes('ფოტო')))
  assert.ok(readyToApprove({ ...a, photoUrl: 'data:image/webp;base64,AA' }))
})

test('§B a company is asked for a logo, not a face', () => {
  const b = approvalBlockers({ kind: 'COMPANY', photoUrl: null, services: ['plumb-leak'], areas: ['TBILISI'], about: ABOUT })
  assert.ok(b.some(x => x.includes('ლოგო')), `expected a logo blocker, got ${JSON.stringify(b)}`)
})

test('§B work photos never block an approval', () => {
  // Requiring a portfolio would rank trades by how photogenic their output is.
  // Nothing in approvalBlockers reads them, and this is what says so.
  assert.ok(readyToApprove({
    kind: 'INDIVIDUAL', photoUrl: 'data:image/webp;base64,AA',
    services: ['plumb-leak'], areas: ['TBILISI'], about: ABOUT,
  }))
})

test('§B the door asks for everything it needs — nothing is left as homework', () => {
  // ⚠️ THIS CASE SAID THE OPPOSITE FOR ONE DAY (2026-09-01). It pinned the
  // „soft gate": a blank description passed the door and was caught at
  // approval, the rule the photo had always had. The owner reversed both the
  // same evening, looking at what the applicant is actually left holding:
  //
  //   „სავალდებულო თუა ფოტო უნდა იყოს და აღარ უნდა ამატებდეს მერე რამეს და
  //    არეული არ უნდა იყოს მომხმარებელი და გაურკვევლობაში."
  //
  // The confirmation screen was saying „განაცხადი გამოგზავნილია" and then
  // listing two more jobs — sent and not-sent in one breath. So the questions
  // are asked in the FORM, and this pins that they cannot drift back out of it.
  assert.equal(ProviderApplicationInput.safeParse({ ...ok(), about: '' }).success, false,
    'a blank description must be refused at the door')
  assert.equal(ProviderApplicationInput.safeParse({ ...ok(), photoUrl: null }).success, false,
    'a missing photo must be refused at the door')
  assert.equal(ProviderApplicationInput.safeParse({ ...ok(), about: 'ok' }).success, false,
    'a two-character description must still be refused')
  assert.ok(ProviderApplicationInput.safeParse(ok()).success,
    'a complete application must still pass — otherwise the three cases above are vacuous')

  // The approval gate keeps its own copy of both checks. Not duplication for
  // its own sake: old rows were written under the soft gate and a reviewer must
  // still see what they are missing.
  const live = { kind: 'INDIVIDUAL', photoUrl: 'data:image/webp;base64,AA', services: ['plumb-leak'], areas: ['TBILISI'] }
  assert.equal(readyToApprove({ ...live, about: '' }), false)
  assert.ok(approvalBlockers({ ...live, about: '' }).some(b => b.includes('აღწერა')))
  assert.ok(readyToApprove({ ...live, about: ABOUT }))
})

test('§B an approvable application always names a trade and a city', () => {
  for (const missing of [{ services: [] }, { areas: [] }]) {
    const a = { kind: 'INDIVIDUAL', photoUrl: 'data:image/webp;base64,AA', services: ['plumb-leak'], areas: ['TBILISI'], about: ABOUT, ...missing }
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
