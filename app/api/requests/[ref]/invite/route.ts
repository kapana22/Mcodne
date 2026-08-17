// POST /api/requests/[ref]/invite — the client writes to an expert first.
//
// ⚠️ THIS IS THE OTHER HALF OF THE PRODUCT. Until now the client could only
// wait: a conversation existed once somebody had bid, and not one second
// earlier, so the whole gap between „გავაგზავნე" and the first offer was dead
// air. Profi.ru does not have that gap — there a client picks somebody from the
// catalogue and offers them the job. Owner, 2026-08-18: „ეს გვინდა."
//
// What it creates is an INVITED offer row: a thread to hang a conversation on,
// carrying no price, consuming no place against `offerLimit`, and impossible to
// accept. See prisma/schema → RequestOfferStatus.INVITED.
//
// ⚠️ IT DOES NOT OPEN THE CONTACT AND MUST NEVER. The masking rule in
// lib/requestChat applies to this thread exactly as it does to a bid — the
// promise is „the number opens when you choose", and a client who writes to
// five experts has chosen nobody.

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef, topicLabel } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { notify } from '@/lib/notify'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  const { ref: raw } = await params
  const ref = normalizePublicRef(raw)
  if (!ref) return notFound()

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
  if (!request) return notFound()

  // A settled or dead request takes no new conversations: the client has either
  // chosen somebody or stopped waiting, and a thread opened now would be a
  // message into a room nobody is in.
  if (request.status !== 'NEW' && request.status !== 'VERIFIED') {
    return NextResponse.json({ ok: false, error: 'CLOSED' }, { status: 409 })
  }

  // The expert must be somebody this platform actually routes work to. Writing
  // to an arbitrary user id would turn a request reference into a way to message
  // any account on the site.
  const access = await prisma.requestAccess.findFirst({
    where: { userId: expertUserId, active: true, kind: 'EXPERT' },
    select: { userId: true },
  })
  if (!access) return notFound()

  // ── Already talking? ─────────────────────────────────────────────────────
  // The unique index on (requestId, expertUserId) means there can only ever be
  // one row per pair, which is the behaviour we want rather than an error to
  // handle: a client who taps the same expert twice, or who writes to somebody
  // that has already bid, lands in the conversation that exists.
  const existing = await prisma.requestOffer.findFirst({
    where: { requestId: request.id, expertUserId },
    select: { id: true, status: true },
  })
  if (existing) {
    return NextResponse.json({ ok: true, offerId: existing.id, created: false })
  }

  const offer = await prisma.requestOffer.create({
    data: {
      requestId: request.id,
      providerKind: 'EXPERT',
      expertUserId,
      status: 'INVITED',
      // ⚠️ ZERO IS NOT A PRICE HERE, it is „no price yet" — the column is
      // required and an INVITED row is not an offer. Nothing renders it: the
      // client's list filters this status out and the provider's screen shows
      // the conversation, not a number.
      priceGel: 0,
      message: '',
    },
    select: { id: true },
  })

  // The expert hears about it. NOT by email — this is a conversation opening,
  // not work being awarded, and the message they are about to receive will send
  // its own mail through /api/request-chat. A second one here would mean two
  // emails for one event.
  after(async () => {
    try {
      await notify(expertUserId, {
        type: 'GENERIC',
        title: 'კლიენტი გწერს',
        // The topic, never the reference — the reference is the client's
        // credential. Same rule as every other provider-facing notification.
        body: topicLabel(request.topic),
        href: '/provider/offers',
      })
    } catch { /* notification is best-effort; the thread is written */ }
  })

  return NextResponse.json({ ok: true, offerId: offer.id, created: true })
}
