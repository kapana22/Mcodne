// /provider/offers — what I sent, and what happened to it.
//
// ⚠️ NO PHONE NUMBER LIVES ON THIS PAGE ANY MORE (2026-08-21). It used to print
// the client's phone and email on every ACCEPTED row. Owner: „მოდი ამ ეტაპზე
// იყოს მიწერა და ჩათში გარკვნენ, ნომერიც თუ საჭიროა იქ გაცვალონ… არ უჩანდეს
// ეგრევე ტელეფონი." An accepted row now shows WHO chose you and points at the
// thread; the two columns are not even selected below, so a later edit cannot
// render what was never fetched.
//
// What survives unchanged is the SEAL ITSELF — `clientIdentityOpen`
// (lib/requests) still decides „კლიენტი" vs the person's name, and it is the
// mirror of the rule the client's page runs on, written once so the two sides
// cannot come apart.

import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import {
  clientIdentityOpen, gel, offerPriceLabel, budgetLabel, topicLabel, kindOf, timeAgoKa,
  OFFER_STATUS_LABEL, type OfferStatusName,
} from '@/lib/requests'
import { offerPeerName } from '@/lib/inboxRows'
import { OfferStatusPill } from '@/components/requests/StatusPills'
import { requestsViewer } from '@/lib/requestsServer'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { OfferActions } from './_actions'

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
      id: true, priceGel: true, priceKind: true, daysEstimate: true, message: true,
      status: true, createdAt: true, kind: true, doneAt: true,
      // Unread FOR THE PROVIDER: client messages this side has not opened.
      _count: { select: { messages: { where: { fromClient: true, readByProviderAt: null } } } },
      request: {
        select: {
          publicRef: true, description: true, status: true,
          kind: true, topic: true, budgetMin: true, budgetMax: true,
          // THE NAME, and nothing else. `phone`/`email` left this select on
          // 2026-08-21 (owner: „არ უჩანდეს ეგრევე ტელეფონი") together with the
          // block that printed them — everything is arranged in the thread now.
          // `adminNote` is deliberately absent for the older reason: it is the
          // operator's note about the client and belongs to no other reader.
          contactName: true,
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
        sub="კლიენტთან კავშირი მიმოწერაშია."
      />

      {offers.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Icon.doc className="w-6 h-6" />}
            title="ჯერ არაფერი გაგიგზავნია"
            description="ღია მოთხოვნები სხვა გვერდზეა."
            cta={{ label: 'მოთხოვნები', href: '/work/requests' }}
          />
        </div>
      ) : (
        // The list arrives as a list — the site's own cascade, and reduced
        // motion lands every row on its end state.
        <div className="mt-6 space-y-3 motion-safe:stagger">
          {offers.map(o => {
            // THE one call that decides — „კლიენტი" until this offer is the
            // chosen one, the person's own name afterwards. Since 2026-08-21
            // that is ALL it releases; see lib/requests → clientIdentityOpen.
            const chosen = clientIdentityOpen(o)
            return (
              <Card key={o.id} className={`hover-lift ${chosen ? 'border-brand-300' : ''}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  {/* ⚠️ THE TITLE STEPPED DOWN A SIZE (2026-08-19). It was
                      `text-h3 font-bold` — exactly the price beside it — so the
                      two strongest facts on the row weighed the same and
                      neither led. On this page the number IS the subject: the
                      provider is checking what they quoted and whether it won.
                      The title is what identifies the row, and it is now the
                      client's own words rather than the category, which made
                      every row of one topic read identically. */}
                  <span className="font-display text-body-lg font-semibold text-ink-900 min-w-0 line-clamp-2">
                    {(o.request.description ?? '').trim() !== '' ? o.request.description : topicLabel(o.request.topic)}
                  </span>
                  {/* ⚠️ AN INVITED ROW HAS NO PRICE, and `priceGel` is 0 on it
                      as a placeholder rather than a number anybody named.
                      Printing „0₾" would tell the expert they had offered to
                      work for nothing. */}
                  {o.status !== 'INVITED' && (
                    <span className="font-display text-h3 font-bold text-ink-900 tabular-nums shrink-0">
                      {offerPriceLabel(o.priceGel, o.priceKind)}
                    </span>
                  )}
                </div>
                {/* ⚠️ NO `publicRef` HERE — see the note on the request detail
                    page. It is the client's credential, not a reference number,
                    and it authorises accepting an offer on their behalf. The
                    offer is already identified by the topic above it and by the
                    status below. */}
                {/* ⚠️ THE STATUS LEFT THE DOT-ROW AND BECAME A BADGE
                    (2026-08-19). „მოგიგია თუ არა" is the only question this
                    page answers, and it was set in `text-meta` between the
                    budget and the age — so SENT, DECLINED and WITHDRAWN looked
                    identical at a glance and the one row that mattered did not
                    stand out. Every other list in the workspace already used a
                    pill; this one now uses the same component. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <OfferStatusPill status={o.status as OfferStatusName} label={OFFER_STATUS_LABEL[o.status as OfferStatusName]} />
                  <p className="text-meta text-ink-500 tabular-nums min-w-0">
                  {topicLabel(o.request.topic)}
                  {' · '}{budgetLabel(kindOf(o.request.kind), o.request.budgetMin, o.request.budgetMax)}
                  {o.daysEstimate ? ` · ${o.daysEstimate} დღე` : ''}
                  {' · '}{timeAgoKa(o.createdAt)}
                  </p>
                </div>

                {/* ⚠️ THE DESCRIPTION IS NOT PRINTED TWICE (2026-08-19). The
                    first pass of this redesign titled the row with the first
                    sentence of the description and then printed the whole
                    description underneath, so every row opened with the same
                    words twice. The description IS the title here; the row's
                    remaining job is the price, the status and the link. */}

                {/* ⚠️ THE CONVERSATION LEFT THIS PAGE (2026-08-19). It used to
                    be an accordion in every row, which made the workspace hold
                    TWO inboxes — this one and /work/messages — and „სად რა არის
                    ვერ ხვდები" was the result. This page is the list of OFFERS
                    (price, status, the two actions); the list of CONVERSATIONS
                    is the inbox, and this is the link between them.

                    ⚠️ INVITED COUNTS (2026-08-18) — that row exists BECAUSE the
                    client wrote, so it is a thread before it is an offer. A
                    WITHDRAWN or DECLINED one keeps its link: the transcript is
                    still readable, the pane says why it is closed.

                    ⚠️ NO NAME HERE. The link says „მიმოწერა" and nothing about
                    who is on the other end — clientContactFor (below) is the
                    only thing on this platform allowed to reveal that. */}
                <Link
                  href={`/work/offers/${o.id}`}
                  className="mt-4 inline-flex items-center gap-2 text-small font-display font-semibold text-brand-700 underline underline-offset-2"
                >
                  მიმოწერა
                  {o._count.messages > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-pill inline-flex items-center justify-center text-meta font-bold tabular-nums bg-brand-600 text-white">
                      {o._count.messages}
                    </span>
                  )}
                </Link>

                <OfferActions offerId={o.id} status={o.status} kind={o.kind} doneAt={o.doneAt ? o.doneAt.toISOString() : null} />

                {/* WHO CHOSE YOU — the name, and the way to reach them, which
                    is the thread. What used to sit here was a phone number and
                    an email; both left the product on 2026-08-21. */}
                {chosen && (
                  <div className="mt-4 pt-4 border-t border-ink-100">
                    <p className="text-body text-ink-900">{offerPeerName(o, o.request.contactName)}</p>
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
