// GET  /api/admin/users/[id]/credits — the balance and the rows behind it.
// POST /api/admin/users/[id]/credits — move it by hand, with a reason.
//
// ⚠️ WHY THIS ROUTE HAS TO EXIST, AND WHY IT SHIPPED THE SAME DAY AS
// `CREDITS_ENFORCED = true` (2026-08-21). Enforcement without a way back is a
// trap: a provider whose balance runs out cannot answer a lead, and while
// `PAYMENTS_LIVE` is false there is nothing they can buy to fix it. The loop's
// own answers — a released charge on an offer nobody answered, 25₾ for a
// finished job (lib/credits) — cover the cases the design predicts. This covers
// the ones it does not, so that unblocking a real person is a form somebody
// fills in rather than a deploy somebody schedules.
//
// ⚠️ IT IS BOOKKEEPING AND NOT A PAYMENT. Nothing here is sold, owed or
// withdrawable; a balance buys exactly one thing, which is sending an offer.
// The wording rules at the top of lib/credits are what keep that true and they
// apply to this file too.
//
// The shape follows app/api/admin/companies/[id]/balance — the same „a hand
// movement always leaves a row explaining itself" precedent, and the same
// unsigned-amount-plus-direction body, because „amount: -500" in a request log
// does not say whether somebody meant to give 500 or to take it.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { audit } from '@/lib/audit'
import { TETRI, gelLabel, contactsAffordable } from '@/lib/credits'
import { adjustBalance, balanceOf } from '@/lib/creditsServer'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

/**
 * ADMIN, and a non-admin gets `requireRoleApi`'s own 403. The balance is not a
 * dark feature — it is on screen for every provider — so there is nothing here
 * for a 404 to conceal, and every other route under /api/admin/users answers a
 * non-admin the same way.
 *
 * (The b2b routes used to answer 404 instead, to hide a vertical that was dark.
 * They went on 2026-09-03 and so did that distinction.)
 *
 * 404 is still what an unknown user id gets, below.
 */
async function gate() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return { response: auth.response, admin: null as null }
  return { response: null, admin: auth.user }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.response) return g.response
  const { id } = await params

  await ensureDbReady()

  const user = await prisma.user.findUnique({
    // Never the whole row — `passwordHash` lives on it.
    where: { id },
    select: { id: true, fullName: true, email: true },
  })
  if (!user) return notFound()

  const entries = await prisma.creditEntry.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'desc' },
    // A ledger is read newest-first and the tail is history, not a queue. 200
    // is far past what one provider generates before somebody wants an export.
    take: 200,
    select: { id: true, amountTetri: true, reason: true, grantKey: true, refId: true, createdAt: true },
  })
  const balanceTetri = await balanceOf(id)

  return NextResponse.json({
    ok: true,
    user,
    balanceTetri,
    // The two readings the panel would otherwise compute itself, and the second
    // is the one that decides anything: „what can this person still do". Since
    // 2026-08-21 that is client contacts — an offer is free and the balance
    // buys nothing else.
    balanceLabel: gelLabel(balanceTetri),
    contactsAffordable: contactsAffordable(balanceTetri),
    entries,
  })
}

const Body = z.object({
  // GRANT adds, DEDUCT removes. Never a signed number from the client — see the
  // note at the top.
  type: z.enum(['GRANT', 'DEDUCT']),
  // WHOLE LARI, and the cap is not a policy about how much anybody may hold: it
  // is a guard against a typed extra zero on a number nobody re-reads. 1 000₾
  // is 200 offers, which is already far past any honest hand movement.
  amountGel: z.number().int().positive().max(1000),
  // Required, in both directions. This is the only place the REASON for a hand
  // movement survives, and an optional field is empty exactly when it matters.
  note: z.string().trim().min(2).max(300),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.response) return g.response
  const admin = g.admin!
  const { id } = await params

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { type, amountGel, note } = parsed.data

  await ensureDbReady()

  // Read first, and here that is not a guard being done wrongly — it is a
  // foreign key being checked so a bad id answers 404 instead of a 500 from
  // `CreditEntry_userId_fkey`. Nothing about the movement depends on it.
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return notFound()

  // ⚠️ A DEDUCTION MAY TAKE THE BALANCE BELOW ZERO, and there is no claim
  // stopping it — deliberately, and it is the opposite of the company balance
  // this route is modelled on. That one guards `balance: { gte: amount }`
  // because a company's money is real and a negative one would be a debt we
  // invented. This balance is a discount on a service that is not yet sold, and
  // the honest reason an admin reaches for DEDUCT is to correct a grant that
  // should not have been paid — refusing the correction because the provider
  // has already spent it would leave the ledger permanently wrong. The ledger
  // stays the truth; `canAffordContact` already refuses to spend from a negative.
  const amountTetri = (type === 'GRANT' ? 1 : -1) * amountGel * TETRI
  const balanceTetri = await adjustBalance(id, amountTetri, note)

  // Audited SEPARATELY from the ledger row, and it is not duplication. The
  // ledger answers „what is this balance made of" for one person; the audit log
  // answers „what did this admin do today" across every surface in the panel.
  // Neither can answer the other's question.
  await audit(admin.id, type === 'GRANT' ? 'credits.grant' : 'credits.deduct', {
    targetType: 'User',
    targetId: id,
    meta: { amountGel, note, balanceAfterTetri: balanceTetri },
  })

  // The new balance goes back so a double-submit is visible immediately — the
  // one thing that stands in for the idempotency a hand movement deliberately
  // does not have (lib/creditsServer → adjustBalance).
  return NextResponse.json({
    ok: true,
    balanceTetri,
    balanceLabel: gelLabel(balanceTetri),
    contactsAffordable: contactsAffordable(balanceTetri),
  })
}
