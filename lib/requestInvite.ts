// „THE CLIENT WROTE TO THIS PROVIDER FIRST" — the one definition.
//
// ⚠️ IT WAS INLINE IN THE ROUTE UNTIL 2026-08-19, and there was exactly one
// caller, so that was right. There are two now: the room's „მიწერე" button
// (POST /api/requests/[ref]/invite) and the intake itself, when the visitor
// arrived from somebody's profile (`/request?to=<slug>` — see lib/requestTarget).
// Copying eleven lines into the second one would have been copying the four
// guarantees below with them, and the copy is the one that eventually drops one.
//
// What it creates is an INVITED offer row: a thread to hang a conversation on,
// carrying NO PRICE, consuming NO PLACE against `offerLimit`, and impossible to
// accept. See prisma/schema → RequestOfferStatus.INVITED.
//
// ⚠️ IT DOES NOT OPEN THE CONTACT AND MUST NEVER. The masking rule in
// lib/requestChat applies to this thread exactly as it does to a bid — the
// promise is „the number opens when you choose", and a client who wrote to five
// providers has chosen nobody.

import { after } from 'next/server'
import { prisma } from './prisma'
import { topicLabel, PROVIDER_ROUTE } from './requests'
import { notify } from './notify'

/** As much of the request as the invite needs — the caller already holds it,
 *  and re-reading the row here would be a second round trip for facts that
 *  cannot have changed inside one handler. */
type InvitableRequest = { id: string; status: string; topic: string }

type InviteOutcome =
  | { ok: true; offerId: string; created: boolean }
  /** The provider is not somebody this platform routes work to (or does not
   *  exist). Answered as NOT_FOUND, never as „no access": a request reference
   *  must not become a way to probe which accounts are on the allowlist. */
  | { ok: false; error: 'NOT_FOUND' }
  /** A settled or dead request takes no new conversations. */
  | { ok: false; error: 'CLOSED' }

/**
 * Open (or find) the INVITED thread between this request and this provider.
 *
 * Idempotent by the unique index on (requestId, expertUserId): a client who
 * taps the same provider twice, or one whose provider has already bid, lands in
 * the conversation that exists rather than meeting an error.
 */
export async function inviteProviderToRequest(
  request: InvitableRequest,
  expertUserId: string,
): Promise<InviteOutcome> {
  // A settled or dead request takes no new conversations: the client has either
  // chosen somebody or stopped waiting, and a thread opened now would be a
  // message into a room nobody is in.
  if (request.status !== 'NEW' && request.status !== 'VERIFIED') {
    return { ok: false, error: 'CLOSED' }
  }

  // The provider must be somebody this platform actually routes work to.
  // Writing to an arbitrary user id would turn a request reference into a way
  // to message any account on the site.
  const access = await prisma.requestAccess.findFirst({
    where: { userId: expertUserId, active: true, kind: 'EXPERT' },
    select: { userId: true },
  })
  if (!access) return { ok: false, error: 'NOT_FOUND' }

  const existing = await prisma.requestOffer.findFirst({
    where: { requestId: request.id, expertUserId },
    select: { id: true },
  })
  if (existing) return { ok: true, offerId: existing.id, created: false }

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

  // The provider hears about it. NOT by email — this is a conversation opening,
  // not work being awarded, and the message they are about to receive will send
  // its own mail through /api/request-chat. A second one here would mean two
  // emails for one event.
  after(async () => {
    try {
      await notify(expertUserId, {
        // Typed (D12, 2026-08-19): same always-delivered group as GENERIC.
        type: 'REQUEST_INVITE',
        title: 'კლიენტი გწერს',
        // The topic, never the reference — the reference is the client's
        // credential. Same rule as every other provider-facing notification.
        body: topicLabel(request.topic),
        href: `${PROVIDER_ROUTE}/offers`,
      })
    } catch { /* notification is best-effort; the thread is written */ }
  })

  return { ok: true, offerId: offer.id, created: true }
}
