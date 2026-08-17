// The conversation endpoint — both sides, one route.
//
//   GET  ?offerId=…&ref=…   the thread, as the caller's side reads it
//   POST { offerId, body, ref? }   say something
//
// ⚠️ THE SIDE IS DERIVED, NEVER DECLARED. A caller says which OFFER they mean
// and (if they are the client) proves it with the reference; the endpoint works
// out whether they are the client or the provider from what they could prove.
// A `side: 'CLIENT'` field in the body would be exactly the thing a crafted
// request lies about.
//
// TWO WAYS TO BE AUTHORISED, and only two:
//   CLIENT    the `ref` matches the offer's request. Possession of the
//             reference IS the client's identity — they have no account, by
//             design, and the ref is crypto-random precisely so it can carry
//             this. Same key that already opens /request/<ref>.
//   PROVIDER  the session user owns this offer (as the expert, or as a member
//             of the company that made it).
//
// Anything else is 404 — never 403, for the reason the whole subsystem answers
// 404: a 403 confirms the thread is there.

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import {
  RequestMessageInput, chatIsOpen, chatClosedReason, maskContacts,
  chatMessageView, type ChatSide,
} from '@/lib/requestChat'
import { notify } from '@/lib/notify'
import { sendMail } from '@/lib/mailer'
import { requestChatEmail } from '@/lib/emailTemplates'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

type Resolved = {
  side: ChatSide
  offer: {
    id: string
    status: string
    requestId: string
    expertUserId: string | null
    companyId: string | null
    request: { publicRef: string; status: string; topic: string; email: string | null }
  }
  /** Every provider account behind this offer — one expert, or a company's
   *  members. The notification audience, and the read-receipt owners. */
  providerUserIds: string[]
}

/**
 * Who is asking, and about which thread.
 *
 * Returns null for every failure — a caller who may not read this thread must
 * not be able to tell „wrong reference" from „no such offer".
 */
async function resolve(offerId: string, ref: string | null): Promise<Resolved | null> {
  const offer = await prisma.requestOffer.findUnique({
    where: { id: offerId },
    select: {
      id: true, status: true, requestId: true, expertUserId: true, companyId: true,
      request: { select: { publicRef: true, status: true, topic: true, email: true } },
    },
  })
  if (!offer) return null

  const providerUserIds = offer.expertUserId
    ? [offer.expertUserId]
    : (await prisma.companyMember.findMany({
        where: { companyId: offer.companyId ?? '' },
        select: { userId: true },
      })).map(m => m.userId)

  // The client: possession of the reference.
  const normalised = normalizePublicRef(ref)
  if (normalised && normalised === offer.request.publicRef) {
    return { side: 'CLIENT', offer, providerUserIds }
  }

  // The provider: the session owns this offer.
  const viewer = await requestsViewer()
  if (viewer.provider) {
    const p = viewer.provider
    const owns = p.kind === 'EXPERT'
      ? offer.expertUserId === p.userId
      : offer.companyId === p.companyId
    if (owns) return { side: 'PROVIDER', offer, providerUserIds }
  }

  return null
}

export async function GET(req: Request) {
  // The subsystem gate first, as everywhere else — a caller who may not see the
  // feature must not learn anything from it, including whether a thread exists.
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  await ensureDbReady()
  const url = new URL(req.url)
  const offerId = (url.searchParams.get('offerId') ?? '').trim()
  if (!offerId) return notFound()

  const r = await resolve(offerId, url.searchParams.get('ref'))
  if (!r) return notFound()

  const rows = await prisma.requestMessage.findMany({
    where: { offerId },
    orderBy: { createdAt: 'asc' },
    // A conversation this long is not a conversation; the tail is what anybody
    // reads and the cap keeps one payload from becoming a page.
    take: 200,
    select: {
      id: true, fromClient: true, body: true, createdAt: true,
      readByClientAt: true, readByProviderAt: true,
    },
  })

  // Reading IS the receipt — marked here rather than by a separate call, so a
  // reader who never clicks anything still clears the badge. Only the OTHER
  // side's messages: marking your own read would be meaningless.
  after(async () => {
    try {
      await prisma.requestMessage.updateMany({
        where: r.side === 'CLIENT'
          ? { offerId, fromClient: false, readByClientAt: null }
          : { offerId, fromClient: true, readByProviderAt: null },
        data: r.side === 'CLIENT'
          ? { readByClientAt: new Date() }
          : { readByProviderAt: new Date() },
      })
    } catch { /* a receipt is never worth failing a read over */ }
  })

  return NextResponse.json({
    ok: true,
    side: r.side,
    open: chatIsOpen(r.offer.request, r.offer),
    closedReason: chatClosedReason(r.offer.request, r.offer),
    messages: rows.map(m => chatMessageView(m, r.side)),
  })
}

export async function POST(req: Request) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  const parsed = RequestMessageInput.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()
  const r = await resolve(parsed.data.offerId, parsed.data.ref ?? null)
  if (!r) return notFound()

  if (!chatIsOpen(r.offer.request, r.offer)) {
    return NextResponse.json({ ok: false, error: 'CLOSED' }, { status: 409 })
  }

  // ── The contact firewall ─────────────────────────────────────────────────
  // Contacts are open only once THIS offer is the accepted one; until then a
  // phone number in a message is the choice being taken away from the client
  // and the record from us. Masked rather than refused — see lib/requestChat.
  const contactIsOpen = r.offer.status === 'ACCEPTED'
  const { body, masked } = maskContacts(parsed.data.body, contactIsOpen)

  const created = await prisma.requestMessage.create({
    data: {
      offerId: r.offer.id,
      requestId: r.offer.requestId,
      fromClient: r.side === 'CLIENT',
      // The author, on the provider side only. For a company message that is
      // the member who typed it — the thread belongs to the company, the
      // sentence belongs to a person.
      fromUserId: r.side === 'CLIENT' ? null : (viewer.user?.id ?? null),
      body,
    },
    select: { id: true, createdAt: true },
  })

  // ── Telling the other side ───────────────────────────────────────────────
  // After the response has flushed. A client has no account, so their only
  // channel is the email they left (optional — many leave none, and the admin's
  // call covers those). A provider has both.
  after(async () => {
    try {
      if (r.side === 'CLIENT') {
        for (const userId of r.providerUserIds) {
          await notify(userId, {
            type: 'GENERIC',
            title: 'ახალი შეტყობინება მოთხოვნაზე',
            body: r.offer.request.publicRef,
            href: '/provider/offers',
          })
        }
        const emails = r.providerUserIds.length
          ? (await prisma.user.findMany({
              where: { id: { in: r.providerUserIds } }, select: { email: true },
            })).map(u => u.email)
          : []
        const mail = requestChatEmail({
          toProvider: true,
          topic: r.offer.request.topic,
          publicRef: r.offer.request.publicRef,
          preview: body,
        })
        for (const to of emails) {
          try { await sendMail({ to, ...mail }) } catch { /* best-effort per address */ }
        }
      } else if (r.offer.request.email) {
        const mail = requestChatEmail({
          toProvider: false,
          topic: r.offer.request.topic,
          publicRef: r.offer.request.publicRef,
          preview: body,
        })
        try { await sendMail({ to: r.offer.request.email, ...mail }) } catch { /* … */ }
      }
    } catch { /* notification is best-effort; the message is written */ }
  })

  return NextResponse.json({
    ok: true,
    id: created.id,
    // Told plainly, because silently editing somebody's words is worse than the
    // leak it prevents.
    masked,
  })
}
