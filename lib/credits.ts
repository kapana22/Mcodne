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
    work: { label: 'აირჩიე რას აკეთებ', why: 'ამის მიხედვით მიდის მოთხოვნები შენამდე.' },
  },
  {
    key: 'PROFILE_SERVICE',
    tetri: 20 * TETRI,
    label: 'დაამატე პირველი სერვისი',
    why: 'ეს არის ის, რასაც კლიენტი კატალოგში ხედავს.',
    work: { label: 'დაუწერე ფასი ერთ სერვისს მაინც', why: 'ფასიანი სერვისი კატალოგში სახელით ჩანს.' },
  },
  {
    key: 'PROFILE_CERTIFICATE',
    tetri: 20 * TETRI,
    label: 'ატვირთე სერტიფიკატი ან დიპლომი',
    why: 'გადამოწმებული პროფილი მეტ პასუხს იღებს.',
    work: { label: 'ატვირთე ნამუშევრის ფოტო', why: 'შესრულებული სამუშაო ყველაზე კარგი მტკიცებულებაა.' },
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
    work: { label: 'მიუთითე სად მუშაობ', why: 'რაიონები, სადაც გამოძახებაზე გახვალ.' },
  },
] as const

/* ⚠️ SIX KEYS, TWO VOCABULARIES — AND NEVER TWO TASK LISTS (2026-08-20).
 *
 * Three of the six were written for an expert profile and are unreachable on
 * the other half: a `ServiceProfile` has no certificates, no `professions[]`
 * and no `yearsExp`. A services-only provider could therefore earn 50₾ of a
 * grant the landing calls 100₾ — and services are what this site sells, so
 * that is the majority of the supply side being shown a prize they cannot win.
 *
 * The fix is a SECOND WORDING, not a second list. The key and the amount are
 * shared, so the ledger, the unique index and `CREDIT_TASKS_TOTAL` know nothing
 * about capabilities; only the sentence changes, because „ატვირთე სერტიფიკატი"
 * is meaningless to a plumber and „ატვირთე ნამუშევრის ფოტო" is the same proof
 * in their trade. What SATISFIES each key per half lives in one place —
 * lib/creditsServer → profileFacts — and the pairs are deliberately distinct so
 * one tick can never pay twice: `services[]` earns PROFESSIONS, a PRICE on one
 * of them earns SERVICE.
 */
type CreditKind = 'CONSULT' | 'WORK'

/** The task list in one half's words. Copy only — same keys, same amounts. */
export function creditTasks(kind: CreditKind): { key: CreditTaskKey; tetri: number; label: string; why: string }[] {
  return CREDIT_TASKS.map(t => {
    const alt = kind === 'WORK' && 'work' in t ? t.work : null
    return { key: t.key, tetri: t.tetri, label: alt?.label ?? t.label, why: alt?.why ?? t.why }
  })
}

export type CreditTaskKey = (typeof CREDIT_TASKS)[number]['key']

/** ⚠️ EXACTLY 100₾, and it is asserted by a test. The number is the promise the
 *  landing makes („100₾ საჩუქრად"); if a task is re-priced, another one moves. */
export const CREDIT_TASKS_TOTAL = CREDIT_TASKS.reduce((n, t) => n + t.tetri, 0)

/* ═══════════ what spends it ═════════════════════════════════════════════ */

/**
 * ⚠️ SPENT ON SENDING AN OFFER, NEVER ON SEEING A REQUEST (2026-08-20).
 *
 * This is the one structural decision in the whole feature. Charging to VIEW a
 * lead is the model most of this industry uses and the one it is most hated
 * for: the provider pays before knowing whether anybody will answer. On our own
 * numbers that would be indefensible — 32 requests have produced 4 offers, so
 * a provider paying to look would pay for silence most of the time.
 *
 * Charging to RESPOND inverts it. They read the whole job, decide, and spend
 * only on their own decision. It also maps onto something already built:
 * a request has `offerLimit` places (3), the card already prints „N ადგილი",
 * and a credit buys one of them.
 *
 * 5₾ against a 100₾ grant is 20 offers — a number a person can hold in their
 * head. Cheap enough not to deter a real bid, expensive enough that spraying
 * every request costs something.
 */
export const OFFER_COST_TETRI = 5 * TETRI

/** How many offers a balance still buys — the only arithmetic the UI needs. */
export function offersAffordable(balanceTetri: number): number {
  return Math.max(0, Math.floor(balanceTetri / OFFER_COST_TETRI))
}

/**
 * ⚠️ A ZERO BALANCE DOES NOT BLOCK YET, AND THIS FLAG IS THE WHOLE OF IT.
 *
 * Owner: „დასაწყისში უფასო იქნება." The ledger runs, the balance is shown and
 * the offer is charged — so the mechanism is exercised on real behaviour and
 * the data accumulates — but nobody is stopped. Flip this to `true` the day the
 * accept rate is known well enough to price a lead honestly; nothing else about
 * the shape changes, which is the point of doing it now rather than later.
 *
 * Same contract as the other switches in lib/flags: one line, both directions.
 */
export const CREDITS_ENFORCED = false

/** Can this balance send an offer? While unenforced, always. */
export function canAffordOffer(balanceTetri: number): boolean {
  if (!CREDITS_ENFORCED) return true
  return balanceTetri >= OFFER_COST_TETRI
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
