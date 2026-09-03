import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { ASSIGNABLE_CATEGORY_WHERE } from '@/lib/categoryTree'
import { revealCategoryIfHidden } from '@/lib/categoryReveal'

/* Re-file an EXISTING expert. 2026-08-11.
 *
 * WHY THIS EXISTS. Approval was the only moment the platform could decide where
 * an expert belongs, and it decides by matching a free-text `specialty` against
 * category names. When it got one wrong there was no way back: this panel could
 * toggle „გადამოწმებული", „მთავარზე" and „პაკეტები", suspend the account and
 * even make it an admin — but not answer „this psychologist is filed under
 * business". The only remaining route was to ask the expert to fix it in their
 * own editor, which is both backwards (our taxonomy, our mistake) and, until
 * the same-day fix to PATCH /api/me/tutor, impossible for half the categories.
 *
 * Found live: ნინო გახოკია, whose application, specialty and profile all say
 * „ფსიქოლოგია", sitting in „ბიზნესი და ფინანსები" and therefore absent from the
 * psychology sphere she is the third expert of.
 *
 * `null` is a legitimate value and is NOT a disguised delete: an expert with no
 * category still appears in the unfiltered browse (lib/tutorsQuery treats the
 * category as a label, not a gate). It costs them the sphere pages and the
 * filter, which is why the panel says so rather than offering it silently.
 */
const Body = z.object({ categoryId: z.string().min(1).max(64).nullable() })

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { categoryId } = parsed.data

  // The SAME set approval and the profile editor use — lib/categoryTree owns
  // the rule, so an id that is refused on one screen cannot be accepted here.
  const cat = categoryId
    ? await prisma.category.findFirst({
      where: { ...ASSIGNABLE_CATEGORY_WHERE, id: categoryId },
      select: { id: true, name: true, status: true, parentId: true },
    })
    : null
  if (categoryId && !cat) {
    return NextResponse.json({
      ok: false,
      error: 'BAD_CATEGORY',
      message: 'ეს კატეგორია ვერ მიენიჭება — აირჩიე სხვა.',
    }, { status: 400 })
  }

  const before = await prisma.serviceProfile.findUnique({
    where: { id },
    select: { id: true, categoryId: true, category: { select: { name: true } } },
  })
  if (!before) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const updated = await prisma.serviceProfile.update({
    where: { id },
    data: { categoryId: cat?.id ?? null },
    select: { id: true, categoryId: true, category: { select: { id: true, name: true, status: true } } },
  })

  // Same rule as approval, from the SAME function (lib/categoryReveal, stage
  // 11): a sphere is HIDDEN because it has no expert yet, and putting one
  // there makes that false. For a sub-field the row revealed is its SPHERE.
  const spheres = cat
    ? await prisma.category.findMany({ select: { id: true, name: true, status: true, parentId: true } })
    : []
  await revealCategoryIfHidden(cat ?? undefined, spheres, {
    adminId: admin.id,
    reason: 'expert re-filed here',
    via: cat?.name ?? null,
  })

  // BOTH sides in the meta. „who moved this expert, and out of what" is the
  // question this row will be asked months later; the new value alone answers
  // half of it.
  await audit(admin.id, 'provider.category.set', {
    targetType: 'ServiceProfile',
    targetId: id,
    meta: {
      fromCategoryId: before.categoryId,
      fromCategoryName: before.category?.name ?? null,
      toCategoryId: updated.categoryId,
      toCategoryName: updated.category?.name ?? null,
    },
  })

  return NextResponse.json({ ok: true, provider: updated })
}
