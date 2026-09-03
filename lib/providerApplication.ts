// WHAT A TRADESPERSON MUST TELL US — the rules for a ProviderApplication.
//
// PURE: no prisma, no react. The form draws these, the endpoint enforces them,
// the tests execute them. The same contract lib/serviceProfile and
// lib/applyValidation already carry, and for the same reason — a rule with two
// copies is a rule with two behaviours, and the copy that drifts is always the
// one on the server, where nobody is looking.
//
// ⚠️ THIS FILE IS WHERE „REQUIRED" IS DECIDED, AND EVERY REQUIRED FIELD IS A
// COST. We have zero masters. The failure mode that ends this vertical is not a
// thin profile, it is an empty one — an applicant who opens the form, meets a
// wall of mandatory fields, and closes the tab. So each `required` below states
// what it buys, and anything that cannot answer that question is optional.

import { z } from 'zod'
import { isOfferableTopic, MAX_WORK_PHOTOS } from './serviceProfile'
import { CITIES, type CityName } from './requestTopics'
import { phoneFormatError } from './phone'

const AREA_IDS = new Set(CITIES.map(c => c.id))

export const MASTER_KINDS = ['INDIVIDUAL', 'COMPANY'] as const
export type ProviderKind = (typeof MASTER_KINDS)[number]

export const PROVIDER_KIND_LABEL: Record<ProviderKind, string> = {
  INDIVIDUAL: 'ინდივიდუალური',
  COMPANY: 'კომპანია',
}

/* ═══════════ the bounds ══════════════════════════════════════════════════ */

export const MASTER = {
  /** Same ceiling `MAX_SERVICES` sets on the profile itself, and for the same
   *  reason: ticking everything is „send me all of it", which is the lead-mill
   *  behaviour the routing exists to stop. */
  MAX_SERVICES: 12,
  /** Long enough to be a sentence, short enough that nobody stalls. 40 was the
   *  expert bio's floor and it produced usable text; a trade needs no essay. */
  ABOUT_MIN: 40,
  ABOUT_MAX: 1500,
  /** ⚠️ SIX, AND IT IS A STORAGE LIMIT AS MUCH AS AN EDITORIAL ONE. There is no
   *  object storage on this site — /api/uploads returns a base64 data URI and
   *  the image IS the column. Six photos at ~200KB is a 1.2MB row, which is
   *  survivable only because nothing ever lists these rows with the photos in
   *  them. Raise this and check the admin queue's `omit` first.
   *
   *  ⚠️ AND IT IS RE-EXPORTED, NOT RETYPED (2026-08-21). /work/services edits
   *  the same column for the rest of the profile's life, so the number lives in
   *  lib/serviceProfile beside the other ceilings on that row — two copies
   *  would let the editor accept a seventh photo the intake refuses. */
  MAX_WORK_PHOTOS,
  NAME_MIN: 3,
  NAME_MAX: 80,
} as const

/* ═══════════ what may be submitted ═══════════════════════════════════════ */

const dataUri = z.string().trim().max(4_000_000)
  .refine(v => v.startsWith('data:image/'), { message: 'ფოტო ვერ აიტვირთა' })

export const ProviderApplicationInput = z.object({
  kind: z.enum(MASTER_KINDS),

  fullName: z.string().trim().min(MASTER.NAME_MIN).max(MASTER.NAME_MAX),
  // Keep the provider door on the same phone rule as signup, requests and the
  // profile editor. A length-only check accepted strings that looked filled in
  // but could not be called, then the applicant only learned about it later.
  phone: z.string().trim().refine(v => phoneFormatError(v, { required: true }) === null, {
    message: 'ნომერი არასწორია',
  }),

  // ⚠️ NULLABLE IN THE SCHEMA, REQUIRED BY THE REFINEMENT BELOW. Modelled this
  // way on purpose: somebody who fills the company fields and then switches to
  // INDIVIDUAL must not have their submit rejected for a field that is no
  // longer on their screen — and somebody who switches the other way must not
  // get through without one.
  companyName: z.string().trim().max(120).nullable(),
  taxId: z.string().trim().max(20).nullable(),

  services: z.array(z.string().trim().min(1).max(40))
    .min(1, { message: 'აირჩიე ერთი სერვისი მაინც' })
    .max(MASTER.MAX_SERVICES)
    .refine(ids => ids.every(isOfferableTopic), { message: 'არჩეულია სერვისი, რომელიც სიაში არ არის' })
    .refine(ids => new Set(ids).size === ids.length, { message: 'სერვისი ორჯერ არის არჩეული' }),

  areas: z.array(z.string().trim().min(1).max(20))
    .min(1, { message: 'აირჩიე ქალაქი' })
    .max(CITIES.length)
    .refine(ids => ids.every(id => AREA_IDS.has(id as CityName)), { message: 'არჩეულია ქალაქი, რომელიც სიაში არ არის' })
    .refine(ids => new Set(ids).size === ids.length, { message: 'ქალაქი ორჯერ არის არჩეული' }),

  /**
   * ⚠️ REQUIRED AT THE DOOR — AND THIS NOTE SPENT A DAY SAYING THE OPPOSITE
   * (corrected 2026-09-02).
   *
   * On the morning of 2026-09-01 this became a soft gate: blank allowed at
   * APPLY, required at APPROVAL, the rule the photo had always had. The
   * argument was good and is still worth reading — blocking at submit loses an
   * applicant at the exact step a marketplace with no supply cannot afford to
   * lose one; blocking at approval costs nothing, because a reviewer is already
   * there and „send us a few lines" is a NEEDS_REVISION note rather than a dead
   * end.
   *
   * ⚠️ THE OWNER REVERSED IT THAT EVENING, looking at what the applicant is
   * actually left holding: „სავალდებულო თუა ფოტო უნდა იყოს და აღარ უნდა
   * ამატებდეს მერე რამეს და არეული არ უნდა იყოს მომხმარებელი და
   * გაურკვევლობაში." The confirmation screen was saying „განაცხადი
   * გამოგზავნილია" and then listing two more jobs — sent and not-sent in one
   * breath. So the questions are asked HERE, in the form, once.
   *
   * The schema was changed back; this comment was not, and on 2026-09-02 it
   * cost a wrong reading: the mismatch was reported as „the code has not caught
   * up with the note", the rule was softened again, and `tests/
   * masterApplication §B` — which pins the owner's decision and quotes it —
   * refused the change. The test was right. The stale half was this paragraph.
   *
   * `approvalBlockers` below STILL checks `about`, and that is not a
   * contradiction: an application written before this rule existed can carry a
   * blank one, and it must not be approvable.
   */
  about: z.string().trim().min(MASTER.ABOUT_MIN, { message: 'დაწერე ცოტა უფრო ვრცლად' }).max(MASTER.ABOUT_MAX),
  /**
   * ⚠️ `.default(null)` — AND WITHOUT IT THE DOOR WAS SHUT (fixed 2026-08-31).
   *
   * „გამოცდილება — N წელი" was removed from every screen earlier the same day
   * (owner: „გამოცდილება 0 წელი … წაშალე"), so the form stopped SENDING the
   * key. This line still read `.nullable()`, which in zod accepts `null` and
   * refuses `undefined` — so every application posted after that removal was
   * refused with `field: 'yearsExp'` and „შეავსე ველები სწორად.", a message the
   * form had no box to print beside and therefore did not print at all. The
   * applicant pressed „დასრულება" and the page did nothing.
   *
   * `tsc` could not see it and neither could the tests: the fixture in
   * tests/formValidation passes `yearsExp: null` by hand, so the schema was
   * only ever exercised with a key the interface no longer produces. The test
   * added there now parses the FORM'S OWN body (`providerApplicationBody`).
   *
   * The column stays — old rows hold real answers and the admin drawer prints
   * them. What changed is only that a body which omits it is a valid body.
   */
  yearsExp: z.number().int().min(0).max(70).nullable().default(null),

  calloutFee: z.number().int().positive().max(100_000).nullable(),
  priceFrom: z.number().int().positive().max(1_000_000).nullable(),

  /**
   * ⚠️ AN ASSERTION, NOT A COLUMN (2026-09-01, owner: „ერთი ფასი და
   * „შეთანხმებით""). It is parsed and then DISCARDED — the route writes
   * `priceFrom` and nothing else, because once the pair rule at the bottom of
   * this object makes an answer compulsory, `priceFrom === null` IS
   * „შეთანხმებით". A stored boolean that only repeats what a null already says
   * is two facts about one thing, and two facts about one thing disagree.
   *
   * It travels in the BODY rather than staying in the interface because the
   * form's „დარჩა" list is this schema's own `safeParse`. A rule kept only on
   * the page is the hand-written `need(...)` mirror this file deleted on
   * 2026-08-31, and that mirror had drifted by a whole digit.
   */
  priceOnAsk: z.boolean().default(false),

  // ⚠️ `{ topicId: lari }`, AND THE KEYS ARE CHECKED AGAINST THE TICKS BELOW.
  // A JSON column can hold anything a bad write ever put there, so the schema
  // does the two things the reader cannot: every value is a positive integer
  // (a blank input must never arrive as 0 and print „0₾" on a card), and every
  // key names a real service topic. The stronger rule — the key is one THIS
  // applicant ticked — is a cross-field refinement, so it lives with the
  // others at the bottom of this object.
  priceList: z.record(z.string(), z.number().int().positive().max(1_000_000)).default({}),

  /**
   * ⚠️ REQUIRED AT SUBMIT SINCE 2026-09-01 — IT WAS NULLABLE, AND THE OWNER
   * REVERSED THAT: „სავალდებულო თუა ფოტო უნდა იყოს და აღარ უნდა ამატებდეს მერე
   * რამეს და არეული არ უნდა იყოს მომხმარებელი და გაურკვევლობაში."
   *
   * The soft gate below explains, at length, why blocking at submit was thought
   * expensive. What it did not weigh is what the applicant is left holding: a
   * screen that says „განაცხადი გამოგზავნილია" and then hands them two more
   * jobs. Sent and not-sent at the same time — and the person cannot tell which
   * they are. A cost paid in confusion is still a cost; this one was just
   * invisible in the funnel, because it looks like a completed application.
   *
   * So the question is asked ONCE, where every other question is asked, and the
   * confirmation screen means what it says.
   */
  photoUrl: dataUri,
  workPhotos: z.array(dataUri).max(MASTER.MAX_WORK_PHOTOS),
})
  .refine(v => v.kind !== 'COMPANY' || !!v.companyName, {
    message: 'დაწერე კომპანიის სახელი', path: ['companyName'],
  })
  // A price for something they do not offer is either a stale key left behind
  // when a tick was removed, or a crafted body. Neither may be stored: the
  // reader walks `services` and would ignore it, but a row that holds a price
  // for a service the provider does not do is a row nobody can explain.
  .refine(v => Object.keys(v.priceList).every(k => v.services.includes(k)), {
    message: 'ფასი მითითებულია სერვისზე, რომელიც არჩეული არ არის', path: ['priceList'],
  })
  /**
   * ⚠️ ONE OF THE TWO, ALWAYS (2026-09-01). The price was optional and blank
   * meant two different things at once — „I have not answered yet" and „ask
   * me" — which the catalogue card cannot tell apart: it prints
   * „ფასს შემოგთავაზებს" for both, so almost everybody landed in that second
   * state without ever choosing it.
   *
   * Measured on the 25 published profiles the day this changed: 1 of 25 had
   * filled the per-service price map, 0 of 25 a call-out fee. The one number
   * they DID all answer clustered on two values — 16 of the 25 priced at
   * exactly 80₾ or 100₾, which is the signature of a box being cleared rather
   * than a price being named.
   *
   * So the pair, and not a required number: „აირჩიე ერთი" costs one tap and
   * „გამოიგონე ციფრი" costs the client's trust the first time an offer does
   * not match the card. CLAUDE.md → „never invent a number".
   *
   * ⚠️ A CROSS-FIELD RULE SURFACES LAST IN „დარჩა", and that is a property of
   * zod rather than a choice: an outer `.refine` runs only once the object's
   * own fields have parsed, so this blocker appears in the form's list after
   * the last plain field is answered — measured, not assumed. The rule above
   * it (`companyName`) has behaved that way since it was written. It is
   * tolerable for the same reason: the submit ALWAYS names the field and jumps
   * to it, so the applicant is never refused without being told where. If that
   * ever stops being true the fix is to post one key — a discriminated
   * „from N" / „ask" — not to hand-write the rule a second time in the form.
   */
  .refine(v => v.priceOnAsk || v.priceFrom !== null, {
    message: 'დაწერე ფასი, ან მონიშნე „შეთანხმებით“', path: ['priceFrom'],
  })
export type ProviderApplicationInput = z.infer<typeof ProviderApplicationInput>

/* ═══════════ what the form actually posts ════════════════════════════════ */

/**
 * ⚠️ THE BODY IS BUILT HERE, NOT IN THE FORM (2026-08-31), and the `yearsExp`
 * note above is the whole reason. The door hand-assembled its own object
 * literal inside `submit()`: nothing typed it, nothing tested it, and the day
 * one key stopped being written the schema above started refusing every
 * application while the gate stayed green. A body the schema has never seen is
 * a body nobody has checked.
 *
 * With one builder the form and the test parse the SAME object, so a key that
 * goes missing fails a test instead of a stranger's registration.
 *
 * It takes what the CONTROLS hold — strings, including the money boxes — and
 * returns what the endpoint takes. That is the other half of the fix: the
 * cleaning used to live in the form too.
 */
export type ProviderApplicationDraft = {
  kind: ProviderKind
  fullName: string
  phone: string
  /** Only sent when `kind` is COMPANY — see the schema's note. */
  companyName: string
  taxId: string
  services: string[]
  areas: string[]
  about: string
  /** The raw contents of the money inputs, exactly as typed. */
  calloutFee: string
  priceFrom: string
  /** „ფასი შეთანხმებით" — ticked, `priceFrom` is cleared and posted as null. */
  priceOnAsk: boolean
  photoUrl?: string | null
  workPhotos?: string[]
}

/**
 * A typed money box → the integer the schema takes, or null.
 *
 * ⚠️ NULL FOR ANYTHING THE SCHEMA WOULD REFUSE, not merely for an empty box.
 * The form's own `parseInt` returned 0 for „0" and sent it, and every price
 * column here is `.positive()` — so one zero in „გამოძახება" refused the whole
 * application, naming a field that had no error slot on the page. A price is
 * either a positive number under the ceiling or it is „ask", and „ask" is null.
 */
const money = (raw: string, max: number): number | null => {
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isInteger(n) && n > 0 && n <= max ? n : null
}

export function providerApplicationBody(d: ProviderApplicationDraft) {
  const company = d.kind === 'COMPANY'
  return {
    kind: d.kind,
    fullName: d.fullName.trim(),
    phone: d.phone.trim(),
    companyName: company ? d.companyName.trim() : null,
    taxId: company ? (d.taxId.trim() || null) : null,
    services: d.services,
    areas: d.areas,
    about: d.about.trim(),
    calloutFee: money(d.calloutFee, 100_000),
    // ⚠️ THE TICK WINS OVER WHATEVER IS IN THE BOX (2026-09-01). The interface
    // clears the number when „შეთანხმებით" goes on, but the two are separate
    // pieces of state and a body assembled from a stale pair must not post
    // both — „ask me, and it is 80₾" is not an answer anybody can print.
    priceFrom: d.priceOnAsk ? null : money(d.priceFrom, 1_000_000),
    priceOnAsk: d.priceOnAsk,
    // ⚠️ NO PER-SERVICE PRICES ANY MORE (2026-09-01, owner: „ერთი ფასი").
    // The application asked for a price on every ticked row and 1 of 25
    // published providers had ever filled one in; the schema keeps the key,
    // with its `{}` default, because ServiceProfile.priceList still exists and
    // the catalogue still reads it for the row that has one.
    photoUrl: d.photoUrl ?? null,
    workPhotos: d.workPhotos ?? [],
  }
}

/* ═══════════ the photo rule ══════════════════════════════════════════════ */

/**
 * ⚠️ THE PHOTO IS A SOFT GATE, AND THIS IS THE MOST CONSEQUENTIAL LINE IN THE
 * FILE. You may APPLY without one. You may not be APPROVED without one.
 *
 * The two halves are answering two different risks. Requiring it at submit
 * costs applicants at the exact step where a marketplace with no supply cannot
 * afford to lose any — a photo means finding one, cropping it, and often
 * switching device, and a form that blocks on it is abandoned rather than
 * postponed. Requiring it at approval costs nothing, because a reviewer is
 * already in the loop and „send us a photo" is a NEEDS_REVISION note rather
 * than a dead end.
 *
 * What the photo buys is not decoration: this is a stranger who comes to your
 * flat. A face is the cheapest evidence a marketplace can carry that somebody
 * is willing to be recognised, and it is the one thing a client cannot get from
 * the price. For a COMPANY the logo answers a different question — which firm —
 * so it is accepted in the same slot rather than demanding a face from an
 * entity that does not have one.
 *
 * Work photos stay optional at BOTH ends. A plumber who fixed a leak has
 * nothing to photograph; demanding a portfolio would file the trades that
 * produce no picture below the trades that do, which is a ranking of
 * photogenic-ness, not of skill.
 */
/**
 * „there is no photo", in the one place both readers of that fact get it from.
 *
 * ⚠️ IT WAS SAID IN ONE PLACE AND MEANT IN TWO (2026-09-02). `approvalBlockers`
 * below has spelled this for the ADMIN since it was written; the APPLICANT,
 * refused at submit for the same reason, got „ფოტო არასწორია." — the generic
 * fallback in lib/validationMessages, because `photoUrl: dataUri` refuses a
 * `null` with an `invalid_type` issue that carries no Georgian message.
 *
 * „არასწორია" is a claim about a photo they uploaded. They uploaded none.
 * Walked as a brand-new applicant on 2026-09-02: fill everything, skip the
 * photo, press „დასრულება" — and be told the photo you never chose is wrong.
 *
 * The COMPANY wording differs because the thing being asked for differs, which
 * is the whole reason this is a function rather than a constant.
 */
export function missingPhotoMessage(kind: string): string {
  return kind === 'COMPANY' ? 'ლოგო ან ფოტო არ არის' : 'ფოტო არ არის'
}

export function approvalBlockers(a: {
  kind: string
  photoUrl: string | null
  services: string[]
  areas: string[]
  /** Optional so an older caller still typechecks; absent is treated as blank,
   *  which is the safe reading — it blocks approval rather than passing it. */
  about?: string | null
}): string[] {
  const out: string[] = []
  if (!a.photoUrl) out.push(missingPhotoMessage(a.kind))
  // ⚠️ MOVED HERE FROM THE SCHEMA (2026-09-01). The description used to be
  // required to APPLY; it is now required to GO LIVE, which is the same rule
  // the photo has always had and for the same reason. A card with no sentence
  // on it is the thing this gate exists to prevent — not an application with
  // no sentence yet.
  if (!a.about || a.about.trim().length === 0) out.push('აღწერა არ არის')
  if (a.services.length === 0) out.push('სერვისი არ არის არჩეული')
  if (a.areas.length === 0) out.push('ქალაქი არ არის არჩეული')
  return out
}

/** Is this application complete enough to be approved as it stands? */
export function readyToApprove(a: Parameters<typeof approvalBlockers>[0]): boolean {
  return approvalBlockers(a).length === 0
}

/* ═══════════ what the applicant is looking at ════════════════════════════ */

/**
 * The one line the status screen shows. Written for somebody who submitted a
 * form three days ago and wants to know whether anything is happening — so it
 * says what the state IS, never what we are feeling about it.
 */
export const PROVIDER_STATUS_TEXT: Record<string, string> = {
  SUBMITTED: 'განაცხადი გამოგზავნილია. გადავამოწმებთ და დაგიკავშირდებით.',
  NEEDS_REVISION: 'განაცხადს ერთი რამ აკლია — შეავსე და ხელახლა გამოგზავნე.',
  APPROVED: 'დამტკიცებულია. მოთხოვნები უკვე მოგდის.',
  REJECTED: 'განაცხადი არ დამტკიცდა.',
}
