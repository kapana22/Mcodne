// THE PROVIDER'S BALANCE — what earns it, what spends it, and what it may be
// called on a screen.
//
// ⚠️ WHY IT IS DENOMINATED IN LARI (2026-08-20). Owner: „ეს რეალურად 100₾
// ტოლფასი მივცეთ, ვთქვათ, რომ ფულად პრიზად წარმოვადგინოთ — და არა რაღაც
// უაზრო ტოკენები." A token is an abstraction the provider has to learn before
// it can motivate them; „100₾" is a number they already understand, and the
// whole point of the grant is to be worth completing a profile for.
//
// ⚠️ AND WHY THAT IS SAFE WHILE `PAYMENTS_LIVE` IS FALSE. Denominating in lari
// is not the same as owing lari. This balance buys exactly ONE thing — sending
// an offer — and it cannot be withdrawn, transferred or refunded. Nothing here
// is a purchase, a payment or a liability; it is a discount on a service we
// have not started charging for. The wording rules below are what keep that
// true, and they are not decoration: call it „ანაზღაურება" or „შენი ფული" once
// and it becomes a promise somebody can hold us to.
//
//   SAY:        „ბალანსი", „100₾ საჩუქრად", „შეთავაზების ღირებულება 5₾"
//   NEVER SAY:  „ანაზღაურება", „შენი ფული", „გამომუშავებული", „გატანა",
//               „დაბრუნება", „ქეშბექი"
//
// ⚠️ THE LEDGER IS THE TRUTH. `prisma.creditEntry` holds one row per movement
// and the balance is their sum — see the model's own note for why there is no
// counter to edit. Everything below is PURE so the arithmetic can be tested
// without a database; the writes live in lib/creditsServer.ts.
//
// ═══════════ THE LOOP (2026-08-21) ═══════════════════════════════════════
//
// Owner: „ბალანსის სისტემა შემსრულებლის მხარეს გამოყენებაში უნდა იყოს და
// ლიდები გახსნას — კარგი ლოგიკით და სწორი გადაწყვეტილებებით."
//
// Until today the accounting was real and nothing used it. The grant paid, an
// offer charged, and `CREDITS_ENFORCED` was false — so a zero or negative
// balance stopped nobody, and there was no way to obtain more balance than the
// one-off 100₾ of profile tasks. A currency with one deposit and no withdrawal
// pressure is a scoreboard, not a loop.
//
// Three movements, and the middle one is the product:
//
//   +100₾  the profile tasks              one-off, per key, idempotent
//    −1₾   opening a client's CONTACT     once per request, for ever
//   +25₾   a job was marked finished      the earn-back, once per offer
//
// Reading a request is FREE. Sending an offer is FREE. The only thing a balance
// buys is the client's name and number, and it buys them once.
//
// ═══════════ ⚠️ THIS REVERSED AN EARLIER DECISION, AND THE HISTORY MATTERS ══
//
// What stood here until 2026-08-21 was the opposite rule, stated as the one
// structural decision in the feature:
//
//   „SPENT ON SENDING AN OFFER, NEVER ON SEEING A REQUEST. Charging to VIEW a
//    lead is the model most of this industry uses and the one it is most hated
//    for: the provider pays before knowing whether anybody will answer. On our
//    own numbers that would be indefensible — 32 requests have produced 4
//    offers, so a provider paying to look would pay for silence most of the
//    time. Charging to RESPOND inverts it."
//
// ⚠️ THE OWNER DECIDED OTHERWISE ON 2026-08-21, and the objection above was put
// to them before they did. It is kept here rather than deleted because it is
// still TRUE, and because it is what shaped the answer:
//
//   · The request itself is still free to read. Nobody pays to look at a job —
//     the description, the budget, the deadline and the city arrive at no cost,
//     which is exactly what „never on seeing a request" was protecting. What is
//     paid for is the CONTACT, and a phone number is not a look at a lead: it
//     is the lead.
//   · The price fell from 5₾ to 1₾, and that is the objection's direct answer.
//     If most leads go quiet, the amount a provider risks on one has to be
//     small enough that silence costs them almost nothing. 1₾ is a fifth of
//     what an unanswered offer used to cost them.
//   · It is paid ONCE per request, for ever. Re-opening the same number
//     tomorrow, or from a second tab, is free. Charging twice for the same
//     phone number is theft.
//
// ⚠️ AND 1₾ IS PROVISIONAL — owner: „ჯერ". It is one named constant
// (CONTACT_COST_TETRI) precisely so the number can move without the shape of
// anything moving with it.
//
// WHY THIS IS THE ACT THAT CARRIES A PRICE. lib/requests → clientIdentityOpen
// had already written the reason down, before there was anything to charge:
// „the contact IS the lead. Handing it over automatically the moment a client
// chooses means the platform gives away, for free, the only thing it has to
// sell. Whatever it eventually costs, it has to be opened by a deliberate act
// that can carry a price — never printed on arrival." This is that act.
//
// ⚠️ AND THE CONTACT OPENS BEFORE THE OFFER, NOT AFTER IT. The provider reads
// the job, decides it is worth a call, pays 1₾, and then may phone, or bid, or
// do nothing. That ordering is the owner's, and it is what makes the 1₾ buy
// something: a contact released only after the client already chose you would
// be charging for a door that is already open.

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
 * ⚠️ THE TASKS ARE THE PROFILE THE MARKETPLACE ACTUALLY NEEDS, and the amounts
 * say which parts matter. Measured 2026-08-20 across the 26 expert profiles:
 *
 *     ფოტო        24/26      already done — worth little
 *     ბიო 80+     23/26      already done
 *     პროფესია     3/26  ⚠️  and routeRequest MATCHES ON IT
 *     სერტიფიკატი  4/26  ⚠️
 *     ვიდეო        0/26
 *
 * `professions` is the field that decides who a request is shown to, and
 * twenty-three profiles have none — so twenty-three people are invisible to
 * the routing for want of one answer. It is therefore the single biggest grant
 * here. This is the whole reason the bonus is worth building: it pays for the
 * thing the product needs and the provider has no other reason to do.
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

/* ⚠️ AND THE SECOND WORDINGS ARE GONE (2026-08-29). Each task carried a `work:`
 * pair beside its own label, and `creditTasks()` — the only reader of this list
 * — returns `t.label` and `t.why`, never `t.work`. Six unread strings that read
 * as a live alternative. The one that was still worth saying was
 * PROFILE_CERTIFICATE's, and it is that task's label now.
 *
 * ⚠️ SIX KEYS, ONE VOCABULARY AGAIN (2026-08-24).
 *
 * Between 2026-08-20 and that day each task carried TWO wordings, chosen by
 * capability: „ატვირთე სერტიფიკატი" for an expert and „ატვირთე ნამუშევრის ფოტო"
 * for a trades provider, because three of the six keys named fields a
 * `ServiceProfile` did not have — so a services-only provider could earn 50₾ of
 * a grant the landing calls 100₾.
 *
 * One profile now has all of those fields, so there is one list again. What did
 * NOT change is the rule underneath it: a key is earned by EITHER of two facts
 * (lib/creditsServer → profileFacts), and the pairs stay disjoint so one tick
 * can never pay twice — `services[]` earns PROFESSIONS, a PRICE on one of them
 * earns SERVICE.
 */

/** The task list. Copy only — the ledger, the unique index and
 *  `CREDIT_TASKS_TOTAL` know nothing about it. */
export function creditTasks(): { key: CreditTaskKey; tetri: number; label: string; why: string }[] {
  return CREDIT_TASKS.map(t => ({ key: t.key, tetri: t.tetri, label: t.label, why: t.why }))
}

/**
 * WHERE A TASK IS ANSWERED — the editor that owns that field.
 *
 * Two pages, two questions, and every task belongs to exactly one of them:
 *
 *   /work/services  — what I SELL: the services, the price on them, and the
 *                     cities I travel to.
 *   /work/profile   — who I AM: the photo, the sentence, the professions, the
 *                     years, and the proof (a certificate, or a photo of
 *                     finished work).
 */
export function taskHref(key: CreditTaskKey): string {
  const SERVICES = '/work/services'
  const PROFILE = '/work/profile'
  switch (key) {
    // A price on a ticked service. That is what is sold, so it lives with it.
    case 'PROFILE_SERVICE': return SERVICES
    default: return PROFILE
  }
}

export type CreditTaskKey = (typeof CREDIT_TASKS)[number]['key']

/** ⚠️ EXACTLY 100₾, and it is asserted by a test. The number is the promise the
 *  landing makes („100₾ საჩუქრად"); if a task is re-priced, another one moves. */
export const CREDIT_TASKS_TOTAL = CREDIT_TASKS.reduce((n, t) => n + t.tetri, 0)

/* ═══════════ what spends it ════════════════════════════════════════════ */

/**
 * ⚠️ ONE CLIENT'S CONTACT, ONE LARI — AND „ჯერ" IS PART OF THE DECISION.
 *
 * Owner, 2026-08-21: the balance opens the client's contact, and one contact
 * costs 1₾ „ჯერ" — for now. So this is a single named constant and every
 * screen, every refusal and every test reads it from here; moving it is one
 * line and nothing about the mechanism moves with it.
 *
 * WHY SO SMALL. The header records the objection this price is the answer to:
 * on our own numbers most leads go quiet, so the amount a provider risks on one
 * has to be small enough that silence costs them almost nothing. It also has to
 * be a number a person does not stop to think about — the whole point of moving
 * the charge to the contact is that the provider decides „is this job worth a
 * phone call", and a price they have to weigh would put a second decision in
 * front of the first.
 *
 * ⚠️ AND IT IS PAID ONCE PER REQUEST, FOR EVER — see `contactKey`. That is not
 * a courtesy; charging twice for the same phone number is theft, and it is the
 * kind that happens by accident, from a read-then-write under two tabs.
 */
export const CONTACT_COST_TETRI = 1 * TETRI

/** How many client contacts a balance still opens — the only arithmetic the UI
 *  needs. „85 კონტაქტი" is what a provider actually wants to know; „85₾" is
 *  the currency it happens to be denominated in. */
export function contactsAffordable(balanceTetri: number): number {
  return Math.max(0, Math.floor(balanceTetri / CONTACT_COST_TETRI))
}

/**
 * ⚠️ THE IDEMPOTENCY KEY FOR ONE UNLOCK, and it is the whole of „paid once".
 *
 * `CreditEntry` carries the unique index `(userId, grantKey)`, so this string
 * IS the guarantee: the second insert is refused by the database, whatever
 * calls it and however often. A `findFirst` followed by a `create` is how a
 * provider gets billed twice for a number they already hold, and it takes two
 * tabs and no bad luck at all.
 *
 * ⚠️ IT IS ALSO THE COUNTER. „How many providers opened this request's
 * contact" is `count(CreditEntry where grantKey = contactKey(requestId))` —
 * one key, read two ways — which is why the prefix is per REQUEST and the row
 * is per USER. See CONTACT_LIMIT_REASON for what that count is used for.
 *
 * Prefixed so it can never collide with a `CreditTaskKey` (a bare `PROFILE_*`)
 * or with `jobDoneKey`; a collision would make one of the two silently
 * unpayable, which reads as the feature being broken rather than as a bug.
 */
export function contactKey(requestId: string): string {
  return `CONTACT:${requestId}`
}

/**
 * ⚠️ ONE REFUND PER PROVIDER PER REQUEST, AND THE INDEX IS THE GUARANTEE.
 * `@@unique([userId, grantKey])` means a second attempt writes nothing, so the
 * sweep may run this every fifteen minutes for ever and the ledger is right.
 *
 * It is deliberately a DIFFERENT key from `contactKey`: that one is shared by
 * every provider on the request (the `offerLimit` cap counts it), so reusing it
 * would make one refund look like somebody else's purchase.
 */
export function contactRefundKey(requestId: string): string {
  return `CONTACT_REFUND:${requestId}`
}

/* ═══════════ what gives it back ═════════════════════════════════════════ */

/**
 * ⚠️ WHAT A FINISHED JOB PAYS. 25₾ — AND THE NUMBER IS UNDER REVIEW.
 *
 * It was derived against the OLD model, where answering cost 5₾: a request has
 * `offerLimit` = 3 places, so a request that ended in a finished job took at
 * most 15₾ out of the supply side, and 25₾ put back more than the competition
 * for it removed. In the unit a provider read it, that was „5 შეთავაზება" — one
 * finished job buys five more attempts.
 *
 * ⚠️ THE PRICE UNDERNEATH IT MOVED AND THIS DID NOT (2026-08-21). At 1₾ a
 * contact, 25₾ is TWENTY-FIVE leads for one finished job, and a provider who
 * completes four jobs is back at the full starting grant. A price that a
 * fortnight's work makes irrelevant stops informing any decision, which is the
 * one thing this number exists to do.
 *
 * The shape that was right before is still right: ONE FINISHED JOB BUYS FIVE
 * MORE LEADS. At the new price that is 5₾, and 5₾ is what this file recommends.
 * It is deliberately NOT changed here — the task amounts and this number are the
 * owner's to set, and a re-price that arrives as a silent diff is how „100₾
 * საჩუქრად" quietly stops being true.
 *
 * ⚠️ IT IS PAID ON `doneAt`, WHICH EITHER SIDE MAY STAMP — and that is not a
 * hole. Reaching a stamp at all requires the CLIENT to have accepted the offer
 * first (lib/offerLifecycle → markDoneWhere claims `status: 'ACCEPTED'`), and a
 * provider cannot accept their own. Paying on the stamp also pays for pressing
 * the button, which is the thing the product wants pressed: it is what opens
 * the review, and 21 days of nobody pressing it is what closes a job silently.
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
 * ⚠️ THE REASON LIVES ON THE ROW, IN `reason` — there is no note column and
 * this is deliberately not a migration (2026-08-21).
 *
 * `CreditEntry.reason` is free text by its own schema note („stored as text so
 * adding one is an edit to an array and never a migration"), and a hand
 * movement's reason is the one thing that cannot be reconstructed later: the
 * balance says what it became, and only this string says why somebody typed it.
 * A separate `note` column would be a schema change for one field that exactly
 * one route ever writes.
 *
 * The prefix is what keeps it machine-readable — an audit or an export can tell
 * a hand movement from an earned one without a second column.
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
 * ⚠️ A BALANCE BELOW 1₾ NOW REFUSES TO OPEN A CONTACT, AND THIS FLAG IS THE
 * WHOLE OF IT.
 *
 * It shipped `false` — owner: „დასაწყისში უფასო იქნება" — and stayed false
 * because enforcement without replenishment is a trap: a provider who spends
 * the grant has no route back, and there was none. Enforcement and replenishment
 * were never two decisions.
 *
 * `true` SINCE 2026-08-21, because the routes back now exist. Owner: „ბალანსის
 * სისტემა შემსრულებლის მხარეს გამოყენებაში უნდა იყოს და ლიდები გახსნას." A
 * balance that refuses nothing opens nothing.
 *
 *   what it gates   ONE act: opening a client's contact. Reading a request and
 *                   sending an offer are free, so a provider at zero can still
 *                   see every job and still answer one — they simply cannot
 *                   have the phone number. Nothing about the marketplace's own
 *                   scarce resource (answers) is rationed by this line.
 *   the way back    a finished job pays 25₾; an admin can move any balance by
 *                   hand with a reason on the row (POST
 *                   /api/admin/users/[id]/credits) — no deploy.
 *   who it blocks   measured 2026-08-21 across all 29 sellers: NOBODY. The
 *                   lowest balance is 10₾ — a hundred contacts at today's
 *                   price — and the median is 60₾.
 *
 * ⚠️ THE ARGUMENT FOR TURNING IT ON GOT STRONGER WHEN THE MODEL CHANGED. While
 * the charge sat on SENDING AN OFFER, enforcement meant a provider could be
 * stopped from answering a job — pointed the wrong way on a marketplace whose
 * measured problem is that 28 of 32 requests got no offer at all. It no longer
 * can: the offer is free and only the phone number is gated.
 *
 * ⚠️ FLIP IT BACK TO `false` IF providers start reading jobs and not calling
 * because of the price. The signal to watch is an unlock refused for want of
 * balance on a request that then received no offer. One line, both directions,
 * nothing else to undo. Same contract as the switches in lib/flags: read it
 * here, never re-spell it.
 */
export const CREDITS_ENFORCED = true

/** Can this balance open one client's contact? While unenforced, always. */
export function canAffordContact(balanceTetri: number): boolean {
  if (!CREDITS_ENFORCED) return true
  return balanceTetri >= CONTACT_COST_TETRI
}

/* ═══════════ what the provider is told ══════════════════════════════════ */

/**
 * ⚠️ THE PRICE IS SPELLED ONCE, HERE, AND NEVER ON A SCREEN (2026-08-21). A
 * hard-coded „1₾" in a component is how a re-price and a copy change stop
 * agreeing — and „ჯერ" says out loud that this number is going to move.
 *
 * Kept to the facts and nothing else: no benefit, no reassurance, no marketing.
 * The wording rules at the top of this file apply to every string below — this
 * is „ბალანსი", never „ანაზღაურება", „შენი ფული" or „გატანა".
 */
export const CONTACT_COST_NOTE = `კლიენტის კონტაქტი — ${CONTACT_COST_TETRI / TETRI}₾ ბალანსიდან. ერთხელ იხდი, მერე ყოველთვის გიჩანს.`

/**
 * ⚠️ THE HALF THAT MAKES THE PRICE FAIR, AND IT IS SAID BEFORE THE CLICK.
 *
 * Researched 2026-08-30: the defining complaint against the lead-mills is a
 * provider paying for a contact, answering at once, and the client never
 * speaking again — with the money kept. mcodne gives it back automatically
 * (lib/creditsServer → refundDeadContacts, fired by the sweep and by the
 * admin's close/reject), and this is the sentence that says so at the moment
 * money is about to leave. A refund nobody knows about before paying changes
 * no decision; it is a rebate discovered later, not a term of the sale.
 *
 * ⚠️ NO DEADLINE IN THE COPY, ON PURPOSE. „14 დღეში" would be a second place
 * `STALE_OPEN_DAYS` is written down, and the day this file and requestRouting
 * disagree is the day the promise becomes a lie. The condition is stated in
 * the terms it is actually enforced in: the request closes with nobody having
 * answered.
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
 *  request's own `offerLimit` and it is 1 on an addressed request.
 *
 *  ⚠️ THE SENTENCE IS ABOUT THE CLIENT, NOT ABOUT THE OTHERS (2026-08-21). It
 *  first read „…უკვე N შემსრულებელთანაა გახსნილი" and „შემსრულებელი" is
 *  retired contract language (tests/lexicon). Naming the rivals at all was the
 *  weaker sentence anyway: what the provider needs to know is that this client
 *  has already been reached as often as they agreed to be, which is the reason
 *  the answer is „no" and the only part that is any of their business. */
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
   * ⚠️ IT IS NOT A TASK AND EARNS NOTHING, deliberately — it rides on
   * ProfileFacts only because `profileFacts()` already reads the row and
   * tests/requestQueue §F forbids /work a second serviceProfile query. Paying
   * for it would put money behind pressing save, which is the one thing that
   * must stay a free, honest „yes, this is what I sell".
   *
   * `false` for the 27 the migration seeded from their category, and for the
   * two profiles that predate it — nobody has been asked yet. See
   * prisma/schema → servicesConfirmedAt.
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
 * 0–100, and it is the SAME arithmetic as the grant — one mechanism, two uses.
 *
 * The second use is the one the catalogue has been missing: a service card
 * carries no trust signal at all today, and „profile completeness" is a real,
 * earned one. Never invent a second score for that.
 */
export function completeness(f: ProfileFacts): number {
  const earned = earnedTasks(f)
  const sum = CREDIT_TASKS.filter(t => (earned as string[]).includes(t.key)).reduce((n, t) => n + t.tetri, 0)
  return Math.round((sum / CREDIT_TASKS_TOTAL) * 100)
}
