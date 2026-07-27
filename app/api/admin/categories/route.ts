import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { slugify } from '@/lib/slug'

// GET /api/admin/categories
// Returns every category (live + hidden) with attached tutor counts so admin
// can toggle visibility + service-type default without a second round-trip.
export async function GET() {
  await requireRole('ADMIN')
  const rows = await prisma.category.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      defaultServiceType: true,
      isLive: true,
      _count: { select: { tutors: true } },
    },
  })
  const out = rows.map(r => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    defaultServiceType: r.defaultServiceType,
    isLive: r.isLive,
    tutorCount: r._count.tutors,
  }))
  return NextResponse.json(out)
}

// POST /api/admin/categories — create a category from a display name. Slug is
// derived (Georgian → Latin) and de-duplicated; the new category sorts last.
const CreateBody = z.object({
  name: z.string().trim().min(2).max(60),
  defaultServiceType: z.enum(['CONSULTATION', 'RECURRING']).default('CONSULTATION'),
})

export async function POST(req: Request) {
  const admin = await requireRole('ADMIN')
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const { name, defaultServiceType } = parsed.data
  // Unique slug: base, then base-2, base-3, … if taken.
  const base = slugify(name)
  let slug = base
  for (let i = 2; await prisma.category.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`
  }
  const last = await prisma.category.findFirst({ orderBy: { order: 'desc' }, select: { order: true } })
  const created = await prisma.category.create({
    data: { name, slug, defaultServiceType, order: (last?.order ?? 0) + 1, isLive: true },
    select: { id: true, slug: true, name: true, defaultServiceType: true, isLive: true, _count: { select: { tutors: true } } },
  })
  await audit(admin.id, 'category.create', {
    targetType: 'Category',
    targetId: created.id,
    meta: { name: created.name, slug: created.slug, defaultServiceType: created.defaultServiceType },
  })
  return NextResponse.json({
    ok: true,
    category: { id: created.id, slug: created.slug, name: created.name, defaultServiceType: created.defaultServiceType, isLive: created.isLive, tutorCount: created._count.tutors },
  }, { status: 201 })
}
