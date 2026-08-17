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
import { mailVerifiedRequest } from '@/lib/requestJobs'
import { AdminRequestPatch } from '@/lib/requests'
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

  const updated = await prisma.serviceRequest.update({
    where: { id },
    data,
    select: { id: true, publicRef: true, status: true, adminNote: true, offerLimit: true, offerCount: true },
  })

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

  // ── Verification is the moment providers hear about it ───────────────────
  // …and ONLY on the NEW → VERIFIED edge. Re-saving a note on an already
  // verified request must not re-notify everybody, which is how a working
  // notification becomes one people mute.
  if (status === 'VERIFIED' && before.status !== 'VERIFIED') {
    // ── The one moment providers hear about a request ────────────────────
    // ROUTED, not broadcast: the mail goes to the providers filed under the
    // request's sphere, and falls back to everybody when the sphere is unknown
    // or empty (lib/requestRouting explains why the fallback is the point).
    // Everyone still SEES it in the queue — the mail is a nudge, not a
    // permission.
    //
    // ONLY on the NEW → VERIFIED edge: re-saving a note on an already-verified
    // request must not re-notify, which is how a working notification becomes
    // one people mute.
    //
    // After the response has flushed. The routing, the bell and the sending
    // all live in lib/requestJobs so the cron's 6-hour re-mail runs the exact
    // same code — two copies of „who should hear about this" is how the nudge
    // and the first mail end up disagreeing.
    after(async () => {
      try {
        const { audience, sent } = await mailVerifiedRequest(before.id)
        await audit(admin.id, 'request.routed', {
          targetType: 'ServiceRequest', targetId: before.id,
          // Recorded because it is the one thing the panel cannot recompute
          // later: the allowlist moves, so „who was told, and was it targeted"
          // is only knowable now.
          meta: { publicRef: before.publicRef, audience, sent },
        })
      } catch { /* notification is best-effort; the verification stands */ }
    })
  }

  return NextResponse.json({ ok: true, request: updated })
}
