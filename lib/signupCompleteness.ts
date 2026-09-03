// WHAT IS STILL MISSING FROM A REGISTRATION FORM — one answer, used twice.
//
// ⚠️ WRITTEN 2026-08-31 BECAUSE THE TWO USES HAD DRIFTED APART. Each signup
// form on /signup stated its own completeness THREE times: once in the submit
// button's `disabled={…}`, once in the condition that decides whether to show
// the grey-button hint, and once again in the nested ternary that picks the
// hint's sentence. The phone box is required — `app/api/auth/signup` parses
// `phone: z.string().min(1)` and runs `phoneFormatError(phone, { required:
// true })`, and each form's own `submit` refuses an empty one — but it was
// named in NONE of the three. So a person who filled everything except the
// phone watched the button turn green and the hint disappear, pressed it, and
// was handed an error for a field the form had just told them was fine.
//
// Three copies of a rule are three chances to forget a field. This is the one
// copy: the button asks it, the hint prints its sentence, and a test can walk
// every field without rendering anything.
//
// ⚠️ PRESENCE ONLY — this is not the validator. Whether an address is shaped
// like an address, whether a name is Georgian, whether a number is a Georgian
// mobile: those live in lib/emailRule, lib/name and lib/phone, and each form's
// `submit` runs them on press. This answers the narrower question the BUTTON
// needs — „has the person typed anything here yet" — and it must stay narrow,
// because a rule that greys the button out cannot explain itself as precisely
// as a message attached to the field can.

import { PWD_MIN } from './passwordPolicy'

export type SignupShape = {
  first: string
  /** The provider form has a surname box and the client form does not — one
   *  name is what /signup asks a client for. `undefined` means „this form has
   *  no such field", which is not the same as „it is empty". */
  last?: string
  email: string
  phone: string
  pw: string
  agree: boolean
}

/** The logical field names, in the order the forms ask for them. `agree` is
 *  the consent line rather than a box, and it is last on both forms. */
export type SignupField = 'first' | 'last' | 'email' | 'phone' | 'password' | 'agree'

export type SignupGap = { field: SignupField; message: string }

/** The FIRST thing still missing, or null when the form may be submitted.
 *
 *  The order is the order the eye travels down the form, which is also the
 *  order each `submit` checks in — so the sentence under a grey button names
 *  the same field the press would have complained about. */
export function firstMissing(f: SignupShape): SignupGap | null {
  if (!f.first.trim()) return { field: 'first', message: 'შეიყვანე სახელი' }
  // The client form sends ONE name and the route requires ≥2 characters of it
  // (`fullName`), so a single letter is refused there; the provider form spends
  // that check on the surname box instead.
  if (f.last === undefined && f.first.trim().length < 2)
    return { field: 'first', message: 'სახელი — მინიმუმ 2 სიმბოლო' }
  if (f.last !== undefined && !f.last.trim()) return { field: 'last', message: 'შეიყვანე გვარი' }
  if (!f.email.trim()) return { field: 'email', message: 'შეიყვანე ელფოსტა' }
  if (!f.phone.trim()) return { field: 'phone', message: 'შეიყვანე ტელეფონი' }
  // The floor only. `passwordError` states the ceiling too and says so at the
  // field; a button cannot.
  if (f.pw.length < PWD_MIN) return { field: 'password', message: `პაროლი — მინიმუმ ${PWD_MIN} სიმბოლო` }
  if (!f.agree) return { field: 'agree', message: 'დაეთანხმე წესებს გასაგრძელებლად' }
  return null
}
