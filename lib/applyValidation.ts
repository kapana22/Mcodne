/**
 * ONE validation source for the expert application — shared by the form
 * (app/apply/ApplyClient.tsx) and the API (app/api/applications/route.ts).
 *
 * THE BUG THIS EXISTS TO KILL (2026-08-06, seen in production). The API added a
 * Georgian-script gate to `fullName`; the form never checked it. The form also
 * pre-fills first/last name from the Google account, and a Georgian's Google
 * account is very often Latin („Nino Beridze"). So the applicant filled in a
 * name they never typed, passed every client gate, pressed „გაგზავნა" and got
 * 400 INVALID_TEXT — while the client threw away the server's `message` and
 * showed „ვერ მოხერხდა — სცადე თავიდან.". There was no way, from inside the
 * form, to discover that the NAME was the problem. The applicant retries, then
 * leaves. That is the apply funnel's worst possible failure: a wall with no
 * sign on it.
 *
 * TWO RULES, and everything in this file follows from them:
 *
 *   1. THE CLIENT MUST BE STRICTER THAN THE SERVER. Anything the form accepts,
 *      the API accepts. The server is the guard against a forged request, never
 *      the first place an honest applicant hears „no".
 *   2. EVERY refusal names the field AND says what fixes it. A validator that
 *      only produces „არასწორია" moves the work to the applicant.
 *
 * So the rules live here once, as functions that return the sentence the
 * applicant reads — the form calls them per step, the zod schema calls the SAME
 * functions through `refine()`, and the 400 body carries `{ field, message }`
 * so the form can jump to the offending field even on a step the user has left.
 *
 * Pinned by tests/applyValidation.test.ts.
 */
import { checkGeorgian, georgianError } from './georgianText'
import { phoneFormatError } from './phone'
import { extractYouTubeId } from './youtube'

/** Every bound the application is judged by. Two numbers, one place. */
export const APPLY = {
  NAME_MIN: 2,
  /** A name is a name. The column was unbounded before 2026-08-06. */
  NAME_MAX: 120,
  SPECIALTY_MIN: 2,
  SPECIALTY_MAX: 200,
  /** „my field isn't listed" — a NAME for a sphere, not a description of one.
   *  Same ceiling the headline uses; anything longer is a sentence. */
  OTHER_CAT_MAX: 60,
  /** What the FORM asks for. */
  BIO_MIN: 40,
  /** What the API has always accepted — deliberately the looser of the two. */
  BIO_MIN_API: 20,
  BIO_MAX: 2000,
  PRICE_MIN: 10,
  PRICE_MAX: 5000,
  YEARS_MAX: 80,
  PHONE_MAX: 40,
  URL_MAX: 500,
} as const

/** Server field name → the words the applicant sees on the form. */
export const APPLY_FIELD_LABEL: Record<string, string> = {
  fullName: 'სახელი და გვარი',
  specialty: 'სფერო',
  motivation: 'მოკლე აღწერა',
  hourlyRate: 'ფასი',
  yearsExp: 'გამოცდილება',
  phone: 'ტელეფონი',
  city: 'ქალაქი',
  linkedinUrl: 'LinkedIn',
  websiteUrl: 'ვებგვერდი',
  introVideoUrl: 'ვიდეოგაცნობის ბმული',
  certificates: 'დოკუმენტი',
}

/* ───────────────────────── the rules ─────────────────────────
 * Each returns the sentence to show, or null when the value is fine.
 * Empty is fine for every OPTIONAL field — required-ness is the form's job,
 * stated once per field, not smuggled in here. */

export function nameError(raw: string): string | null {
  const v = (raw ?? '').trim()
  if (v.length < APPLY.NAME_MIN) return 'შეავსე სახელი და გვარი.'
  if (v.length > APPLY.NAME_MAX) return `სახელი ძალიან გრძელია — მაქსიმუმ ${APPLY.NAME_MAX} სიმბოლო.`
  // The message names the fix and shows it, because this one usually fires on a
  // name the applicant did not type — it came from their Google account.
  if (!checkGeorgian(v).ok) {
    return 'სახელი და გვარი ქართულად ჩაწერე — მაგ. „ნინო ბერიძე“. საიტი ქართულენოვანია და სტუდენტები სწორედ ამ ჩანაწერს ხედავენ.'
  }
  return null
}

export function specialtyError(raw: string): string | null {
  const v = (raw ?? '').trim()
  if (v.length < APPLY.SPECIALTY_MIN) return 'აირჩიე სფერო.'
  if (v.length > APPLY.SPECIALTY_MAX) return `სფერო ძალიან გრძელია — მაქსიმუმ ${APPLY.SPECIALTY_MAX} სიმბოლო.`
  return null
}

/**
 * „ჩემი სფერო სიაში არ არის" — the applicant's own words. OPTIONAL: empty is
 * fine, because a tapped chip is the other complete answer (the form gates on
 * „one or the other", see ApplyClient.validateStep).
 *
 * Bounded and Georgian-checked for the same reason `specialty` is: this value
 * becomes `specialty` when no chip was picked, so it is read by the approval
 * matcher, printed in the moderation queue and aggregated in the admin. An
 * unbounded field that reaches all three is a field somebody will paste a
 * paragraph into.
 */
export function otherCatError(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (v.length < APPLY.SPECIALTY_MIN) return 'სფერო ერთი სიტყვით მაინც დაწერე.'
  if (v.length > APPLY.OTHER_CAT_MAX) {
    return `მოკლედ დაწერე — მაქსიმუმ ${APPLY.OTHER_CAT_MAX} სიმბოლო (ახლა ${v.length}). მაგ. „დიეტოლოგია“.`
  }
  return georgianError('სფერო', checkGeorgian(v))
}

/** `min` differs by side: the form asks 40, the API accepts 20. See APPLY. */
export function bioError(raw: string, min: number = APPLY.BIO_MIN): string | null {
  const v = (raw ?? '').trim()
  if (v.length < min) return `მოკლედ დაწერე, რაში ეხმარები — მინიმუმ ${min} სიმბოლო (ახლა ${v.length}).`
  if (v.length > APPLY.BIO_MAX) return `აღწერა ძალიან გრძელია — მაქსიმუმ ${APPLY.BIO_MAX} სიმბოლო (ახლა ${v.length}). დანარჩენს დამტკიცების შემდეგ, პროფილში დაამატებ.`
  return georgianError('აღწერა', checkGeorgian(v))
}

/** The one PAID service's price. 0 / missing means „no paid service yet". */
export function priceError(price: number): string | null {
  if (!Number.isFinite(price) || price <= 0) {
    return `საჭიროა ერთი ფასიანი სერვისი მაინც — მინიმალური ფასი ₾${APPLY.PRICE_MIN}.`
  }
  // The price input is type=number: „79.5" is reachable by typing, and the API
  // takes an integer. Left unchecked this 400s with the field never named.
  if (!Number.isInteger(price)) return 'ფასი მთელ რიცხვად ჩაწერე — მაგ. ₾80, არა ₾79.5.'
  if (price < APPLY.PRICE_MIN) return `მინიმალური ფასია ₾${APPLY.PRICE_MIN}.`
  if (price > APPLY.PRICE_MAX) return `ფასი ₾${APPLY.PRICE_MAX}-ზე მეტი ვერ იქნება.`
  return null
}

/** Optional. The form keeps it as a string, so this takes both. */
export function yearsError(raw: string | number | null | undefined): string | null {
  const v = String(raw ?? '').trim()
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 'გამოცდილება მთელი რიცხვით ჩაწერე — მაგ. 5.'
  if (n > APPLY.YEARS_MAX) return `გამოცდილება ${APPLY.YEARS_MAX} წელზე მეტი ვერ იქნება.`
  return null
}

/** Optional. `label` is what the applicant sees above the input. */
export function urlError(raw: string | null | undefined, label: string): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (v.length > APPLY.URL_MAX) return `${label} ძალიან გრძელია — მაქსიმუმ ${APPLY.URL_MAX} სიმბოლო.`
  return null
}

/** Optional — but if something IS pasted it must be a YouTube link we can parse. */
export function videoError(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (v.length > APPLY.URL_MAX) return 'ბმული ძალიან გრძელია — ჩასვი მოკლე YouTube-ის ბმული.'
  if (!extractYouTubeId(v)) {
    return 'YouTube-ის ბმული ვერ ამოვიცანით — ჩასვი მაგ. https://youtu.be/xxxxxxxxxxx, ან ველი ცარიელი დატოვე.'
  }
  return null
}

/**
 * REQUIRED on the application since 2026-08-10 (owner): the moderator phones the
 * applicant, and an application with no number is one they cannot act on. The
 * shape rule lives in lib/phone.ts, the same one signup uses, so a number
 * accepted on one screen is never refused on the next.
 */
export function phoneRequiredError(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (v.length > APPLY.PHONE_MAX) return `ტელეფონი ძალიან გრძელია — მაქსიმუმ ${APPLY.PHONE_MAX} სიმბოლო.`
  return phoneFormatError(v, { required: true })
}

/** The lenient sibling: empty is fine, anything typed must still be real. */
export function phoneError(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (v.length > APPLY.PHONE_MAX) return `ტელეფონი ძალიან გრძელია — მაქსიმუმ ${APPLY.PHONE_MAX} სიმბოლო.`
  return phoneFormatError(v)
}

/* ───────────────────── zod ↔ these rules ───────────────────── */

/**
 * Adapt a rule above into a zod `superRefine` callback, so the schema and the
 * form cannot state different rules. Kept structurally typed (no zod import)
 * so this module stays free of framework weight and testable on its own.
 */
export function refine<T>(rule: (v: T) => string | null) {
  return (value: T, ctx: { addIssue: (i: { code: 'custom'; message: string }) => void }) => {
    const msg = rule(value)
    if (msg) ctx.addIssue({ code: 'custom', message: msg })
  }
}

/** The last-resort sentence for a zod issue none of our rules produced. */
export function applyIssueMessage(field: string): string {
  const label = APPLY_FIELD_LABEL[field]
  return label
    ? `„${label}“ არასწორად არის შევსებული — შეამოწმე და სცადე თავიდან.`
    : 'ერთი ველი არასწორად არის შევსებული — შეამოწმე ფორმა და სცადე თავიდან.'
}

export type ApplyErrorCode = 'INVALID' | 'INVALID_TEXT' | 'INVALID_VIDEO_URL'
export type ApplyFailure = { code: ApplyErrorCode; field?: string; message: string }

/** Fields whose refusal already had its own code before this file existed. */
const FIELD_CODE: Record<string, ApplyErrorCode> = { introVideoUrl: 'INVALID_VIDEO_URL' }

/**
 * Turn a zod failure into the 400 body: a CODE (stable, comparable across
 * copy rewrites — the funnel reads it), the FIELD, and the SENTENCE.
 *
 * Our own rules come through as `custom` issues carrying a Georgian message, so
 * they are preferred over zod's English ones; anything else falls back to a
 * sentence that at least names the field.
 */
export function applyValidationFailure(err: {
  issues: readonly { code: string; message: string; path: readonly PropertyKey[] }[]
}): ApplyFailure {
  const issues = err.issues ?? []
  const ours = issues.find(i => i.code === 'custom' && /[Ⴀ-ჿᲐ-Ჿ]/.test(i.message))
  const issue = ours ?? issues[0]
  const field = issue?.path?.length ? String(issue.path[0]) : undefined
  const code: ApplyErrorCode = (field ? FIELD_CODE[field] : undefined) ?? (ours ? 'INVALID_TEXT' : 'INVALID')
  return { code, field, message: ours ? ours.message : applyIssueMessage(field ?? '') }
}
