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
import { normalizePublicRef, topicLabel } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { clientThreadHref } from '@/lib/inboxRows'
import {
  RequestMessageInput, chatIsOpen, chatClosedReason, maskContacts,
  chatMessageView, type ChatSide,
} from '@/lib/requestChat'
import { notify } from '@/lib/notify'
import { sendMail } from '@/lib/mailer'
import { requestChatEmail } from '@/lib/emailTemplates'
import { recordOfferEvent } from '@/lib/offerEvents'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

type Resolved = {
  side: ChatSide
  offer: {
    id: string
    status: string
    requestId: string
    expertUserId: string | null
    companyId: string | null
    request: {
      publicRef: string; status: string; topic: string; email: string | null
      /** The account that filed it, or null for a request left by reference
       *  alone. The client's bell needs it — see the notify block in POST. */
      userId: string | null
    }
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
      request: { select: { publicRef: true, status: true, topic: true, email: true, userId: true } },
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
    // ⚠️ THE LAST 200, NOT THE FIRST (2026-08-17). This read `asc` + `take: 200`
    // while the comment claimed „the tail is what anybody reads" — so past the
    // cap every NEW message became invisible to both sides, and the read-receipt
    // sweep below (which is not capped) marked them read anyway. Messages
    // vanished and their badge cleared. Taken from the end and re-ordered here,
    // so the cap drops the OLDEST, which is what a chat window does.
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, fromClient: true, body: true, createdAt: true,
      readByClientAt: true, readByProviderAt: true,
    },
  })

  // ── THE BILLABLE MOMENT ──────────────────────────────────────────────────
  // Owner, 2026-08-17: the expert pays „როცა კლიენტმა წაიკითხა". This is that
  // instant, and it is recorded BEFORE the response is sent rather than in the
  // `after()` below — a badge may be lost to a swallowed error, an invoice line
  // may not.
  //
  // ⚠️ IT IS THE CLIENT OPENING A THREAD, NOT A PAGE LOAD, and that is what
  // makes it an honest signal: components/RequestChat mounts offer threads
  // COLLAPSED and only fetches when the pane is opened, so reaching this line
  // means somebody deliberately opened this expert's offer. If that ever
  // changes to `defaultOpen`, every expert on the request is billed at once for
  // an intention nobody had — which is why it is written down here rather than
  // left as a property of a component nobody reads.
  //
  // Price is 0 today; the row is what a price will later be attached to.
  if (r.side === 'CLIENT') {
    const rec = await recordOfferEvent(offerId, 'VIEWED', { via: 'chat-open' })
    // Never fails the read. A client must not be shown an error because our
    // bookkeeping stumbled — but it is LOGGED, because a lost billable event
    // that nobody hears about is the failure mode this table exists to end.
    if (!rec.ok) console.error('[offerEvents] VIEWED not recorded', offerId, rec.error)
  }

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
    // ⚠️ THE SAME BOOLEAN THE POST MASKS BY, so the pane can never say
    // „contacts are open" while the endpoint is still scrubbing numbers out of
    // what is typed into it. It is a STATE, not a contact: no phone, no email,
    // no name — only whether the firewall in lib/requestChat is still standing.
    // The owner's Messages artboard prints one line about it in the transcript,
    // and a line that could go stale would be worse than no line.
    contactOpen: r.offer.status === 'ACCEPTED',
    // Re-ordered oldest-first for the reader: the CAP takes from the end, the
    // BUBBLES read from the start.
    messages: [...rows].reverse().map(m => chatMessageView(m, r.side)),
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

  // The stronger of the two engagement signals, recorded beside the weaker one
  // so the billing trigger can be chosen from real numbers rather than from an
  // opinion — see lib/offerEvents for why both exist while the lead is free.
  if (r.side === 'CLIENT') {
    const rec = await recordOfferEvent(r.offer.id, 'REPLIED', { via: 'chat-post' })
    if (!rec.ok) console.error('[offerEvents] REPLIED not recorded', r.offer.id, rec.error)
  }

  // ── Telling the other side ───────────────────────────────────────────────
  // After the response has flushed. BOTH SIDES GET A BELL AND A MAIL — the
  // client's bell was added 2026-09-02 and the note that used to stand here
  // („a client has no account, so their only channel is the email they left")
  // described the by-reference era. It is still true of a GUEST, which is why
  // the mail stayed: see the client branch below.
  after(async () => {
    try {
      if (r.side === 'CLIENT') {
        for (const userId of r.providerUserIds) {
          await notify(userId, {
            // Typed (D12, 2026-08-19): same always-delivered group as GENERIC.
            type: 'REQUEST_MESSAGE',
            title: 'ახალი შეტყობინება მოთხოვნაზე',
            // ⚠️ THE TOPIC, NOT THE REFERENCE. `publicRef` is the client's
            // credential — see app/provider/requests/[id]/page. A bell body is
            // a place a provider reads it at a glance, which is exactly what
            // must not happen.
            body: topicLabel(r.offer.request.topic),
            /* ⚠️ THE THREAD, NOT THE LIST (2026-09-01). This pointed at
               /work/offers, so „ახალი შეტყობინება" put the provider on a list
               of every offer they had ever sent and left them to find the one
               that had just been written to — the same defect the won-job
               page's „მიმოწერა" button had. The offer id is right here. */
            href: `/work/offers/${r.offer.id}`,
          })
        }
        const emails = r.providerUserIds.length
          ? (await prisma.user.findMany({
              where: { id: { in: r.providerUserIds } }, select: { email: true },
            })).map(u => u.email).filter((e): e is string => !!e)
          : []
        const mail = await requestChatEmail({
          toProvider: true,
          topic: r.offer.request.topic,
          publicRef: r.offer.request.publicRef,
          preview: body,
        })
        for (const to of emails) {
          try { await sendMail({ key: 'chat.message', to, ...mail }) } catch { /* best-effort per address */ }
        }
      } else {
        /* ⚠️ THE CLIENT'S BELL NEVER RANG (fixed 2026-09-02). Owner: „მესიჯები
           რომ მოდიოდეს შეტყობინებებში კარგი იქნება. რადგან ესე დაიკარგება."
           This branch sent a mail and stopped, on the strength of a comment
           four lines up that said „a client has no account, so their only
           channel is the email they left". That was true while a request was
           something a stranger filed by reference; a signed-in client has had
           a room, a bell and an inbox since 2026-08-31.

           What it cost, and it is exactly the shape of the complaint: the
           FIRST event reached them — app/api/provider/offers already rings the
           bell when an offer lands — and every event after it, the actual
           conversation, was silent. Somebody sitting on the site while an
           expert answered them saw nothing move.

           ⚠️ NO `publicRef`, NOT IN THE BODY AND NOT IN THE HREF, the same
           rule the offer bell states: the reference is a credential (CLAUDE.md
           §5) and `clientThreadHref` needs only the offer id. The client owns
           the ref, but a notification row is a place it would sit in plain
           text for ever.

           REQUEST_MESSAGE, so /settings' „ახალი შეტყობინება · ახალი ტექსტი
           მიმოწერაში" finally governs BOTH directions of the same chat rather
           than the provider's half alone (lib/notify → prefKeyForType).

           The mail below is unchanged and still goes to whoever left an
           address — including a guest with no account, for whom it remains the
           only channel. */
        if (r.offer.request.userId) {
          await notify(r.offer.request.userId, {
            type: 'REQUEST_MESSAGE',
            title: 'ახალი შეტყობინება მოგივიდა',
            body: topicLabel(r.offer.request.topic),
            href: clientThreadHref(r.offer.id),
          })
        }
        if (r.offer.request.email) {
          const mail = await requestChatEmail({
            toProvider: false,
            topic: r.offer.request.topic,
            publicRef: r.offer.request.publicRef,
            preview: body,
          })
          try { await sendMail({ key: 'chat.message', to: r.offer.request.email, ...mail }) } catch { /* … */ }
        }
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
