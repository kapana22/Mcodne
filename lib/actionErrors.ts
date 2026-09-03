// WHAT A FAILED ACTION SAYS, IN ONE PLACE.
//
// ⚠️ WHY THIS EXISTS (2026-09-02). Eight screens each carried their own
// `errText(code)` — a switch over the error codes their endpoint answers with —
// and every one of them ended in the same two or three cases:
//
//     case 'INVALID':    return 'შეავსე ველები სწორად.'
//     case 'NOT_FOUND':  return 'ვერ მოიძებნა.'
//     default:           return 'ვერ შესრულდა — სცადე თავიდან.'
//
// Measured that day across the tree: „შეავსე ველები სწორად." was typed in SIX
// files, „ვერ შესრულდა — სცადე თავიდან." in FIVE, „ვერ გაიგზავნა — სცადე
// თავიდან." in FOUR. Owner: „ერთი და იგივე კონტენტს ორი ფაილი რომ არ აკეთებდეს
// — შევამციროთ და სწორად დავხვეწოთ საიტი."
//
// The cost of that shape is not the duplication, it is what the duplication
// does next: a reworded sentence lands in one screen and the other five keep
// the old words, which is the same failure that let the home page advertise a
// lead at 1₾ while the ledger charged 3₾.
//
// ⚠️ AND IT DOES NOT FLATTEN THE SCREENS. Most of what those switches held is
// genuinely local — „უკვე მეტი შეთავაზებაა მიღებული", „ეს საიდენტიფიკაციო კოდი
// უკვე გამოყენებულია", „მიმოწერა დახურულია" — and a shared map holding every
// domain code of every screen would be a worse file than eight switches. So
// this module owns ONLY the codes that recur, each caller passes its own, and
// the caller's map WINS: `RequestChat` answers 'INVALID' with „შეტყობინება
// ცარიელია." because on that screen the only field is the message.

/** „the thing you pressed did not happen" — the default default. */
export const ACTION_FAILED = 'ვერ შესრულდა — სცადე თავიდან.'

/** The same fact for a SEND — a message, an offer, a request. Distinct from
 *  ACTION_FAILED because „ვერ შესრულდა" beside a Send button is vaguer than the
 *  screen can afford: the person wants to know whether it went. */
export const SEND_FAILED = 'ვერ გაიგზავნა — სცადე თავიდან.'

/**
 * Codes more than one screen answers, with the words they already used.
 *
 * ⚠️ NOTHING IS INVENTED HERE. Every sentence below is lifted verbatim from the
 * switches it replaces, so this change moves copy and does not write any.
 * A code that only one screen can produce does NOT belong here — pass it in the
 * caller's own map instead, where the reader of that screen can see it.
 */
/** Exported because `app/admin/_access` points two of its own codes at it —
 *  SUBJECT_MISSING and SUBJECT_KIND_MISMATCH are that endpoint's way of saying
 *  „the form is wrong", and re-typing the sentence to say so is the thing this
 *  module exists to stop. */
export const SHARED_INVALID = 'შეავსე ველები სწორად.'

const SHARED: Record<string, string> = {
  INVALID: SHARED_INVALID,
  NOT_FOUND: 'ვერ მოიძებნა.',
  USER_NOT_FOUND: 'ამ ელფოსტაზე ანგარიში არ არსებობს — ჯერ დარეგისტრირდეს.',
  RATE_LIMITED: 'ძალიან ბევრი მოთხოვნა — სცადე ცოტა ხანში.',
  CHANGED: 'ეს მოთხოვნა ახლახან შეიცვალა — განაახლე გვერდი.',
}

/**
 * The one resolver.
 *
 * @param code     what the endpoint answered with, or undefined for a network
 *                 failure — which is why `undefined` is a normal input and
 *                 returns the fallback rather than throwing.
 * @param own      this screen's own codes. Checked FIRST, so a screen can mean
 *                 something more precise by a shared code.
 * @param fallback what an unrecognised code says. `ACTION_FAILED` unless the
 *                 screen is a send, where `SEND_FAILED` reads truer.
 */
export function actionError(
  code: string | undefined,
  own: Record<string, string> = {},
  fallback: string = ACTION_FAILED,
): string {
  if (!code) return fallback
  return own[code] ?? SHARED[code] ?? fallback
}
