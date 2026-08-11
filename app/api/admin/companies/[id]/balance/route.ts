// POST /api/admin/companies/[id]/balance — put money on, or take it off.
//
// THE ONLY WAY A BALANCE EVER MOVES BY HAND. There is deliberately no
// `balance` field on PATCH /api/admin/companies/[id] and no opening balance on
// create: every lari that has ever been on a balance has a CompanyTransaction
// row explaining it, because a ledger with one unexplained movement in it is
// not a ledger — and the unexplained one is always the row somebody is looking
// for a year later.
//
// The other writer is the booking flow (stage 5), which charges the balance
// inside the booking's own transaction. Both write the same pair — the number
// and the row — and both do it atomically.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { canSeeB2B } from '@/lib/b2b'
import { audit } from '@/lib/audit'

const Body = z.object({
  // TOPUP adds, CHARGE removes. The client never sends a signed number: a
  // minus sign is one keystroke away from being the wrong way round, and
  // „amount: -500" in a request log does not say whether somebody meant to
  // refund 500 or to charge it.
  type: z.enum(['TOPUP', 'CHARGE']),
  // Lari, whole, positive. Capped at a million per movement — not a policy
  // about how much a company may hold, but a guard against a typed zero.
  amount: z.number().int().positive().max(1_000_000),
  // Required, and required for both directions. This is the only place the
  // REASON for a hand-made movement survives („გადმორიცხა 2026-08-11, ბრძ. #12"),
  // and an optional field is empty exactly when it matters.
  note: z.string().trim().min(2).max(300),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser()
  if (!canSeeB2B(me?.role)) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  const { id } = await params

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { type, amount, note } = parsed.data

  await ensureDbReady()

  // ── The claim, not a check ────────────────────────────────────────────────
  // „A status check you read before the write is not a guard" (CLAUDE.md).
  // Reading the balance, deciding it is enough, and then writing loses to a
  // second admin tab and to the booking flow charging the same balance at the
  // same moment — and losing here means a balance that went negative, or a
  // ledger whose balanceAfter is a number the balance never actually held.
  //
  // So the decrement CLAIMS the row: `balance: { gte: amount }` is part of the
  // WHERE, and a count of 0 means somebody else got there first. The database
  // CHECK constraint (balance >= 0) is the backstop underneath that.
  //
  // The whole thing is one transaction, so a failure cannot leave the number
  // moved with no row to explain it, or a row describing a movement that never
  // happened.
  try {
    const result = await prisma.$transaction(async tx => {
      if (type === 'TOPUP') {
        const claimed = await tx.company.updateMany({
          // status is NOT in this WHERE: money may be added to a frozen
          // company. Freezing stops SPENDING — it must not stop an admin
          // recording a transfer that really arrived.
          where: { id },
          data: { balance: { increment: amount } },
        })
        if (claimed.count !== 1) return { error: 'NOT_FOUND' as const }
      } else {
        const claimed = await tx.company.updateMany({
          where: { id, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        })
        if (claimed.count !== 1) {
          // Either the company is gone or the balance is short. Tell them
          // apart with one more read — this is the slow path, taken only when
          // the write already failed, so it costs nothing in the normal case.
          const exists = await tx.company.findUnique({ where: { id }, select: { id: true } })
          return { error: exists ? ('INSUFFICIENT' as const) : ('NOT_FOUND' as const) }
        }
      }

      // Read the balance back INSIDE the transaction: `balanceAfter` must be
      // the number this movement actually produced, not one computed from a
      // value read before the write.
      const after = await tx.company.findUniqueOrThrow({
        where: { id },
        select: { balance: true },
      })

      const txn = await tx.companyTransaction.create({
        data: {
          companyId: id,
          type,
          amount,
          balanceAfter: after.balance,
          actorId: admin.id,
          note,
          // No bookingId — a hand movement is not a booking. The booking flow
          // sets it on the rows it writes.
        },
        select: { id: true, type: true, amount: true, balanceAfter: true, createdAt: true },
      })

      return { balance: after.balance, txn }
    })

    if ('error' in result) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.error === 'NOT_FOUND' ? 404 : 409 },
      )
    }

    // Audited SEPARATELY from the ledger row, and this is not duplication. The
    // ledger answers „what is this company's balance made of" and is scoped to
    // one company; the audit log answers „what did this admin do today" across
    // every surface in the panel. Neither can answer the other's question.
    await audit(admin.id, type === 'TOPUP' ? 'company.balance.topup' : 'company.balance.charge', {
      targetType: 'Company', targetId: id,
      meta: { amount, note, balanceAfter: result.balance },
    })

    return NextResponse.json({ ok: true, balance: result.balance, transaction: result.txn })
  } catch (e: any) {
    // The CHECK constraint firing means a code path got past the conditional
    // claim above — worth a distinct log line, because it is a bug in this
    // file and not a user error.
    if (e?.code === 'P0001' || /Company_balance_nonnegative/.test(String(e?.message))) {
      console.error('[b2b] balance CHECK refused a movement — the claim above is not holding', { id, type, amount })
      return NextResponse.json({ ok: false, error: 'INSUFFICIENT' }, { status: 409 })
    }
    throw e
  }
}
