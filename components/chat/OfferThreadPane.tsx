// ONE OFFER CONVERSATION, on its own — the pane the provider's inbox opens for
// a row of kind OFFER.
//
// ⚠️ NOTHING ABOUT THE CHAT IS NEW. It is components/RequestChat, mounted the
// way /work/offers used to mount it inline: no `ref` (the session is the
// identity and the endpoint derives the side from it), open on arrival because
// here the transcript IS the screen. What moved is only WHERE it hangs — a row
// in the one list instead of an accordion inside a list of offers. Two inboxes
// in one workspace was the disorientation this pane exists to end; rewriting
// the conversation would have been a second, unrelated risk.
//
// ⚠️ NO CONTACT BLOCK ANY MORE (2026-08-21). This pane used to print the
// client's phone and email above the transcript once the offer was accepted.
// Owner: „მოდი ამ ეტაპზე იყოს მიწერა და ჩათში გარკვნენ, ნომერიც თუ საჭიროა იქ
// გაცვალონ." So the screen is the conversation and nothing else: the columns
// are no longer even SELECTED below, and after acceptance the endpoint stops
// masking, so a number the two actually need is typed to each other in the
// thread. `offerPeerName` still decides the NAME the header prints — one rule,
// in lib/requests, asked rather than copied.
//
// ⚠️ AND `publicRef` IS NOT SELECTED, NOW OR EVER. It is the client's
// credential (25 bits, and it opens a page carrying their phone number) and
// possession of it IS how /api/request-chat authenticates them — a provider
// holding it could accept an offer on the client's behalf. The CLIENT's own
// pane reads it, in their own room, and that is why the two are separate files:
// see components/chat/ThreadPaneShell.
//
// ⚠️ THE ARTBOARD'S HEADER, SINCE 2026-08-31 (owner's „Messages"): the disc, the
// name, the metadata line and the „სამუშაო" button now live in ThreadPaneShell,
// shared with the client's pane so the two sides of one conversation cannot be
// drawn two ways. The button is new — the pane named the job and offered no way
// to open it.

import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requestsViewer } from '@/lib/requestsServer'
import {
  topicLabel, offerPriceLabel, PROVIDER_ROUTE,
  OFFER_STATUS_LABEL, type OfferStatusName,
} from '@/lib/requests'
import { offerPeerName } from '@/lib/inboxRows'
import { RequestChat } from '@/components/RequestChat'
import { NotFoundPane, ThreadPaneShell } from '@/components/chat/ThreadPaneShell'

export async function OfferThreadPane({
  offerId, backHref,
}: {
  offerId: string
  /** Where „back to the list" goes — the caller's own space. */
  backHref: string
}) {
  const viewer = await requestsViewer()
  const p = viewer.provider
  if (!p) return <NotFoundPane backHref={backHref} />

  await ensureDbReady()

  // OWNERSHIP IS IN THE `where`, not in a branch after the read: a provider may
  // only ever load an offer that is theirs, so a guessed id cannot even return
  // a row to compare against.
  const offer = await prisma.requestOffer.findFirst({
    where: {
      id: offerId,
      ...(p.kind === 'EXPERT' ? { expertUserId: p.userId } : { companyId: p.companyId }),
    },
    select: {
      id: true, status: true, createdAt: true,
      // ⚠️ THE PRICE, SINCE 2026-08-29 — the one thing that told these threads
      // apart and was not on screen. A provider with three jobs open can have
      // two of them under the same topic („დეკლარაცია"), and the header named
      // the topic and the status but not the number they agreed. It is the
      // agreed sum, not a contact detail: `offerPriceLabel` turns it into words
      // („ფასს შემოგთავაზებს") when there is no figure.
      priceGel: true, priceKind: true,
      // The request's own id — the address of the job behind this conversation
      // (/work/requests/[id] takes the ServiceRequest id, never the reference).
      requestId: true,
      request: {
        select: {
          topic: true, status: true,
          // THE NAME, and nothing else. `phone`/`email` left this select on
          // 2026-08-21 with the block that printed them — a column that is
          // never fetched cannot be rendered by a later edit that forgets why.
          contactName: true,
        },
      },
    },
  })
  if (!offer) return <NotFoundPane backHref={backHref} />

  // ⚠️ „კლიენტი" until the choice is made — lib/requests decides it, and the
  // name is now the ONLY thing that decision releases.
  const peerName = offerPeerName(offer, offer.request.contactName)

  return (
    <ThreadPaneShell
      peerName={peerName}
      // ⚠️ THE CREATION TIME LEFT THIS LINE ON 2026-08-31. The artboard's
      // metadata is the JOB („სერვისი 1 · 60₾ · ხელში მაქვს"), and the row in
      // the list two hundred pixels to the left already carries when anybody
      // last spoke, which is the time somebody actually looks for.
      meta={`${topicLabel(offer.request.topic)} · ${offerPriceLabel(offer.priceGel, offer.priceKind)} · ${OFFER_STATUS_LABEL[offer.status as OfferStatusName]}`}
      backHref={backHref}
      // The request behind the conversation, inside the queue this provider is
      // already admitted to (the same allowlist gate the pane itself passed).
      job={{ href: `${PROVIDER_ROUTE}/requests/${offer.requestId}`, label: 'სამუშაო' }}
    >
      {/* No `ref` on this side: the session is the identity, and the endpoint
          works the side out from it. `pane` because the conversation IS the
          screen here — a row was tapped to read exactly this. `peerName` is the
          masked one, for the same reason the header's is. */}
      <RequestChat
        thread={{ kind: 'OFFER', offerId: offer.id }}
        peerName={peerName}
        layout="pane"
      />
    </ThreadPaneShell>
  )
}
