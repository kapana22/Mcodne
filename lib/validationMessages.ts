import { SHARED_INVALID } from '@/lib/actionErrors'
// One safe boundary for schema-validation copy.
// Zod's built-in messages are English (most visibly "Invalid input"). A
// schema may intentionally omit a custom message for a structural check, but
// that must never leak implementation text into a Georgian product UI.

type Issue = { message?: unknown; code?: unknown; path?: unknown }

// ⚠️ A FIELD WITH NO LABEL HERE FALLS BACK TO „შეავსე ველები სწორად." — which
// names nothing, on a form with eight boxes. Four keys were added on
// 2026-08-31 for exactly that reason: /business refuses a `taxId` under four
// characters (BusinessLeadInput, `min(4)`) and could only say „შეავსეთ ველები
// სწორად."; the request intake's `description` and `format` are in the same
// position. If you add a field to a schema, add its word here.
const FIELD_LABELS: Record<string, string> = {
  fullName: 'სახელი და გვარი', companyName: 'კომპანიის სახელი', contactName: 'საკონტაქტო პირის სახელი', name: 'სახელი',
  email: 'ელფოსტა', phone: 'ტელეფონის ნომერი', password: 'პაროლი', currentPassword: 'მიმდინარე პაროლი',
  newPassword: 'ახალი პაროლი', confirmPassword: 'პაროლის გამეორება', message: 'შეტყობინება', about: 'აღწერა',
  services: 'სერვისი', areas: 'ქალაქი', city: 'ქალაქი', topic: 'თემა', timing: 'ვადა', budgetBand: 'ბიუჯეტი',
  priceGel: 'ფასი', priceKind: 'ფასის ტიპი', daysEstimate: 'ვადა', kind: 'ტიპი',
  // The word the offer form already prints over this box — nothing new.
  priceIncludes: 'რას მოიცავს ფასი',
  taxId: 'საიდენტიფიკაციო კოდი', interest: 'მიმართულება', description: 'დეტალები', format: 'ფორმატი',
  // Each of these four is the word ALREADY PRINTED beside its control — the
  // provider door's „გამოძახების ფასი" aria-label and its „სამუშაოს ფოტოები"
  // and photo block titles, the editor's „სამუშაო, ₾-დან". Nothing here is new
  // copy; a refusal simply says what the screen already calls the box.
  calloutFee: 'გამოძახების ფასი', priceFrom: 'სამუშაო, ₾-დან',
  photoUrl: 'ფოტო', workPhotos: 'სამუშაოს ფოტოები', priceList: 'ფასი',
}

const HAS_GEORGIAN = /[\u10A0-\u10FF]/

/** Replaces absent/default English Zod text with a field-aware Georgian cue. */
export function validationIssueMessage(issue: Issue | null | undefined, fallback = SHARED_INVALID): string {
  const original = typeof issue?.message === 'string' ? issue.message.trim() : ''
  if (original && HAS_GEORGIAN.test(original)) return original

  const firstPath = Array.isArray(issue?.path) && typeof issue.path[0] === 'string' ? issue.path[0] : ''
  const field = FIELD_LABELS[firstPath] ?? ''
  if (!field) return fallback
  if (issue?.code === 'too_small') return `${field} შეავსე სრულად.`
  if (issue?.code === 'too_big') return `${field} ძალიან გრძელია.`
  return `${field} არასწორია.`
}
