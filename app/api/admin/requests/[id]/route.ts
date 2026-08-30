// PATCH /api/admin/requests/[id] — verify, reject, close, annotate, re-limit.
//
// One endpoint for every admin edit to a request, because they arrive together:
// the operator finishes the phone call, types what was said, and marks it
// verified in the same breath. Splitting that into three endpoints would mean
// three audit rows for one decision.
//
// Every mutating call writes an AuditLog row — the existing pattern, and here
// it is load-bearing: „verified" is a claim that a human phoned somebody, and
// the only evidence that happened is the row saying who marked it.

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { audit } from '@/lib/audit'
import { mailVerifiedRequest, refundDeadRequest } from '@/lib/requestJobs'
import { AdminRequestPatch, topicLabel } from '@/lib/requests'
import { requestsViewer, requestsNotFound } from '@/lib/requestsServer'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) return requestsNotFound()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user

  const { id } = await params
  const parsed = AdminRequestPatch.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  const before = await prisma.serviceRequest.findUnique({
    where: { id },
    select: {
      id: true, publicRef: true, status: true, offerCount: true, offerLimit: true,
      kind: true, topic: true, budgetMin: true, budgetMax: true, timing: true,
    },
  })
  if (!before) return requestsNotFound()

  const { status, adminNote, offerLimit } = parsed.data

  // Lowering the limit below the offers already received would violate the
  // database CHECK (offerCount <= offerLimit) and surface as a 500 on a
  // dropdown. Answered as its own code so the panel can say what happened —
  // the offers that exist cannot be un-received.
  if (typeof offerLimit === 'number' && offerLimit < before.offerCount) {
    return NextResponse.json(
      { ok: false, error: 'LIMIT_BELOW_RECEIVED', received: before.offerCount },
      { status: 409 },
    )
  }

  const data: Record<string, unknown> = {}
  if (adminNote !== undefined) data.adminNote = adminNote?.trim() || null
  if (typeof offerLimit === 'number') data.offerLimit = offerLimit
  if (status) {
    data.status = status
    // Stamped on the transition INTO verified and never cleared afterwards:
    // „when was this checked" stays true even if it is later closed. Set here
    // rather than by a trigger so the value and the audit row are written by
    // the same statement and cannot disagree.
    if (status === 'VERIFIED') {
      data.verifiedAt = new Date()
      data.verifiedById = admin.id
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'NOTHING_TO_DO' }, { status: 400 })
  }

  // A CLAIM, NOT AN UPDATE (D4, 2026-08-18). Two admins with the same row open
  // — or one admin's second tab — used to overwrite each other silently: the
  // status the second one saw when they clicked is not the status the row had
  // when their write landed. The row is claimed on the status it was read at;
  // a mismatch is a 409 the panel can show („ეს მოთხოვნა ახლახან შეიცვალა"),
  // and the audit row is written only for a write that actually happened.
  // Same pattern as bookings/[id]/cancel and the CLAUDE.md rule on guards.
  const claim = await prisma.serviceRequest.updateMany({
    where: { id, status: before.status },
    data,
  })
  if (claim.count !== 1) {
    return NextResponse.json({ ok: false, error: 'CHANGED', message: 'ეს მოთხოვნა ახლახან შეიცვალა — განაახლე გვერდი.' }, { status: 409 })
  }
  const updated = await prisma.serviceRequest.findUniqueOrThrow({
    where: { id },
    select: { id: true, publicRef: true, status: true, adminNote: true, offerLimit: true, offerCount: true },
  })

  // ⚠️ THE ADMIN'S CLOSE OWES THE SAME MONEY AS THE CRON'S (2026-08-30). The
  // sweep refunds paid contacts on a request that died unanswered; an operator
  // closing that same request by hand must not be the way the promise gets
  // skipped — the provider cannot see which of the two ended it.
  //
  // REJECTED IS UNCONDITIONAL, and that is the deliberate asymmetry. Closing
  // with offers in hand is an ordinary ending: somebody answered, the money
  // bought what it was for. Rejecting says the REQUEST was never real — a
  // duplicate, a test, a number that does not answer — and nobody should be
  // left holding 1₾ for a lead we ourselves have just declared invalid.
  if (status === 'REJECTED' || (status === 'CLOSED' && before.offerCount === 0)) {
    after(() => refundDeadRequest(id, topicLabel(before.topic)))
  }

  await audit(admin.id, status ? `request.${status.toLowerCase()}` : 'request.update', {
    targetType: 'ServiceRequest',
    targetId: id,
    meta: {
      publicRef: updated.publicRef,
      // The previous status is recorded because that is the half you cannot
      // reconstruct later: the row now says what it became, and only the log
      // says what it was.
      from: before.status,
      to: updated.status,
      ...(typeof offerLimit === 'number' ? { offerLimit } : {}),
      ...(adminNote !== undefined ? { noteChanged: true } : {}),
    },
  })

  // ⚠️ VERIFYING NO LONGER SENDS ANYTHING (2026-08-18), and the block that did
  // is gone rather than disabled.
  //
  // Verification and distribution used to be one edge: NEW → VERIFIED mailed
  // the routed audience on the spot. Fusing them meant the operator could not
  // verify without broadcasting, could not choose who heard, and could not
  // re-send without first un-verifying. Owner: „ხელით მართვაც დამატე, რომ
  // გავაგზავნო ყველა ქიმიის მასწავლებელთან."
  //
  // They are two actions now. This PATCH sets the status; POST (below) sends,
  // takes an explicit recipient list, and can be run again.

  return NextResponse.json({ ok: true, request: updated })
}

/**
 * POST /api/admin/requests/[id] — tell providers about it. On purpose, by hand.
 *
 * ⚠️ SEPARATE FROM VERIFICATION, AND THAT IS THE WHOLE POINT (2026-08-18).
 * Sending used to be a side effect of marking a request verified, so the
 * operator got one shot, at a moment chosen by a status change, at an audience
 * chosen by a rule. Owner: „ხელით მართვაც დამატე, რომ გავაგზავნო ყველა ქიმიის
 * მასწავლებელთან." Now it is a button, it takes a list, and it can be pressed
 * again tomorrow.
 *
 * Body: `{ userIds?: string[] }` — omit to use the routing rules, pass a list to
 * override them. An EMPTY array sends to nobody and is not the same as omitting
 * it (see lib/requestJobs).
 *
 * ⚠️ IT IS DELIBERATELY REPEATABLE. Re-sending is how an operator reaches
 * somebody who joined the allowlist after the first send — and every run writes
 * its own audit row, so „who was told, and when" is a history rather than a
 * single overwritten fact.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) return requestsNotFound()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user

  const { id } = await params
  await ensureDbReady()

  const row = await prisma.serviceRequest.findUnique({
    where: { id },
    select: { id: true, publicRef: true, status: true },
  })
  if (!row) return requestsNotFound()

  // A request nobody may bid on must not be advertised. REJECTED and CLOSED are
  // dead; NEW has not been checked by anybody yet, and sending it would undo the
  // reason verification exists at all.
  if (row.status !== 'VERIFIED') {
    return NextResponse.json({ ok: false, error: 'NOT_VERIFIED' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({})) as { userIds?: unknown }
  const userIds = Array.isArray(body.userIds)
    ? body.userIds.filter((v): v is string => typeof v === 'string')
    : undefined

  const { audience, sent } = await mailVerifiedRequest(row.id, userIds)

  await audit(admin.id, 'request.routed', {
    targetType: 'ServiceRequest',
    targetId: row.id,
    // The allowlist moves, so „who was told, and was it targeted or chosen" is
    // only knowable at this moment. Recorded per send, never overwritten.
    meta: { publicRef: row.publicRef, audience, sent, manual: userIds !== undefined },
  })

  return NextResponse.json({ ok: true, audience, sent })
}
