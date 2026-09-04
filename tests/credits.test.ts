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
 * And one structural rule, which is the whole reason this design is defensible.
 * It CHANGED on 2026-08-21 and the change is the owner's:
 *
 *   was    a credit is spent on SENDING AN OFFER, never on SEEING A REQUEST.
 *   is     a credit is spent on OPENING THE CLIENT'S CONTACT. Reading a request
 *          is free, sending an offer is free, and one contact costs 1₾ once —
 *          for ever, per request, per provider.
 *
 * The objection the old rule raised („a provider paying to look pays for
 * silence most of the time") is why the price fell to a fifth and why the
 * REQUEST itself is still free to read: what is sold is the phone number, which
 * is the lead, not a look at one. lib/credits keeps the whole history.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CREDIT_TASKS, CREDIT_TASKS_TOTAL, CONTACT_COST_MIN_TETRI, CONTACT_COST_MAX_TETRI,
  CONTACT_COST_DEFAULT_TETRI,
  contactCostTetri, contactCostRangeLabel, contactsLabel, TETRI, CREDITS_ENFORCED,
  JOB_DONE_TETRI, CONTACT_COST_NOTE, CONTACT_BUTTON_LABEL, OFFER_FREE_NOTE,
  contactChargeNote, contactRefundNote, CONTACT_REFUND_HOURS,
  OFFER_FREE_TITLE, OFFER_FREE_BODY,
  JOB_DONE_NOTE, noBalanceNote, contactLimitNote, contactPlacesLeft,
  gelLabel, contactsAffordable, canAffordContact, earnedTasks, completeness, creditTasks, taskHref,
  contactKey, jobDoneKey, adminAdjustReason, isAdminAdjust, ADMIN_ADJUST,
  CREDIT_PACKS, packBonusPct, packContacts,
  creditReasonLabel,
  type ProfileFacts, type CreditTaskKey,
} from '../lib/credits'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Source with its comments stripped — for assertions that must land on code,
 *  not on a note explaining where the code went.
 *
 *  ⚠️ BLOCK COMMENTS FIRST, THEN LINE COMMENTS. The copy of this helper in
 *  tests/joinDoor does it the other way round, and that order is silently
 *  destructive: dropping the ` * …` lines of a doc comment takes its closing
 *  `*∕` with them, so the surviving `∕**` pairs with the NEXT one and eats
 *  every line of real code in between. */
const codeOf = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')

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

/* ── B. It is spent on the CONTACT, and reading a request is free ────────── */

test('a credit buys one client contact, and the arithmetic is legible', () => {
  /* ⚠️ 3₾ SINCE 2026-09-01, from the owner's design canvas → „Expert Jobs",
   * which prints it three times and ties every one to the selection. It was 1₾,
   * and the re-price came with the mechanic: a contact is now bought AFTER the
   * client has chosen this provider, so it buys a job in hand rather than a
   * chance at one. See lib/credits → CONTACT_COST_TETRI for the whole argument,
   * including which half of the canvas won — „Request Room v2" still carries the
   * old „1₾ პასუხზე" in a footer and is the stale statement.
   *
   * ⚠️ THE ASSERTION IS THE ARITHMETIC, NOT THE NUMBER. What must not break is
   * that the grant divides cleanly into contacts and that the two constants
   * agree; the price itself is the owner's to move again.
   */
  /* ⚠️ REWRITTEN 2026-09-03 — THE PRICE IS A LADDER NOW. It asserted
     `CONTACT_COST_TETRI === 3 * TETRI`; a contact costs 1₾ to 10₾ by the
     client's budget (owner: „1-10ლ ათამაშე"), so the fixed figure is gone and
     what is pinned is what was always the point: the SHAPE. */
  assert.equal(CONTACT_COST_MIN_TETRI, 1 * TETRI)
  assert.equal(CONTACT_COST_MAX_TETRI, 10 * TETRI)
  for (const t of [CONTACT_COST_MIN_TETRI, CONTACT_COST_MAX_TETRI]) {
    assert.equal(t % TETRI, 0, 'a contact costs a fraction of a lari')
  }

  // The ladder only climbs, never dips, and it stays inside its own two ends.
  /* ⚠️ A REQUEST THAT NAMED NO MONEY KEEPS THE OLD FLAT PRICE, and this is the
     assertion that stops the ladder quietly cutting revenue by two thirds.
     Measured 2026-09-03: 19 of 20 live rows carry no budget at all. Pricing
     those off the floor would read „every job on this platform is small", which
     is not something anybody said. */
  assert.equal(contactCostTetri(0, null), CONTACT_COST_DEFAULT_TETRI)
  /* ⚠️ EVERY SHAPE OF „NOTHING", not just Prisma's. The guard first tested
     `budgetMax === null` and a caller passing `undefined` fell straight past it
     to the ladder's floor — 1₾ where 3₾ was intended, silently. Found by
     walking a draft through the run rather than by a type error, because both
     shapes type-check. */
  for (const [a, b] of [[undefined, undefined], [undefined, null], [0, undefined], [null, null]] as [any, any][]) {
    assert.equal(contactCostTetri(a, b), CONTACT_COST_DEFAULT_TETRI,
      `an unstated budget as (${a}, ${b}) priced off the ladder instead of the default`)
  }
  assert.equal(contactCostTetri(0, null), 3 * TETRI, 'the unpriced default moved off the price it replaced')
  // …but a budget of „up to 60₾" IS a statement, and it prices on the ladder.
  assert.equal(contactCostTetri(30, 60), CONTACT_COST_MIN_TETRI)

  let last = 0
  for (const gel of [50, 99, 100, 299, 300, 699, 700, 1499, 1500, 4999, 5000, 100000]) {
    const c = contactCostTetri(1, gel)
    assert.ok(c >= CONTACT_COST_MIN_TETRI && c <= CONTACT_COST_MAX_TETRI, `${gel}₾ prices outside 1–10₾`)
    assert.ok(c >= last, `the fee fell between ${gel}₾ and the band below it`)
    assert.equal(c % TETRI, 0, `${gel}₾ prices a fraction of a lari`)
    last = c
  }
  // Both ends are actually reachable — a ladder nobody can climb to the top of
  // is a range that lies about itself.
  assert.equal(contactCostTetri(0, 50), CONTACT_COST_MIN_TETRI)
  assert.equal(contactCostTetri(15000, null), CONTACT_COST_MAX_TETRI)
  // ⚠️ THE CEILING WINS WHERE THERE IS ONE. „500–1 000₾" is priced on 1 000,
  // not on 500: the higher of the two facts the client actually typed.
  assert.ok(contactCostTetri(500, 1000) > contactCostTetri(500, 600))
  // …and where the band has no top („15 000₾-ზე მეტი"), the floor is all there
  // is and must not read as zero.
  assert.equal(contactCostTetri(5000, null), CONTACT_COST_MAX_TETRI)

  // What a balance opens is a PAIR now, for the same reason.
  assert.deepEqual(contactsAffordable(0), { min: 0, max: 0 })
  assert.deepEqual(contactsAffordable(CREDIT_TASKS_TOTAL), { min: 10, max: 100 })
  assert.equal(contactsLabel(0), '', 'a balance that opens nothing still printed a number')
  assert.equal(contactsLabel(CREDIT_TASKS_TOTAL), '10–100')
  assert.equal(contactsLabel(CONTACT_COST_MAX_TETRI), '1–10')

  /* ⚠️ THE STRUCTURAL RULE, AND IT WAS REVERSED BY THE OWNER ON 2026-08-21.
   *
   * This test used to assert `chargeForOffer` existed and that no
   * `chargeForView` / `chargeForRequest` / `unlockRequest` had appeared —
   * pinning „charge to respond, never to view". The owner moved the charge onto
   * the client's CONTACT and made the offer free.
   *
   * What survives of the old rule is the half that was protecting somebody:
   * READING A REQUEST IS STILL FREE. A provider gets the description, the
   * budget, the deadline and the city at no cost and decides with them in hand;
   * only the phone number is sold. So the assertion flips from „nothing charges
   * for a view" to „the charge is the contact, and nothing charges for a view".
   */
  const server = read('lib/creditsServer.ts')
  assert.match(server, /export async function chargeForContact/,
    'the charge is no longer tied to opening a contact')
  assert.doesNotMatch(server, /chargeForView|chargeForRequest|chargeForOffer/,
    'a charge for SEEING a request, or for answering one, appeared — read the header of lib/credits first')

  // The offers route must not spend anything. Answering is free, and a provider
  // at zero must still be able to answer a job — that is the marketplace's
  // scarce resource and nothing may ration it.
  const offers = read('app/api/provider/offers/route.ts')
  assert.doesNotMatch(offers, /creditsServer|CONTACT_COST|canAffordContact/,
    'sending an offer costs something again — it is free since 2026-08-21')

  // And the request list/detail must not charge on RENDER. A page that spends
  // on being looked at is the model the header argues against at length.
  assert.doesNotMatch(read('app/work/(provider)/requests/[id]/page.tsx'), /chargeForContact/,
    'the detail page charges on render — the contact is bought by a deliberate POST')
})

test('the contact is paid for once, and the client is not called by twenty people', () => {
  // ⚠️ THE KEY IS THE IDEMPOTENCY. `(userId, grantKey)` refuses the second row,
  // so re-opening the same number tomorrow, or from a second tab, is free.
  // „Charging twice for the same phone number is theft."
  assert.equal(contactKey('req1'), 'CONTACT:req1')
  assert.notEqual(contactKey('r'), jobDoneKey('r'))
  for (const t of CREDIT_TASKS) {
    assert.notEqual(contactKey(t.key), t.key, 'a contact key can collide with a task key')
    assert.ok(!isAdminAdjust(contactKey(t.key)))
  }
  // ⚠️ THE SAME KEY IS THE COUNTER — one row per provider, one prefix per
  // request — which is what lets the cap be a COUNT rather than a column.
  assert.ok(contactKey('req1').includes('req1'), 'the key no longer identifies the request it counts')

  // The cap is the request's own `offerLimit`: 3 ordinarily, 1 when the request
  // is addressed to one named expert.
  assert.equal(contactPlacesLeft({ contactCount: 0, offerLimit: 3 }), 3)
  assert.equal(contactPlacesLeft({ contactCount: 2, offerLimit: 3 }), 1)
  assert.equal(contactPlacesLeft({ contactCount: 3, offerLimit: 3 }), 0)
  assert.equal(contactPlacesLeft({ contactCount: 9, offerLimit: 3 }), 0, 'the cap can go negative on screen')
  assert.equal(contactPlacesLeft({ contactCount: 1, offerLimit: 1 }), 0, 'an addressed request admits a second caller')

  // ⚠️ BOTH CEILINGS LIVE IN THE INSERT. Neither a SUM nor a COUNT has a row to
  // claim, so a `where` cannot hold them and a read-then-write loses to a second
  // tab — CLAUDE.md's fourth rule, applied to two aggregates.
  const server = read('lib/creditsServer.ts')
  // ⚠️ BOUNDED AT THE NEXT EXPORT, NOT AT THE END OF THE FILE. It used to run
  // to EOF, which meant every function added below `chargeForContact` — and
  // every word in their comments — was read as part of it. `refundDeadContacts`
  // arriving at the bottom failed the `offerCount` assertion below by
  // EXPLAINING the rule in prose (2026-08-30). A test that fails on a comment
  // is a test that will be silenced.
  const from = server.indexOf('export async function chargeForContact')
  const next = server.indexOf('\nexport ', from + 1)
  const fn = server.slice(from, next === -1 ? undefined : next)
  assert.match(fn, /INSERT INTO "CreditEntry"/, 'the unlock is no longer a single conditional insert')
  assert.match(fn, /COALESCE\(SUM\("amountTetri"\)[\s\S]{0,200}?>=/,
    'the unlock stopped claiming the balance — two tabs can both spend the last lari')
  assert.match(fn, /SELECT COUNT\(\*\) FROM "CreditEntry" WHERE "grantKey"[\s\S]{0,120}?</,
    'the unlock stopped claiming the contact cap — a client can be called by anyone with a balance')
  assert.match(fn, /"ServiceRequest"[\s\S]{0,200}?FOR UPDATE[\s\S]{0,300}?"User"[\s\S]{0,60}?FOR UPDATE/,
    'the two locks are gone or out of order — a fixed order is what makes two locks safe')

  // ⚠️ THE CAP MUST NOT BE `offerCount`. Spending the offer budget on unlocks
  // would let three providers buy a number, never bid, and leave the client with
  // no offers at all — see lib/credits → CONTACT_LIMIT_REASON.
  assert.doesNotMatch(fn, /offerCount/,
    'the contact cap is spending the client\'s offer budget')
})

/* ── B2. Enforcement and the way back are ONE decision ────────────────────
 *
 * ⚠️ WHAT THIS TEST USED TO SAY, AND WHY IT CHANGED (2026-08-21). It pinned
 * `CREDITS_ENFORCED === false` with the message „was the accept rate measured
 * first?", which was the right question while the flag was the only thing in
 * the feature that could move. It is not any more. Enforcement is now true, and
 * the property worth pinning is not the flag's VALUE — the owner may move that
 * either way on a Tuesday — but the INVARIANT underneath it: a balance that can
 * refuse must be a balance that can recover. Enforcement without replenishment
 * is a provider permanently unable to answer a lead, on a marketplace whose
 * measured problem is that 28 of 32 requests got no answer at all.
 */
test('a balance that can refuse is a balance that can recover', () => {
  // The flag itself: whichever way it points, the predicate must agree with it.
  // This is behaviour, and it is the whole of what the switch does.
  assert.equal(canAffordContact(0, CONTACT_COST_MIN_TETRI), !CREDITS_ENFORCED,
    'the switch and the predicate disagree — one of them is not reading CREDITS_ENFORCED')
  assert.equal(canAffordContact(CONTACT_COST_MIN_TETRI, CONTACT_COST_MIN_TETRI), true,
    'the exact price of one contact must buy one contact')
  assert.equal(canAffordContact(CREDIT_TASKS_TOTAL, CONTACT_COST_MAX_TETRI), true)
  // ⚠️ AND THE PRICE IS AN ARGUMENT, so a balance that buys a cheap contact may
  // still refuse an expensive one. That is the whole point of the ladder.
  if (CREDITS_ENFORCED) {
    assert.equal(canAffordContact(CONTACT_COST_MIN_TETRI, CONTACT_COST_MAX_TETRI), false,
      'a 1₾ balance opened a 10₾ contact')
  }

  if (!CREDITS_ENFORCED) return

  /* ⚠️ THE INVARIANT. With enforcement on, every one of these has to exist or a
   * provider who spends the grant is stuck for ever — there is no top-up,
   * `PAYMENTS_LIVE` is false, and nothing here may be SOLD.
   *
   * The list is SHORTER than it was on the offer-charge model, and that is the
   * point of the new one: there is no „release" to build, because a provider
   * who never opens a contact never spends anything. Silence is free by
   * construction rather than by a cron that has to notice it. */
  const server = read('lib/creditsServer.ts')
  assert.match(server, /export async function grantJobDone/,
    'enforcement is on and finishing a job no longer pays — the loop has no engine')
  assert.match(server, /export async function adjustBalance/,
    'enforcement is on and an admin can no longer unblock somebody without a deploy')
  assert.match(read('app/api/internal/cleanup/route.ts'), /runCreditJobs\(/,
    'the credit sweep is not on the cron — a finished job would rely on one route remembering')
  // The route that spends must actually consult the balance. On the old model
  // the flag was true of nothing: POST /api/provider/offers never asked.
  assert.match(read('app/api/provider/requests/[id]/contact/route.ts'), /NO_BALANCE/,
    'the unlock route does not refuse a short balance — flipping the switch would change nothing')
})

/* ── B3. What pays, what charges, and what is free ────────────────────────── */

test('the loop closes: reading and answering are free, a finished job pays', () => {
  assert.equal(JOB_DONE_TETRI % TETRI, 0, 'a finished job pays a fraction of a lari')
  /* ⚠️ THE ONE NUMBER THE OWNER STILL HAS TO SET. 25₾ was derived against the
   * OLD price — 5₾ to answer, so a finished job bought five more answers. At 1₾
   * a contact it buys twenty-five, and the starting grant is a hundred. The
   * ratio is deliberately NOT asserted at 5: pinning it would quietly re-price
   * the earn-back the next time the contact does move. What must hold is only
   * that finishing a job is worth MORE than the contacts one request can
   * consume (`CONTACT_LIMIT` providers may open it), or doing the work does not
   * grow the pool of answers and the shortage stays where it is. */
  // The ceiling on one request is `offerLimit` unlocks (lib/credits →
  // CONTACT_LIMIT_REASON); 3 is what an ordinary request carries.
  const ORDINARY_LIMIT = 3
  assert.equal(contactPlacesLeft({ contactCount: 0, offerLimit: ORDINARY_LIMIT }), ORDINARY_LIMIT)
  /* ⚠️ THE COMPARISON NARROWED ON 2026-09-03, AND THE THING IT GAVE UP IS
     WRITTEN DOWN RATHER THAN DELETED.
     It read `JOB_DONE_TETRI > ORDINARY_LIMIT * <the contact price>` — 25₾ > 3×3₾
     — and the price became a 1–10₾ ladder (owner: „1-10ლ ათამაშე"). At the TOP
     rung that arithmetic no longer holds: three providers opened on one
     15 000₾ project take 30₾ out of the supply side while finishing it puts 25₾
     back. Two honest ways out and both are the owner's, not this file's:
     cap the ladder at 8₾ (3×8 = 24 < 25), or raise what a finished job pays.
     FLAGGED, not chosen — and the ceiling stays where the owner put it.

     What is asserted instead is the loop that must hold for a PERSON, which is
     what the surrounding test is named for: whatever a provider paid to reach a
     client, finishing the work has to be worth more than that. The pool-level
     version is also softened in practice by `sweepSilentContacts`, which gives
     back every contact the client never answered — the losing two, usually. */
  assert.ok(JOB_DONE_TETRI > CONTACT_COST_MAX_TETRI,
    'a finished job pays back less than the most expensive contact — the loop shrinks for the person who did the work')
  assert.ok(JOB_DONE_TETRI <= CREDIT_TASKS_TOTAL,
    'one finished job pays more than the whole starting grant — the grant stops meaning anything')

  // ⚠️ SILENCE IS FREE BECAUSE NOTHING WAS CHARGED FOR IT. Reading the request
  // and sending the offer both cost zero, so the 28-of-32 requests that got no
  // answer take nothing from anybody. Pinned as the ABSENCE of a charge in the
  // two paths a provider walks before a phone number is involved.
  const offers = codeOf('app/api/provider/offers/route.ts')
  assert.doesNotMatch(offers, /chargeFor|amountTetri|creditEntry/,
    'sending an offer moves the balance again — answering is free, only the contact is paid')
  const list = codeOf('app/work/(provider)/requests/page.tsx')
  assert.doesNotMatch(list, /chargeFor|creditEntry/, 'the queue itself charges — reading a request is free')
})

test('a charge can never be paid twice, and never by accident', () => {
  // The keys ARE the idempotency: `@@unique([userId, grantKey])` refuses the
  // second row, so the format is load-bearing. Change one of these strings by a
  // character and every contact already paid for is charged again.
  assert.equal(contactKey('abc'), 'CONTACT:abc')
  assert.equal(jobDoneKey('abc'), 'JOB_DONE:abc')
  assert.notEqual(contactKey('abc'), jobDoneKey('abc'))
  // Neither namespace may collide with a task key, or one of the two becomes
  // silently unpayable — which reads as the feature being broken.
  for (const t of CREDIT_TASKS) {
    assert.notEqual(contactKey(t.key), t.key)
    assert.notEqual(jobDoneKey(t.key), t.key)
  }
  const server = read('lib/creditsServer.ts')
  // ⚠️ THE UNLOCK CLAIMS, IT DOES NOT CHECK — CLAUDE.md rule 4 applied to a
  // number that is a SUM and therefore has no row to claim. The key is written
  // by the same statement that tests the balance, so two tabs cannot both spend
  // the last lari and cannot both be charged for one phone number.
  const charge = server.slice(server.indexOf('export async function chargeForContact'))
  assert.match(charge.slice(0, 2500), /ON CONFLICT|skipDuplicates|grantKey/,
    'the unlock is written without its idempotency key — a second tab pays for the same contact')
  const done = server.slice(server.indexOf('export async function grantJobDone'))
  assert.match(done.slice(0, 900), /skipDuplicates: true/, 'a finished job can be paid twice')
})

test('an admin can unblock somebody, and the row says why', () => {
  // The reason lives IN `reason`, prefixed so it stays machine-readable — see
  // lib/credits → adminAdjustReason for why that is not a migration.
  const r = adminAdjustReason('  ბრძანება #12  ')
  assert.equal(r, `${ADMIN_ADJUST}: ბრძანება #12`)
  assert.ok(isAdminAdjust(r))
  assert.ok(isAdminAdjust(ADMIN_ADJUST))
  // A task key must never be mistaken for a hand movement, or an export counts
  // earned credit as manually typed.
  for (const t of CREDIT_TASKS) assert.ok(!isAdminAdjust(t.key))
  assert.ok(!isAdminAdjust('OFFER_SENT'))
  assert.ok(!isAdminAdjust('OFFER_UNANSWERED'))
  // Bounded, because the column is read into panels and mails.
  assert.ok(adminAdjustReason('x'.repeat(500)).length <= 300)
})

/* ── C. It is never called money ──────────────────────────────────────────── */

test('the vocabulary never turns a discount into a liability', () => {
  // These words make a balance sound like something owed. PAYMENTS_LIVE is
  // false; nothing here can be withdrawn, transferred or refunded.
  const BANNED = ['ანაზღაურება', 'შენი ფული', 'გამომუშავებულ', 'გატანა', 'ქეშბექ', 'დაბრუნება']
  // ⚠️ AND THE SCREENS THAT SAY IT, not only the modules that define it
  // (2026-08-21): /work/services now announces what a save earned, which is the
  // first time the grant is spoken outside the strip.
  // ⚠️ AND THE OFFER FORM (2026-08-21): it now states what sending costs and
  // what happens when nobody answers, which is the first time the SPEND is
  // spoken to a provider. „დაბრუნება" is banned, so a released charge is stated
  // as the balance ending where it started — never as money coming back.
  for (const f of [
    'lib/credits.ts', 'lib/creditsServer.ts', 'app/work/profile/_editor.tsx',
    'app/work/(provider)/requests/[id]/OfferForm.tsx', 'app/work/_components/CreditStrip.tsx',
    'app/api/admin/users/[id]/credits/route.ts',
    // ⚠️ AND THE PAGE THAT NOW SAYS ALL OF IT AT ONCE (2026-09-01). /work/balance
    // is the first screen to print the rules, the grants and every movement
    // together — which makes it the single easiest place for one careless word
    // to turn a credit into a liability.
    'app/work/balance/page.tsx',
  ]) {
    const src = read(f)
    for (const w of BANNED) {
      // The rule is about COPY, so a line that explicitly forbids the word is
      // the one place it may appear.
      const lines = src.split('\n').filter(l => l.includes(w) && !l.includes('NEVER SAY') && !/^\s*(\/\/|\*)/.test(l))
      assert.deepEqual(lines, [], `${f} calls the balance „${w}" — see the wording rules at the top of lib/credits`)
    }
  }
})

/* ── C2. Every movement has a word for the person it happened to ─────────── */

test('the ledger can name every reason the code is able to write', () => {
  /* ⚠️ THIS IS WHY THE BALANCE HAD NO PAGE UNTIL 2026-09-01. `CreditEntry.reason`
     is written in seven shapes and NOTHING turned one into Georgian, so the
     only honest thing a screen could show was the total — a number that moves
     for reasons its owner cannot see. Owner, reading his own workspace:
     „ეს 65₾ საიდან მოვიდა".

     The list below is not a copy of the labels; it is the list of reasons the
     WRITERS actually produce (lib/creditsServer: `t.key`, 'JOB_DONE',
     'CONTACT_OPENED', 'CONTACT_REFUND', `adminAdjustReason`). If a new movement
     is added and nothing names it, this fails — which is the property, because
     the alternative is a row on a provider's ledger reading „PROFILE_BIO". */
  const written = [
    ...CREDIT_TASKS.map(t => t.key),
    'JOB_DONE', 'CONTACT_OPENED', 'CONTACT_REFUND',
    adminAdjustReason('ხელით შესწორება'),
  ]
  for (const reason of written) {
    const label = creditReasonLabel(reason)
    assert.notEqual(label, reason, `„${reason}" reaches a provider's ledger as its own key`)
    assert.ok(label.trim().length > 0, `„${reason}" has an empty label`)
    // The wording rules are not suspended by a label being short.
    for (const w of ['ანაზღაურება', 'შენი ფული', 'გამომუშავებულ', 'გატანა', 'ქეშბექ', 'დაბრუნება']) {
      assert.ok(!label.includes(w), `the ledger calls „${reason}" „${w}"`)
    }
  }
  // A task's row is named by the task's own label — never a second wording that
  // can drift from the checklist two cards above it on the same page.
  for (const t of CREDIT_TASKS) assert.equal(creditReasonLabel(t.key), t.label)
  // An admin movement shows the note somebody typed, not the prefix.
  assert.equal(creditReasonLabel(adminAdjustReason('ხელით შესწორება')), 'ხელით შესწორება')
  assert.equal(creditReasonLabel(`${ADMIN_ADJUST}: `), ADMIN_ADJUST, 'an empty note blanks the row')
  // ⚠️ AN UNKNOWN REASON RETURNS ITSELF and must not blank. The number still
  // moved; a ledger that hides one movement is worse than one printing a key.
  assert.equal(creditReasonLabel('SOMETHING_NEW'), 'SOMETHING_NEW')
})

/* ── D. The score is the same arithmetic as the grant ─────────────────────── */

test('completeness is earned, not invented', () => {
  // ⚠️ `servicesConfirmed` IS SET THE SAME IN BOTH and must stay that way: it
  // rides on ProfileFacts only because profileFacts() already reads the row
  // (tests/requestQueue §F forbids /work a second query), and it earns NOTHING.
  // If completeness ever moves when only this flips, money has been put behind
  // pressing save — which is the one thing that must stay a free, honest yes.
  const none: ProfileFacts = {
    hasPhoto: false, hasBio: false, hasProfessions: false,
    hasExperience: false, hasService: false, hasCertificate: false,
    servicesConfirmed: false, notVisible: [],
  }
  const all: ProfileFacts = {
    hasPhoto: true, hasBio: true, hasProfessions: true,
    hasExperience: true, hasService: true, hasCertificate: true,
    servicesConfirmed: false, notVisible: [],
  }
  assert.equal(completeness(none), 0)
  assert.equal(completeness(all), 100)
  // …and confirming the list moves neither number.
  assert.equal(completeness({ ...all, servicesConfirmed: true }), 100)
  assert.equal(completeness({ ...none, servicesConfirmed: true }), 0)
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
  // ServiceProfile had none of them. A provider who only sold services could
  // therefore earn 50₾ of a grant the landing calls 100₾, and services are what
  // this site sells, so that was the majority of the supply side being shown a
  // prize they could not win.
  //
  // It was fixed with a SECOND WORDING per task, chosen by capability. There is
  // one profile since 2026-08-24 and one wording again — what survives is the
  // rule underneath: every key must be earnable from a column this row has, and
  // the editor the strip points at must be the page that writes it.
  const list = creditTasks()
  assert.equal(list.length, CREDIT_TASKS.length, 'a task went missing')
  assert.equal(list.reduce((n, t) => n + t.tetri, 0), CREDIT_TASKS_TOTAL, 'the list does not add up to the promise')
  assert.deepEqual(list.map(t => t.key), CREDIT_TASKS.map(t => t.key), 'the keys were reordered')
  for (const t of list) {
    assert.ok(t.label.trim().length > 0 && t.why.trim().length > 0, `${t.key} has empty copy`)
  }

  const columnOf: Record<string, string> = {
    PROFILE_PROFESSIONS: 'services',
    PROFILE_SERVICE: 'priceList',
    PROFILE_CERTIFICATE: 'workPhotos',
    PROFILE_PHOTO: 'photoUrl',
    PROFILE_BIO: 'about',
    PROFILE_EXPERIENCE: 'areas',
  }
  const facts = read('lib/creditsServer.ts')
  const schema = read('lib/serviceProfile.ts')
  const api = read('app/api/provider/service-profile/route.ts')
  // ⚠️ THE EDITOR IS LOOKED UP THROUGH `taskHref`, not named here (2026-08-21).
  // „ვინ ვარ" moved to /work/profile for both halves on the day this test was
  // written, and a hard-coded file would have gone on asserting that the photo
  // is editable on the services page long after it stopped being.
  // ⚠️ THE PAGE, NOT ONE OF ITS PARTS (2026-08-29). This named a single file
  // per destination, and /work/profile is a container plus five `_*.tsx`
  // siblings — so the test was really asserting „the column appears in
  // _master.tsx", which was true only by accident. It stopped being true the
  // day that file lost its second face uploader and the `about` it had no
  // field for, and the failure read as „the photo task is unreachable" when the
  // photo had simply moved to the block beside it.
  // ⚠️ ONE KEY SINCE 2026-08-30, and it used to be two. This map existed to say
  // which of the two editors drew the control a task is completed with; the two
  // wrote one `ServiceProfile` row and became one page („ჩემი გვერდი"), so the
  // question it answers is now „which SECTION", and all of them are that page.
  const EDITOR: Record<string, string[]> = {
    '/work/profile': [
      'app/work/profile/_editor.tsx',
      'app/work/profile/_secIdentity.tsx',
      'app/work/profile/_secServices.tsx',
      'app/work/profile/_secPhotos.tsx',
    ],
  }

  // ⚠️ AND THE CONTROL IS NAMED, BECAUSE THE COLUMN IS NOT ALWAYS THE FIELD.
  // Two of the six never spelled their column on screen and a grep for it was
  // passing on the surrounding prose rather than on a control:
  //   · `about` USED TO BE `bio` in the form and was mapped at the two edges.
  //     Since 2026-08-30 the draft carries the endpoint's own field names, so
  //     the body is `JSON.stringify(draft)` and nothing translates in between —
  //     a mapping layer is where „the bio saved and the headline did not" comes
  //     from. The control is `draft.about` now (app/work/profile/_types.ts);
  //   · `photoUrl` is written by /api/uploads from the ავატარი block, not by
  //     the page's own PUT body — and `profileFacts` pays the task for EITHER
  //     portrait column, which is what makes one uploader enough.
  // What has to exist is the control. That is what „a task with nowhere to do
  // it" meant.
  const CONTROL: Record<string, RegExp> = {
    PROFILE_PROFESSIONS: /toggleService|professions/,
    PROFILE_SERVICE: /setPrice|priceList/,
    PROFILE_CERTIFICATE: /WorkPhotos/,
    PROFILE_PHOTO: /pickAvatar/,
    PROFILE_BIO: /draft\.about/,
    PROFILE_EXPERIENCE: /yearsExp|toggleArea/,
  }

  for (const t of creditTasks()) {
    const col = columnOf[t.key]
    assert.ok(col, `${t.key} has no column on the service side — profileFacts cannot pay it`)
    // The four things that have to agree, from the ledger back to the input:
    // what earns it, what may be sent, what is written, and what is on screen.
    assert.match(facts, new RegExp(`provider\\?\\.${col}`),
      `profileFacts stopped reading ${col} — ${t.key} („${t.label}") is unearnable for a master`)
    assert.match(schema, new RegExp(`\\b${col}:`),
      `ServiceProfileInput refuses ${col} — the editor cannot send „${t.label}"`)
    assert.match(api, new RegExp(`\\b${col}\\b`),
      `/api/provider/service-profile never writes ${col} — „${t.label}" is a task with no writer`)
    const files = EDITOR[taskHref(t.key)]
    assert.ok(files, `${t.key} points at an editor this test does not know`)
    const control = CONTROL[t.key]
    assert.ok(control, `${t.key} has no named control — this test cannot tell whether it is reachable`)
    // The CONTROL, not a mention: comment text must not satisfy this, which is
    // what `codeOf` strips. One of the page's parts has to carry it.
    assert.ok(files.some(f => control.test(codeOf(f))),
      `no part of ${taskHref(t.key)} carries ${control} — „${t.label}" is a task with nowhere to do it`)
  }
})

test('the grant arrives with the act that earned it', () => {
  // The shell grants on navigation (the test below), which for a form saved by
  // fetch means „some time later, on another screen". A balance that moves on
  // its own is not a bonus; the endpoint that writes the two service-side
  // columns pays for them and says so.
  const api = read('app/api/provider/service-profile/route.ts')
  assert.match(api, /grantEarnedTasks\(viewer\.user\.id\)/,
    'the services editor stopped paying on save — the grant is back to arriving silently')
  assert.match(read('app/work/profile/_editor.tsx'), /ბალანსზე დაგერიცხა/,
    'the form stopped saying what the save earned')
  // The vocabulary it uses to say so is pinned by the wording test above, which
  // now reads this file too.
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

test('the strip sends each task to the editor that owns it', () => {
  /* ⚠️ WHAT THIS USED TO PIN, AND WHY IT CHANGED (2026-08-21). The button
   * branched on the CAPABILITY — expert → /work/profile, master → /work/services
   * — which was right only while a master had no profile page: their photo and
   * their sentence were edited inside „ჩემი სერვისები", so one address answered
   * both questions. /work/profile now opens for both halves and holds „ვინ ვარ"
   * for both, so a per-person address would send a plumber who needs to upload a
   * photo to the page listing their trades.
   */
  const OWNS: Record<CreditTaskKey, string> = {
    PROFILE_PROFESSIONS: '/work/profile',
    PROFILE_EXPERIENCE:  '/work/profile',
    PROFILE_SERVICE:     '/work/profile',
    PROFILE_CERTIFICATE: '/work/profile',
    PROFILE_PHOTO:       '/work/profile',
    PROFILE_BIO:         '/work/profile',
  }
  for (const t of creditTasks()) {
    assert.equal(taskHref(t.key), OWNS[t.key],
      `${t.key} („${t.label}") sends the provider to a page that does not hold that field`)
  }
  // Two pages and only two: every task is either what I sell or who I am.
  // ⚠️ ONE ADDRESS SINCE 2026-08-30. This list held two while the row had two
  // editors; `taskHref` no longer branches at all — see lib/credits.
  assert.deepEqual([...new Set(Object.values(OWNS))].sort(), ['/work/profile'],
    'a third editor appeared — „რას ვყიდი" and „ვინ ვარ" are the whole of it')
  // The page passes the task's own address, and the strip hard-codes nothing.
  assert.match(read('app/work/page.tsx'), /editHref=\{next \? taskHref\(next\.key\)/,
    'the completion button stopped following the task')
  assert.doesNotMatch(read('app/work/_components/CreditStrip.tsx'), /href="\/work\//,
    'the strip hard-codes an editor again')
})

test('the grant runs on the SHELL, and every supply-side hat is routed to it', () => {
  // ⚠️ THE BUG THIS PINS (2026-08-21). The grant was wired to app/work/page.tsx
  // and nothing else, and /work was the one screen a service provider was never
  // sent to — sign-in put them on the queue and the phone's tab bar had no route
  // to the home at all. Measured on live data before the fix: 0 of 2 service
  // providers and 3 of 27 experts had ANY grant; one provider held 85₾ of
  // completed tasks and a −5₾ balance. A bonus that pays only the people who
  // walk past one door is not a bonus.
  const shell = read('app/work/layout.tsx')
  assert.match(shell, /grantEarnedTasks\(user\.id\)/,
    'the shell stopped granting — the bonus is back to paying one screen')
  assert.doesNotMatch(read('app/work/page.tsx'), /await grantEarnedTasks/,
    'the grant is being run twice per render of the home')

  // Where each supply-side hat LANDS is pinned next to the hats themselves
  // (tests/hats §C, tests/spaces §F) — this file stays pure and asserts only the
  // door, which is the one redirect that lives outside lib/hats and branched on
  // the capability: a finished applicant must not be dropped on the queue.
  assert.match(read('app/join/page.tsx'), /if \(await isProvider\(user\.id\)\) redirect\('\/work'\)/,
    'the join door sends a finished applicant somewhere without a balance again')
})

test('the balance is readable from the chrome, in the sanctioned wording', () => {
  // ⚠️ OWNER, 2026-08-21, pointing at the signed-in cluster: „აქ უნდა ჩანდეს
  // ლამაზად." The number had lived on /work alone — one screen out of forty —
  // so a provider browsing the catalogue or their own public page never saw the
  // thing the whole bonus exists to motivate.
  const pill = read('components/CreditPill.tsx')
  for (const bar of ['components/PublicTopBar.tsx', 'components/work/WorkspaceTopBar.tsx']) {
    assert.match(read(bar), /<CreditPill\s/, `${bar} no longer shows the balance`)
  }

  // It must render NOTHING when there is no balance to show — a plain client
  // has no capability and must never be handed „0₾" for something they cannot
  // earn or spend. Null and zero are different states on purpose.
  assert.match(pill, /tetri == null.*return null/s, 'the pill draws a number for somebody who sells nothing')
  assert.match(read('app/api/me/route.ts'), /identity\.provider \? balanceTetri : null/,
    '/api/me hands the balance to somebody who sells nothing')

  // The wording rules from lib/credits — they exist because naming this
  // „ანაზღაურება" or „შენი ფული" once turns a discount into a liability.
  // ⚠️ COMMENTS STRIPPED FIRST: the component QUOTES the banned list in its own
  // header, and a scan over raw source would read the warning as the offence.
  const shown = pill
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  assert.match(shown, /ბალანსი/, 'the pill lost the only word that names it')
  for (const banned of ['ანაზღაურება', 'შენი ფული', 'გამომუშავებ', 'გატანა', 'ქეშბექ']) {
    assert.ok(!shown.includes(banned), `the pill calls the balance „${banned}" — it reads as cash`)
  }
})


/* ── G. The provider is told what it costs BEFORE they spend it ───────────── */

test('the screen says what opening a contact costs, before the click', () => {
  /* ⚠️ THE RULE THIS PINS. A charge somebody discovers afterwards is exactly
   * what a lari-denominated balance must never produce — it is the thing that
   * turns a discount into a grievance. So the price is on the button, not in a
   * confirmation and not in a receipt.
   *
   * ⚠️ AND THE OFFER FORM MUST NOT MENTION A PRICE AT ALL (2026-08-21). Sending
   * is free now; a cost line left behind on that form would be the site
   * charging for something in words while charging for something else in code.
   *
   * ⚠️ THE PRICE CAME OFF THE BUTTON AND THE RULE DID NOT (2026-09-01, the
   * canvas). „კონტაქტის ნახვა · 1₾" became „კონტაქტის გახსნა" with the fee set
   * above it and `CONTACT_CHARGE_NOTE` beside it, because the canvas's card
   * already states the number twice and a third copy on the control itself is
   * one fact said three ways. What is pinned is what was always the point —
   * SOMETHING ON THAT CARD NAMES THE PRICE BEFORE THE CLICK — so the assertion
   * moves from the label to the line that now carries it.
   */
  const contact = read('app/work/(provider)/requests/[id]/_contact.tsx')
  assert.match(contact, /CONTACT_COST_NOTE|CONTACT_BUTTON_LABEL/, 'the unlock stopped saying what it costs')
  assert.match(contact, /NO_BALANCE/, 'a provider refused for want of balance is shown a raw code or nothing')
  const form = read('app/work/(provider)/requests/[id]/OfferForm.tsx')
  assert.match(form, /OFFER_FREE_NOTE/, 'the offer form no longer says that answering is free')

  // The sentences are built from the constants, so the price is spelled in ONE
  // place — a hard-coded „1₾" on a screen is how a copy change and a code
  // change stop agreeing.
  /* ⚠️ THE PRICE IS PER JOB NOW, so the sentences that name a figure take one.
     `CONTACT_COST_NOTE` speaks where no job is in hand and carries the RANGE;
     the two beside the button are functions of what THIS contact costs. */
  assert.match(CONTACT_COST_NOTE, new RegExp(contactCostRangeLabel()), 'the cost line no longer names the price')
  assert.match(CONTACT_COST_NOTE, /ბალანს/, 'the cost line no longer names what it is spent from')
  const someFee = contactCostTetri(800, null)
  assert.match(contactChargeNote(someFee), new RegExp(`${someFee / TETRI}₾`),
    'nothing beside the button carries this job‘s price')
  assert.match(contact, /contactChargeNote\(/, 'the unlock card stopped naming the charge before the click')
  // The refund is a TERM OF THE SALE and has to be readable before paying, not
  // discovered after — and it now names its own window, so the sentence and the
  // sweep that enforces it are the same number.
  assert.match(contactRefundNote(someFee), new RegExp(String(CONTACT_REFUND_HOURS)),
    'the refund promise stopped naming its deadline')
  assert.match(contactRefundNote(someFee), new RegExp(`${someFee / TETRI}₾`))
  assert.match(noBalanceNote(someFee), new RegExp(`${someFee / TETRI}₾`))
  assert.match(JOB_DONE_NOTE, new RegExp(`${JOB_DONE_TETRI / TETRI}₾`), 'the earn-back line no longer names what a finished job pays')
  for (const line of [CONTACT_COST_NOTE, CONTACT_BUTTON_LABEL, contactChargeNote(someFee), OFFER_FREE_NOTE,
                      OFFER_FREE_TITLE, OFFER_FREE_BODY, JOB_DONE_NOTE, noBalanceNote(someFee), contactLimitNote(0)]) {
    for (const banned of ['ანაზღაურება', 'შენი ფული', 'გამომუშავებ', 'გატანა', 'ქეშბექ', 'დაბრუნება']) {
      assert.ok(!line.includes(banned), `„${line}" calls the balance „${banned}"`)
    }
  }

  // The strip is where the person with a finished profile learns the number can
  // go back up — that screen is the only one whose reader has no grants left.
  assert.match(read('app/work/_components/CreditStrip.tsx'), /JOB_DONE_NOTE/,
    'the strip stopped telling a finished profile how the balance grows again')
})

test('the contact is claimed, not checked — and it never leaves the server unpaid', () => {
  /* ⚠️ WHAT THIS PINS. The old charge was a best-effort call AFTER the offer
   * existed: a swallowed failure was a free lead. The unlock cannot work that
   * way at all, because what it hands over is a phone number — if the write
   * fails and the response still carries the contact, the platform gave away
   * the only thing it has to sell.
   *
   * A balance is a SUM and has no row to claim, so the guard is pushed into the
   * INSERT (CLAUDE.md rule 4 applied to an aggregate) and the contact is read
   * only after that statement reports it wrote a row.
   */
  const server = read('lib/creditsServer.ts')
  assert.match(server, /INSERT INTO "CreditEntry"[\s\S]{0,900}?COALESCE\(SUM\("amountTetri"\)[\s\S]{0,300}?>=/,
    'the spend no longer claims the balance — two tabs can both spend the last lari')
  assert.match(server, /FOR UPDATE/, 'nothing serialises one provider\'s concurrent spends')

  const route = read('app/api/provider/requests/[id]/contact/route.ts')
  // The refusals a caller can actually get, each with its own code: no balance
  // is 402, a full request is 409. A single „error" would leave the screen
  // unable to say which of the two happened.
  for (const code of ['NO_BALANCE', '402', '409']) {
    assert.ok(route.includes(code), `the unlock route lost its ${code} answer`)
  }
  /* ⚠️ THE AUTHORISATION ITSELF, PINNED FOR THE FIRST TIME (2026-09-01, the
     owner's design canvas → „Expert Jobs"). Nothing anywhere asserted WHO may
     unlock a contact — the old rule („the request is VERIFIED") was open to
     every allowlisted provider, so there was little to get wrong. The canvas
     moved the fee behind the client's choice, and that turns this route into
     the boundary between „a stranger with a balance" and „the person this
     client picked", which is a phone number's worth of difference.

     Two halves, and the second is the one a plausible rewrite loses: the
     question is asked of THIS PROVIDER'S OWN OFFER, not of the request. A
     `MATCHED` request says somebody was chosen and never says who — a route
     that read the status alone would sell the winner's client to every provider
     who lost, while passing any test that only looked for the word ACCEPTED. */
  const gate = codeOf('app/api/provider/requests/[id]/contact/route.ts')
  assert.match(gate, /prisma\.requestOffer\.findFirst\([\s\S]{0,300}?status: 'ACCEPTED'/,
    'the unlock no longer requires an accepted offer — it is chargeable before the client has chosen')
  assert.match(gate, /status: 'ACCEPTED',[\s\S]{0,120}?expertUserId: userId/,
    'the accepted offer is not keyed to the caller — every loser can buy the winner\'s client')
  assert.doesNotMatch(gate, /status: 'MATCHED'/,
    'the request\'s own status is being used as the gate — it says somebody was chosen, never who')

  // And the phone is fetched inside the paid path, never selected into the
  // page that lists requests — the rule lib/requests set when it took
  // phone/email out of ProviderRequestRow.
  assert.doesNotMatch(codeOf('app/work/(provider)/requests/page.tsx'), /phone: true|email: true/,
    'the queue selects the client contact again — it must never leave the server unpaid')
})

/*
 * ═══════════ THE REFUND — the promise that answers the category's complaint ══
 *
 * ⚠️ WHY THIS IS TESTED AND NOT JUST WRITTEN. The refund is the one piece of
 * this ledger the provider is asked to TRUST BEFORE PAYING: the contact screen
 * says the 1₾ comes back if the request dies unanswered, and that sentence is
 * a promise made at the moment money leaves. Every part of it below is a way
 * the promise could quietly stop being kept while the sentence stayed on the
 * screen — refunding the wrong key, refunding on the wrong ending, refunding
 * silently, or the sweep closing a row and never asking.
 */

test('a dead lead gives the money back, and the index is what makes it safe', () => {
  const credits = read('lib/credits.ts')
  const server = read('lib/creditsServer.ts')

  // Its own key. Sharing `contactKey` would make a refund count against the
  // `offerLimit` cap — one refund would look like a fourth provider's purchase
  // and lock the request.
  assert.match(credits, /export function contactRefundKey/,
    'the refund lost its own grant key')
  assert.match(credits, /CONTACT_REFUND:/)
  assert.doesNotMatch(codeOf('lib/creditsServer.ts'),
    /refundDeadContacts[\s\S]{0,400}?grantKey: contactKey\(requestId\),[\s\S]{0,200}?create/,
    'the refund writes under the shared contact key — it would count as a purchase')

  // It pays back exactly what was taken, as a POSITIVE row (the spend is
  // negative). A sign error here is a second charge wearing a refund's name.
  /* ⚠️ IT PAYS BACK WHAT THE SPEND ROW SAYS (2026-09-03), not a constant — a
     contact costs 1–10₾ by job, so „refund the fee" is only answerable by
     reading what this provider actually paid. A constant here would hand a 1₾
     payer 10₾ and, worse, a 10₾ payer 1₾. */
  assert.match(codeOf('lib/creditsServer.ts'),
    /amountTetri: Math\.abs\(s\.amountTetri\),[\s\S]{0,120}?reason: 'CONTACT_REFUND'/,
    'the refund no longer gives back exactly what was taken')
  assert.ok(server.includes('reason: \'CONTACT_OPENED\''),
    'the refund no longer looks for the spend it is undoing')
})

test('the refund fires on the two endings that mean nobody answered', () => {
  const jobs = codeOf('lib/requestJobs.ts')

  // The sweep. It must sit AFTER the claim — a refund before the row is
  // actually claimed would run again on the next tick for a row somebody else
  // closed, and would mail a provider twice about one lari.
  assert.match(jobs, /claimed\.count !== 1\) continue[\s\S]{0,200}?refundDeadRequest\(/,
    'the sweep refunds before it owns the row, or has stopped refunding at all')

  // The admin's hand does what the cron does. REJECTED unconditionally — the
  // request was never real — CLOSED only with no offers, because a request
  // somebody answered is an ordinary ending and competition is not refunded.
  const admin = codeOf('app/api/admin/requests/[id]/route.ts')
  assert.match(admin, /status === 'REJECTED' \|\| \(status === 'CLOSED' && before\.offerCount === 0\)/,
    'the admin close/reject path no longer refunds what the cron would have')
  assert.match(admin, /refundDeadRequest\(/)
})

test('the refund is told to the provider, not left to be discovered', () => {
  // The whole finding this feature answers is half about silence: a refund
  // somebody has to notice in a balance they had written off reads exactly
  // like no refund. Bell AND mail, both from the one helper.
  const jobs = codeOf('lib/requestJobs.ts')
  assert.match(jobs, /refundDeadRequest[\s\S]{0,1200}?notifyMany\([\s\S]{0,200}?PAYOUT/,
    'a refunded provider is no longer notified')
  assert.match(jobs, /contactRefundedProviderEmail/,
    'a refunded provider is no longer mailed')

  const mail = read('lib/emailTemplates.ts')
  assert.match(mail, /export async function contactRefundedProviderEmail/)
  // No „claim your refund" CTA anywhere in it: there is nothing to claim, and
  // an action button would recreate the appeals process this replaces.
  const body = mail.slice(mail.indexOf('export async function contactRefundedProviderEmail'))
    .slice(0, 1600)
  assert.doesNotMatch(body, /მოითხოვ|განაცხად|დაბრუნების ფორმა/,
    'the refund mail asks the provider to apply for their own money')
})

test('a refund that fails once is not lost for ever', () => {
  const server = codeOf('lib/creditsServer.ts')
  const jobs = codeOf('lib/requestJobs.ts')

  // ⚠️ ONLY THE UNIQUE VIOLATION COUNTS AS SUCCESS. A bare `catch {}` reads
  // „already refunded" out of a dropped connection too — and because the first
  // attempt happens at the single moment a request dies, that silence would be
  // permanent.
  assert.match(server, /code === 'P2002'/,
    'the refund swallows every error again — a timeout now reads as success')

  // And the second chance that makes the first one recoverable.
  assert.match(jobs, /export async function sweepDeadContactRefunds/)
  assert.match(jobs, /out\.contactsRefunded \+= await sweepDeadContactRefunds\(\)/,
    'the retry sweep exists but no tick calls it')

  // It must ask the LEDGER first. Walking requests instead would cost one query
  // per closed row on every tick to do nothing.
  assert.match(jobs, /sweepDeadContactRefunds[\s\S]{0,400}?creditEntry\.findMany[\s\S]{0,200}?CONTACT_OPENED/,
    'the retry sweep no longer starts from the ledger')

  // The same two endings the admin path uses, and no third.
  assert.match(jobs, /status: 'REJECTED'[\s\S]{0,80}?status: 'CLOSED', offerCount: 0/,
    'the retry sweep refunds an ending the rest of the system does not')
})

test('the rail says what the profile is worth, not how full it is', () => {
  // ⚠️ FROM THE OWNER'S CANVAS (2026-08-30), where this line appears on SEVEN
  // of the fourteen artboards — the most-repeated element in the design. The
  // rail used to read „პროფილის სისრულე · 60%": true, and about a form rather
  // than about the reader. The bar is the same; what changed is that it now
  // names the money it is worth.
  const rail = read('components/work/WorkspaceSidebar.tsx')
  assert.match(rail, /კიდევ \{gelLabel\(unearnedTetri\)\} პროფილის შევსებისთვის/,
    'the rail dropped the line that says what finishing the profile pays')
  assert.match(rail, /unearnedTetri > 0 &&/,
    'the rail promises „კიდევ 0 ₾" to somebody with nothing left to earn')

  // ⚠️ NOT A SECOND READ OF THE SAME FACTS. The number rides back from the
  // grant the shell already performs; a `profileFacts` call of its own is the
  // duplicate query lib/creditsServer and tests/requestQueue §F both forbid.
  const layout = codeOf('app/work/layout.tsx')
  assert.match(layout, /const granted = await grantEarnedTasks\(user\.id\)/,
    'the rail number costs a second read of the profile again')
  assert.match(layout, /grantPercent = granted\.percent/,
    'the rail bar is fetched separately from the line beneath it')

  // ⚠️ THE BAR AND THE LINE COME FROM ONE MEASURE (2026-08-30). The bar used to
  // be lib/profileScore's weighted checks — a different six-item list, asking
  // for a headline and a language where the grant pays for a certificate and
  // years of experience — drawn directly above „კიდევ N ₾". It could read 100%
  // over a promise of 40₾ still to earn.
  assert.match(codeOf('lib/creditsServer.ts'), /const percent = completeness\(facts\)/,
    'the grant stopped reporting its own completeness')
  assert.doesNotMatch(codeOf('components/work/WorkspaceSidebar.tsx'), /badges\.profilePercent/,
    'the rail reads the polled score again — a different measure, and one that arrives late')
  assert.doesNotMatch(codeOf('app/api/work/nav-badges/route.ts'), /profilePercent/,
    'the badge poll computes a percentage nobody reads')
  assert.doesNotMatch(codeOf('components/work/WorkspaceSidebar.tsx'), /profileFacts|prisma/,
    'the rail queries for its own number — it is a client component')

  // And it must not restate the balance the top bar already carries.
  assert.doesNotMatch(rail, /balanceTetri/,
    'the rail prints the balance again — CreditPill already does, in the same chrome')
})

/* ═══════════ the three packages (2026-09-03) ════════════════════════════ */

test('every pack buys a WHOLE number of contacts', () => {
  /* ⚠️ REWRITTEN WITH THE LADDER (2026-09-03). It asserted that every pack
     divided cleanly by a single 3₾ contact; against a 1–10₾ price no pack can,
     and „N contacts" is a range rather than a figure. What survives is the part
     that was always the point: a pack is a whole number of lari, and what it
     buys is stated the same way the balance states it. */
  for (const p of CREDIT_PACKS) {
    assert.equal(p.priceTetri % TETRI, 0, `${p.key} charges a fraction of a lari`)
    assert.equal(p.creditTetri % TETRI, 0, `${p.key} credits a fraction of a lari`)
    assert.equal(packContacts(p), contactsLabel(p.creditTetri), `${p.key} counts contacts its own way`)
  }
})

test('the ladder only goes one way — bigger pack, better rate', () => {
  // The whole reason a pack exists. Both comparable platforms discount the big
  // one (Bark's credits are „on a sliding scale… the cost per credit drops when
  // you buy in bigger amounts"); a ladder that flattened or inverted would be a
  // price list with no argument for its top row.
  for (let i = 1; i < CREDIT_PACKS.length; i++) {
    const prev = CREDIT_PACKS[i - 1]
    const cur = CREDIT_PACKS[i]
    assert.ok(cur.priceTetri > prev.priceTetri, `${cur.key} does not cost more than ${prev.key}`)
    assert.ok(packBonusPct(cur) >= packBonusPct(prev), `${cur.key} gives away less than ${prev.key}`)
    // Price per contact, in tetri — strictly better as you go up.
    // Price per lari of balance — strictly better as you go up. („Per contact"
    // is no longer a single number; per lari is the same claim without one.)
    assert.ok(
      cur.priceTetri / cur.creditTetri < prev.priceTetri / prev.creditTetri,
      `${cur.key} is not cheaper per lari of balance than ${prev.key}`,
    )
  }
})

test('the bonus is computed from the money, never stored beside it', () => {
  // A typed „+20%" next to a pair of amounts is two facts that can disagree,
  // and only one of them moves money.
  assert.equal(packBonusPct({ key: 'START', priceTetri: 100, creditTetri: 100, label: 'x' }), 0)
  assert.equal(packBonusPct({ key: 'START', priceTetri: 100, creditTetri: 120, label: 'x' }), 20)
  // A pack that credited LESS than it costs is not a discount, it is a bug —
  // and it must read as 0 rather than as a negative bonus on a card.
  assert.equal(packBonusPct({ key: 'START', priceTetri: 100, creditTetri: 90, label: 'x' }), 0)
})

test('nothing sells a pack while PAYMENTS_LIVE is false', () => {
  /* ⚠️ THE PAGE'S OWN RULE, EXECUTED. app/work/balance says a „პაკეტები" block
     „would be a price list for something nobody can buy" — so the block exists
     but is gated, and this is the assertion that keeps the gate. If a checkout
     ever ships, this test is the one that should be deleted deliberately, with
     the flag. */
  const page = readFileSync(join(process.cwd(), 'app/work/balance/page.tsx'), 'utf8')
  assert.match(page, /PAYMENTS_LIVE && \(/, 'the packages block lost its flag')
})
