// POST /api/requests/[ref]/offers/[offerId]/withdraw — the provider takes a
// SENT offer back (D8).
//
// PROVIDER ONLY, by session — gated like app/api/provider/offers (an admin
// with no allowlist row has no identity to withdraw as, and is 404 like
// everyone else). The `[ref]` segment is a placeholder here and is never read:
// it is the client's credential and a provider must never need it.
//
// ⚠️ CLAIMED, NOT CHECKED: updateMany on { id, status: 'SENT', <the session's
// provider> } — a session that does not own the offer, or an offer already
// decided, matches zero rows → 409 NOT_OPEN. The place the offer took against
// `offerLimit` is given back with the same guarded decrement the offer route
// uses on failure (lib/offerLifecycle → withdrawOffer). No notification: the
// client's page simply stops listing it.

import { NextResponse } from 'next/server'
import { ensureDbReady } from '@/lib/dbBoot'
import { requestsViewer, requestsNotFound } from '@/lib/requestsServer'
import { withdrawOffer } from '@/lib/offerLifecycle'

export async function POST(_req: Request, { params }: { params: Promise<{ ref: string; offerId: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) return requestsNotFound()
  const provider = viewer.provider
  if (!provider) return requestsNotFound()

  const { offerId } = await params
  if (!offerId) return requestsNotFound()

  await ensureDbReady()

  const r = await withdrawOffer(offerId, provider)
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 409 })
  return NextResponse.json({ ok: true })
}
