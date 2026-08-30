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
  CREDIT_TASKS, CREDIT_TASKS_TOTAL, CONTACT_COST_TETRI, TETRI, CREDITS_ENFORCED,
  JOB_DONE_TETRI, CONTACT_COST_NOTE, CONTACT_BUTTON_LABEL, OFFER_FREE_NOTE,
  JOB_DONE_NOTE, NO_BALANCE_NOTE, contactLimitNote, contactPlacesLeft,
  gelLabel, contactsAffordable, canAffordContact, earnedTasks, completeness, creditTasks, taskHref,
  contactKey, jobDoneKey, adminAdjustReason, isAdminAdjust, ADMIN_ADJUST,
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
  assert.equal(CONTACT_COST_TETRI, 1 * TETRI)
  assert.equal(CONTACT_COST_TETRI % TETRI, 0, 'a contact costs a fraction of a lari')
  // 100₾ ÷ 1₾ = 100 contacts.
  assert.equal(contactsAffordable(CREDIT_TASKS_TOTAL), 100)
  assert.equal(contactsAffordable(0), 0)
  assert.equal(contactsAffordable(CONTACT_COST_TETRI - 1), 0, 'a partial credit buys a contact')
  assert.equal(contactsAffordable(CONTACT_COST_TETRI), 1)

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
  assert.equal(canAffordContact(0), !CREDITS_ENFORCED,
    'the switch and the predicate disagree — one of them is not reading CREDITS_ENFORCED')
  assert.equal(canAffordContact(CONTACT_COST_TETRI), true, 'the exact price of one contact must buy one contact')
  assert.equal(canAffordContact(CREDIT_TASKS_TOTAL), true)

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
  assert.ok(JOB_DONE_TETRI > ORDINARY_LIMIT * CONTACT_COST_TETRI,
    'a finished job pays back less than one request can take out of the supply side — the loop shrinks')
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
    'lib/credits.ts', 'lib/creditsServer.ts', 'app/work/services/_trades.tsx',
    'app/work/(provider)/requests/[id]/OfferForm.tsx', 'app/work/_components/CreditStrip.tsx',
    'app/api/admin/users/[id]/credits/route.ts',
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
    servicesConfirmed: false,
  }
  const all: ProfileFacts = {
    hasPhoto: true, hasBio: true, hasProfessions: true,
    hasExperience: true, hasService: true, hasCertificate: true,
    servicesConfirmed: false,
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
  const EDITOR: Record<string, string[]> = {
    '/work/services': ['app/work/services/_trades.tsx'],
    '/work/profile': [
      'app/work/profile/_tabProfile.tsx',
      'app/work/profile/_master.tsx',
      'app/work/profile/_expertClient.tsx',
    ],
  }

  // ⚠️ AND THE CONTROL IS NAMED, BECAUSE THE COLUMN IS NOT ALWAYS THE FIELD.
  // Two of the six never spelled their column on screen and a grep for it was
  // passing on the surrounding prose rather than on a control:
  //   · `about` is `bio` in the form — mapped at the two edges on purpose, see
  //     app/work/profile/_types.ts;
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
    PROFILE_BIO: /form\.bio/,
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
  assert.match(read('app/work/services/_trades.tsx'), /ბალანსზე დაგერიცხა/,
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
    PROFILE_SERVICE:     '/work/services',
    PROFILE_CERTIFICATE: '/work/profile',
    PROFILE_PHOTO:       '/work/profile',
    PROFILE_BIO:         '/work/profile',
  }
  for (const t of creditTasks()) {
    assert.equal(taskHref(t.key), OWNS[t.key],
      `${t.key} („${t.label}") sends the provider to a page that does not hold that field`)
  }
  // Two pages and only two: every task is either what I sell or who I am.
  assert.deepEqual([...new Set(Object.values(OWNS))].sort(), ['/work/profile', '/work/services'],
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
  for (const bar of ['components/PublicTopBar.tsx', 'components/tutor/WorkspaceTopBar.tsx']) {
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
   */
  const contact = read('app/work/(provider)/requests/[id]/_contact.tsx')
  assert.match(contact, /CONTACT_COST_NOTE|CONTACT_BUTTON_LABEL/, 'the unlock stopped saying what it costs')
  assert.match(contact, /NO_BALANCE/, 'a provider refused for want of balance is shown a raw code or nothing')
  const form = read('app/work/(provider)/requests/[id]/OfferForm.tsx')
  assert.match(form, /OFFER_FREE_NOTE/, 'the offer form no longer says that answering is free')

  // The sentences are built from the constants, so the price is spelled in ONE
  // place — a hard-coded „1₾" on a screen is how a copy change and a code
  // change stop agreeing.
  const price = `${CONTACT_COST_TETRI / TETRI}₾`
  assert.match(CONTACT_COST_NOTE, new RegExp(price), 'the cost line no longer names the price')
  assert.match(CONTACT_COST_NOTE, /ბალანს/, 'the cost line no longer names what it is spent from')
  assert.match(CONTACT_BUTTON_LABEL, new RegExp(price), 'the button no longer carries the price')
  assert.match(NO_BALANCE_NOTE, new RegExp(price))
  assert.match(JOB_DONE_NOTE, new RegExp(`${JOB_DONE_TETRI / TETRI}₾`), 'the earn-back line no longer names what a finished job pays')
  for (const line of [CONTACT_COST_NOTE, CONTACT_BUTTON_LABEL, OFFER_FREE_NOTE, JOB_DONE_NOTE, NO_BALANCE_NOTE, contactLimitNote(0)]) {
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
  assert.match(codeOf('lib/creditsServer.ts'),
    /amountTetri: CONTACT_COST_TETRI,[\s\S]{0,120}?reason: 'CONTACT_REFUND'/,
    'the refund no longer credits exactly one contact')
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
  assert.match(mail, /export function contactRefundedProviderEmail/)
  // No „claim your refund" CTA anywhere in it: there is nothing to claim, and
  // an action button would recreate the appeals process this replaces.
  const body = mail.slice(mail.indexOf('export function contactRefundedProviderEmail'))
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
  const rail = read('components/tutor/WorkspaceSidebar.tsx')
  assert.match(rail, /კიდევ \{gelLabel\(unearnedTetri\)\} პროფილის შევსებისთვის/,
    'the rail dropped the line that says what finishing the profile pays')
  assert.match(rail, /unearnedTetri > 0 &&/,
    'the rail promises „კიდევ 0 ₾" to somebody with nothing left to earn')

  // ⚠️ NOT A SECOND READ OF THE SAME FACTS. The number rides back from the
  // grant the shell already performs; a `profileFacts` call of its own is the
  // duplicate query lib/creditsServer and tests/requestQueue §F both forbid.
  assert.match(codeOf('app/work/layout.tsx'), /\(await grantEarnedTasks\(user\.id\)\)\.unearnedTetri/,
    'the rail number costs a second read of the profile again')
  assert.doesNotMatch(codeOf('components/tutor/WorkspaceSidebar.tsx'), /profileFacts|prisma/,
    'the rail queries for its own number — it is a client component')

  // And it must not restate the balance the top bar already carries.
  assert.doesNotMatch(rail, /balanceTetri/,
    'the rail prints the balance again — CreditPill already does, in the same chrome')
})
