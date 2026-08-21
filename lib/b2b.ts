// The B2B vertical — one file, every rule about it.
//
// Same shape and the same reasoning as lib/abroad.ts and lib/packages.ts: pure
// data and pure functions, NO prisma and NO react, so a server page, a client
// component and an API route can all import from here and a rule stated once
// cannot drift into three versions. The rollout stage lives in lib/flags.ts;
// this file says what it MEANS.
//
// WHAT THE VERTICAL IS. A company pays us by some route we do not model, an
// admin types the amount onto `Company.balance` by hand, and employees who are
// `CompanyMember`s of that company can spend it on ordinary bookings. Every
// movement of that number is a `CompanyTransaction` row. See
// prisma/schema.prisma → the B2B block.
//
// A BOOKING PAID FROM A BALANCE IS AN ORDINARY BOOKING. It carries
// `paidBy = COMPANY_BALANCE` and nothing else about it differs — reschedule,
// cancel, the video room, messages, reminders, no-show, disputes and the .ics
// feed all keep working with no new code, exactly as `enrollmentId` did for
// packages. There is deliberately no second booking system to maintain.

import { z } from 'zod'
import { B2B_VISIBILITY, type B2BVisibility } from '@/lib/flags'
import { normalizePhone, phoneFormatError } from '@/lib/phone'

/** The route the whole vertical lives on. */
export const B2B_ROUTE = '/business'

/**
 * The decision itself, with the stage passed IN.
 *
 * ⚠️ NOT FOR CALL SITES — use `canSeeB2B` below. This exists split out for one
 * reason: a gate that closes over a module constant can only ever be tested at
 * whichever stage the repository happens to be on. That is a real blind spot,
 * not a theoretical one — the vertical spends its whole life at 'off', so the
 * 'admin' and 'public' branches would ship having never once been executed, and
 * the day somebody flips the flag is the day they run for the first time.
 * Taking the stage as an argument lets tests/b2b.test.ts check all nine
 * (stage × viewer) combinations for real.
 *
 * Anything that passes something other than B2B_VISIBILITY here in application
 * code has invented a second switch — which is the one thing lib/flags.ts asks
 * nobody to do.
 */
export function b2bVisibleTo(visibility: B2BVisibility, role: string | null | undefined): boolean {
  switch (visibility) {
    case 'off':
      return false
    case 'admin':
      return role === 'ADMIN'
    case 'public':
      return true
  }
}

/**
 * Who may see any B2B surface right now.
 *
 * The ONLY place B2B_VISIBILITY is interpreted. Call sites ask this question
 * and never compare the constant themselves, so „is it on?" cannot develop two
 * different answers.
 *
 * Takes the viewer's role (or null/undefined when signed out) rather than a
 * whole user, so it is usable from a server page, an API route and a client
 * component alike. A plain `string` and not the Prisma `Role` enum for the same
 * reason canSeePackages does it: this file must stay importable from a client
 * component without dragging @prisma/client into the browser bundle.
 */
export function canSeeB2B(role: string | null | undefined): boolean {
  return b2bVisibleTo(B2B_VISIBILITY, role)
}

/**
 * May THIS PERSON spend a balance they are a member of?
 *
 * ⚠️ NOT `canSeeB2B`, and the difference is the whole reason this function
 * exists. It was `canSeeB2B` and the feature was unusable — found by driving
 * the real flow end-to-end against production, 2026-08-11:
 *
 *   at stage 'admin', canSeeB2B('STUDENT') is false, so an employee could not
 *   spend their company's balance … and canSeeB2B('ADMIN') is true but
 *   POST /api/bookings refuses role ADMIN outright. There was NO account that
 *   could complete the flow. The booking silently fell back to card, which is
 *   worse than an error: the balance was never charged and nothing said so.
 *
 * The fix is not another stage. It is noticing that MEMBERSHIP IS ITSELF THE
 * ALLOWLIST — an admin adds a named person to a named company by hand, and
 * nobody else has anything to spend. Gating that on the rollout stage asks the
 * same question twice and gets a wrong answer the second time.
 *
 * So the stage gates what it is for — who may SEE the vertical: the landing
 * page, the admin tab, the admin APIs. Spending is gated by being a member,
 * which is checked where it must be anyway: claimed inside the booking
 * transaction, against the database.
 *
 * A non-member calling a member-facing endpoint learns nothing either way —
 * they get „you have no company", which is true for them at every stage.
 */
export function canSpendAsMember(): boolean {
  return b2bFeatureExists()
}

/**
 * True when this deployment knows the feature exists at all.
 *
 * Separate from canSeeB2B on purpose, and it is NOT „canSeeB2B for admins".
 * canSeeB2B answers „may THIS person open a B2B surface"; this answers „should
 * an admin-only control be rendered at all". They come apart at the 'public'
 * stage, where every visitor can see the landing page but the balance controls
 * stay admin-only — that separation is enforced by requireRoleApi on the route,
 * never by this function.
 */
export function b2bFeatureExists(): boolean {
  return B2B_VISIBILITY !== 'off'
}

/**
 * Where a booking's money came from.
 *
 * ⚠️ THE ONE READER OF `Booking.paidBy`, and the reason it exists as a
 * function. The column is nullable with no default and was never backfilled:
 * every booking created before 2026-08-11 has `null`, and `null` MEANS 'CARD'.
 * A call site that reads the column directly gets `null` for the entire history
 * of the platform and has to remember that fact — which is precisely the kind
 * of thing that gets remembered in four places and forgotten in the fifth.
 *
 * Returns the string form rather than the Prisma enum so this file stays
 * client-safe; the two are the same values.
 */
type PaymentSourceName = 'CARD' | 'COMPANY_BALANCE'
export function paymentSourceOf(paidBy: string | null | undefined): PaymentSourceName {
  return paidBy === 'COMPANY_BALANCE' ? 'COMPANY_BALANCE' : 'CARD'
}

/** True when this booking spent a company balance. Sugar over the above, so a
 *  reader never has to compare enum strings inline. */
export function isBalancePaid(paidBy: string | null | undefined): boolean {
  return paymentSourceOf(paidBy) === 'COMPANY_BALANCE'
}

/**
 * May this company spend right now?
 *
 * ⚠️ THIS IS NOT A GUARD, AND IT MUST NEVER BE USED AS ONE. It answers „should
 * the balance option be OFFERED", i.e. it decides what the booking flow draws.
 * The actual spend is claimed conditionally inside the booking transaction
 * (`updateMany` with `balance: { gte: price }` + `count !== 1 → 409`), because
 * a check you read before the write loses to a second tab — the rule in
 * CLAUDE.md, and here losing it means overdrawing somebody's real money.
 *
 * Kept as a pure function anyway so the UI and the server agree on what
 * „spendable" means: ACTIVE, and enough on the balance for THIS price.
 */
export function canSpendBalance(
  company: { status: string; balance: number } | null | undefined,
  priceGel: number,
): boolean {
  if (!company) return false
  if (company.status !== 'ACTIVE') return false
  return company.balance >= priceGel
}

/* ── the /business enquiry form ──────────────────────────────────────────── */

/**
 * ONE schema, parsed on both sides.
 *
 * The form validates with it so the person is told before they submit, and
 * POST /api/business/lead parses the request body with the SAME object so a
 * crafted POST is judged identically. Two hand-written copies of „what is a
 * valid lead" is how a field ends up accepted by the browser and rejected by
 * the server — the shape this codebase already got bitten by twice, where a zod
 * ceiling sized for a URL silently rejected a real upload.
 *
 * ⚠️ CEILINGS ARE SIZED FOR WHAT PEOPLE ACTUALLY TYPE, not for tidiness. The
 * message ceiling matches /api/contact's 4000 exactly: a company describing
 * what it needs writes at least as much as someone asking a support question.
 */
export const BusinessLeadInput = z.object({
  companyName: z.string().trim().min(2).max(160),
  // Optional: an admin may be handed the identification code later, and
  // refusing the whole enquiry over a number the person does not have in front
  // of them costs a customer to gain nothing.
  //
  // Deliberately NOT „9 or 11 Georgian digits". A company registered abroad has
  // a different format entirely, and this form's whole audience is companies —
  // including the ones a Georgian marketplace most wants to hear from. Same
  // reasoning as lib/phone's refusal to be +995-only.
  taxId: z.string().trim().min(4).max(32).optional().or(z.literal('')),
  contactName: z.string().trim().min(2).max(120),
  // Judged by THE phone rule (lib/phone), the same one signup, /apply and the
  // profile editor use — so a number accepted here cannot fail on the next
  // screen that asks for it.
  phone: z.string().trim().refine(v => phoneFormatError(v, { required: true }) === null, {
    message: 'ნომერი არასწორია',
  }),
  email: z.string().trim().email().max(200),
  interest: z.string().trim().max(200).optional().or(z.literal('')),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
  // Which service card they came from. Optional: the general form at the bottom
  // of the page still exists, and a request that names no service is a real
  // enquiry rather than a malformed one. Validity of the id is the server's
  // business — an unknown one is dropped rather than rejected, for the same
  // reason a malformed alternate never costs a booking.
  serviceId: z.string().trim().max(40).optional().or(z.literal('')),
})
export type BusinessLeadInput = z.infer<typeof BusinessLeadInput>

/**
 * The row to write, from a parsed lead.
 *
 * Empty optional strings become `null` rather than `''`. A column holding an
 * empty string reads as „they answered, with nothing", which is a different
 * fact from „they did not answer" — and the admin list has to tell them apart
 * to know whether there is anything left to ask.
 */
export function businessLeadRow(input: BusinessLeadInput) {
  const blank = (v: string | undefined) => {
    const t = (v ?? '').trim()
    return t === '' ? null : t
  }
  return {
    companyName: input.companyName.trim(),
    taxId: blank(input.taxId),
    contactName: input.contactName.trim(),
    // Stored normalised (digits + one leading +) so two people typing the same
    // number two ways produce one value an admin can actually dial or search.
    phone: normalizePhone(input.phone),
    email: input.email.trim().toLowerCase(),
    interest: blank(input.interest),
    message: blank(input.message),
  }
}

/* ═══════════ WHAT WE SELL, ON TWO AXES ═══════════════════════════════════
 *
 * The offer is „a consultation or a training, in business or sales or
 * something else" (owner, 2026-08-12). That is TWO questions, and the catalogue
 * used to have one field for both: production held „HR", „იურიდიული" and
 * „ფინანსური" — areas — sitting in the same column as „ტრენინგები", a kind. So
 * „a sales training" could be filed under its kind or under its area, never
 * both, and /business grouped them as though they were the same axis.
 *
 *   kind      — CONSULTATION | TRAINING. What we do.
 *   direction — the AREA. What it is about. Free text, the owner's words.
 *
 * The page leads with KIND because that is the question a company answers
 * first, and shows the area beside each row.
 */
export const B2B_KINDS = ['CONSULTATION', 'TRAINING'] as const
type B2BKind = (typeof B2B_KINDS)[number]

/** Its Georgian name. One place, so the page and the admin never disagree. */
export function kindLabel(kind: string): string {
  return kind === 'TRAINING' ? 'ტრენინგი' : 'კონსულტაცია'
}

/** Anything unrecognised reads as a consultation — the safe default, and the
 *  same one the column carries, so a row can never fall out of the page. */
function normalizeKind(kind: string | null | undefined): B2BKind {
  return kind === 'TRAINING' ? 'TRAINING' : 'CONSULTATION'
}

/**
 * Does this row's AREA merely restate its KIND?
 *
 * Rows written before the split said „training" the only way the model let
 * them: in `direction`. The backfill can read the kind back out of that, but it
 * cannot invent the area that was never recorded — so „გაყიდვების ტრენინგი"
 * still sits in direction „ტრენინგები" until the owner re-files it, and the
 * page would print „ტრენინგი · ტრენინგები": a chip that repeats the heading
 * above it and says nothing.
 *
 * So the page asks this before showing the chip, and the count of areas asks it
 * before counting one. Nothing is rewritten in the database on a guess — the
 * row keeps saying what it says, the page just declines to repeat itself.
 */
export function areaRestatesKind(kind: string | null | undefined, direction: string): boolean {
  const d = direction.trim().toLowerCase()
  if (!d) return true
  return normalizeKind(kind) === 'TRAINING'
    ? d.startsWith('ტრენინგ')
    : d.startsWith('კონსულტაცი')
}

/** Services split by kind, in the order the page renders them: consultations
 *  first, then trainings, each keeping the admin's `direction`/`order` sort.
 *  A kind with nothing in it is omitted rather than rendered empty. */
export function groupByKind<T extends { id: string; kind?: string | null; direction: string; order: number }>(rows: T[]) {
  return B2B_KINDS
    .map(k => [k, rows.filter(r => normalizeKind(r.kind) === k)] as const)
    .filter(([, list]) => list.length > 0)
    .map(([k, list]) => [
      k,
      // `id` is the final tiebreaker for the same reason the query carries one:
      // two services with the same area and the same `order` must not trade
      // places just because one of them was edited.
      [...list].sort((a, b) =>
        a.direction.localeCompare(b.direction, 'ka') || a.order - b.order || a.id.localeCompare(b.id)),
    ] as [B2BKind, T[]])
}

/** Services grouped by direction, in the order the page renders them. */
export function groupByDirection<T extends { direction: string; order: number }>(rows: T[]) {
  const out = new Map<string, T[]>()
  for (const r of rows) out.set(r.direction, [...(out.get(r.direction) ?? []), r])
  for (const list of out.values()) list.sort((a, b) => a.order - b.order)
  return [...out.entries()]
}

/** „800₾" or „ფასი შეთანხმებით" — one place, so the page and the admin agree. */
export function servicePriceLabel(s: { priceGel: number; priceOnRequest: boolean }): string {
  return s.priceOnRequest ? 'ფასი შეთანხმებით' : `${s.priceGel.toLocaleString('en-US')}₾`
}
