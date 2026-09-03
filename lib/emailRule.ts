// THE EMAIL RULE — the same judgement, on the form and in the route.
//
// ⚠️ WHY (2026-08-31). Every route that takes an address parses it with
// `z.string().email()`: signin, signup, reset/request, otp/send, otp/verify,
// contact. Not one FORM checked the format — they checked `!email`, an empty
// string — so a typo („ana@gmail" with no TLD) sailed past the client, came
// back as a bare 400, and the screens then guessed at a cause:
//
//   /signin  „პაროლი მინიმუმ 8 სიმბოლო"                  ← the password was fine
//   /signup  „შეავსე ყველა ველი (პაროლი მინიმუმ 8 სიმბოლო)"
//
// Both of those are FALSE STATEMENTS about a correct password, printed at
// somebody whose address is one character short. That is worse than silence:
// they retype the password, it fails again, and nothing on the screen ever
// mentions the field that is actually wrong.
//
// This wraps zod's own `.email()` rather than writing a regex, so „valid here"
// and „valid there" are the same function evaluating the same string — not two
// approximations that agree until the day they do not. `tests/formValidation`
// runs the schema the routes use and this helper over one list of addresses and
// asserts they never disagree.

import { z } from 'zod'

const Email = z.string().email()

/**
 * `null` when the address is acceptable, otherwise the message to show.
 *
 * Same shape as `phoneFormatError` (lib/phone) and `passwordError`
 * (lib/passwordPolicy), deliberately: the three rules are asked the same way at
 * every call site, so none can be applied as „is it truthy" by mistake.
 *
 * `required` is the caller's business, as it is for the phone. An empty box on
 * a screen that needs one is „you have not answered", which is a different
 * thing from „that is not an address" and deserves its own sentence.
 */
export function emailFormatError(
  raw: string | null | undefined,
  { required = true }: { required?: boolean } = {},
): string | null {
  const v = (raw ?? '').trim()
  if (!v) return required ? 'შეიყვანე ელფოსტა' : null
  return Email.safeParse(v).success ? null : 'ელფოსტა არასწორია'
}
