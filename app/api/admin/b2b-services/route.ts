// The B2B service catalogue — what a company can buy, and for how much.
//
//   GET    /api/admin/b2b-services  — every service, hidden ones included
//   POST                            — add one
//   PATCH                           — edit one (any field, including `visible`)
//   DELETE ?id=…                    — remove one
//
// Gated like every other admin B2B route: canSeeB2B → 404 first, then
// requireRoleApi('ADMIN') → 401/403.
//
// DELETE IS SAFE HERE, unlike on a company. BusinessLead.serviceId is
// `onDelete: SetNull`, so removing a service keeps every request it ever
// produced — only the link goes. That said, the panel offers „დამალვა" first:
// a hidden service leaves the page while its requests keep their label, which
// is what somebody usually means by „stop selling this".

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

const Fields = {
  direction: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  // Lari, whole. Zero is legal and means „the number is meaningless here" —
  // it is only ever shown when priceOnRequest is false, and the two travel
  // together.
  priceGel: z.number().int().min(0).max(1_000_000),
  priceOnRequest: z.boolean(),
  order: z.number().int().min(0).max(9999),
  visible: z.boolean(),
}

export async function GET() {
  const g = await gate()
  if (g.response) return g.response
  await ensureDbReady()
  const services = await prisma.b2BService.findMany({
    orderBy: [{ direction: 'asc' }, { order: 'asc' }],
    take: 300,
    include: { _count: { select: { requests: true } } },
  })
  return NextResponse.json({ ok: true, services })
}

const CreateBody = z.object({
  direction: Fields.direction,
  title: Fields.title,
  description: Fields.description,
  priceGel: Fields.priceGel.default(0),
  priceOnRequest: Fields.priceOnRequest.default(false),
  order: Fields.order.default(0),
})

export async function POST(req: Request) {
  const g = await gate()
  if (g.response) return g.response
  const admin = g.admin!

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()
  const service = await prisma.b2BService.create({
    data: {
      direction: parsed.data.direction,
      title: parsed.data.title,
      description: (parsed.data.description ?? '').trim() || null,
      priceGel: parsed.data.priceGel,
      priceOnRequest: parsed.data.priceOnRequest,
      order: parsed.data.order,
    },
  })
  await audit(admin.id, 'b2bService.create', {
    targetType: 'B2BService', targetId: service.id,
    meta: { direction: service.direction, title: service.title, priceGel: service.priceGel },
  })
  return NextResponse.json({ ok: true, service })
}

const PatchBody = z.object({
  id: z.string().min(1),
  direction: Fields.direction.optional(),
  title: Fields.title.optional(),
  description: Fields.description,
  priceGel: Fields.priceGel.optional(),
  priceOnRequest: Fields.priceOnRequest.optional(),
  order: Fields.order.optional(),
  visible: Fields.visible.optional(),
})

export async function PATCH(req: Request) {
  const g = await gate()
  if (g.response) return g.response
  const admin = g.admin!

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { id, ...rest } = parsed.data

  const data: Record<string, unknown> = {}
  for (const k of ['direction', 'title', 'priceGel', 'priceOnRequest', 'order', 'visible'] as const) {
    if (rest[k] !== undefined) data[k] = rest[k]
  }
  if (rest.description !== undefined) data.description = (rest.description ?? '').trim() || null
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  await ensureDbReady()
  // updateMany + count, not update: a missing id answers 404 rather than
  // throwing P2025 into the 500 handler.
  const done = await prisma.b2BService.updateMany({ where: { id }, data })
  if (done.count !== 1) return notFound()

  await audit(admin.id, 'b2bService.update', {
    targetType: 'B2BService', targetId: id, meta: data,
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const g = await gate()
  if (g.response) return g.response
  const admin = g.admin!

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()
  // The requests survive — the FK is SET NULL. They keep their contact details,
  // their message and their place in the queue; only „which service" is lost,
  // which is the honest outcome for a service that no longer exists.
  const done = await prisma.b2BService.deleteMany({ where: { id } })
  if (done.count !== 1) return notFound()

  await audit(admin.id, 'b2bService.delete', { targetType: 'B2BService', targetId: id })
  return NextResponse.json({ ok: true })
}
