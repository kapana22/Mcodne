// GET  /api/admin/companies — the list, with balances and member counts.
// POST /api/admin/companies — create one.
//
// TWO GATES, BOTH REQUIRED, and they answer differently on purpose:
//   canSeeB2B()      → 404. „This deployment has no such endpoint." Runs FIRST,
//                      so a non-admin learns nothing, not even that admin-only
//                      endpoints exist under this path.
//   requireRoleApi() → 401/403. „You are not an admin." Only reachable once the
//                      vertical is visible to you at all.
//
// At the 'public' stage those come apart, which is why they are two checks and
// not one: everyone may see /business, and nobody but an admin may see this.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { canSeeB2B } from '@/lib/b2b'
import { audit } from '@/lib/audit'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function GET() {
  const me = await getCurrentUser()
  if (!canSeeB2B(me?.role)) return notFound()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  await ensureDbReady()

  const companies = await prisma.company.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true, name: true, taxId: true, balance: true, status: true, note: true, createdAt: true,
      _count: { select: { members: true, transactions: true } },
    },
  })
  return NextResponse.json({ ok: true, companies })
}

const CreateBody = z.object({
  name: z.string().trim().min(2).max(160),
  // Optional here for the same reason it is optional on the enquiry form: an
  // admin creating a company from a phone call may not have the code yet, and
  // refusing the row buys nothing. It is UNIQUE in the database, so a duplicate
  // is caught below rather than silently creating a second company.
  taxId: z.string().trim().min(4).max(32).optional().or(z.literal('')),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  // Deliberately NO opening balance. Money arrives through the balance endpoint
  // and ONLY through it, so every lari that ever existed on a balance has a
  // CompanyTransaction row explaining it. An `initialBalance` here would be the
  // one movement with no ledger entry — and it would be the first one, which is
  // exactly the row somebody later needs to find.
})

export async function POST(req: Request) {
  const me = await getCurrentUser()
  if (!canSeeB2B(me?.role)) return notFound()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  const taxId = (parsed.data.taxId ?? '').trim() || null
  const note = (parsed.data.note ?? '').trim() || null

  let company
  try {
    company = await prisma.company.create({
      data: { name: parsed.data.name.trim(), taxId, note },
      select: { id: true, name: true, taxId: true, balance: true, status: true },
    })
  } catch (e: any) {
    // P2002 = the unique index on taxId. Answered as its own code so the panel
    // can say „this identification code already exists" instead of „error" —
    // two companies under one code means one of them is a typo, and the admin
    // is the only person who can tell which.
    if (e?.code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'TAX_ID_TAKEN' }, { status: 409 })
    }
    throw e
  }

  await audit(admin.id, 'company.create', {
    targetType: 'Company', targetId: company.id,
    meta: { name: company.name, taxId },
  })

  return NextResponse.json({ ok: true, company })
}
