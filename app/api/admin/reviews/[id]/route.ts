// DELETE /api/admin/reviews/[id] — take a review off the public page.
//
// ⚠️ IT DELETES RATHER THAN HIDES, and that is a decision worth the sentence.
// `Review` has no `hidden` column, and adding one would mean teaching every
// public reader (the card, the hero, the profile body, the average) to filter
// on it — four readers, any of which is a leak if it is missed. Removal is one
// row and no new state. What is NOT lost is the record: `lib/audit` keeps the
// actor, the reason and the review's own text in `meta`, so „why did that
// rating change" has an answer after the row is gone.
//
// The reason is REQUIRED. An account is deleted with a reason for the same
// reason (app/admin/_parts → AdminDeleteUserDialog): the audit row is the only
// place the story survives.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { ensureDbReady } from '@/lib/dbBoot'

const Body = z.object({ reason: z.string().trim().min(3).max(300) })

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  await ensureDbReady()
  const { id } = await params

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID', message: 'მიზეზი სავალდებულოა.' }, { status: 400 })
  }

  // Read it BEFORE the delete: the audit row carries the text, and after the
  // delete there is nothing to carry.
  const review = await prisma.review.findUnique({
    where: { id },
    select: {
      id: true, rating: true, body: true, createdAt: true,
      student: { select: { id: true, email: true } },
      offer: { select: { id: true, expertUserId: true, companyId: true, request: { select: { publicRef: true } } } },
    },
  })
  if (!review) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  // ⚠️ CLAIM THE ROW, DON'T CHECK IT (CLAUDE.md §4). Two admins on the same
  // review both read it above; `deleteMany` + a count is what makes the second
  // one a 409 instead of a silent second audit entry for a row that was already
  // gone.
  const gone = await prisma.review.deleteMany({ where: { id } })
  if (gone.count !== 1) {
    return NextResponse.json({ ok: false, error: 'ALREADY_GONE', message: 'შეფასება უკვე წაშლილია.' }, { status: 409 })
  }

  await audit(admin.id, 'review.delete', {
    targetType: 'Review',
    targetId: id,
    meta: {
      reason: parsed.data.reason,
      rating: review.rating,
      body: review.body,
      writtenAt: review.createdAt.toISOString(),
      authorId: review.student?.id ?? null,
      offerId: review.offer?.id ?? null,
      providerUserId: review.offer?.expertUserId ?? null,
      providerCompanyId: review.offer?.companyId ?? null,
      requestRef: review.offer?.request?.publicRef ?? null,
    },
  })

  return NextResponse.json({ ok: true })
}
