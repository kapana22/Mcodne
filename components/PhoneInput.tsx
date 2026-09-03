'use client'
// THE phone input. Every form that asks for a number uses this one, so the
// keyboard, the autofill hint and what the field will even accept are decided
// once — the same reason lib/phone.ts holds the rule.
//
// It FILTERS rather than blocks: letters simply never appear, but a pasted
// „+995 (555) 12-34-56" survives intact. Blocking the paste instead would be
// the hostile version of the same idea — the user cannot see why nothing
// happened, and the number in their clipboard is the correct one.
//
// `type="tel"` + `inputMode="tel"` is what puts a phone keypad on a phone.
// Without it Android and iOS open the full QWERTY keyboard for a field that can
// only hold digits.

import { normalizePhone } from '@/lib/phone'

/** Digits, one leading +, and the separators people type. Nothing else. */
function sanitizePhoneInput(raw: string): string {
  const plus = raw.trimStart().startsWith('+')
  const rest = raw.replace(/[^\d]/g, '')
  return (plus ? '+' : '') + rest
}

export function PhoneInput({
  value,
  onChange,
  id,
  className = '',
  placeholder = '5XX XX XX XX',
  autoFocus,
  required,
  field,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  className?: string
  placeholder?: string
  autoFocus?: boolean
  /** The per-field error wiring from components/FieldError — `data-fault`,
   *  `aria-invalid`, `aria-describedby`. Spread onto the real <input> so THE
   *  phone field can be the one at fault like any other control, and so a
   *  screen reader is told which box „ნომერი არასწორია" is about. Optional:
   *  screens that report no per-field errors pass nothing and are unchanged. */
  field?: Record<string, unknown>
  /** ⚠️ Where the server already demands one. The request intake's zod bound
   *  (lib/requests → ServiceRequestInput.phone, `required: true`) rejects an
   *  empty number, so without this the only way to learn the field was needed
   *  was to press send and be handed an error for a field two scrolls up. The
   *  browser says it at the field, before the round trip. */
  required?: boolean
}) {
  return (
    <input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      autoCapitalize="none"
      spellCheck={false}
      // 40 matches APPLY.PHONE_MAX and the signup route's zod bound, so the
      // field cannot hold a value the server will reject on length alone.
      maxLength={40}
      required={required}
      value={value}
      onChange={e => onChange(sanitizePhoneInput(e.target.value))}
      placeholder={placeholder}
      autoFocus={autoFocus}
      {...field}
      className={className}
    />
  )
}

/** What gets sent to the API — the stored shape, not what was typed. */
const phoneForSubmit = normalizePhone
