// GET /api/admin/requests — the moderation queue.
//
// TWO GATES, BOTH REQUIRED, and they answer differently on purpose — the same
// pair /api/admin/companies uses:
//   requestsViewer() → 404. „This deployment has no such endpoint." Runs FIRST,
//                      so a non-admin learns nothing, not even that admin-only
//                      endpoints exist under this path.
//   requireRoleApi() → 401/403. „You are not an admin." Only reachable once the
//                      subsystem is visible to you at all.
//
// They come apart for an allowlisted PROVIDER: the subsystem is visible to
// them, and this endpoint is not. That is exactly why it is two checks.
//
// ⚠️ THIS IS THE ONE ENDPOINT THAT RETURNS CONTACT DETAILS, and it does so
// deliberately: the admin's job is to phone the person. Every other reader —
// provider or client — goes through the shaping functions in lib/requests,
// which cannot emit these columns at all.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { REQUEST_STATUSES } from '@/lib/requests'
import { requestsViewer, requestsNotFound } from '@/lib/requestsServer'

export async function GET(req: Request) {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) return requestsNotFound()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  await ensureDbReady()

  // One optional filter, validated against the enum rather than passed through.
  // An unrecognised value returns the whole queue instead of an empty page: a
  // stale bookmark should show an operator their work, not nothing.
  const raw = new URL(req.url).searchParams.get('status')
  const status = REQUEST_STATUSES.find(s => s === raw)

  const requests = await prisma.serviceRequest.findMany({
    where: status ? { status } : {},
    // UNHANDLED FIRST. `status` sorts alphabetically, which would put CLOSED at
    // the top — so the order is explicit: NEW before everything, then newest
    // first inside each group. Postgres sorts an enum by its DECLARED order
    // (NEW, VERIFIED, REJECTED, MATCHED, CLOSED), which is the queue order, and
    // that is why the enum is declared in that order.
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    // A ceiling rather than a cursor: this queue is a phone list. If it ever
    // passes 500 rows the bottleneck is the person, not the page, and paging it
    // would be solving the wrong problem.
    take: 500,
    select: {
      id: true, publicRef: true, description: true,
      kind: true, topic: true, details: true,
      budgetMin: true, budgetMax: true, budgetUnit: true,
      timing: true, format: true, city: true,
      contactName: true, phone: true, email: true,
      status: true, adminNote: true,
      offerLimit: true, offerCount: true,
      verifiedAt: true, createdAt: true,
      category: { select: { id: true, name: true } },
      // No avatar anywhere in this payload, so lib/avatarSrc does not apply —
      // the client here is a name and a phone number, not an account with a
      // picture. (tests/apiPayloadHygiene pins that rule for routes that DO
      // select avatarUrl.)
      user: { select: { id: true, fullName: true, email: true } },
      offers: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, priceGel: true, daysEstimate: true, message: true,
          status: true, createdAt: true, providerKind: true,
          expertUser: { select: { id: true, fullName: true, email: true, phone: true } },
          company: { select: { id: true, name: true } },
        },
      },
    },
  })

  // ── Candidate experts, per sphere ────────────────────────────────────────
  // The request stores the sphere its topic maps onto (categoryId, derived at
  // write time), and the operator's next move after verifying is telling the
  // right experts — so the panel shows who is already filed there, beside the
  // request. ONE grouped query for every sphere on the page rather than one per
  // row, then distributed in memory.
  //
  // Names and slugs only, deliberately: this payload must not become a second
  // expert profile API, and lib/avatarSrc's rule (no raw avatars in list
  // payloads) is easiest to keep by not selecting images at all.
  const categoryIds = [...new Set(requests.map(r => r.category?.id).filter((v): v is string => !!v))]
  const experts = categoryIds.length
    ? await prisma.tutorProfile.findMany({
        where: { categoryId: { in: categoryIds }, available: true },
        orderBy: [{ verified: 'desc' }, { rating: 'desc' }],
        select: {
          id: true, slug: true, categoryId: true, verified: true, rating: true,
          user: { select: { fullName: true, email: true } },
        },
      })
    : []
  const candidatesByCategory: Record<string, typeof experts> = {}
  for (const e of experts) {
    if (!e.categoryId) continue
    ;(candidatesByCategory[e.categoryId] ??= []).push(e)
  }

  // Counts for the filter bar, in one grouped query rather than five. Sent as a
  // plain object so the panel does not have to know the enum order.
  const grouped = await prisma.serviceRequest.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  const counts = Object.fromEntries(grouped.map(g => [g.status, g._count._all]))

  // ── THE NUMBER THAT WILL SET THE PRICE ───────────────────────────────────
  // The lead is free today and will not stay free (owner, 2026-08-17). What
  // decides the first real number is the ratio below: of the offers experts
  // send, how many does a client ever OPEN, and how many do they answer.
  //
  // It is also the health of the whole marketplace and the thing comparable
  // platforms get told about rather than knowing — Bark's own users measure
  // roughly 44% of paid leads ever responding and quote it back at them. One
  // grouped query over lib/offerEvents, so the panel shows it beside the queue
  // instead of it living in somebody's spreadsheet.
  const eventTotals = await prisma.offerEvent.groupBy({
    by: ['type'],
    _count: { _all: true },
  })
  const funnel = Object.fromEntries(eventTotals.map(e => [e.type, e._count._all]))

  return NextResponse.json({ ok: true, requests, counts, candidatesByCategory, funnel })
}
