import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { hierarchyError, TREE_ERROR } from '@/lib/categoryTree'

// PATCH /api/admin/categories/[id]
// Partial update — any of `name`, `status` (VISIBLE / HIDDEN / REDIRECTED),
// `parentId`. Zod refuses empty bodies so no-op PATCHes fail loud instead of
// silently returning 200.
//
// ⚠️ `defaultServiceType` WAS A FOURTH FIELD AND THE COLUMN IS GONE — the
// services-only migration dropped Category.defaultServiceType on 2026-08-24
// (prisma/manual-migrations/2026-08-24-services-only/up.sql) and these two
// route files kept selecting it, so EVERY request here threw
// PrismaClientValidationError in production and the whole „კატეგორიები" tab
// was dead. `tsc` does not catch a stale Prisma select; tests/schemaDrift
// does.
//
// `isLive` is NOT accepted. Visibility now has exactly one input — `status` —
// and the boolean is written from it below, so the two cannot disagree. It is
// still written because the public site reads it until stage 3 lands, and it is
// what down.sql restores the old behaviour from.
const Body = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    status: z.enum(['VISIBLE', 'HIDDEN', 'REDIRECTED']).optional(),
    // `null` clears the parent; absent leaves it alone. The two are different
    // requests and zod has to keep them apart, hence nullable + optional.
    parentId: z.string().min(1).nullable().optional(),
  })
  .refine(v => Object.keys(v).length > 0, { message: 'EMPTY_BODY' })

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const change = parsed.data

  const current = await prisma.category.findUnique({
    where: { id },
    select: { id: true, status: true, parentId: true, _count: { select: { children: true } } },
  })
  if (!current) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  // The hierarchy rules, before anything is written. The parent is resolved
  // here and handed to the pure checker in lib/categoryTree — the same rules
  // the migration asserts, and the same ones the admin screen greys out with.
  const nextParentId = change.parentId !== undefined ? change.parentId : current.parentId
  const parent = nextParentId
    ? await prisma.category.findUnique({ where: { id: nextParentId }, select: { id: true, status: true, parentId: true } })
    : null
  const bad = hierarchyError(
    { id: current.id, status: current.status, parentId: current.parentId, childCount: current._count.children },
    change,
    parent,
  )
  if (bad) {
    return NextResponse.json({ ok: false, error: bad, message: TREE_ERROR[bad] }, { status: 409 })
  }

  const data = {
    ...change,
    // Derived, never sent: one input for visibility. A REDIRECTED category is
    // not a place to browse either, so only VISIBLE stays live.
    ...(change.status ? { isLive: change.status === 'VISIBLE' } : {}),
  }

  try {
    const updated = await prisma.category.update({
      where: { id },
      data,
      select: {
        id: true,
        slug: true,
        name: true,
        isLive: true,
        status: true,
        parentId: true,
        _count: { select: { providers: true, children: true } },
      },
    })
    // A status change delists or re-lists every expert in the category on the
    // public site, so it gets its own action string (with the affected count).
    const action = change.status === 'VISIBLE' ? 'category.show'
      : change.status === 'HIDDEN' ? 'category.hide'
      : change.status === 'REDIRECTED' ? 'category.redirect'
      : 'category.update'
    await audit(admin.id, action, {
      targetType: 'Category',
      targetId: id,
      meta: { name: updated.name, slug: updated.slug, providerCount: updated._count.providers, changes: change },
    })
    return NextResponse.json({
      ok: true,
      category: {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        isLive: updated.isLive,
        status: updated.status,
        parentId: updated.parentId,
        providerCount: updated._count.providers,
        // Recomputed on the next load; the row only needs it to stay a number.
        listedCount: updated.status === 'VISIBLE' ? updated._count.providers : 0,
        childCount: updated._count.children,
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }
}

// DELETE /api/admin/categories/[id] — only when nothing depends on it: no
// experts attached, and no categories pointed at it. A category with either can
// be hidden instead, never orphaned. (The FK is ON DELETE RESTRICT, so the
// second case would fail at the database anyway — this turns that into a
// sentence the admin can act on.)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  const { id } = await params
  const cat = await prisma.category.findUnique({ where: { id }, select: { name: true, slug: true, _count: { select: { providers: true, children: true } } } })
  if (!cat) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (cat._count.providers > 0) {
    return NextResponse.json({ ok: false, error: 'HAS_PROVIDERS' }, { status: 409 })
  }
  if (cat._count.children > 0) {
    return NextResponse.json({ ok: false, error: 'HAS_CHILDREN', message: TREE_ERROR.HAS_CHILDREN }, { status: 409 })
  }
  await prisma.category.delete({ where: { id } })
  await audit(admin.id, 'category.delete', {
    targetType: 'Category',
    targetId: id,
    meta: { name: cat.name, slug: cat.slug },
  })
  return NextResponse.json({ ok: true })
}
