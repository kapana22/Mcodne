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
//    −3₾   opening a client's CONTACT     once per request, for ever
//   +25₾   a job was marked finished      the earn-back, once per offer
//
// Reading a request is FREE. Sending an offer is FREE. The only thing a balance
// buys is the client's name and number, and it buys them once.
//
// ⚠️ THE CONTACT OPENS AFTER THE CLIENT HAS CHOSEN, NOT BEFORE (2026-09-01, the
// owner's design canvas → „Expert Jobs"). This reverses the 2026-08-21 order,
// and the reversal is the product: a provider now answers for nothing and pays
// only once somebody has picked them, so the money follows a decision the
// CLIENT made rather than a bet the provider placed. „შერჩევის საფასური" is the
// canvas's own name for it and says exactly that.
//
// ⚠️ WHAT THAT COSTS, SAID PLAINLY: the provider can no longer phone before
// bidding. That was the whole argument for the old order (owner, 2026-08-21:
// read the job, decide it is worth a call, pay, then answer) and it is what the
// canvas gives up in exchange for an answer that is free to send. The thread is
// where the questions go now — it opens with the offer and costs nothing.

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
 * WHERE A TASK IS ANSWERED WITHIN THAT EDITOR — the section to scroll to.
 *
 * ⚠️ IT EXISTS BECAUSE THE CHECKLIST MOVED ONTO THIS LIST (2026-09-03). The
 * card beside the form used to score `lib/profileScore`'s SIX DIFFERENT checks
 * and print „+15%" against each; the owner, looking at it: „ვფიქრობ აქ ეგ
 * კრედიტები ან ლარები უნდა ეწეროს." Money is the honest label — these are the
 * tasks that pay — but the two lists are not the same six things, so the fix
 * was to change the LIST rather than relabel a percentage as a lari.
 *
 * `taskHref` answers „which page"; there is one, so it answers the same thing
 * for every key. This answers „which part of it", which is what a checklist
 * beside a long form is for.
 */
export function taskAnchor(key: CreditTaskKey): string {
  switch (key) {
    // Identity: the photo, the professions, the two sentences about you.
    case 'PROFILE_PHOTO':
    case 'PROFILE_BIO':
    case 'PROFILE_PROFESSIONS': return '#section-avatar'
    // What you sell and where you travel to.
    case 'PROFILE_SERVICE':
    case 'PROFILE_EXPERIENCE': return '#section-services'
    // The work photos.
    case 'PROFILE_CERTIFICATE': return '#section-photos'
  }
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
 * ⚠️ IT MOVED FROM 1₾ TO 3₾ AND FROM ONE MOMENT TO ANOTHER (2026-09-01, the
 * owner's design canvas → „Expert Jobs"). Both halves are the same change.
 *
 * The old 1₾ was priced for a GAMBLE: a provider paid before bidding, on a lead
 * that would probably go quiet, so the risk had to be small enough that silence
 * cost almost nothing. It is not a gamble any more — the canvas charges only
 * after the client has ALREADY chosen this provider („საფასურს იხდი მხოლოდ
 * მაშინ, თუ კლიენტი შეგარჩევს და კონტაქტს გახსნი"), so what is being bought is
 * a job in hand rather than a chance at one. A won job is worth more than a
 * lottery ticket and is priced accordingly.
 *
 * ⚠️ THE CANVAS DISAGREES WITH ITSELF AND THIS IS THE HALF THAT WON. „Expert
 * Jobs" says 3₾ in three places and ties every one of them to the selection;
 * „Request Room v2"'s provider footer still reads „უფასოა · 1₾ პასუხზე", which
 * is the OLD price attached to the OLD moment. The more specific and more
 * recent statement about this mechanic is the one implemented; the other line
 * is a leftover of the model this change replaces.
 *
 * It still has to be a number nobody stops to weigh — the point is that the
 * provider decides „is this job worth having", not that they audit a fee.
 *
 * ⚠️ PAID ONCE PER REQUEST, FOR EVER — see `contactKey`. Charging twice for the
 * same phone number is theft, and it is the kind that happens by accident.
 *
 * ⚠️ AND IT IS NOT ONE NUMBER ANY MORE (2026-09-03). It scales with the JOB —
 * see `contactCostTetri` below. Everything above is why the SHAPE of the fee is
 * what it is; the ladder is why 3₾ stopped being all of it.
 */
export const CONTACT_COST_MIN_TETRI = 1 * TETRI
export const CONTACT_COST_MAX_TETRI = 10 * TETRI

/**
 * ⚠️ WHAT AN UNPRICED REQUEST COSTS — AND MEASURING THIS IS WHY IT EXISTS.
 *
 * Run against the live rows on 2026-09-03, the day the ladder was written:
 * NINETEEN OF TWENTY requests carry `budgetMin: 0, budgetMax: null`. The money
 * question is optional in the intake and almost nobody answers it. Priced off
 * the ladder's floor, every one of those would have dropped from 3₾ to 1₾ —
 * a two-thirds cut to the only revenue this platform has, dressed up as a
 * smarter price.
 *
 * An unstated budget is NOT evidence of a small job; it is the absence of
 * evidence, and CLAUDE.md rule 6 is about exactly this. So a request that named
 * no money keeps the price it has had since 2026-09-01, and the ladder applies
 * where the client actually said something.
 *
 * ⚠️ IT ALSO SAYS WHAT TO FIX FIRST. The ladder can only do its job once the
 * intake collects a budget — that is the change worth making before this one
 * is worth much, and it is the owner's.
 */
export const CONTACT_COST_DEFAULT_TETRI = 3 * TETRI

/**
 * ⚠️ WHAT ONE CLIENT'S CONTACT COSTS ON THIS JOB — 1₾ to 10₾ (2026-09-03).
 *
 * Owner: „მოთხოვნის შესაბამისად არ შეგვიძლია ფასის კორექტირება… 1-10ლ ათამაშე
 * ვფიქრობ საინტერესო იქნება ძალიან ძვირასც არ გადიახდიან."
 *
 * A flat 3₾ was unfair in BOTH directions and the arithmetic says so: on a 70₾
 * cleaning visit it is 4% of the job, on a 15 000₾ renovation it is 0.02%. The
 * small job was being taxed and the big one was being given away.
 *
 * ⚠️ CHECKED, NOT INVENTED. MyBuilder's shortlist fee „is calculated based on
 * the likely size, value and location of the Job"; Thumbtack's lead price moves
 * with „job size, service type, geographic location, and market competition".
 * This is the first of those two factors and only the first — see the note on
 * demand below.
 *
 * ⚠️ DEMAND IS DELIBERATELY NOT IN HERE YET. Thumbtack re-prices weekly on
 * supply and demand, and it is their most complained-about mechanic — one of
 * their own community threads is titled „Why does the lead cost more than the
 * job?!" and pros report 50–100% spikes with no warning. It also needs data
 * this platform does not have: measured 2026-09-03, twenty requests in one
 * city. A demand multiplier today would be an invented number, which CLAUDE.md
 * rule 6 forbids outright. The budget is real, is already on every row, and is
 * enough.
 *
 * ⚠️ ONE LADDER FOR ALL FOUR KINDS, AND THE LIMIT IS WRITTEN DOWN. The bands in
 * lib/requestTopics are per-kind and measure different things — LEARNING is per
 * LESSON, SERVICE is per VISIT, PROJECT is the whole job — so a 120₾ lesson
 * budget and a 120₾ project are not the same size of work. Reading raw lari
 * treats them as if they were. That is accepted rather than solved: a per-kind
 * ladder is four tables to keep in step for a difference that costs at most one
 * step of this one, and the owner asked for the simple version at this stage.
 *
 * `budgetMax` where the client named a ceiling, `budgetMin` where they did not
 * („250₾-ზე მეტი" has no top) — the higher of the two facts we hold, never an
 * average of a band, which would invent a figure nobody typed.
 */
export function contactCostTetri(budgetMin: number, budgetMax: number | null): number {
  /* ⚠️ „NOTHING WAS SAID" IS ITS OWN ANSWER, not the bottom of the ladder — see
     CONTACT_COST_DEFAULT_TETRI for the measurement that forced this line.

     ⚠️ AND `undefined` COUNTS AS NOTHING, NOT AS ZERO (caught 2026-09-03 by
     walking a draft through the run). The guard originally tested
     `budgetMax === null`, which is what Prisma returns — so production was
     right and every OTHER caller was not: `contactCostTetri(undefined,
     undefined)` fell past this line, floored to 0 and priced at 1₾, silently
     charging a third of the intended fee. A guard that is correct only for one
     caller's null-shape is the kind that fails quietly. */
  const stated = (budgetMin ?? 0) > 0 || (budgetMax ?? null) !== null
  if (!stated) return CONTACT_COST_DEFAULT_TETRI
  const gel = Math.max(0, budgetMax ?? budgetMin ?? 0)
  if (gel < 100) return 1 * TETRI
  if (gel < 300) return 2 * TETRI
  if (gel < 700) return 3 * TETRI
  if (gel < 1500) return 5 * TETRI
  if (gel < 5000) return 7 * TETRI
  return CONTACT_COST_MAX_TETRI
}

/**
 * HOW MANY CONTACTS A BALANCE OPENS — as a pair, because it is a pair.
 *
 * ⚠️ IT USED TO BE ONE NUMBER AND THAT NUMBER WAS THE POINT. „85 კონტაქტი" is
 * what a provider wants to know; „85₾" is the currency it happens to be
 * denominated in. Against a 1–10₾ ladder the single figure became a promise the
 * platform cannot keep either way — 85₾ opens eight big jobs or eighty small
 * ones — and CLAUDE.md rule 6 forbids putting the middle of that on a screen.
 *
 * So the pair, and `contactsLabel` renders it. Nothing is lost that was true.
 */
export function contactsAffordable(balanceTetri: number): { min: number; max: number } {
  return {
    min: Math.max(0, Math.floor(balanceTetri / CONTACT_COST_MAX_TETRI)),
    max: Math.max(0, Math.floor(balanceTetri / CONTACT_COST_MIN_TETRI)),
  }
}

/** „6–60", or „6" where the two coincide, or „" for a balance that opens
 *  nothing. The one place the pair becomes text, so five screens cannot punctuate
 *  a range five ways. */
export function contactsLabel(balanceTetri: number): string {
  const { min, max } = contactsAffordable(balanceTetri)
  if (max === 0) return ''
  return min === max ? `${min}` : `${min}–${max}`
}

/** The fee as a range, for the two screens that speak about the price without
 *  a job in front of them (the balance page, the home CTA). Two true numbers
 *  rather than one that used to be true. */
export function contactCostRangeLabel(): string {
  return `${CONTACT_COST_MIN_TETRI / TETRI}–${CONTACT_COST_MAX_TETRI / TETRI}₾`
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

/* ═══════════ what one row of the ledger is CALLED ═══════════════════════ */

/**
 * ⚠️ THE LEDGER HAD NO WORDS UNTIL 2026-09-01, and that is why it had no page.
 * Every movement was stored as a `reason` the database understands —
 * „PROFILE_BIO", „CONTACT_OPENED" — and nothing anywhere turned one into
 * something a provider could read. So the balance could only ever be shown as a
 * TOTAL: a number that changes for reasons the person it belongs to cannot see.
 * Owner, 2026-09-01: „ეს 65₾ საიდან მოვიდა… ბალანსის სისტემას გვერდი არ აქვს."
 *
 * ⚠️ NOTHING HERE IS NEW COPY. Each label is the site's own sentence with its
 * number and its explanation cut off — `JOB_DONE_NOTE` already says
 * „დასრულებული სამუშაო — +25₾ ბალანსზე", `CONTACT_COST_NOTE` already says
 * „კლიენტის კონტაქტი — 1₾ ბალანსიდან". A ledger row prints its own amount, so
 * what it needs from those sentences is the subject and not the predicate.
 *
 * ⚠️ AND „დაბრუნება" IS NOT SAID, here least of all. A released charge is the
 * request closing with nobody on it, which is what the row is named after —
 * never money coming back, which is the sentence that turns a credit into a
 * liability. See the wording rules at the top of this file.
 *
 * An unknown reason returns itself rather than „—": a ledger that silently
 * blanks a movement is worse than one that prints a key, because the number
 * still moved and now nothing accounts for it.
 */
export function creditReasonLabel(reason: string): string {
  if (isAdminAdjust(reason)) {
    const note = reason.slice(`${ADMIN_ADJUST}: `.length).trim()
    return note || ADMIN_ADJUST
  }
  const task = CREDIT_TASKS.find(t => t.key === reason)
  if (task) return task.label
  if (reason === 'JOB_DONE') return 'დასრულებული სამუშაო'
  if (reason === 'CONTACT_OPENED') return 'კლიენტის კონტაქტი'
  if (reason === 'CONTACT_REFUND') return 'კონტაქტი — მოთხოვნა დაიხურა'
  // ⚠️ A SECOND REASON, THE SAME `grantKey` (2026-09-01). Both are „the contact
  // did not become work", and `contactRefundKey` is deliberately shared so the
  // unique index refuses a second payment however the first one was triggered.
  // They are told apart in the LEDGER because a provider reading their own
  // history is owed the actual cause: „the request closed" and „the client you
  // won never answered" are different things that happened to them.
  if (reason === 'CONTACT_REFUND_SILENT') return 'კონტაქტი — კლიენტი არ გამოეხმაურა'
  return reason
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
export function canAffordContact(balanceTetri: number, costTetri: number): boolean {
  if (!CREDITS_ENFORCED) return true
  return balanceTetri >= costTetri
}

/* ═══════════ what a balance is bought with ══════════════════════════════
 *
 * ⚠️ THREE PACKAGES, AND THE BIGGEST IS THE CHEAPEST PER CONTACT (2026-09-03).
 * Owner: „რაიმე 3 პაკეტი რომ შევქმნათ… 100ლ ვთქვათ არის 1000 ქოინი და ამ ათასი
 * ქოინით შემდეგ ყიდულობს და ხსნის."
 *
 * CHECKED BEFORE CHOOSING THE LADDER. Both comparable platforms sell exactly
 * this way and both discount the big pack: Bark's credits are „on a sliding
 * scale, meaning the cost per credit drops when you buy in bigger amounts",
 * about 25–30% off the largest; Thumbtack's credits likewise drop in bulk. The
 * bonus here is 0 / 20 / 30 %, which lands inside that range rather than being
 * picked for how it looks.
 *
 * ⚠️ THE BONUS IS EXTRA BALANCE, NOT A DISCOUNT ON THE PRICE, and the two
 * fields say so: `priceTetri` is what leaves a card, `creditTetri` is what
 * lands in the ledger. Modelling it as „100₾ costs 83₾" would put a second
 * price on the same thing and make every receipt disagree with the ledger.
 *
 * ⚠️ STILL DENOMINATED IN LARI, AND THE FILE'S OWN CONDITION FOR THAT IS ABOUT
 * TO EXPIRE. The header says it plainly: lari is safe „WHILE `PAYMENTS_LIVE` IS
 * FALSE", because a balance that buys one thing and cannot be withdrawn is not
 * money owed. The moment a card can top it up, „you paid 100₾ and we credited
 * you 120₾" is a discount on currency — awkward on an invoice and worse in an
 * account. A COIN fixes that (you bought 1200 coins for 100₾; a coin has no
 * exchange rate), and it is also what lets a contact's price VARY without every
 * screen re-stating a lari figure.
 *
 * So the coin is right and it arrives WITH the card, not before it: swapping
 * the display unit on ten screens for a checkout that does not exist would be
 * the „control that lies" this repo deletes. `creditTetri` is the ledger's own
 * unit either way, so that swap is a display change and not a migration —
 * 1 coin = 10 tetri at the owner's own rate (100₾ = 1000 coins), which makes a
 * contact 30 coins.
 *
 * ⚠️ NOT SOLD ANYWHERE YET. `PAYMENTS_LIVE` is false and there is no checkout;
 * /work/balance draws this list only behind that flag, keeping the honest state
 * its own header describes — „a price list for something nobody can buy… It
 * arrives when the flag does."
 */

export type CreditPack = {
  key: 'START' | 'STANDARD' | 'PRO'
  /** What the provider pays. */
  priceTetri: number
  /** What lands in the ledger — price plus the bonus. */
  creditTetri: number
  /** The owner's word for it on the card. */
  label: string
}

/** ⚠️ EVERY AMOUNT IS A WHOLE LARI AND A ROUND ONE. The packs used to be sized
 *  against a single 3₾ contact; since 2026-09-03 a contact costs 1–10₾ by job
 *  (`contactCostTetri`), so „N contacts" is no longer a fact a pack can state
 *  and the numbers answer to nothing but themselves. */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { key: 'START',    priceTetri:  30 * TETRI, creditTetri:  30 * TETRI, label: 'დამწყები' },
  { key: 'STANDARD', priceTetri: 100 * TETRI, creditTetri: 120 * TETRI, label: 'სტანდარტული' },
  { key: 'PRO',      priceTetri: 300 * TETRI, creditTetri: 390 * TETRI, label: 'პრო' },
]

/** The bonus as a whole percentage, or 0. Computed rather than stored: a stored
 *  „+20%" beside a hand-typed pair of numbers is two facts that can disagree,
 *  and the pair is the one that moves money. */
export function packBonusPct(p: CreditPack): number {
  if (p.creditTetri <= p.priceTetri) return 0
  return Math.round(((p.creditTetri - p.priceTetri) / p.priceTetri) * 100)
}

/** How many contacts a pack buys, at best and at worst — two true numbers.
 *
 *  ⚠️ IT WAS ONE NUMBER AND COULD NOT STAY ONE (2026-09-03). „40 კონტაქტი" was
 *  exact while every contact cost 3₾; against a 1–10₾ ladder it would be a
 *  figure the platform cannot honour, which is CLAUDE.md rule 6. The screens
 *  print the pair or print nothing — never the middle of it. */
export function packContacts(p: CreditPack): string {
  return contactsLabel(p.creditTetri)
}

/* ═══════════ what the provider is told ══════════════════════════════════ */

/**
 * ⚠️ THE PRICE IS SPELLED ONCE, HERE, NEVER ON A SCREEN. A hard-coded „1₾" in a
 * component is how a re-price and a copy change stop agreeing. Facts only — no
 * benefit, no reassurance; the wording rules at the top apply to every string
 * below.
 */
export const CONTACT_COST_NOTE = `კლიენტის კონტაქტი — ${contactCostRangeLabel()} ბალანსიდან, სამუშაოს მიხედვით. ერთხელ იხდი, მერე ყოველთვის გიჩანს.`

/**
 * ⚠️ HOW LONG A PAID CONTACT HAS TO PROVE ITSELF — 48 hours (the canvas).
 *
 * The number is here and nowhere else: `CONTACT_REFUND_NOTE` interpolates it,
 * `sweepSilentContacts` (lib/requestJobs) enforces it, and tests/credits asserts
 * the two agree. A deadline that is typed twice is a deadline that eventually
 * means two different things — which is precisely why the previous note refused
 * to name one at all.
 *
 * ⚠️ WHAT „გამოეხმაურა" MEANS IS A MESSAGE, NOT A PHONE CALL. We cannot see a
 * call, so the only honest evidence of the client answering is a
 * `RequestMessage` from their side on this offer's thread after the unlock. A
 * provider who was genuinely phoned back and refunded anyway has lost nothing;
 * the reverse — charged for silence — is the complaint the refund exists to
 * answer, so the doubt is spent in the provider's favour.
 */
export const CONTACT_REFUND_HOURS = 48

/**
 * ⚠️ THE HALF THAT MAKES THE PRICE FAIR, SAID BEFORE THE CLICK.
 *
 * The defining complaint against lead-mills (researched 2026-08-30) is paying
 * for a contact, answering at once, and the client never speaking again — money
 * kept. mcodne refunds it automatically (refundDeadContacts). A refund nobody
 * knows about before paying changes no decision; it is a rebate discovered
 * later, not a term of the sale.
 *
 * ⚠️ IT HAS A DEADLINE NOW, AND THE DEADLINE IS THE PROMISE (2026-09-01, the
 * canvas → „Expert Jobs": „თუ კლიენტი 48 საათში არ გამოგეხმაურება, 3₾
 * ავტომატურად დაგიბრუნდება").
 *
 * The old note deliberately named NO period, because the condition was „the
 * request closed with nobody having answered" and `STALE_OPEN_DAYS` was the
 * only clock — writing „14 დღეში" into copy would have been a second place that
 * number lived. That reasoning is intact and the conclusion simply moved with
 * the mechanic: the charge now happens AFTER the client picked somebody, so
 * „the request closed unanswered" can no longer be the trigger — by then it is
 * answered. What a provider is now waiting for is the client to pick up, and
 * that has its own clock, `CONTACT_REFUND_HOURS`, interpolated here rather than
 * typed, so this sentence and the sweep cannot drift apart.
 */
export const contactRefundNote = (costTetri: number) =>
  `თუ კლიენტი ${CONTACT_REFUND_HOURS} საათში არ გამოგეხმაურება, ${costTetri / TETRI}₾ ავტომატურად დაგიბრუნდება.`

/** The same promise where no job is in hand — the amount is „whatever you
 *  paid", so the sentence says the period and not a figure. */
export const CONTACT_REFUND_NOTE = `თუ კლიენტი ${CONTACT_REFUND_HOURS} საათში არ გამოგეხმაურება, თანხა ავტომატურად დაგიბრუნდება.`

/** What the fee IS, in the canvas's own words — a fee for having been chosen,
 *  not for a phone number. Read by the provider's job card. */
export const CONTACT_FEE_LABEL = 'შერჩევის საფასური'

/** Said beside the button that spends it. The price belongs ON the control —
 *  a cost a person finds out about afterwards is the thing a lari-denominated
 *  balance must never produce. */
export const contactChargeNote = (costTetri: number) => `ბალანსიდან ჩამოიჭრება ${costTetri / TETRI}₾`

/** The button, before the click. ⚠️ THE PRICE CAME OFF THE LABEL (2026-09-01,
 *  the canvas). It read „კონტაქტის ნახვა · 1₾" because the button was the only
 *  place a provider met the number; the canvas puts the fee above it and
 *  `CONTACT_CHARGE_NOTE` beside it, so printing it a third time on the control
 *  itself is the same fact said three ways in one card. */
export const CONTACT_BUTTON_LABEL = 'კონტაქტის გახსნა' 

/** ⚠️ SAID ON THE OFFER FORM, because it is the half that CHANGED. A provider
 *  who used to pay 5₾ to answer has to be told plainly that answering is now
 *  free, or the old price is what they will assume. */
export const OFFER_FREE_NOTE = 'გაგზავნა უფასოა'

/** The canvas's tinted plate on the job card — the headline and the condition.
 *  Two constants rather than one string because the canvas sets them at two
 *  weights, and because the second is the sentence that actually describes the
 *  new mechanic: the money follows the CLIENT's choice. */
export const OFFER_FREE_TITLE = 'შეთავაზება უფასოა'
export const OFFER_FREE_BODY = 'საფასურს იხდი მხოლოდ მაშინ, თუ კლიენტი შეგარჩევს და კონტაქტს გახსნი.'

/** The earn-back, in one line, for the screen that has to answer „და მერე?" */
export const JOB_DONE_NOTE = `დასრულებული სამუშაო — +${JOB_DONE_TETRI / TETRI}₾ ბალანსზე.`

/** What a provider is told when the balance is short. It names the PRICE rather
 *  than the shortfall — the shortfall is arithmetic they can do, the price is
 *  the fact they need. */
export const noBalanceNote = (costTetri: number) =>
  `ბალანსი არ არის საკმარისი — კონტაქტი ${costTetri / TETRI}₾ ღირს.`

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
  /**
   * What still keeps this card OFF the site — `lib/profileCompleteness →
   * profileBlockers`, already in Georgian, ready to print. Empty means visible.
   *
   * ⚠️ NOT A TASK EITHER, AND NOT THE SAME QUESTION AS THE BONUSES ABOVE. Those
   * pay for a card worth reading; this decides whether there is a card at all,
   * and the two thresholds differ on purpose — `BIO_MIN` is 80 characters to
   * EARN 15₾, `MASTER.ABOUT_MIN` is 40 to BE SEEN. A profile can therefore be
   * fully visible with a bonus still unclaimed, which is the right way round:
   * being paid for extra effort must never be the price of existing.
   *
   * It rides here for the same reason `servicesConfirmed` does —
   * `profileFacts()` already reads the row, and tests/requestQueue §F forbids
   * /work a second serviceProfile query.
   */
  notVisible: string[]
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
