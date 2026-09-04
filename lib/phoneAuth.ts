// REGISTRATION AND SIGN-IN BY PHONE. The whole life of one code, in one file.
//
// Owner, 2026-09-04: „მე მინდა დავამატოთ მობილურით რეგისტრაცია." The shape
// chosen is the one every Georgian marketplace has already taught people —
// a number, a six-digit SMS, and no password ever.
//
// ⚠️ THERE IS ONE FLOW, NOT TWO. „Register" and „sign in" are the same three
// screens: the number, the code, and — only if no account came back — the name.
// That is not a shortcut, it is what stops the site announcing whether a phone
// number is registered. A form that answers „this number already has an
// account" hands a stranger a fact about somebody else for the price of typing
// nine digits; every response here is identical whether or not the number is
// known, right up to the moment the code is answered by the person holding the
// handset.
//
// ⚠️ AND THIS IS NOW A CREDENTIAL PATH. Before today a phone was contact
// information. From today, answering a code on a number IS the proof of
// identity for a passwordless account, so three things that would have been
// paranoid yesterday are load-bearing:
//   · the code is stored HASHED (a ten-minute window of DB read = takeover),
//   · wrong guesses are counted IN THE ROW, because lib/rateLimit lives in one
//     instance's memory and forgets everything on each deploy,
//   · a number is unique only once VERIFIED — see the partial index in
//     lib/dbBoot for why that distinction had to exist at all.

import { randomInt, randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { prisma } from './prisma'
import { canonicalPhone, isGeorgianMobile } from './phone'

/** How long a code is good for. Long enough for a slow carrier, short enough
 *  that a leaked row is worthless by the time anyone reads it. */
export const CODE_TTL_MS = 10 * 60 * 1000

/** How long „I proved I hold this number" lasts while the person types a name.
 *  Longer than the code because they are now filling in a form, not waiting. */
export const TICKET_TTL_MS = 15 * 60 * 1000

/** Wrong guesses one code survives. Six digits is 10^6; five tries is 1 in
 *  200 000 per code, and the code is dead afterwards. */
export const MAX_ATTEMPTS = 5

const sha = (v: string) => createHash('sha256').update(v).digest('hex')

/**
 * The only shape this subsystem will accept, or null.
 *
 * ⚠️ GEORGIAN MOBILES ONLY, AND THAT IS A PROVIDER LIMIT RATHER THAN A POLICY.
 * sender.ge dials Georgian mobiles (lib/sms → smsDestination) and nothing else,
 * so an international number cannot be sent a code — offering the form to one
 * would be a door that opens onto a wall. Those people still have the address
 * and password path, which is why it was kept.
 */
export function phoneLoginKey(raw: string | null | undefined): string | null {
  const v = canonicalPhone(raw)
  return isGeorgianMobile(v) ? v : null
}

/**
 * Mint a code for this number and store its hash. Returns the digits — the ONLY
 * moment they exist outside the SMS.
 *
 * Any earlier unconsumed code for the number is deleted first: two live codes
 * for one phone doubles the guessing surface and means „the last SMS" is not
 * reliably the one that works, which is a support ticket every time.
 */
export async function issuePhoneCode(phone: string): Promise<{ code: string; id: string }> {
  // crypto.randomInt is a CSPRNG. Math.random would let anyone who can observe
  // one code predict the next — the same reason /api/auth/otp/send uses it.
  const code = String(randomInt(100000, 1_000_000))
  await prisma.phoneOtp.deleteMany({ where: { phone, consumed: false } })
  const row = await prisma.phoneOtp.create({
    data: { phone, codeHash: sha(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  })
  return { code, id: row.id }
}

export type CodeCheck =
  /** Right. `ticket` is the proof to hand to the register step, when there is
   *  no account yet. */
  | { ok: true; ticket: string }
  /** Wrong, expired, already used, or out of tries. ONE reason, deliberately:
   *  telling a guesser which of those it was tells them whether the number has
   *  a live code, and there is nothing a real person does differently. */
  | { ok: false }

/**
 * Answer a code. Consumes it on success AND on the fifth failure.
 *
 * ⚠️ THE COMPARISON IS CONSTANT-TIME. Six digits over a network is not a
 * realistic timing target, but the branch is written once and copied for ever,
 * and the next thing compared this way may be 32 bytes.
 */
export async function checkPhoneCode(phone: string, code: string): Promise<CodeCheck> {
  const row = await prisma.phoneOtp.findFirst({
    where: { phone, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  if (!row || row.attempts >= MAX_ATTEMPTS) return { ok: false }

  const a = Buffer.from(row.codeHash, 'hex')
  const b = Buffer.from(sha(code), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    // ⚠️ COUNTED IN THE ROW, NOT IN MEMORY. lib/rateLimit resets on every
    // deploy and lives in one instance; this counter is the floor under it.
    await prisma.phoneOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
    return { ok: false }
  }

  /* ⚠️ CLAIM THE ROW, DO NOT CHECK IT (CLAUDE.md rule 4). Two tabs answering
     the same code must not both come away with a ticket: `updateMany` filtered
     on `consumed: false` is the atomic half, and a count of 0 means the other
     tab won. Reading `row.consumed` above and writing here would be exactly the
     race that rule names. */
  const ticket = randomBytes(32).toString('hex')
  const claimed = await prisma.phoneOtp.updateMany({
    where: { id: row.id, consumed: false },
    data: { consumed: true, ticketHash: sha(ticket), expiresAt: new Date(Date.now() + TICKET_TTL_MS) },
  })
  if (claimed.count !== 1) return { ok: false }
  return { ok: true, ticket }
}

/**
 * Spend the „I hold this number" proof from the code step.
 *
 * Returns the phone it was issued for, or null. Single use: the row is deleted,
 * so a replayed ticket creates no second account.
 */
export async function redeemPhoneTicket(ticket: string): Promise<string | null> {
  const row = await prisma.phoneOtp.findFirst({
    where: { ticketHash: sha(ticket), consumed: true, expiresAt: { gt: new Date() } },
  })
  if (!row) return null
  const claimed = await prisma.phoneOtp.deleteMany({ where: { id: row.id, ticketHash: sha(ticket) } })
  return claimed.count === 1 ? row.phone : null
}

export type PhoneAccount =
  /** Nobody holds this number — the code step will ask for a name. */
  | { kind: 'none' }
  /** Exactly one account. `claim` means the number was on the row but nobody
   *  had ever proved they hold it; answering the code proves it now. */
  | { kind: 'one'; userId: string; suspended: boolean; claim: boolean }
  /** Two or more accounts carry this number and none is verified, so there is
   *  no honest way to say whose it is. */
  | { kind: 'ambiguous' }

/**
 * Whose account is this number?
 *
 * ⚠️ THE THREE ANSWERS EXIST BECAUSE OF REAL ROWS. Measured on production
 * 2026-09-04: 27 accounts carry a phone, 25 distinct — two numbers appear
 * twice. Those rows were typed into a profile field back when a phone was
 * contact information, and one of them is a genuine pair of addresses.
 *
 * · VERIFIED wins outright. Only one row can be verified for a number (partial
 *   unique index, lib/dbBoot), so this is unambiguous by construction.
 * · One UNVERIFIED holder is CLAIMED. The person on the handset is the one who
 *   can receive the code; the row's number was typed by somebody who, at the
 *   time, was almost always typing their own. The reverse takeover is
 *   impossible — an attacker cannot receive somebody else's SMS.
 * · Two unverified holders is refused, and it must be. Handing the handset's
 *   owner one of two strangers' accounts at random is worse than asking them to
 *   use the address they registered with.
 */
export async function accountForPhone(phone: string): Promise<PhoneAccount> {
  const rows = await prisma.user.findMany({
    where: { phone },
    select: { id: true, phoneVerified: true, suspendedAt: true },
    orderBy: { createdAt: 'asc' },
  })
  if (rows.length === 0) return { kind: 'none' }
  const verified = rows.find(r => r.phoneVerified)
  if (verified) return { kind: 'one', userId: verified.id, suspended: !!verified.suspendedAt, claim: false }
  if (rows.length > 1) return { kind: 'ambiguous' }
  return { kind: 'one', userId: rows[0].id, suspended: !!rows[0].suspendedAt, claim: true }
}

/**
 * Mark the number as proved for this account.
 *
 * ⚠️ IT CAN LOSE, AND LOSING IS NOT AN ERROR. The partial unique index refuses a
 * second verified holder of one number; if another account verified it a moment
 * earlier this write raises P2002. That means the number is not this account's
 * — the caller refuses the sign-in rather than reporting a server fault.
 */
export async function markPhoneVerified(userId: string): Promise<boolean> {
  try {
    await prisma.user.update({ where: { id: userId }, data: { phoneVerified: true } })
    return true
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') return false
    throw e
  }
}
