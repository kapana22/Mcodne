// POST /api/requests/[ref]/invite — the client writes to a provider first.
//
// ⚠️ THIS IS THE OTHER HALF OF THE PRODUCT. Until now the client could only
// wait: a conversation existed once somebody had bid, and not one second
// earlier, so the whole gap between „გავაგზავნე" and the first offer was dead
// air. Profi.ru does not have that gap — there a client picks somebody from the
// catalogue and offers them the job. Owner, 2026-08-18: „ეს გვინდა."
//
// ⚠️ THE ROW IT WRITES IS DEFINED IN lib/requestInvite, NOT HERE (2026-08-19).
// This route is now the ROOM's door into that helper — what an INVITED offer
// is, and the four things it guarantees, live in one file because the intake
// opens the same thread when somebody arrives from a provider's profile
// (`/request?to=<slug>`). Everything this route still owns is the part that is
// about being an endpoint: who may call it, how often, and which request the
// five-character code names.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef } from '@/lib/requests'
import { inviteProviderToRequest } from '@/lib/requestInvite'
import { requestsViewer } from '@/lib/requestsServer'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { refBudgetSpent, noteRefMiss } from '@/lib/refGuard'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  // ⚠️ THE MISSES GO ON THE REFERENCE BUDGET TOO, not only on this route's own
  // ceiling (2026-08-21). The `rateLimit` below bounds how fast THIS endpoint
  // can be worked; it does not tell lib/refGuard that somebody is sweeping the
  // reference space. Measured before the fix: 25 POSTs with random references
  // from one IP → 20 × 404 then 429, and a /open probe from that same IP was
  // still answering 409 — i.e. twenty free guesses that the guard never saw,
  // renewable every hour, and a hit force-invites a named provider.
  if (refBudgetSpent(req)) return notFound()

  const { ref: raw } = await params
  const ref = normalizePublicRef(raw)
  if (!ref) { noteRefMiss(req); return notFound() }

  // ⚠️ RATE LIMITED, because this endpoint CREATES ROWS and the only credential
  // it asks for is a five-character code. Without a ceiling one leaked
  // reference could open a thread with every expert on the platform, and each
  // one of those is a notification somebody receives.
  const limited = await rateLimit(`invite:${clientIp(req)}`, 20, 3600)
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({})) as { expertUserId?: unknown }
  const expertUserId = typeof body.expertUserId === 'string' ? body.expertUserId.trim() : ''
  if (!expertUserId) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  const request = await prisma.serviceRequest.findFirst({
    where: { publicRef: ref },
    select: { id: true, status: true, topic: true },
  })
  if (!request) { noteRefMiss(req); return notFound() }

  // ⚠️ THE ROW ITSELF IS NOT WRITTEN HERE. Status gate, allowlist check, the
  // „already talking?" answer and the notification are all lib/requestInvite —
  // the one definition this route and the intake share.
  const outcome = await inviteProviderToRequest(request, expertUserId)
  if (!outcome.ok) {
    if (outcome.error === 'CLOSED') {
      return NextResponse.json({ ok: false, error: 'CLOSED' }, { status: 409 })
    }
    return notFound()
  }

  return NextResponse.json({ ok: true, offerId: outcome.offerId, created: outcome.created })
}
