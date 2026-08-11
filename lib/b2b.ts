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

import { B2B_VISIBILITY, type B2BVisibility } from '@/lib/flags'

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
export type PaymentSourceName = 'CARD' | 'COMPANY_BALANCE'
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
