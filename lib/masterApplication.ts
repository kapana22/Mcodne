// WHAT A TRADESPERSON MUST TELL US — the rules for a MasterApplication.
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
import { isServiceTopic } from './serviceProfile'
import { CITIES, type CityName } from './requestTopics'

const AREA_IDS = new Set(CITIES.map(c => c.id))

export const MASTER_KINDS = ['INDIVIDUAL', 'COMPANY'] as const
export type MasterKind = (typeof MASTER_KINDS)[number]

export const MASTER_KIND_LABEL: Record<MasterKind, string> = {
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
   *  them. Raise this and check the admin queue's `omit` first. */
  MAX_WORK_PHOTOS: 6,
  NAME_MIN: 3,
  NAME_MAX: 80,
} as const

/* ═══════════ what may be submitted ═══════════════════════════════════════ */

const dataUri = z.string().trim().max(4_000_000)
  .refine(v => v.startsWith('data:image/'), { message: 'ფოტო ვერ აიტვირთა' })

export const MasterApplicationInput = z.object({
  kind: z.enum(MASTER_KINDS),

  fullName: z.string().trim().min(MASTER.NAME_MIN).max(MASTER.NAME_MAX),
  phone: z.string().trim().min(9).max(20),

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
    .refine(ids => ids.every(isServiceTopic), { message: 'არჩეულია სერვისი, რომელიც სიაში არ არის' })
    .refine(ids => new Set(ids).size === ids.length, { message: 'სერვისი ორჯერ არის არჩეული' }),

  areas: z.array(z.string().trim().min(1).max(20))
    .min(1, { message: 'აირჩიე ქალაქი' })
    .max(CITIES.length)
    .refine(ids => ids.every(id => AREA_IDS.has(id as CityName)), { message: 'არჩეულია ქალაქი, რომელიც სიაში არ არის' })
    .refine(ids => new Set(ids).size === ids.length, { message: 'ქალაქი ორჯერ არის არჩეული' }),

  about: z.string().trim().min(MASTER.ABOUT_MIN, { message: 'დაწერე ცოტა უფრო ვრცლად' }).max(MASTER.ABOUT_MAX),
  yearsExp: z.number().int().min(0).max(70).nullable(),

  calloutFee: z.number().int().positive().max(100_000).nullable(),
  priceFrom: z.number().int().positive().max(1_000_000).nullable(),

  // ⚠️ `{ topicId: lari }`, AND THE KEYS ARE CHECKED AGAINST THE TICKS BELOW.
  // A JSON column can hold anything a bad write ever put there, so the schema
  // does the two things the reader cannot: every value is a positive integer
  // (a blank input must never arrive as 0 and print „0₾" on a card), and every
  // key names a real service topic. The stronger rule — the key is one THIS
  // applicant ticked — is a cross-field refinement, so it lives with the
  // others at the bottom of this object.
  priceList: z.record(z.string(), z.number().int().positive().max(1_000_000)).default({}),

  photoUrl: dataUri.nullable(),
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
export type MasterApplicationInput = z.infer<typeof MasterApplicationInput>

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
export function approvalBlockers(a: {
  kind: string
  photoUrl: string | null
  services: string[]
  areas: string[]
}): string[] {
  const out: string[] = []
  if (!a.photoUrl) {
    out.push(a.kind === 'COMPANY' ? 'ლოგო ან ფოტო არ არის' : 'ფოტო არ არის')
  }
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
export const MASTER_STATUS_TEXT: Record<string, string> = {
  SUBMITTED: 'განაცხადი გამოგზავნილია. გადავამოწმებთ და დაგიკავშირდებით.',
  NEEDS_REVISION: 'განაცხადს ერთი რამ აკლია — შეავსე და ხელახლა გამოგზავნე.',
  APPROVED: 'დამტკიცებულია. მოთხოვნები უკვე მოგდის.',
  REJECTED: 'განაცხადი არ დამტკიცდა.',
}
