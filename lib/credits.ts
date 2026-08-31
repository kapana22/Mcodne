// THE PROVIDER'S BALANCE — what earns it, what spends it, and what it may be
// called on a screen.
//
// ⚠️ DENOMINATED IN LARI, AND THAT IS SAFE WHILE `PAYMENTS_LIVE` IS FALSE.
// „100₾" motivates in a way a token cannot, but denominating in lari is not
// owing lari: this balance buys exactly ONE thing — opening a client's contact
// — and cannot be withdrawn, transferred or refunded. The wording rules are
// what keep that true. Call it „ანაზღაურება" once and it becomes a promise
// somebody can hold us to.
//
//   SAY:        „ბალანსი", „100₾ საჩუქრად", „შეთავაზების ღირებულება 5₾"
//   NEVER SAY:  „ანაზღაურება", „შენი ფული", „გამომუშავებული", „გატანა",
//               „დაბრუნება", „ქეშბექი"
//
// ⚠️ THE LEDGER IS THE TRUTH — one `creditEntry` row per movement, the balance
// is their sum, there is no counter to edit. Everything here is PURE so the
// arithmetic can be tested without a database; the writes are in creditsServer.
//
// THE LOOP — three movements, and the middle one is the product:
//
//   +100₾  the profile tasks              one-off, per key, idempotent
//    −1₾   opening a client's CONTACT     once per request, for ever
//   +25₾   a job was marked finished      the earn-back, once per offer
//
// Reading a request is FREE. Sending an offer is FREE. The only thing a balance
// buys is the client's name and number, and it buys them once.
//
// ⚠️ THE CONTACT OPENS BEFORE THE OFFER, NOT AFTER. The provider reads the job,
// decides it is worth a call, pays, and may then phone, bid, or do nothing. A
// contact released only after the client already chose you would be charging
// for a door that is already open.

/** Money is integers. 100₾ = 10 000 თეთრი. */
export const TETRI = 100

/** „100₾" from 10000. Never `toFixed` — a balance is always a whole lari here,
 *  and printing „100.00₾" makes a bonus look like an invoice. */
export function gelLabel(tetri: number): string {
  const lari = Math.round(tetri / TETRI)
  return `${lari}₾`
}

/* ═══════════ what earns it ══════════════════════════════════════════════
 *
 * ⚠️ THE AMOUNTS SAY WHICH PARTS MATTER. Measured 2026-08-20 across 26 expert
 * profiles: photo 24/26, bio 23/26 — already done, worth little. Professions
 * 3/26, certificate 4/26, video 0/26.
 *
 * `professions` is what routeRequest MATCHES ON, and twenty-three profiles have
 * none — twenty-three people invisible to the routing for want of one answer.
 * Hence the biggest grant here: it pays for the thing the product needs and the
 * provider has no other reason to do.
 */
export const CREDIT_TASKS = [
  {
    key: 'PROFILE_PROFESSIONS',
    tetri: 20 * TETRI,
    label: 'აირჩიე შენი პროფესია',
    // Said plainly, because it is the honest reason and it is persuasive:
    // this is the field that decides which requests reach them.
    why: 'ამის მიხედვით მიდის მოთხოვნები შენამდე.',
  },
  {
    key: 'PROFILE_SERVICE',
    tetri: 20 * TETRI,
    label: 'დაამატე პირველი სერვისი',
    why: 'ეს არის ის, რასაც კლიენტი კატალოგში ხედავს.',
  },
  {
    key: 'PROFILE_CERTIFICATE',
    tetri: 20 * TETRI,
    // ⚠️ IT READ „ატვირთე სერტიფიკატი ან დიპლომი" UNTIL 2026-08-29, and by then
    // there was nowhere on the site to upload one: the credentials tab went
    // with the CV („რითი დაგიჯერებს აღარ გვჭირდება, ეს ხომ სერვისებს ყიდის").
    // The wording below is not new — it is this task's own second wording,
    // written on 2026-08-20 for the trades half, promoted to the only one.
    label: 'ატვირთე ნამუშევრის ფოტო',
    why: 'შესრულებული სამუშაო ყველაზე კარგი მტკიცებულებაა.',
  },
  {
    key: 'PROFILE_PHOTO',
    tetri: 15 * TETRI,
    label: 'ატვირთე ფოტო',
    why: 'ყველგან ჩანს, სადაც კლიენტი შენ გხედავს.',
  },
  {
    key: 'PROFILE_BIO',
    tetri: 15 * TETRI,
    label: 'დაწერე შენ შესახებ',
    why: 'ორი წინადადება საკმარისია.',
  },
  {
    key: 'PROFILE_EXPERIENCE',
    tetri: 10 * TETRI,
    label: 'მიუთითე გამოცდილება',
    why: 'რამდენი წელია მუშაობ.',
  },
] as const

/* ⚠️ A KEY IS EARNED BY EITHER OF TWO FACTS (lib/creditsServer → profileFacts),
 * and the pairs stay disjoint so one tick can never pay twice: `services[]`
 * earns PROFESSIONS, a PRICE on one of them earns SERVICE.
 */

/** The task list. Copy only — the ledger, the unique index and
 *  `CREDIT_TASKS_TOTAL` know nothing about it. */
export function creditTasks(): { key: CreditTaskKey; tetri: number; label: string; why: string }[] {
  return CREDIT_TASKS.map(t => ({ key: t.key, tetri: t.tetri, label: t.label, why: t.why }))
}

/**
 * WHERE A TASK IS ANSWERED — the editor that owns that field.
 *
 * ⚠️ IT IS ONE ADDRESS SINCE 2026-08-30, and the switch that used to stand here
 * is the clearest small measure of what the merge fixed. This function existed
 * to route „დაუწერე ფასი ერთ სერვისს მაინც" to /work/services and everything
 * else to /work/profile — a fork the provider had to hold in their head too,
 * because the two pages looked and opened identically. One row, one editor, one
 * answer; the shape survives so a future task with its own home has somewhere
 * to say so.
 */
export function taskHref(_key: CreditTaskKey): string {
  return '/work/profile'
}

export type CreditTaskKey = (typeof CREDIT_TASKS)[number]['key']

/** ⚠️ EXACTLY 100₾, and it is asserted by a test. The number is the promise the
 *  landing makes („100₾ საჩუქრად"); if a task is re-priced, another one moves. */
export const CREDIT_TASKS_TOTAL = CREDIT_TASKS.reduce((n, t) => n + t.tetri, 0)

/* ═══════════ what spends it ════════════════════════════════════════════ */

/**
 * ⚠️ ONE CLIENT'S CONTACT, ONE LARI — and „ჯერ" is part of the decision, so it
 * is a single named constant every screen, refusal and test reads from.
 *
 * WHY SO SMALL. Most leads go quiet, so what a provider risks on one has to be
 * small enough that silence costs almost nothing. It also has to be a number
 * nobody stops to weigh — the point of charging for the contact is that the
 * provider decides „is this worth a phone call", and a price worth thinking
 * about puts a second decision in front of the first.
 *
 * ⚠️ PAID ONCE PER REQUEST, FOR EVER — see `contactKey`. Charging twice for the
 * same phone number is theft, and it is the kind that happens by accident.
 */
export const CONTACT_COST_TETRI = 1 * TETRI

/** How many client contacts a balance still opens — the only arithmetic the UI
 *  needs. „85 კონტაქტი" is what a provider actually wants to know; „85₾" is
 *  the currency it happens to be denominated in. */
export function contactsAffordable(balanceTetri: number): number {
  return Math.max(0, Math.floor(balanceTetri / CONTACT_COST_TETRI))
}

/**
 * ⚠️ THE IDEMPOTENCY KEY FOR ONE UNLOCK — the whole of „paid once".
 *
 * `CreditEntry` carries `@@unique(userId, grantKey)`, so this string IS the
 * guarantee: the second insert is refused by the database. A `findFirst` then
 * `create` is how a provider gets billed twice for a number they already hold,
 * and it takes two tabs and no bad luck at all.
 *
 * ⚠️ IT IS ALSO THE COUNTER: „how many providers opened this request's contact"
 * is `count(CreditEntry where grantKey = contactKey(requestId))` — which is why
 * the prefix is per REQUEST and the row is per USER.
 *
 * Prefixed so it can never collide with a `CreditTaskKey` or `jobDoneKey`; a
 * collision would make one of them silently unpayable.
 */
export function contactKey(requestId: string): string {
  return `CONTACT:${requestId}`
}

/**
 * ⚠️ ONE REFUND PER PROVIDER PER REQUEST — `@@unique([userId, grantKey])` is
 * the guarantee, so the sweep may run every fifteen minutes for ever.
 *
 * Deliberately a DIFFERENT key from `contactKey`: that one is shared by every
 * provider on the request (the `offerLimit` cap counts it), so reusing it would
 * make one refund look like somebody else's purchase.
 */
export function contactRefundKey(requestId: string): string {
  return `CONTACT_REFUND:${requestId}`
}

/* ═══════════ what gives it back ═════════════════════════════════════════ */

/**
 * ⚠️ 25₾ IS UNDER REVIEW, AND NOT CHANGED HERE. It was derived when answering
 * cost 5₾ — one finished job bought five more attempts. At 1₾ a contact it buys
 * twenty-five, and a number a fortnight's work makes irrelevant stops informing
 * the decision it exists for. The shape that was right still is: ONE FINISHED
 * JOB BUYS FIVE MORE LEADS, i.e. 5₾. The amounts are the owner's to set, and a
 * re-price arriving as a silent diff is how „100₾ საჩუქრად" stops being true.
 *
 * ⚠️ PAID ON `doneAt`, WHICH EITHER SIDE MAY STAMP — not a hole. Reaching the
 * stamp requires the CLIENT to have accepted the offer first (markDoneWhere
 * claims `status: 'ACCEPTED'`) and nobody accepts their own. Paying on the
 * stamp also pays for pressing the button, which is what opens the review.
 */
export const JOB_DONE_TETRI = 25 * TETRI

/** Same mechanism as `contactKey`, different namespace — one grant per finished
 *  offer, refused twice by the index rather than by a check. */
export function jobDoneKey(offerId: string): string {
  return `JOB_DONE:${offerId}`
}

/* ═══════════ how many strangers may reach one client ════════════════════ */

/**
 * ⚠️ THE CONTACT CAP IS `offerLimit`, AND IT IS COUNTED SEPARATELY FROM
 * `offerCount`. Both halves of that sentence are decisions.
 *
 * THE NUMBER is `offerLimit` — 3 on an ordinary request, 1 on one addressed to
 * a named expert — because it answers the same question the offer limit
 * answers: how many strangers may this one person hear from. The client asked
 * for up to three; three phone calls is the same promise as three offers, and
 * without a cap the answer would be „as many as have a balance", which is
 * twenty people ringing somebody who asked for a plumber.
 *
 * IT IS A SECOND BUDGET AND NOT THE SAME ONE, and this is the part worth
 * arguing about. Spending `offerCount` on unlocks would let three providers buy
 * a phone number, never bid, and leave the client with no offers at all — the
 * client would have paid the whole cost of the cap and received nothing for it.
 * `offerCount` protects the client's INBOX from a pile of bids they must
 * compare; this protects their PHONE. They are different harms with the same
 * ceiling.
 *
 * ⚠️ THE HONEST WORST CASE, said out loud: a client can be called by up to
 * three people AND receive up to three offers, and in the worst case those are
 * six different providers. In practice the callers are the bidders — paying 1₾
 * to read somebody's number and then not answering their job is a strange thing
 * to do — but if the two lists diverge in real data, the fix is to cap the
 * UNION, not to merge the counters.
 */
export const CONTACT_LIMIT_REASON = 'offerLimit'

/** Is there still room for one more provider to open this request's contact?
 *  Pure, so the rule can be argued with in a test. ⚠️ It is NOT the guard: the
 *  real one is inside the INSERT (lib/creditsServer → chargeForContact), because
 *  a count read before a write loses to a second tab. */
export function contactPlacesLeft(r: { contactCount: number; offerLimit: number }): number {
  return Math.max(0, r.offerLimit - r.contactCount)
}

/* ═══════════ what an admin can move by hand ═════════════════════════════ */

/**
 * ⚠️ THE REASON LIVES ON THE ROW, IN `reason` — no note column, deliberately.
 * A hand movement's reason is the one thing that cannot be reconstructed: the
 * balance says what it became, only this string says why somebody typed it. The
 * prefix is what lets an audit tell a hand movement from an earned one.
 */
export const ADMIN_ADJUST = 'ADMIN_ADJUST'
export function adminAdjustReason(note: string): string {
  // Bounded because the column is read into panels and mails. The route's zod
  // already caps it at 300; this is the floor under a caller that does not.
  return `${ADMIN_ADJUST}: ${note.trim()}`.slice(0, 300)
}
export function isAdminAdjust(reason: string): boolean {
  return reason === ADMIN_ADJUST || reason.startsWith(`${ADMIN_ADJUST}: `)
}

/* ═══════════ what blocks ════════════════════════════════════════════════ */

/**
 * ⚠️ A BALANCE BELOW 1₾ REFUSES TO OPEN A CONTACT, AND THIS FLAG IS ALL OF IT.
 *
 * It shipped `false`, because enforcement without replenishment is a trap: a
 * provider who spends the grant needs a route back. The routes exist now.
 *
 *   what it gates   ONE act: opening a client's contact. Reading a request and
 *                   sending an offer stay free, so a provider at zero still
 *                   sees every job and can still answer — they cannot have the
 *                   phone number. The scarce resource (answers) is not rationed.
 *   the way back    a finished job pays 25₾; an admin can move any balance by
 *                   hand with a reason (POST /api/admin/users/[id]/credits).
 *   who it blocks   measured 2026-08-21 across all 29 sellers: NOBODY. Lowest
 *                   balance 10₾ — a hundred contacts — median 60₾.
 *
 * ⚠️ FLIP BACK TO `false` IF providers read jobs and do not call because of the
 * price. The signal is an unlock refused for want of balance on a request that
 * then received no offer.
 */
export const CREDITS_ENFORCED = true

/** Can this balance open one client's contact? While unenforced, always. */
export function canAffordContact(balanceTetri: number): boolean {
  if (!CREDITS_ENFORCED) return true
  return balanceTetri >= CONTACT_COST_TETRI
}

/* ═══════════ what the provider is told ══════════════════════════════════ */

/**
 * ⚠️ THE PRICE IS SPELLED ONCE, HERE, NEVER ON A SCREEN. A hard-coded „1₾" in a
 * component is how a re-price and a copy change stop agreeing. Facts only — no
 * benefit, no reassurance; the wording rules at the top apply to every string
 * below.
 */
export const CONTACT_COST_NOTE = `კლიენტის კონტაქტი — ${CONTACT_COST_TETRI / TETRI}₾ ბალანსიდან. ერთხელ იხდი, მერე ყოველთვის გიჩანს.`

/**
 * ⚠️ THE HALF THAT MAKES THE PRICE FAIR, SAID BEFORE THE CLICK.
 *
 * The defining complaint against lead-mills (researched 2026-08-30) is paying
 * for a contact, answering at once, and the client never speaking again — money
 * kept. mcodne refunds it automatically (refundDeadContacts). A refund nobody
 * knows about before paying changes no decision; it is a rebate discovered
 * later, not a term of the sale.
 *
 * ⚠️ NO DEADLINE IN THE COPY. „14 დღეში" would be a second place
 * `STALE_OPEN_DAYS` is written down, and the day the two disagree the promise
 * becomes a lie. The condition is stated as it is enforced: the request closed
 * with nobody having answered.
 */
export const CONTACT_REFUND_NOTE = `თუ კლიენტს არავინ გამოეხმაურა და მოთხოვნა დაიხურა — ${CONTACT_COST_TETRI / TETRI}₾ ავტომატურად ბრუნდება ბალანსზე.`

/** The button, before the click. The price belongs ON the control that spends
 *  it — a cost a person finds out about afterwards is the thing a
 *  lari-denominated balance must never produce. */
export const CONTACT_BUTTON_LABEL = `კონტაქტის ნახვა · ${CONTACT_COST_TETRI / TETRI}₾`

/** ⚠️ SAID ON THE OFFER FORM, because it is the half that CHANGED. A provider
 *  who used to pay 5₾ to answer has to be told plainly that answering is now
 *  free, or the old price is what they will assume. */
export const OFFER_FREE_NOTE = 'შეთავაზების გაგზავნა უფასოა.'

/** The earn-back, in one line, for the screen that has to answer „და მერე?" */
export const JOB_DONE_NOTE = `დასრულებული სამუშაო — +${JOB_DONE_TETRI / TETRI}₾ ბალანსზე.`

/** What a provider is told when the balance is short. It names the PRICE rather
 *  than the shortfall — the shortfall is arithmetic they can do, the price is
 *  the fact they need. */
export const NO_BALANCE_NOTE = `ბალანსი არ არის საკმარისი — კონტაქტი ${CONTACT_COST_TETRI / TETRI}₾ ღირს.`

/** What they are told when the client has already been reached by as many
 *  providers as they asked for. A function, because the ceiling is the
 *  request's own `offerLimit`, which is 1 on an addressed request.
 *
 *  ⚠️ THE SENTENCE IS ABOUT THE CLIENT, NOT THE RIVALS — what the provider
 *  needs to know is that this client has already been reached as often as they
 *  agreed to be. The rest is none of their business. */
export function contactLimitNote(limit: number): string {
  return `ამ კლიენტს უკვე ${limit}-ჯერ დაუკავშირდნენ — მეტს არ ელოდება.`
}

/* ═══════════ the profile, scored ════════════════════════════════════════ */

/** What a profile has, in the only terms the tasks care about. */
export type ProfileFacts = {
  hasPhoto: boolean
  hasBio: boolean
  hasProfessions: boolean
  hasExperience: boolean
  hasService: boolean
  hasCertificate: boolean
  /**
   * Has this provider ever SAVED their own service list?
   *
   * ⚠️ NOT A TASK, EARNS NOTHING. It rides on ProfileFacts only because
   * `profileFacts()` already reads the row (tests/requestQueue §F forbids /work
   * a second query). Paying for it would put money behind pressing save, which
   * must stay a free, honest „yes, this is what I sell".
   *
   * `false` for the 27 the migration seeded and the two that predate it —
   * nobody has been asked yet.
   */
  servicesConfirmed: boolean
}

/** ⚠️ 80 CHARACTERS, the same floor the application's own validator uses — a
 *  bio that earns 15₾ has to be worth reading, and „გამარჯობა" is not. */
export const BIO_MIN = 80

/** Which tasks this profile has completed. Pure: the caller reads the row. */
export function earnedTasks(f: ProfileFacts): CreditTaskKey[] {
  const done: CreditTaskKey[] = []
  if (f.hasProfessions) done.push('PROFILE_PROFESSIONS')
  if (f.hasService) done.push('PROFILE_SERVICE')
  if (f.hasCertificate) done.push('PROFILE_CERTIFICATE')
  if (f.hasPhoto) done.push('PROFILE_PHOTO')
  if (f.hasBio) done.push('PROFILE_BIO')
  if (f.hasExperience) done.push('PROFILE_EXPERIENCE')
  return done
}

/**
 * 0–100, the SAME arithmetic as the grant — one mechanism, two uses. The second
 * is the trust signal a service card otherwise has none of. Never invent a
 * second score for that.
 */
export function completeness(f: ProfileFacts): number {
  const earned = earnedTasks(f)
  const sum = CREDIT_TASKS.filter(t => (earned as string[]).includes(t.key)).reduce((n, t) => n + t.tetri, 0)
  return Math.round((sum / CREDIT_TASKS_TOTAL) * 100)
}
