// THE PASSWORD RULE. One number, one sentence, and every form and every route
// reads them from here.
//
// ⚠️ WHY THIS FILE EXISTS. `min(8)` was typed out in five routes
// (/api/auth/signup, /api/auth/reset/confirm, /api/me/password, /api/me PATCH)
// and `pw.length < 8` in seven client files, with the copy („პაროლი მინიმუმ 8
// სიმბოლო") retyped beside each one. Two of those copies had already drifted:
//
//   • /me/profile refused under SIX characters and said so, while
//     /api/me/password's zod is min(8) — a 7-character password passed the
//     client and came back INVALID with no explanation. Fixed 2026-08-31 with a
//     local `MIN_PASSWORD = 8`, which was the right fix at the wrong scope.
//   • `app/work/profile/_types.ts` grew PWD_MIN for /work/account for the same
//     reason, so the site then had TWO single-sources-of-truth.
//
// A number with two homes is a number that will differ again. It lives in lib/
// now — importable by a route, a client component and a test alike — and
// `app/work/profile/_types.ts` re-exports it so the provider space keeps its
// existing import path.
//
// No react, no prisma — importable by a route, a client component and a test
// alike. `tests/formValidation.test.ts` executes it against both halves.

import { z } from 'zod'

/** Floor. Anything shorter is refused by every route that takes a password. */
export const PWD_MIN = 8
/** Ceiling. bcrypt truncates at 72 bytes anyway; 120 is the schemas' `.max()`. */
export const PWD_MAX = 120

/** The one sentence a person is shown when the password is too short. */
export const PWD_MIN_MSG = 'პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო'
/** …and when it is absurdly long. Rare, but a silent refusal is not an option. */
export const PWD_MAX_MSG = 'პაროლი ძალიან გრძელია'

/**
 * `null` when the value is acceptable, otherwise the message to show.
 *
 * The SAME shape as `phoneFormatError` in lib/phone, deliberately: the two
 * rules are asked the same way at every call site, so neither can be applied
 * as „is it truthy" by mistake.
 *
 * Deliberately NOT a strength test. The signup screen's StrengthBar rewards an
 * uppercase letter, a digit and a symbol, and the reset screen prints the same
 * four lines — but none of those is ENFORCED anywhere on the server, and a
 * client rule the server does not have is a refusal the server would have
 * accepted. They stay guidance; length is the rule.
 */
export function passwordError(value: string | null | undefined): string | null {
  const v = value ?? ''
  if (v.length < PWD_MIN) return PWD_MIN_MSG
  if (v.length > PWD_MAX) return PWD_MAX_MSG
  return null
}

/* ═══════════ THE BODY, NOT JUST THE NUMBER ══════════════════════════════
 *
 * ⚠️ THE FIELD NAMES WERE THE BUG, NOT THE LENGTH (2026-08-31).
 * app/work/account posted `{ current, next }` to POST /api/me/password, which
 * parses `{ currentPassword, newPassword }`. Every submit therefore failed zod
 * on two MISSING keys, returned 400 INVALID — and the screen translated INVALID
 * into „პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო". A provider typing a good sixteen-
 * character password was told, forever, that it was too short. Nothing about
 * that was visible to `tsc`: both objects are valid TypeScript.
 *
 * So the schema lives here and BOTH SIDES USE IT — exactly the rule lib/b2b's
 * header already states („valid is decided once, so a field cannot be accepted
 * by the browser and rejected by the server"). The client builds its body by
 * parsing it, which means a renamed key cannot reach the network, and
 * tests/formValidation executes it on the shape that shipped.
 */
export const PasswordChangeInput = z.object({
  // Only non-empty — it is checked against the stored hash, not against policy.
  // A password created before a rule tightened must still be usable to change.
  currentPassword: z.string().min(1),
  // The new one meets the SAME policy as signup and reset, so the change
  // endpoint cannot be used to downgrade to a weaker password.
  newPassword: z.string().min(PWD_MIN).max(PWD_MAX),
})
export type PasswordChangeInput = z.infer<typeof PasswordChangeInput>
