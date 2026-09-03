// /settings — shapes shared by the page and its section components.
import { ROLE } from '@/lib/roles'

/** The success/error line every settings card renders under its form.
 *
 *  ⚠️ IT IS NO LONGER THE ONLY PLACE A REFUSAL LANDS (2026-08-31). A card with
 *  four boxes answering „შენახვა ვერ მოხერხდა" under all of them named nothing;
 *  each section now takes a `fault` (components/FieldError) and puts the
 *  sentence on the control. This line stays for what has NO field — a rate
 *  limit, a dropped network, an upload that was too large. */
export type Msg = { kind: 'success' | 'error'; text: string } | null

/** What a settings section needs to draw a per-field refusal. Shaped as the
 *  return of `useFault` so a section can spread it straight onto a control. */
export type FaultKit = ReturnType<typeof import('@/components/FieldError').useFault>

export type PrefKey = 'MESSAGE_NEW' | 'REVIEW_NEW' | 'APPLICATION_STATUS' | 'ADMIN_BROADCAST'
export type PrefsMap = Record<PrefKey, boolean>
export const DEFAULT_PREFS: PrefsMap = {
  MESSAGE_NEW: true,
  REVIEW_NEW: true,
  APPLICATION_STATUS: true,
  ADMIN_BROADCAST: true,
}
/* The same pref KEY means different things to the two sides, so the copy is
   derived from the viewer's role — it used to be hardcoded tutor-side and a
   student was told „კლიენტმა შეგაფასა" about a notification they get when an
   EXPERT replies to their review (see app/api/reviews/[bookingId] vs
   app/api/reviews). Keys never change; only the wording does. */
export const prefRows = (role: Me['role'] | null | undefined): Array<{ key: PrefKey; label: string; hint: string }> => {
  const expert = role === ROLE.PROVIDER || role === 'ADMIN'
  return [
    // ⚠️ „ჯავშნის ცვლილება" WAS THE FIRST ROW AND IT GOVERNED NOTHING
    // (removed 2026-08-26). Its key was BOOKING_CREATED, and no booking
    // notification has been sent since the product went on 2026-08-24 — a
    // switch that changes nothing is worse than an absent one, because the
    // person believes they have turned something off. The row below now really
    // does control the chat pings it describes: lib/notify maps
    // REQUEST_MESSAGE onto MESSAGE_NEW.
    { key: 'MESSAGE_NEW',        label: 'ახალი შეტყობინება',     hint: 'ახალი ტექსტი მიმოწერაში' },
    expert
      ? { key: 'REVIEW_NEW' as const, label: 'ახალი შეფასება',      hint: 'კლიენტმა შეგაფასა' }
      : { key: 'REVIEW_NEW' as const, label: 'პასუხი შეფასებაზე',  hint: 'ექსპერტმა უპასუხა შენს შეფასებას' },
    expert
      ? { key: 'APPLICATION_STATUS' as const, label: 'განაცხადი და პროფილი', hint: 'განაცხადის პასუხი და პროფილის შეხსენებები' }
      : { key: 'APPLICATION_STATUS' as const, label: 'განაცხადის სტატუსი',   hint: 'პასუხი, თუ ექსპერტად განაცხადს გააკეთებ' },
    { key: 'ADMIN_BROADCAST',    label: 'პლატფორმის სიახლეები', hint: 'მნიშვნელოვანი განცხადებები' },
  ]
}

export type Me = {
  id: string
  email: string
  fullName: string
  role: 'USER' | 'PROVIDER' | 'ADMIN'
  avatarUrl?: string | null
  bio?: string | null
  phone?: string | null
  emailVerified?: boolean
  // False for SSO-only accounts (Google) — they have no usable password, so the
  // delete flow must not demand one.
  hasPassword?: boolean
}

