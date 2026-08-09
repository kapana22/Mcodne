// THE phone rule. One source for the signup form, the API, /apply and the
// profile editor — the same string must be judged the same way everywhere, or
// a number accepted at signup starts failing on the next screen that asks.
//
// Deliberately NOT Georgian-only. The diaspora vertical (lib/abroad) exists to
// serve clients and experts who are abroad, so a strict +995 check would lock
// out exactly the people that vertical was built for. Georgian mobiles get the
// precise rule; everything else has to be an international number.

/** Digits, plus a single leading `+`. Spaces, dashes, dots and parens are noise. */
export function normalizePhone(raw: string | null | undefined): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  const plus = v.startsWith('+')
  const digits = v.replace(/\D/g, '')
  return plus ? `+${digits}` : digits
}

/** A Georgian mobile: 9 digits starting with 5, with or without the +995. */
export function isGeorgianMobile(normalized: string): boolean {
  const local = normalized.startsWith('+995') ? normalized.slice(4)
    : normalized.startsWith('995') ? normalized.slice(3)
    : normalized
  return /^5\d{8}$/.test(local)
}

/**
 * `null` when the value is acceptable, otherwise the message to show.
 *
 * `required` is the caller's business: signup and the missing-phone prompt pass
 * true, /apply and the profile editor pass false (an empty field there means
 * „not provided", which is a different thing from „wrong").
 */
export function phoneFormatError(
  raw: string | null | undefined,
  { required = false }: { required?: boolean } = {},
): string | null {
  const v = normalizePhone(raw)
  if (!v) return required ? 'შეიყვანე ტელეფონის ნომერი.' : null

  if (isGeorgianMobile(v)) return null

  // Anything not Georgian must carry its country code, or we cannot dial it.
  if (!v.startsWith('+')) {
    return 'ქართული ნომერი უნდა იწყებოდეს 5-ით და იყოს 9 ციფრი. უცხოური ნომერი მიუთითე ქვეყნის კოდით, მაგ. +49…'
  }
  // E.164 allows up to 15 digits; below 8 nothing real exists.
  const digits = v.slice(1)
  if (digits.length < 8 || digits.length > 15) {
    return 'ნომერი არასწორია — ქვეყნის კოდთან ერთად 8-დან 15 ციფრამდე უნდა იყოს.'
  }
  return null
}

/** How the number is stored and shown: „+995 5XX XXX XXX" / „+49 30 1234567". */
export function formatPhone(raw: string | null | undefined): string {
  const v = normalizePhone(raw)
  if (!v) return ''
  if (isGeorgianMobile(v)) {
    const local = v.replace(/^\+?995/, '')
    return `+995 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
  }
  return v
}
