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
export function sanitizePhoneInput(raw: string): string {
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
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  className?: string
  placeholder?: string
  autoFocus?: boolean
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
      value={value}
      onChange={e => onChange(sanitizePhoneInput(e.target.value))}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className}
    />
  )
}

/** What gets sent to the API — the stored shape, not what was typed. */
export const phoneForSubmit = normalizePhone
