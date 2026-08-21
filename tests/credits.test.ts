/*
 * THE PROVIDER'S BALANCE — the arithmetic, and the two promises it makes.
 *
 * Run:  npx tsx tests/credits.test.ts   (also in `npm run check`)
 *
 * WHY THIS FILE EXISTS. The balance is denominated in LARI, on purpose (owner:
 * „ეს რეალურად 100₾ ტოლფასი მივცეთ… და არა რაღაც უაზრო ტოკენები"), and that
 * choice is what makes it work — and what makes it dangerous. Money-shaped
 * copy creates a money-shaped expectation, so two things have to stay true and
 * neither is visible in a screenshot:
 *
 *   · THE NUMBER ON THE LANDING IS THE SUM OF THE TASKS. „100₾ საჩუქრად" is a
 *     promise; if a task is re-priced and nothing else moves, the site starts
 *     lying about an amount somebody is working towards.
 *   · IT IS NEVER CALLED MONEY. „ანაზღაურება" / „შენი ფული" / „გატანა" turn a
 *     discount into a liability at a stage where `PAYMENTS_LIVE` is false.
 *
 * And one structural rule, which is the whole reason this design is defensible:
 * a credit is spent on SENDING AN OFFER, never on SEEING A REQUEST.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CREDIT_TASKS, CREDIT_TASKS_TOTAL, OFFER_COST_TETRI, TETRI, CREDITS_ENFORCED,
  gelLabel, offersAffordable, canAffordOffer, earnedTasks, completeness, creditTasks,
  type ProfileFacts,
} from '../lib/credits'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/* ── A. The promise is exactly 100₾ ───────────────────────────────────────── */

test('the tasks add up to the number the site promises', () => {
  assert.equal(CREDIT_TASKS_TOTAL, 100 * TETRI,
    `the grant is ${gelLabel(CREDIT_TASKS_TOTAL)}, not 100₾ — re-price another task to compensate`)
  // Every task is worth a whole number of lari. „12.5₾ for a photo" is a token
  // wearing a currency symbol, which is the thing this design exists to avoid.
  for (const t of CREDIT_TASKS) {
    assert.equal(t.tetri % TETRI, 0, `${t.key} is not a whole lari`)
    assert.ok(t.tetri > 0, `${t.key} pays nothing`)
  }
  // Keys are unique — the ledger's idempotency index is keyed on them, so a
  // duplicate would make one of the two tasks unpayable and silently so.
  assert.equal(new Set(CREDIT_TASKS.map(t => t.key)).size, CREDIT_TASKS.length)
})

test('the biggest grant is the field that decides who sees a request', () => {
  // Measured 2026-08-20: 3 of 26 expert profiles carry `professions`, and
  // lib/requestRouting matches on it. Twenty-three people are invisible to the
  // routing for want of one answer — that is what this bonus is FOR, and the
  // amounts have to say so.
  const top = [...CREDIT_TASKS].sort((a, b) => b.tetri - a.tetri)[0]
  assert.equal(top.key, 'PROFILE_PROFESSIONS',
    'the profession task is no longer the largest — the grant stopped paying for the thing routing needs')
})

/* ── B. It is spent on responding, never on looking ───────────────────────── */

test('a credit buys an offer, and the arithmetic is legible', () => {
  assert.equal(OFFER_COST_TETRI, 5 * TETRI)
  // 100₾ ÷ 5₾ = 20 offers. A number a person can hold in their head is the
  // point; „200 offers" would read as monopoly money.
  assert.equal(offersAffordable(CREDIT_TASKS_TOTAL), 20)
  assert.equal(offersAffordable(0), 0)
  assert.equal(offersAffordable(OFFER_COST_TETRI - 1), 0, 'a partial credit buys an offer')

  // ⚠️ THE STRUCTURAL RULE. Charging to VIEW a lead is the model this industry
  // is most criticised for, and on our own numbers (32 requests → 4 offers) it
  // would mean paying for silence most of the time.
  const server = read('lib/creditsServer.ts')
  assert.match(server, /export async function chargeForOffer/, 'the charge is no longer tied to sending an offer')
  assert.doesNotMatch(server, /chargeForView|chargeForRequest|unlockRequest/,
    'a charge for SEEING a request appeared — read the note on OFFER_COST_TETRI before adding one')
})

test('a zero balance does not block yet, and one line changes that', () => {
  assert.equal(CREDITS_ENFORCED, false, 'enforcement was switched on — was the accept rate measured first?')
  assert.equal(canAffordOffer(0), true, 'a provider is being stopped while the launch is free')
  assert.equal(canAffordOffer(CREDIT_TASKS_TOTAL), true)
})

/* ── C. It is never called money ──────────────────────────────────────────── */

test('the vocabulary never turns a discount into a liability', () => {
  // These words make a balance sound like something owed. PAYMENTS_LIVE is
  // false; nothing here can be withdrawn, transferred or refunded.
  const BANNED = ['ანაზღაურება', 'შენი ფული', 'გამომუშავებულ', 'გატანა', 'ქეშბექ', 'დაბრუნება']
  for (const f of ['lib/credits.ts', 'lib/creditsServer.ts']) {
    const src = read(f)
    for (const w of BANNED) {
      // The rule is about COPY, so a line that explicitly forbids the word is
      // the one place it may appear.
      const lines = src.split('\n').filter(l => l.includes(w) && !l.includes('NEVER SAY') && !/^\s*(\/\/|\*)/.test(l))
      assert.deepEqual(lines, [], `${f} calls the balance „${w}" — see the wording rules at the top of lib/credits`)
    }
  }
})

/* ── D. The score is the same arithmetic as the grant ─────────────────────── */

test('completeness is earned, not invented', () => {
  const none: ProfileFacts = {
    hasPhoto: false, hasBio: false, hasProfessions: false,
    hasExperience: false, hasService: false, hasCertificate: false,
  }
  const all: ProfileFacts = {
    hasPhoto: true, hasBio: true, hasProfessions: true,
    hasExperience: true, hasService: true, hasCertificate: true,
  }
  assert.equal(completeness(none), 0)
  assert.equal(completeness(all), 100)
  assert.deepEqual(earnedTasks(none), [])
  assert.equal(earnedTasks(all).length, CREDIT_TASKS.length)

  // ⚠️ ONE MECHANISM, TWO USES. The catalogue card carries no trust signal
  // today; „profile completeness" is a real, earned one. It must stay the SAME
  // arithmetic as the grant — a second, differently-weighted score would let
  // the card and the workspace disagree about how finished somebody is.
  const typical: ProfileFacts = { ...none, hasPhoto: true, hasBio: true, hasExperience: true }
  assert.equal(completeness(typical), 40, 'the score drifted from the task weights')
})

test('the ledger is the only source of a balance', () => {
  // No counter column anywhere — „რატომ მაქვს 40₾?" is answered by reading rows.
  assert.doesNotMatch(read('prisma/schema.prisma'), /balanceTetri|creditBalance/,
    'a mutable balance column appeared — the ledger stops being the truth the moment one exists')
  assert.match(read('lib/creditsServer.ts'), /_sum: \{ amountTetri: true \}/, 'the balance is no longer summed')
  // Idempotency comes from the index, not from a read-then-write.
  assert.match(read('lib/creditsServer.ts'), /skipDuplicates: true/, 'a grant can now be paid twice')
  assert.match(read('lib/dbBoot.ts'), /CreditEntry_userId_grantKey_key/, 'the unique index is not created at boot')
})


/* ── F. Both halves can finish the profile ────────────────────────────────── */

test('a services-only provider can reach the same 100₾', () => {
  // ⚠️ THE BUG THIS PINS. Three of the six tasks were written against
  // TutorProfile columns — certificates, professions[], yearsExp — and a
  // ServiceProfile has none of them. A provider who only sells services could
  // therefore earn 50₾ of a grant the landing calls 100₾, and services are
  // what this site sells, so that was the majority of the supply side being
  // shown a prize they could not win.
  for (const kind of ['CONSULT', 'WORK'] as const) {
    const list = creditTasks(kind)
    assert.equal(list.length, CREDIT_TASKS.length, `${kind} lost a task`)
    assert.equal(list.reduce((n, t) => n + t.tetri, 0), CREDIT_TASKS_TOTAL, `${kind} does not add up to the promise`)
    assert.deepEqual(list.map(t => t.key), CREDIT_TASKS.map(t => t.key), `${kind} reordered the keys`)
    for (const t of list) {
      assert.ok(t.label.trim().length > 0 && t.why.trim().length > 0, `${kind}/${t.key} has empty copy`)
    }
  }
  // The wording differs where the field does not exist on the other side.
  const work = creditTasks('WORK'), consult = creditTasks('CONSULT')
  for (const key of ['PROFILE_CERTIFICATE', 'PROFILE_PROFESSIONS', 'PROFILE_EXPERIENCE'] as const) {
    const a = consult.find(t => t.key === key)!, b = work.find(t => t.key === key)!
    assert.notEqual(a.label, b.label, `${key} still asks a provider for an expert's field`)
  }
  // …and „სერტიფიკატი" must not survive into the job half's own list.
  assert.ok(!work.some(t => /სერტიფიკატ|დიპლომ/.test(t.label)), 'a plumber is still asked for a diploma')
})

test('one tick never pays two tasks', () => {
  // `services[]` earns PROFESSIONS and a PRICE on one of them earns SERVICE.
  // If profileFacts ever reads the same column for both, one tap pays 40₾ and
  // the profile still says nothing a client can shop for.
  const src = read('lib/creditsServer.ts')
  const professions = src.match(/hasProfessions:.*/)![0]
  const service = src.match(/hasService:.*/)![0]
  assert.match(professions, /provider\?\.services/, 'a provider can no longer earn the routing task')
  assert.doesNotMatch(service, /provider\?\.services/, 'services[] now pays twice')
  assert.match(src, /priced/, 'the provider side of „first service" is not a price any more')
})

test('the strip sends each half to an editor it can actually open', () => {
  // /work/profile lives inside the (expert) route group and bounces a WORK-only
  // provider straight back out — the „შევსება" button would have been a wall.
  const page = read('app/work/page.tsx')
  assert.match(page, /editHref=\{isExpert\s+\?\s+'\/work\/profile'\s+:\s+'\/work\/services'\}/,
    'the completion button no longer branches on the capability')
  assert.doesNotMatch(read('app/work/_components/CreditStrip.tsx'), /href="\/work\/profile"/,
    'the strip hard-codes the expert-only editor again')
})
