// ONE OFFER CONVERSATION, on its own — the pane the unified inbox opens for a
// row of kind OFFER.
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
// TWO MOUNTS, ONE IMPLEMENTATION: the expert reads it inside the messages
// centre, and a WORK-only provider — whom the (expert) guard never lets into
// /work/messages — reads it in their own space. Same component, so the two can
// never drift; the caller passes only where „back" goes.

import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requestsViewer } from '@/lib/requestsServer'
import {
  timeAgoKa, topicLabel, offerPriceLabel,
  OFFER_STATUS_LABEL, type OfferStatusName,
} from '@/lib/requests'
import { offerPeerName } from '@/lib/inboxRows'
import { RequestChat } from '@/components/RequestChat'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'

/** The „this is not yours, or it is gone" state. Identical wording to the
 *  booking thread's, and deliberately the same for both causes — a pane that
 *  distinguishes them tells a stranger which offer ids exist. */
function NotFoundPane({ backHref }: { backHref: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ink-100 text-ink-500 mb-3">
        <Icon.warn className="w-6 h-6" />
      </span>
      <div className="font-display text-body-lg font-semibold text-ink-800">მიმოწერა ვერ მოიძებნა</div>
      <p className="text-small text-ink-500 mt-1">წაიშალა, ან არ არის შენი.</p>
      <div className="mt-4"><Btn variant="secondary" size="sm" href={backHref}>სიაში დაბრუნება</Btn></div>
    </div>
  )
}

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

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 sm:px-5 py-3.5 border-b border-ink-100">
        <div className="flex items-center gap-3">
          <Btn variant="ghost" size="sm" href={backHref} className="lg:hidden -ml-2">უკან</Btn>
          <div className="min-w-0">
            {/* ⚠️ „კლიენტი" until the choice is made — lib/requests decides it,
                and the name is now the ONLY thing that decision releases. */}
            <div className="font-display text-body font-semibold text-ink-900 truncate">
              {offerPeerName(offer, offer.request.contactName)}
            </div>
            <p className="text-meta text-ink-500 truncate">
              {topicLabel(offer.request.topic)}
              {' · '}{offerPriceLabel(offer.priceGel, offer.priceKind)}
              {' · '}{OFFER_STATUS_LABEL[offer.status as OfferStatusName]}
              {' · '}{timeAgoKa(offer.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 pb-4">
        {/* No `ref` on this side: the session is the identity, and the endpoint
            works the side out from it. Open on arrival — a row was tapped to
            read exactly this, so a collapsed pane would be one more tap between
            the provider and the message they came for. `peerName` is the masked
            one, for the same reason the header's is. */}
        <RequestChat
          thread={{ kind: 'OFFER', offerId: offer.id }}
          peerName={offerPeerName(offer, offer.request.contactName)}
          defaultOpen
        />
      </div>
    </div>
  )
}
