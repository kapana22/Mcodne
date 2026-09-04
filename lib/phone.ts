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

/**
 * The `tel:` value for a number we hold, or null when there is nothing to dial.
 *
 * ⚠️ E.164 FOR A GEORGIAN MOBILE, VERBATIM FOR EVERYTHING ELSE. „555 12 34 56"
 * dials from a Georgian handset and from nowhere else, so the +995 goes in —
 * it costs nothing and is the difference between a client abroad reaching their
 * provider and hearing a dead tone. Anything that is NOT a Georgian mobile is
 * handed back as it was normalised rather than rejected: a landline or a
 * foreign number is still a number somebody meant to be called, and guessing a
 * country code onto it would dial the wrong one.
 *
 * Null only for an empty value — a button with no destination is not drawn.
 */
export function telHref(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw)
  if (!n) return null
  if (!isGeorgianMobile(n)) return `tel:${n}`
  const local = n.startsWith('+995') ? n.slice(4) : n.startsWith('995') ? n.slice(3) : n
  return `tel:+995${local}`
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
  if (!v) return required ? 'შეიყვანე ტელეფონის ნომერი' : null

  if (isGeorgianMobile(v)) return null

  // Anything not Georgian must carry its country code, or we cannot dial it.
  // E.164 allows up to 15 digits; below 8 nothing real exists.
  const digits = v.startsWith('+') ? v.slice(1) : ''
  if (!digits || digits.length < 8 || digits.length > 15) return 'ნომერი არასწორია'
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

/**
 * THE ONE SHAPE A NUMBER IS STORED AND COMPARED IN — „+995555123456".
 *
 * ⚠️ IT EXISTS BECAUSE THE SAME PHONE WAS STORED THREE WAYS. `normalizePhone`
 * strips punctuation and stops there, so „555123456", „995555123456" and
 * „+995555123456" are one person's number in three rows that no `findUnique`
 * can join. lib/sms carries `phoneVariants` — a three-element `IN` list — for
 * exactly that reason, and a lookup list is a workable answer for a cutoff
 * check and an impossible one for a UNIQUE INDEX.
 *
 * Since 2026-09-04 a phone is a CREDENTIAL (a code sent to it signs somebody
 * in), and a credential that three strings can spell is not one. Everything
 * that writes a phone writes this; the partial unique index in lib/dbBoot
 * enforces it for verified numbers.
 *
 * Non-Georgian numbers pass through as `normalizePhone` left them: they already
 * carry their country code (phoneFormatError refuses them otherwise) and
 * guessing one onto them would dial the wrong country.
 */
export function canonicalPhone(raw: string | null | undefined): string {
  const v = normalizePhone(raw)
  if (!v) return ''
  if (!isGeorgianMobile(v)) return v
  return `+995${v.replace(/^\+?995/, '')}`
}
