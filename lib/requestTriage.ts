// SHOULD A HUMAN LOOK AT THIS BEFORE ANY EXPERT DOES?
//
// PURE: no prisma, no react. The endpoint enforces it, the tests execute it.
//
// ⚠️ WHY THIS EXISTS. Until now EVERY request waited for an operator to pick up
// a phone before a single expert was told it existed. The call is a real quality
// gate and it is what separates this from the lead mills — but as the ONLY gate
// it was also the longest pause in the product: a request sent at 23:00 sat
// untouched until morning, and the person who sent it watched a „ვამოწმებთ"
// pulse for nine hours with nobody on the other side. Profi.ru has no human on
// that path at all. Owner, 2026-08-18: „ამის ავტომატიზაცია გვინდა."
//
// ⚠️ THE CALL IS NOT REMOVED. It is turned from a rule into an EXCEPTION. A
// request that looks ordinary routes immediately and the operator phones it
// afterwards, at leisure; a request that trips one of the flags below waits, as
// everything used to. Nothing here rejects anything and nothing here accepts an
// offer — those remain human decisions, exactly as lib/requestJobs says.
//
// ⚠️ AND THE FLAGS ARE FACTS, NOT SCORES. Each one is a yes/no somebody could
// be shown and could argue with — „your budget is under the floor", „this is the
// fourth identical request from this number in an hour". No weighting, no
// threshold that drifts, nothing learned. The same refusal lib/requestRouting
// makes about matching, made again here.

import { type RequestKindName } from './requestTopics'

/** Why a request is being held for a person. Empty means „let it go". */
export type TriageFlag =
  | 'BELOW_FLOOR'
  | 'NO_TOPIC'
  | 'CONTACT_IN_TEXT'
  | 'LINK_IN_TEXT'
  | 'REPEAT_SENDER'
  | 'SUSPECT_PHONE'

export const TRIAGE_LABEL: Record<TriageFlag, string> = {
  BELOW_FLOOR: 'ბიუჯეტი ზღვარზე დაბალია',
  NO_TOPIC: 'თემა ვერ დადგინდა',
  CONTACT_IN_TEXT: 'აღწერაში კონტაქტია',
  LINK_IN_TEXT: 'აღწერაში ბმულია',
  REPEAT_SENDER: 'ამ ნომრიდან უკვე იყო მოთხოვნა',
  SUSPECT_PHONE: 'ნომერი საეჭვოა',
}

/* ═══════════ the tests, one per flag ════════════════════════════════════ */

/** A phone number or an email inside the description. Not spam by itself — but
 *  somebody trying to be reached around the platform is exactly the case a
 *  person should read before it is broadcast to every expert in the sphere. */
const CONTACT_RE = /(\+?\d[\d\s\-().]{7,}\d)|([^\s@]+@[^\s@]+\.[^\s@]+)/
/** Any link. The overwhelming majority of these are advertising. */
const LINK_RE = /(https?:\/\/|www\.)/i

/**
 * ⚠️ GEORGIAN MOBILES ARE NINE DIGITS AND START WITH 5, and landlines start
 * with 3. Anything else is not automatically fake — a diaspora client with a
 * foreign number is a real client — so this does not REJECT it, it asks for a
 * human. That distinction is the whole design of this file.
 */
function phoneLooksOdd(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 9) return true
  // All one digit, or a simple run — „555555555", „123456789".
  const tail = digits.slice(-9)
  if (/^(\d)\1{8}$/.test(tail)) return true
  if (tail === '123456789' || tail === '987654321') return true
  return false
}

export type TriageInput = {
  kind: RequestKindName
  budgetBand: string
  topic: string
  description: string
  phone: string
  /** How many requests this phone has already sent recently. The endpoint
   *  counts them; the rule lives here. */
  recentFromPhone: number
}

/**
 * How many requests from one number stop being enthusiasm and start being
 * something to look at. Three is generous — a household genuinely might need a
 * plumber and a cleaner in one evening — and the fourth is worth a call.
 */
export const REPEAT_LIMIT = 3

/** Every reason this request should wait for a person. Empty = route it now. */
export function triageFlags(r: TriageInput): TriageFlag[] {
  const out: TriageFlag[] = []

  // ⚠️ BELOW_FLOOR NO LONGER FLAGS ANYTHING (2026-08-18), and the flag is kept
  // rather than deleted on purpose — three months of stored requests carry it,
  // and an admin reading „why did this wait" on an old row must still get an
  // answer instead of a raw string.
  //
  // The floor used to REFUSE a request on arrival. It refused one in three, and
  // the closest local competitor asks for no budget at all — see
  // app/api/requests for the measurement and the owner's decision. A low budget
  // is now simply a low budget: the request routes, the expert sees the number,
  // and the expert decides. That is the judgement they are better placed to
  // make than we are.

  // ⚠️ „სხვა" MEANS THE CATALOGUE COULD NOT NAME IT, which is the most valuable
  // row in the table and also the one nobody can route: with no topic there is
  // no sphere, no service list, nothing to match on. A person reads it, files
  // it, and the vocabulary grows. See lib/requestTopics → OTHER_TOPIC.
  if (r.topic === '' || r.topic === 'other') out.push('NO_TOPIC')

  const desc = r.description.trim()
  if (desc && CONTACT_RE.test(desc)) out.push('CONTACT_IN_TEXT')
  if (desc && LINK_RE.test(desc)) out.push('LINK_IN_TEXT')

  if (r.recentFromPhone >= REPEAT_LIMIT) out.push('REPEAT_SENDER')
  if (phoneLooksOdd(r.phone)) out.push('SUSPECT_PHONE')

  return out
}

/**
 * May this request go straight to the experts?
 *
 * ⚠️ THE ANSWER IS NOT „IS IT GOOD". It is „is there anything here a person
 * needs to see FIRST". An ordinary request routes now and is still phoned; a
 * flagged one waits exactly as everything used to. The operator's queue keeps
 * every request either way — what changes is which of them the client is left
 * waiting on.
 */
export function mayAutoVerify(r: TriageInput): boolean {
  return triageFlags(r).length === 0
}

/** The flags, in the operator's words, for the admin's note. Joined by „ · " so
 *  it reads as one line beside the row rather than a list nobody scans. */
export function triageNote(flags: TriageFlag[]): string | null {
  return flags.length ? flags.map(f => TRIAGE_LABEL[f]).join(' · ') : null
}
