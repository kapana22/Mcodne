// „გავხსნა სხვებისთვის?" — the client turns their addressed request into an
// open one. 2026-08-20
//
// ⚠️ THE ONLY THING THAT WIDENS A REQUEST, AND IT IS A PERSON PRESSING A BUTTON.
// A request that named somebody carries `offerLimit: 1` (app/api/requests) and
// is invisible to every provider but its recipient. Owner: „თუ მცოდნესთან
// აგზავნის, მხოლოდ მცოდნესთან უნდა მივიდეს." Nothing expires it, no cron opens
// it, no timer fires — because publishing somebody's private choice to strangers
// without them asking is the one outcome this whole design exists to prevent.
// lib/requestLive → DIRECT_WINDOW_MS only decides when the BUTTON is offered.
//
// The invited offer is left exactly as it is: the person who was chosen keeps
// their thread, their place and their notification. This adds two places, it
// does not take one away — „open it up" is not „give up on them".
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizePublicRef, DEFAULT_OFFER_LIMIT } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { refBudgetSpent, noteRefMiss } from '@/lib/refGuard'
import { notFound } from 'next/navigation'

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  // The reference is the whole authorisation here too, and this route publishes
  // a private choice to strangers — wrong guesses are counted (lib/refGuard).
  if (refBudgetSpent(req)) return notFound()

  const { ref: raw } = await params
  const ref = normalizePublicRef(raw)
  if (!ref) { noteRefMiss(req); return notFound() }

  // ⚠️ A CONDITIONAL CLAIM, NOT A READ-THEN-WRITE. `offerLimit: 1` in the WHERE
  // is the guard: a second tab, a double-tap, or a request that was never
  // addressed all resolve to `count !== 1` and are answered without changing
  // anything. The same pattern app/api/bookings/[id] uses for accept.
  const claim = await prisma.serviceRequest.updateMany({
    where: { publicRef: ref, offerLimit: 1 },
    data: { offerLimit: DEFAULT_OFFER_LIMIT },
  })
  if (claim.count !== 1) {
    // A reference that matched nothing at all is a guess; one that matched a
    // request which was never addressed is a real client double-tapping. Only
    // the first spends budget.
    const exists = await prisma.serviceRequest.count({ where: { publicRef: ref } })
    if (!exists) noteRefMiss(req)
    return NextResponse.json({ ok: false, error: 'NOT_ADDRESSED' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
