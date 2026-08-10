import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { slugify } from '@/lib/slug'

// GET /api/admin/categories
// Returns EVERY category whatever its status, with the counts the screen needs
// to judge a change before making it: how many experts sit in it, and how many
// categories hang off it. Both are the reason a status change is refused, so
// they travel with the row rather than costing a second round-trip.
export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const rows = await prisma.category.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      defaultServiceType: true,
      isLive: true,
      status: true,
      parentId: true,
      _count: { select: { tutors: true, children: true } },
    },
  })
  const out = rows.map(r => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    defaultServiceType: r.defaultServiceType,
    isLive: r.isLive,
    status: r.status,
    parentId: r.parentId,
    tutorCount: r._count.tutors,
    childCount: r._count.children,
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
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
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
  // A new sphere is visible and stands on its own; a parent is assigned later,
  // deliberately, from the row itself.
  const created = await prisma.category.create({
    data: { name, slug, defaultServiceType, order: (last?.order ?? 0) + 1, isLive: true, status: 'VISIBLE' },
    select: { id: true, slug: true, name: true, defaultServiceType: true, isLive: true, status: true, parentId: true, _count: { select: { tutors: true, children: true } } },
  })
  await audit(admin.id, 'category.create', {
    targetType: 'Category',
    targetId: created.id,
    meta: { name: created.name, slug: created.slug, defaultServiceType: created.defaultServiceType },
  })
  return NextResponse.json({
    ok: true,
    category: {
      id: created.id, slug: created.slug, name: created.name,
      defaultServiceType: created.defaultServiceType,
      isLive: created.isLive, status: created.status, parentId: created.parentId,
      tutorCount: created._count.tutors, childCount: created._count.children,
    },
  }, { status: 201 })
}
