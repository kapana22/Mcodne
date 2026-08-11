// GET   /api/admin/business-leads — the inbound queue from /business.
// PATCH /api/admin/business-leads — mark one NEW → CONTACTED → CLOSED.
//
// A lead is never deleted. It is the record that somebody asked and what
// happened next; „CLOSED" is the answer to „is there anything left to do",
// which is the only question the queue exists to answer.

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

export async function GET() {
  const g = await gate()
  if (g.response) return g.response

  await ensureDbReady()

  const leads = await prisma.businessLead.findMany({
    // NEW first (the enum's own order), newest first within that — the index
    // is (status, createdAt), so this is the read it was built for.
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 500,
    // The service they asked for, named on the row. „Which service" is the one
    // thing that decides who the owner assigns, so it must be readable without
    // opening anything.
    include: { service: { select: { id: true, direction: true, title: true } } },
  })
  const open = leads.filter(l => l.status === 'NEW').length
  return NextResponse.json({ ok: true, leads, open })
}

const PatchBody = z.object({
  id: z.string().min(1),
  status: z.enum(['NEW', 'CONTACTED', 'CLOSED']),
})

export async function PATCH(req: Request) {
  const g = await gate()
  if (g.response) return g.response
  const admin = g.admin!

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  // updateMany + count, not update: an id that no longer exists answers 404
  // instead of throwing P2025 into the 500 handler.
  const done = await prisma.businessLead.updateMany({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  })
  if (done.count !== 1) return notFound()

  await audit(admin.id, 'businessLead.status', {
    targetType: 'BusinessLead', targetId: parsed.data.id,
    meta: { status: parsed.data.status },
  })

  return NextResponse.json({ ok: true })
}
