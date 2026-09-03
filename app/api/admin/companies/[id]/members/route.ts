// POST   /api/admin/companies/[id]/members — add an EXISTING account, by email.
// DELETE /api/admin/companies/[id]/members?userId=… — remove one.
//
// MEMBERSHIP IS AN ALLOWLIST AN ADMIN MAINTAINS BY HAND, and there is no
// self-serve join. That is what makes „who can spend this company's money" a
// question with a short, auditable answer — and it is why the B2B rollout needs
// no 'signed-in' stage the way packages did.
//
// It attaches to an account that already exists. No invitations and no account
// creation: an admin typing an employee's email and thereby minting a user row
// they then have to explain is a bigger feature than this, and every path into
// it (a wrong address, a typo, an account that later signs in with Google)
// creates a mess that only shows up later.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { audit } from '@/lib/audit'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

async function gate() {
  const me = await getCurrentUser()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return { response: auth.response, admin: null as null }
  return { response: null, admin: auth.user }
}

const AddBody = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(['OWNER', 'MEMBER']).default('MEMBER'),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.response) return g.response
  const admin = g.admin!
  const { id } = await params

  const parsed = AddBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  const company = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!company) return notFound()

  const email = parsed.data.email.trim().toLowerCase()
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, fullName: true, email: true, role: true, suspendedAt: true },
  })
  // A distinct code, not INVALID: „that address has no account here" is
  // something the admin can act on (ask them to register first), and „the form
  // is wrong" is not.
  if (!user) return NextResponse.json({ ok: false, error: 'USER_NOT_FOUND' }, { status: 404 })

  // An ADMIN cannot be a company member, because an ADMIN cannot book at all —
  // POST /api/bookings refuses role ADMIN outright. A membership that can never
  // be used would sit in the list looking like it works, and the first time
  // anyone found out otherwise would be at the booking screen.
  if (user.role === 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'ADMIN_CANNOT_BE_MEMBER' }, { status: 400 })
  }
  if (user.suspendedAt) {
    return NextResponse.json({ ok: false, error: 'USER_SUSPENDED' }, { status: 409 })
  }

  // ONE company per person. Not a database constraint — the unique index is
  // (companyId, userId), which only stops the same person joining the same
  // company twice — because „which balance does this booking spend?" is a
  // question the booking flow must never have to ask. If two-company employees
  // ever become real, the flow needs a picker and this check becomes the place
  // that decision is recorded.
  const existing = await prisma.companyMember.findFirst({
    where: { userId: user.id },
    select: { companyId: true, company: { select: { name: true } } },
  })
  if (existing) {
    return NextResponse.json(
      {
        ok: false,
        error: existing.companyId === id ? 'ALREADY_MEMBER' : 'MEMBER_OF_ANOTHER',
        companyName: existing.company.name,
      },
      { status: 409 },
    )
  }

  const member = await prisma.companyMember.create({
    data: { companyId: id, userId: user.id, role: parsed.data.role },
    select: {
      id: true, role: true, createdAt: true,
      user: { select: { id: true, fullName: true, email: true, role: true } },
    },
  })

  await audit(admin.id, 'company.member.add', {
    targetType: 'Company', targetId: id,
    meta: { userId: user.id, email: user.email, role: parsed.data.role, companyName: company.name },
  })

  return NextResponse.json({ ok: true, member })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.response) return g.response
  const admin = g.admin!
  const { id } = await params

  const userId = new URL(req.url).searchParams.get('userId')
  if (!userId) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  // Scoped to BOTH ids, so a userId from another company cannot be removed
  // through this company's URL. deleteMany rather than delete: an already-gone
  // membership is not an error worth showing an admin who clicked twice.
  const removed = await prisma.companyMember.deleteMany({ where: { companyId: id, userId } })
  if (removed.count === 0) return notFound()

  // NOTHING IS REFUNDED AND NOTHING IS REVERSED. Bookings this person already
  // paid for out of the balance stay exactly as they are — the sessions are
  // real, the experts are owed, and the ledger rows describe money that was
  // genuinely spent. Removing a member only stops FUTURE spending.
  await audit(admin.id, 'company.member.remove', {
    targetType: 'Company', targetId: id,
    meta: { userId },
  })

  return NextResponse.json({ ok: true })
}
