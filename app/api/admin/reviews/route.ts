// GET /api/admin/reviews — every review, newest first.
//
// ⚠️ WHY THIS EXISTS AGAIN (2026-08-26). There WAS an admin reviews tab; it went
// on 2026-08-24 with `app/api/admin/reviews` when the consultation product was
// removed, because a review then hung off a Booking. It does not any more — it
// hangs off a RequestOffer the client marked done — so the CONTENT survived the
// deletion and its only moderation path did not. Measured that day: a review is
// printed on the provider's card (`app/experts/_providerCard`), in the profile
// hero and in the profile body, it carries free text a stranger typed, and the
// one way an admin could remove it was to delete the whole account it was
// written by. Public text with no way to take it down is the shape of problem
// that only becomes urgent once, and by then it is on the page.
//
// `lib/audit` records the removal — the action string `review.delete` was still
// in the audit tab's label table the whole time this route did not exist.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'

export async function GET(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  await ensureDbReady()

  // `?low=1` — the only filter worth having on day one: a 1★ or 2★ review is
  // the one an operator is looking for, and everything else is a scroll.
  const low = new URL(req.url).searchParams.get('low') === '1'

  const rows = await prisma.review.findMany({
    where: low ? { rating: { lte: 2 } } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      rating: true,
      body: true,
      anonymous: true,
      tutorResponse: true,
      respondedAt: true,
      createdAt: true,
      student: { select: { id: true, fullName: true, email: true } },
      offer: {
        select: {
          id: true,
          priceGel: true,
          doneAt: true,
          expertUser: { select: { id: true, fullName: true } },
          company: { select: { id: true, name: true } },
          request: { select: { publicRef: true, topic: true } },
        },
      },
    },
  })

  const items = rows.map(r => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    // The flag is the CLIENT's choice on the public page. The admin still sees
    // who wrote it — moderation without an author is moderation of nobody — but
    // the row says which way the public page renders it.
    anonymous: r.anonymous,
    authorName: r.student?.fullName ?? null,
    authorEmail: r.student?.email ?? null,
    providerName: r.offer?.expertUser?.fullName ?? r.offer?.company?.name ?? null,
    providerUserId: r.offer?.expertUser?.id ?? null,
    topic: r.offer?.request?.topic ?? null,
    publicRef: r.offer?.request?.publicRef ?? null,
    priceGel: r.offer?.priceGel ?? null,
    response: r.tutorResponse,
    respondedAt: r.respondedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))

  const [total, lowCount, unanswered] = await Promise.all([
    prisma.review.count(),
    prisma.review.count({ where: { rating: { lte: 2 } } }),
    prisma.review.count({ where: { tutorResponse: null } }),
  ])

  return NextResponse.json({ ok: true, items, counts: { total, low: lowCount, unanswered } })
}
