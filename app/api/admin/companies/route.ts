// GET  /api/admin/companies — the list, with member counts.
// POST /api/admin/companies — create one.
//
// A company here is a PROVIDER that happens to be a firm: /join offers
// „კომპანია" beside „ფიზიკური პირი", and the row this creates is what a
// ServiceProfile and a RequestAccess grant hang off. Admin-only, one gate.
//
// ⚠️ IT USED TO HAVE TWO. `canSeeB2B()` ran first and answered 404 so that a
// non-admin could not learn the endpoint existed while the B2B vertical was
// dark. The vertical went on 2026-09-03 and the flag with it; `requireRoleApi`
// is the whole check now, and its 403 gives nothing away that /admin does not.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { audit } from '@/lib/audit'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function GET() {
  const me = await getCurrentUser()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  await ensureDbReady()

  const companies = await prisma.company.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true, name: true, taxId: true, status: true, note: true, createdAt: true,
      _count: { select: { members: true } },
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
})

export async function POST(req: Request) {
  const me = await getCurrentUser()
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
      select: { id: true, name: true, taxId: true, status: true },
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
