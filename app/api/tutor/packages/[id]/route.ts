import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { firstGeorgianMessage, georgianRefine } from '@/lib/georgianText'
import { packagesFeatureExists, PACKAGE_LESSON_COUNTS } from '@/lib/packages'
import { ROLE } from '@/lib/roles'

// Edit / remove one package. Same ownership rules as the consultations route
// next door: the row must belong to the caller, or the caller must be an admin.

const UpdateBody = z.object({
  title: z.string().min(2).max(80).superRefine(georgianRefine('პაკეტის სახელი')).optional(),
  description: z.string().min(2).max(400).superRefine(georgianRefine('აღწერა')).optional(),
  lessonsCount: z.number().int().refine(n => (PACKAGE_LESSON_COUNTS as readonly number[]).includes(n), {
    message: 'გაკვეთილების რაოდენობა უნდა იყოს 4, 8 ან 12',
  }).optional(),
  minutesPerLesson: z.number().int().min(15).max(240).optional(),
  // Still the TOTAL — see the note in the sibling route.
  price: z.number().int().min(0).max(100000).optional(),
  validDays: z.number().int().min(7).max(365).optional(),
  // The expert's own on/off, separate from the admin's packagesEnabled gate.
  // This is the correct way to stop selling something — see DELETE below.
  active: z.boolean().optional(),
})

async function loadOwned(id: string, userId: string, role: string) {
  const p = await prisma.package.findUnique({
    where: { id },
    include: { tutor: { select: { userId: true } } },
  })
  if (!p) return { p: null, forbidden: false }
  if (p.tutor.userId !== userId && role !== 'ADMIN') return { p, forbidden: true }
  return { p, forbidden: false }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi([ROLE.EXPERT, ROLE.ADMIN])
  if (auth.response) return auth.response
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const user = auth.user
  const { id } = await ctx.params
  const { p, forbidden } = await loadOwned(id, user.id, user.role)
  if (!p) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (forbidden) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

  const parsed = UpdateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    const msg = firstGeorgianMessage(parsed.error)
    return NextResponse.json({ ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', message: msg ?? undefined }, { status: 400 })
  }

  // Same one-per-size rule as create, when the size is what changed.
  if (parsed.data.lessonsCount && parsed.data.lessonsCount !== p.lessonsCount) {
    const clash = await prisma.package.findFirst({
      where: { tutorId: p.tutorId, lessonsCount: parsed.data.lessonsCount, id: { not: id } },
      select: { id: true },
    })
    if (clash) {
      return NextResponse.json(
        { ok: false, error: 'DUPLICATE_SIZE', message: 'ამ ზომის პაკეტი უკვე გაქვს.' },
        { status: 409 },
      )
    }
  }

  // NOTE: editing does NOT touch anyone's running deal. Enrollment snapshots
  // lessonsTotal / priceTotal / perLessonPrice / minutesPerLesson at purchase,
  // precisely so a later edit cannot rewrite an agreement someone already paid
  // for. ⚠️ `minutesPerLesson` was NOT among them until 2026-08-06, and this
  // comment claimed otherwise: both spend routes read the length live, so
  // editing 90 → 50 here silently shortened every unbooked lesson of every
  // running enrollment. If a field is ever added above, snapshot it too — the
  // list is enforced nowhere but here and in the request route.
  const updated = await prisma.package.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ ok: true, item: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi([ROLE.EXPERT, ROLE.ADMIN])
  if (auth.response) return auth.response
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const user = auth.user
  const { id } = await ctx.params
  const { p, forbidden } = await loadOwned(id, user.id, user.role)
  if (!p) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (forbidden) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

  // Refuse while anyone is mid-package. Technically deletion is safe — the FK
  // is SetNull and Enrollment carries its own snapshot — but „the thing I
  // bought disappeared from their profile" is not a message a client should
  // ever have to interpret. Stopping sales is what `active: false` is for, and
  // the error says so.
  const inUse = await prisma.enrollment.count({
    where: { packageId: id, status: { in: ['REQUESTED', 'ACTIVE'] } },
  })
  if (inUse > 0) {
    return NextResponse.json(
      { ok: false, error: 'IN_USE', count: inUse, message: 'ამ პაკეტზე მიმდინარე ჩაწერაა — გამორთე გაყიდვიდან წაშლის ნაცვლად.' },
      { status: 409 },
    )
  }

  await prisma.package.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
