import { test, expect } from '@playwright/test'
import { signIn, balanceOf, withDb } from './fixtures'
import { E2E } from './accounts'
import { contactCostTetri } from '../lib/credits'

/**
 * THE WHOLE COMMERCIAL MODEL, ONCE, IN A REAL BROWSER.
 *
 * A client describes what they need → providers write offers → one is accepted
 * → the winner opens the contact. That sentence is the product (CLAUDE.md), and
 * until now nothing executed it end to end: the 84 test files read source text,
 * so every screen in the chain could be individually „correct" while the chain
 * itself was broken. It was, repeatedly, and a person walking it by hand is
 * what found each one.
 *
 * ⚠️ IT ASSERTS MONEY FROM THE LEDGER, NOT FROM THE SCREEN. „Sending is free"
 * and „the contact costs 3₾" are the two facts the business runs on, and a
 * screen can say either one while the ledger does something else — which is
 * exactly the class of bug that let `priceKind` be parsed, validated, mailed
 * and never written. So the balance is read straight out of `CreditEntry`.
 *
 * ⚠️ AND IT READS THE PRICE FROM `lib/credits`, never a literal. The owner has
 * said the number will move; a test that hard-codes 300 tetri would fail on the
 * day of a re-price and teach whoever is on call to edit the test.
 */
test('a client asks, a provider answers free, the client picks, the winner pays for the contact', async ({ page, context, baseURL }) => {
  const before = await balanceOf(E2E.provider)

  /* ── 1. THE CLIENT WRITES A REQUEST ────────────────────────────────────
     Through the real wizard. A request inserted by a seed has never been
     through the intake and would prove nothing about it. */
  await page.goto('/request')
  await page.getByRole('combobox').first().fill('დალაგება')
  await page.getByRole('option').first().click()

  /* The clarifying step. Which questions appear is `extrasFor`'s business and
     changes per topic, so the walk answers the FIRST option of each one rather
     than naming them — this test is about the flow, not about this topic's
     wording, and hard-coding „2 ოთახი" would make it fail the day a question
     is reworded.

     ⚠️ `[data-question]` IS THE HOOK, not a heading-to-container guess. The
     wizard already stamps that attribute on every clarifier section (it scrolls
     to unanswered ones by it), so it is a contract the screen maintains rather
     than a shape a test inferred. An earlier version walked `h2` elements and
     guessed at their container; it clicked nothing, „გავაგრძელოთ" refused to
     advance because the answers were still missing, and the failure surfaced 40
     lines later as „the contact screen never appeared". */
  await expect(page.getByRole('button', { name: /გავაგრძელოთ/ })).toBeVisible()
  const questions = page.locator('[data-question]')
  for (let i = 0; i < await questions.count(); i++) {
    await questions.nth(i).getByRole('button').first().click()
  }
  await page.getByRole('button', { name: /გავაგრძელოთ/ }).click()

  // The photo step is optional and only offered on a SERVICE topic.
  const skip = page.getByRole('button', { name: /გამოტოვება/ })
  if (await skip.isVisible().catch(() => false)) await skip.click()

  await page.getByRole('textbox', { name: /სახელი/ }).fill('ე2ე კლიენტი')
  await page.getByRole('textbox', { name: /ტელეფონ/ }).fill('+995555111222')
  await page.getByRole('textbox', { name: /ელფოსტა/ }).fill(`e2e-client-${Date.now()}@mcodne.test`)
  await page.getByRole('button', { name: /^გაგზავნა$/ }).click()

  // The address bar becomes the room — the wizard replaces it rather than
  // navigating, deliberately (app/request/RequestWizard: „ფანჯარა ღია რჩება").
  await page.waitForURL(/\/request\/MC-/, { timeout: 30_000 })
  const ref = new URL(page.url()).pathname.split('/').pop()!
  expect(ref).toMatch(/^MC-[0-9A-Z]{5}$/)

  // ⚠️ ONE SCREEN AT ONE ADDRESS. A reload must show the same room the send
  // showed — this is the „one URL, two screens" defect, pinned.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  /* ── 2. AN ADMIN RELEASES IT ────────────────────────────────────────────
     Verification is a PHONE CALL in this product and the automation is
     forbidden from making it (tests/requests §„the automation never makes the
     call"). The walk does what the operator does, and only that. */
  const requestId = await withDb(async p => {
    const r = await p.serviceRequest.findUniqueOrThrow({ where: { publicRef: ref }, select: { id: true } })
    await p.serviceRequest.update({ where: { id: r.id }, data: { status: 'VERIFIED', verifiedAt: new Date() } })
    return r.id
  })

  /* ── 3. THE PROVIDER ANSWERS — AND IT IS FREE ──────────────────────────── */
  await signIn(context, E2E.provider, baseURL!)
  await page.goto(`/work/requests/${requestId}`)
  await expect(page.getByRole('heading', { name: /შეთავაზება/ }).first().or(
    page.getByRole('link', { name: /^შეთავაზება$/ }))).toBeVisible()

  await page.goto(`/work/requests/${requestId}/offer`)
  await page.getByRole('textbox', { name: /რას მოიცავს ფასი/ }).or(
    page.locator('input[placeholder*="მასალა"]')).first().fill('მასალა და ტრანსპორტი ფასში შედის')
  await page.locator('input[type="number"]').first().fill('90')
  await page.getByRole('button', { name: /^გაგზავნა$/ }).click()

  /* ⚠️ ASSERT THE OUTCOME HERE, NOT TWENTY LINES LATER. The first version only
     waited for the URL to change and then looked the offer up in the database;
     when the form refused — a missing field, a lost claim — the URL wait passed
     anyway and the failure surfaced as „findFirstOrThrow found no offer", which
     names the symptom and hides the cause. The job page says „გაგზავნილია" once
     an offer exists, so that is the fact to wait for, and any refusal the form
     printed is on screen when this fails. */
  await expect(page.getByText(/გაგზავნილია/), 'the offer was refused — read the form error in the screenshot')
    .toBeVisible({ timeout: 20_000 })

  expect(await balanceOf(E2E.provider), 'answering must cost nothing').toBe(before)

  /* ── 4. THE CLIENT PICKS THEM ───────────────────────────────────────────
     Accepting is the client's act and it is what the whole fee now hangs on,
     so it goes through the real endpoint the client's own button calls. */
  const offerId = await withDb(p => p.requestOffer.findFirstOrThrow({
    where: { requestId, expertUser: { email: E2E.provider } }, select: { id: true },
  }).then(o => o.id))
  const accept = await page.request.post(`/api/requests/${ref}/accept`, { data: { offerId } })
  expect(accept.ok(), 'the client could not accept the offer').toBeTruthy()

  /* ── 5. THE WINNER OPENS THE CONTACT, AND ONLY THE WINNER ───────────────
     Both halves matter: the fee lands, and a provider who was NOT chosen is
     refused. The second is the guard that replaced „any VERIFIED request". */
  await page.goto(`/work/requests/${requestId}`)
  await expect(page.getByText(/კლიენტმა შეგარჩია/)).toBeVisible()
  await page.getByRole('button', { name: /კონტაქტის გახსნა/ }).click()
  await expect(page.getByRole('link', { name: /^\+?\d[\d\s]+$/ })).toBeVisible({ timeout: 20_000 })

  /* ⚠️ THE EXPECTED FEE IS COMPUTED FROM THE REQUEST, NOT TYPED (2026-09-03).
     A contact costs 1–10₾ by the budget the client picked in step 1, so a
     constant here would pin whatever band that step happens to choose today
     and break the moment the wizard's copy moves. Read the row, price it with
     the same function the route uses. */
  const fee = await withDb(p => p.serviceRequest
    .findUniqueOrThrow({ where: { id: requestId }, select: { budgetMin: true, budgetMax: true } })
    .then(r => contactCostTetri(r.budgetMin, r.budgetMax)))
  expect(await balanceOf(E2E.provider), 'the selection fee did not leave the ledger')
    .toBe(before - fee)

  // The rival never was chosen, so the endpoint must refuse them outright.
  const rival = await context.browser()!.newContext({ baseURL })
  try {
    await signIn(rival, E2E.rival, baseURL!)
    const refused = await rival.request.post(`/api/provider/requests/${requestId}/contact`)
    expect(refused.status(), 'a provider who was not chosen could buy the contact').toBe(404)
    expect(await balanceOf(E2E.rival), 'the refused provider was charged anyway').toBe(E2E.balanceTetri)
  } finally {
    await rival.close()
  }
})
