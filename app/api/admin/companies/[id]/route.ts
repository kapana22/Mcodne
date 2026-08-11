// GET   /api/admin/companies/[id] — one company: members + the ledger.
// PATCH /api/admin/companies/[id] — rename, re-note, freeze/unfreeze.
//
// The balance is NOT editable here. It moves only through ./balance, which
// writes a CompanyTransaction in the same transaction — see the note there.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { canSeeB2B } from '@/lib/b2b'
import { audit } from '@/lib/audit'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

async function gate() {
  const me = await getCurrentUser()
  if (!canSeeB2B(me?.role)) return { response: notFound(), admin: null as null }
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return { response: auth.response, admin: null as null }
  return { response: null, admin: auth.user }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.response) return g.response
  const { id } = await params

  await ensureDbReady()

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true, name: true, taxId: true, balance: true, status: true, note: true, createdAt: true,
      // ⚠️ REQUIRED BY THE PANEL, and its absence was a hard 500 (found by
      // opening a real company on production, 2026-08-11). `transactions` below
      // is capped at 200, so the LIST cannot be counted client-side — the panel
      // reads `_count.transactions` to say „the last 200 of N". It read
      // `_count.members` too, and with `_count` undefined that is a TypeError
      // on the first render of the detail view.
      //
      // TypeScript did not catch it: the client types this response by hand
      // (type Detail = Company & …), so the declaration was a claim about the
      // API, not a check of it.
      _count: { select: { members: true, transactions: true } },
      members: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, role: true, createdAt: true,
          // Never the whole user row — passwordHash lives on it.
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        // A ledger is read newest-first and the tail is history, not a queue.
        // 200 is far past what one company generates before somebody asks for
        // an export instead — and a cap is what stops one busy company from
        // making this endpoint the slowest thing in the panel.
        take: 200,
        select: {
          id: true, type: true, amount: true, balanceAfter: true,
          bookingId: true, actorId: true, note: true, createdAt: true,
        },
      },
    },
  })
  if (!company) return notFound()

  return NextResponse.json({ ok: true, company })
}

const PatchBody = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  taxId: z.string().trim().min(4).max(32).optional().or(z.literal('')),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  // ACTIVE ⇄ SUSPENDED. A freeze, not a delete: the company, its members and
  // its whole ledger stay exactly where they are and stay readable — only
  // spending stops. Mirrors User.suspendedAt.
  //
  // Nothing here deletes a company, and that is deliberate. A DELETE would
  // cascade the membership rows and the LEDGER away with it, which is the one
  // thing this feature must never lose. Freezing answers every real reason
  // somebody would reach for delete.
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.response) return g.response
  const admin = g.admin!
  const { id } = await params

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  const before = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true, taxId: true, status: true },
  })
  if (!before) return notFound()

  const data: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim()
  if (parsed.data.taxId !== undefined) data.taxId = parsed.data.taxId.trim() || null
  if (parsed.data.note !== undefined) data.note = parsed.data.note.trim() || null
  if (parsed.data.status !== undefined) data.status = parsed.data.status
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  let company
  try {
    company = await prisma.company.update({
      where: { id },
      data,
      select: { id: true, name: true, taxId: true, balance: true, status: true, note: true },
    })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'TAX_ID_TAKEN' }, { status: 409 })
    }
    throw e
  }

  // The audit row carries the BEFORE values. „Status changed to SUSPENDED" is
  // half a story; the question asked afterwards is always what it was before
  // and who changed it.
  await audit(admin.id, 'company.update', {
    targetType: 'Company', targetId: id,
    meta: { before: { name: before.name, taxId: before.taxId, status: before.status }, changed: data },
  })

  return NextResponse.json({ ok: true, company })
}
