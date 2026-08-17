// /provider/offers — what I sent, and what happened to it.
//
// ⚠️ THE CLIENT'S CONTACT APPEARS ON EXACTLY ONE KIND OF ROW: an offer with
// status ACCEPTED. That is decided by `clientContactFor` (lib/requests), which
// takes the offer and the contact and returns null unless it was chosen — the
// mirror of the rule the client's page runs on, written once so the two sides
// cannot come apart.
//
// The query DOES select contactName/phone/email, and it has to: this is the
// screen where a chosen provider finds out who to call. What stops it leaking
// is that nothing renders those fields except through the function.

import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import {
  clientContactFor, gel, budgetLabel, topicLabel, kindOf, timeAgoKa,
  OFFER_STATUS_LABEL, type OfferStatusName,
} from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { PageHeader } from '@/components/PageHeader'
import { RequestChat } from '@/components/RequestChat'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const viewer = await requestsViewer()
  const p = viewer.provider

  // An admin has no offers because they cannot write any. An empty list would
  // read as „you sent none yet", which is a different and wrong statement.
  if (!p) {
    return (
      <>
        <PageHeader eyebrow="შეთავაზებები" title="ჩემი შეთავაზებები" />
        <div className="mt-6">
          <EmptyState
            icon={<Icon.doc className="w-6 h-6" />}
            title="შენზე არ ირიცხება"
            description="ეს გვერდი ექსპერტისა და კომპანიისთვისაა."
          />
        </div>
      </>
    )
  }

  await ensureDbReady()

  const rows = await prisma.requestOffer.findMany({
    where: p.kind === 'EXPERT' ? { expertUserId: p.userId } : { companyId: p.companyId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, priceGel: true, daysEstimate: true, message: true,
      status: true, createdAt: true,
      // Unread FOR THE PROVIDER: client messages this side has not opened.
      _count: { select: { messages: { where: { fromClient: true, readByProviderAt: null } } } },
      request: {
        select: {
          publicRef: true, description: true, status: true,
          kind: true, topic: true, budgetMin: true, budgetMax: true,
          // The contact. Rendered only through clientContactFor below — see the
          // header. `adminNote` is deliberately absent: it is the operator's
          // note about the client and belongs to no other reader.
          contactName: true, phone: true, email: true,
        },
      },
    },
  })

  // ACCEPTED first, then newest. An accepted offer is a client WAITING FOR A
  // CALL — the one row on this page that is a task rather than history, so it
  // must not sink under newer rejections. Within each half the recency order
  // stays.
  const offers = [
    ...rows.filter(o => o.status === 'ACCEPTED'),
    ...rows.filter(o => o.status !== 'ACCEPTED'),
  ]

  return (
    <>
      <PageHeader
        eyebrow="შეთავაზებები"
        title="ჩემი შეთავაზებები"
        sub="კლიენტის კონტაქტი მაშინ ჩნდება, როცა შენს შეთავაზებას აირჩევენ."
      />

      {offers.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Icon.doc className="w-6 h-6" />}
            title="ჯერ არაფერი გაგიგზავნია"
            description="ღია მოთხოვნები სხვა გვერდზეა."
            cta={{ label: 'მოთხოვნები', href: '/provider/requests' }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {offers.map(o => {
            // THE one call that decides. Null for everything except an accepted
            // offer — see lib/requests.
            const contact = clientContactFor(o, {
              contactName: o.request.contactName,
              phone: o.request.phone,
              email: o.request.email,
            })
            return (
              <Card key={o.id} className={contact ? 'border-brand-300' : undefined}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-display text-h3 font-bold text-ink-900">
                    {topicLabel(o.request.topic)}
                  </span>
                  <span className="font-display text-h3 font-bold text-ink-900 tabular-nums shrink-0">
                    {gel(o.priceGel)}
                  </span>
                </div>
                {/* ⚠️ NO `publicRef` HERE — see the note on the request detail
                    page. It is the client's credential, not a reference number,
                    and it authorises accepting an offer on their behalf. The
                    offer is already identified by the topic above it and by the
                    status below. */}
                <p className="mt-0.5 text-meta text-ink-500 tabular-nums">
                  {OFFER_STATUS_LABEL[o.status as OfferStatusName]}
                  {' · '}{budgetLabel(kindOf(o.request.kind), o.request.budgetMin, o.request.budgetMax)}
                  {o.daysEstimate ? ` · ${o.daysEstimate} დღე` : ''}
                  {' · '}{timeAgoKa(o.createdAt)}
                </p>

                <p className="mt-3 text-body text-ink-700 leading-relaxed line-clamp-3">{o.request.description}</p>

                {/* The conversation — no ref on this side: the session is the
                    identity, and the endpoint works the side out from it. Open
                    while the offer is live or won; a declined one closes, and
                    the pane says why rather than vanishing. */}
                {/* ⚠️ „კლიენტი" until the choice is made — the NAME is part of
                    the contact, and clientContactFor is the only thing allowed
                    to reveal it. A peer label is not a loophole. */}
                {(o.status === 'SENT' || o.status === 'ACCEPTED') && (
                  <RequestChat
                    thread={{ kind: 'OFFER', offerId: o.id }}
                    unread={o._count.messages}
                    peerName={contact ? contact.contactName : 'კლიენტი'}
                  />
                )}

                {contact && (
                  <div className="mt-4 pt-4 border-t border-ink-100">
                    <p className="text-body text-ink-900">{contact.contactName}</p>
                    <p className="mt-1 text-body text-ink-900">
                      <span className="text-ink-500">ტელეფონის ნომერი: </span>
                      <a href={`tel:${contact.phone}`} className="font-semibold underline underline-offset-2">{contact.phone}</a>
                    </p>
                    {contact.email && (
                      <p className="mt-1 text-body text-ink-900">
                        <span className="text-ink-500">ელფოსტა: </span>
                        <a href={`mailto:${contact.email}`} className="font-semibold underline underline-offset-2">{contact.email}</a>
                      </p>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
