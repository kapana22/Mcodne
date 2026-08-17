// The account that gets made WHILE the request is being sent.
//
// Owner, 2026-08-17: „მოთხოვნას ამ გვერდზე პარალელურად უნდა არეგისტრირდებოდე."
// The reference products work exactly this way — Thumbtack's last screen asks
// for a name, an email and a phone, and the account simply exists afterwards;
// nobody is shown a „create an account" step, because the fields a signup would
// ask for are the same fields the request already needs. A separate step would
// be asking the same person for the same three things twice.
//
// ⚠️ THE FOUR OUTCOMES, and why each is what it is. This is an authentication
// decision, so it is written out rather than left to read off the code:
//
//   SIGNED_IN  somebody was already logged in. The request attaches to THAT
//              account and nothing else happens. Never swap a live session for
//              a new one — a person filling this form is not asking to be
//              logged out of the account they are sitting in.
//   NONE       no email was given. No account is possible and none is faked:
//              the publicRef link stays their only key, which is the promise
//              the intake was rebuilt on („no registration, ever"). An email
//              is the ONE thing that makes an account meaningful, because it
//              is the only way back into it.
//   CREATED    a new email. Account made, session set, request attached.
//   EXISTS     the email already belongs to somebody. The request is attached
//              so the real owner finds it when they sign in — but NO SESSION
//              IS CREATED, and that is the whole security of this file. Typing
//              a stranger's address must never open their account; anything
//              else here is an account takeover with a text input as the
//              exploit.
//
// The password is random and nobody is told it — the account is reached by the
// existing reset flow, which mails the address that was just proven useful
// enough to type. A guest-checkout account with no password is the standard
// shape; inventing a nullable passwordHash for it would change a column every
// other auth path reads.

import { randomBytes } from 'crypto'
import { prisma } from './prisma'
import { hashPassword, createSession } from './auth'
import { normalizePhone } from './phone'

export type AccountOutcome = 'SIGNED_IN' | 'NONE' | 'CREATED' | 'EXISTS'

export type AccountResult = { outcome: AccountOutcome; userId: string | null }

/**
 * Decide, and do it.
 *
 * Called AFTER the request row is written — the request is the deliverable and
 * must never be lost to a failure in the account step. The caller links the
 * userId afterwards.
 */
export async function accountForRequest(input: {
  /** The session that submitted, if any. */
  signedInUserId: string | null
  email: string | null
  contactName: string
  phone: string
}): Promise<AccountResult> {
  if (input.signedInUserId) {
    return { outcome: 'SIGNED_IN', userId: input.signedInUserId }
  }

  const email = (input.email ?? '').toLowerCase().trim()
  if (email === '') return { outcome: 'NONE', userId: null }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })
  if (existing) return { outcome: 'EXISTS', userId: existing.id }

  try {
    const user = await prisma.user.create({
      data: {
        email,
        fullName: input.contactName.trim(),
        // 32 random bytes, hashed and discarded. See the header.
        passwordHash: await hashPassword(randomBytes(32).toString('hex')),
        phone: normalizePhone(input.phone),
        role: 'STUDENT',
      },
      select: { id: true },
    })
    await createSession(user.id)
    return { outcome: 'CREATED', userId: user.id }
  } catch (e: unknown) {
    // Two submits racing on the same new address. The unique constraint is the
    // real check — the findUnique above is only an early exit — and the loser
    // resolves to the same answer it would have got a millisecond earlier.
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
      const u = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      return { outcome: 'EXISTS', userId: u?.id ?? null }
    }
    // Anything else: the REQUEST is already written and that is what the person
    // asked for. Losing the account is recoverable by signing up; losing the
    // request is not.
    return { outcome: 'NONE', userId: null }
  }
}
