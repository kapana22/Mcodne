// POST /api/requests/[ref]/offers/[offerId]/review — the client rates a
// finished job. Body { rating 1..5, body ≤ 300 }.
//
// CLIENT ONLY, by possession of the reference (like `accept`). The review is
// signed by the request's account user (ServiceRequest.userId — attached by
// lib/requestAccount when the request was made); a request that never got an
// account cannot carry one, and the page hides the picker in that case.
//
// ⚠️ ONCE, AND THE DATABASE DECIDES. Review.offerId is unique: the gate below
// (lib/offerLifecycle → reviewGate) is for the honest answer — NOT_DONE,
// ALREADY_REVIEWED — and the create's P2002 is the guard against two tabs.
// Both are 409.

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef, topicLabel, PROVIDER_ROUTE } from '@/lib/requests'
import { requestsViewer, requestsNotFound } from '@/lib/requestsServer'
import { ReviewInput, reviewGate, providerUserIdsOf } from '@/lib/offerLifecycle'
import { notifyMany } from '@/lib/notify'

export async function POST(req: Request, { params }: { params: Promise<{ ref: string; offerId: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return requestsNotFound()

  const { ref: raw, offerId } = await params
  const ref = normalizePublicRef(raw)
  if (!ref || !offerId) return requestsNotFound()

  const parsed = ReviewInput.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  // The offer must belong to THIS request — the ref in the where is the
  // authorisation, and an offer under somebody else's reference is a 404.
  const offer = await prisma.requestOffer.findFirst({
    where: { id: offerId, request: { publicRef: ref } },
    select: {
      id: true, doneAt: true, expertUserId: true, companyId: true,
      review: { select: { id: true } },
      request: { select: { userId: true, topic: true } },
    },
  })
  if (!offer) return requestsNotFound()

  // 🔒 NOBODY RATES THEMSELVES. Resolved here rather than in the gate because a
  // COMPANY offer has no single account behind it — every member is the
  // provider, and a colleague signing the review is the same act. The list is
  // the one the notification audience already uses, so the two cannot disagree
  // about who „the provider" is.
  const providerIds = await providerUserIdsOf(offer)
  const selfReview = !!offer.request.userId && providerIds.includes(offer.request.userId)

  const gate = reviewGate({
    doneAt: offer.doneAt,
    reviewed: offer.review !== null,
    authorUserId: offer.request.userId,
    selfReview,
  })
  if (gate !== 'OK') return NextResponse.json({ ok: false, error: gate }, { status: 409 })

  try {
    await prisma.review.create({
      data: {
        offerId: offer.id,
        studentId: offer.request.userId!,
        // ⚠️ `tutorId: null` WAS WRITTEN HERE AND THE COLUMN IS GONE
        // (2026-08-26). It said „not a lesson: no TutorProfile behind a trades
        // offer" — true, and then the services-only migration dropped
        // Review.tutorId outright, so this create threw
        // PrismaClientValidationError and NOBODY COULD LEAVE A REVIEW on a
        // finished job. `offerId` is the key a review hangs on now, and
        // app/experts/[slug] joins the provider through the offer.
        rating: parsed.data.rating,
        body: parsed.data.body,
      },
      select: { id: true },
    })
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ ok: false, error: 'ALREADY_REVIEWED' }, { status: 409 })
    throw e
  }

  // The provider hears — REVIEW_NEW is the same pref group an expert's lesson
  // review uses. Best-effort, after the response.
  after(async () => {
    try {
      // The same list the gate above resolved — one query, one answer about who
      // the provider is.
      await notifyMany(providerIds, {
        type: 'REVIEW_NEW',
        title: 'ახალი შეფასება',
        body: topicLabel(offer.request.topic),
        href: `${PROVIDER_ROUTE}/offers`,
      })
    } catch { /* best-effort */ }
  })

  return NextResponse.json({ ok: true })
}
