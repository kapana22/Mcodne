/*
 * A PROVIDER PRICES THE SERVICES THEY ALREADY PICKED.
 *
 * Run:  npx tsx tests/providerPricing.test.ts   (also in `npm run check`)
 *
 * WHY THIS FILE EXISTS. The provider's price was two numbers about the whole
 * person — „გამოძახება 30₾" and „სამუშაო 50₾-დან". Those say what a VISIT
 * costs and nothing about what a JOB costs, so a catalogue built to sell
 * services could not print „ბინის დალაგება — 60₾": the one sentence a client
 * is actually shopping for, and the one thing the trades sites in this market
 * do not do (they list services with no prices at all).
 *
 * `ServiceProfile.priceList` is a JSON map keyed by topic id, so the names are
 * the very rows the provider ticked — nothing to type twice, nothing to drift.
 * That choice is also the risk this file guards: a JSON column will hold
 * whatever a bad write puts in it, and every failure below renders as a number
 * on a stranger's card rather than as an error.
 *
 *   · A PRICE FOR A SERVICE THEY DO NOT OFFER — a stale key left behind when a
 *     tick was removed, or a crafted body.
 *   · A ZERO REACHING A CARD as „0₾", which reads as free work.
 *   · THE MAP BEING LISTED instead of read through the ticks, which is how the
 *     first two get on screen.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pricedServices, lowestPrice } from '../lib/serviceProfile'
import { MasterApplicationInput } from '../lib/masterApplication'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/* ── A. The reader is a guard, not a lookup ───────────────────────────────── */

test('the map is read THROUGH the ticks, never listed', () => {
  const owned = ['clean-flat', 'plumb-leak']

  // The ordinary case.
  const ok = pricedServices({ services: owned, priceList: { 'clean-flat': 60, 'plumb-leak': 40 } })
  assert.equal(ok.length, 2)
  assert.ok(ok.every(s => s.label && !s.label.includes('-')), 'an id leaked into a label')

  // ⚠️ A STALE KEY MUST NOT RENDER. Untick a service and its price stays in the
  // column; the reader walks `services`, so the row simply cannot appear.
  const stale = pricedServices({ services: ['clean-flat'], priceList: { 'clean-flat': 60, 'plumb-leak': 40 } })
  assert.deepEqual(stale.map(s => s.id), ['clean-flat'], 'a price for an unticked service reached the page')

  // A key that is not a topic at all — a crafted body, or a renamed id.
  assert.deepEqual(pricedServices({ services: owned, priceList: { 'not-a-topic': 99 } }), [])

  // Junk values are skipped, not coerced. „0₾" reads as free work; a negative
  // is meaningless; a string is a bad write.
  for (const bad of [0, -5, null, undefined, 'თავისუფალი', {}, []]) {
    assert.deepEqual(
      pricedServices({ services: owned, priceList: { 'clean-flat': bad } }), [],
      `a ${JSON.stringify(bad)} price reached the page`,
    )
  }
  // The column itself may be anything.
  for (const bad of [null, undefined, 'x', 42, []]) {
    assert.deepEqual(pricedServices({ services: owned, priceList: bad }), [])
  }
})

test('the order is the catalogue’s, not the map’s', () => {
  // Two providers offering the same two trades must list them the same way, or
  // a client comparing cards is comparing click sequences.
  const a = pricedServices({ services: ['plumb-leak', 'clean-flat'], priceList: { 'plumb-leak': 40, 'clean-flat': 60 } })
  const b = pricedServices({ services: ['clean-flat', 'plumb-leak'], priceList: { 'clean-flat': 60, 'plumb-leak': 40 } })
  assert.deepEqual(a.map(s => s.id), b.map(s => s.id), 'the list follows the map instead of the catalogue')
})

test('the card’s floor is the cheapest thing actually sold', () => {
  assert.equal(lowestPrice({ services: ['clean-flat', 'plumb-leak'], priceList: { 'clean-flat': 60, 'plumb-leak': 40 } }), 40)
  assert.equal(lowestPrice({ services: ['clean-flat'], priceList: {} }), null, 'an unpriced provider must stay „ask"')
  // …and the card falls back the way it always did when nothing is priced.
  assert.match(read('app/experts/_providers.ts'), /lowestPrice\(r\) \?\? r\.priceFrom \?\? r\.calloutFee \?\? null/,
    'the card stopped preferring a real service price, or lost its fallback')
})

/* ── B. The wire refuses what the reader would have to ignore ─────────────── */

test('a price for an unticked service is refused at the door', () => {
  const base = {
    kind: 'INDIVIDUAL' as const,
    fullName: 'გიორგი კაპანაძე',
    phone: '555123456',
    companyName: null, taxId: null,
    services: ['clean-flat'],
    areas: ['TBILISI'],
    about: 'თორმეტი წელია ვმუშაობ სანტექნიკაზე და დალაგებაზე. ჩემი ინსტრუმენტით მოვდივარ, ვმუშაობ სუფთად.',
    yearsExp: 12, calloutFee: null, priceFrom: null,
    photoUrl: null, workPhotos: [],
  }
  assert.equal(MasterApplicationInput.safeParse({ ...base, priceList: { 'clean-flat': 60 } }).success, true)
  assert.equal(MasterApplicationInput.safeParse({ ...base, priceList: {} }).success, true, 'pricing nothing must stay legal')
  assert.equal(MasterApplicationInput.safeParse({ ...base, priceList: { 'plumb-leak': 40 } }).success, false,
    'a price for a service the applicant does not offer was accepted')
  assert.equal(MasterApplicationInput.safeParse({ ...base, priceList: { 'clean-flat': 0 } }).success, false,
    'a zero price was accepted — it prints as „0₾"')
  // Absent is legal and means „ask" — every application written before the
  // column existed parses unchanged.
  const { priceList: _drop, ...noList } = { ...base, priceList: {} }
  assert.equal(MasterApplicationInput.safeParse(noList).success, true, 'an older application body stopped parsing')
})

/* ── C. It survives the trip to a profile ─────────────────────────────────── */

test('the price list is carried, not collected and dropped', () => {
  // The photo taught this lesson once: the application collected a face,
  // approval created a profile without one, and the card had nothing to draw.
  assert.match(read('app/api/master-applications/route.ts'), /priceList: d\.priceList/, 'the application stopped storing it')
  assert.match(read('app/api/master-applications/[id]/route.ts'), /priceList: app\.priceList \?\? \{\}/,
    'approval creates a profile without the prices the applicant gave')
  assert.match(read('lib/dbBoot.ts'), /"ServiceProfile" ADD COLUMN IF NOT EXISTS "priceList" JSONB/,
    'the column is not created at boot — it exists in schema.prisma and nowhere else')
})

test('the profile leads with the offer, and says nothing when there is none', () => {
  const blocks = read('app/experts/[slug]/_providerBlocks.tsx')
  assert.match(blocks, /if \(p\.priced\.length === 0\) return null/,
    'an empty „ფასები" heading over a blank box is worse than no section')
  const page = read('app/experts/[slug]/page.tsx')
  const priced = page.indexOf('<PricedServicesBlock')
  const about = page.indexOf('<AboutBlock')
  assert.ok(priced > -1 && about > -1, 'a block is missing from the profile')
  assert.ok(priced < about, 'the paragraph about the person is drawn before what they sell')
})
