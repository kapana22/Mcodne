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

/* THE DEAL, not just the queue position.
   `agreedPrice` and `adminNote` have been columns since the vertical shipped —
   with a written intent („what the owner actually agreed", „invoice number,
   what was promised") — and nothing ever wrote to them. This is the paid side
   of the product and the work goes out on a contract, so the number that was
   actually agreed has to live somewhere other than a conversation.
   Every field is optional and applied only when SENT, so the „დავუკავშირდი"
   button keeps posting a status alone and nothing else is overwritten. */
const PatchBody = z.object({
  id: z.string().min(1),
  status: z.enum(['NEW', 'CONTACTED', 'CLOSED']).optional(),
  // null CLEARS it — „we agreed nothing after all" is a real edit, and it must
  // not be indistinguishable from „field not sent".
  agreedPrice: z.number().int().min(0).max(10_000_000).nullable().optional(),
  adminNote: z.string().max(2000).optional(),
})

export async function PATCH(req: Request) {
  const g = await gate()
  if (g.response) return g.response
  const admin = g.admin!

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  const { id, status, agreedPrice, adminNote } = parsed.data
  const data: Record<string, unknown> = {}
  if (status !== undefined) data.status = status
  if (agreedPrice !== undefined) data.agreedPrice = agreedPrice
  if (adminNote !== undefined) data.adminNote = adminNote.trim() || null
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  // updateMany + count, not update: an id that no longer exists answers 404
  // instead of throwing P2025 into the 500 handler.
  const done = await prisma.businessLead.updateMany({ where: { id }, data })
  if (done.count !== 1) return notFound()

  // Two separate audit actions: a status move and a money decision are not the
  // same event, and the audit tab filters by action string. „Who agreed 2400₾
  // on this, and when" has to be answerable on its own.
  if (status !== undefined) {
    await audit(admin.id, 'businessLead.status', {
      targetType: 'BusinessLead', targetId: id, meta: { status },
    })
  }
  if (agreedPrice !== undefined || adminNote !== undefined) {
    await audit(admin.id, 'businessLead.deal', {
      targetType: 'BusinessLead', targetId: id,
      meta: { agreedPrice: agreedPrice ?? null, hasNote: adminNote !== undefined && !!adminNote.trim() },
    })
  }

  return NextResponse.json({ ok: true })
}
