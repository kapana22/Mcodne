// /provider/requests — the open queue.
//
// ⚠️ NO CLIENT CONTACT ON THIS SCREEN, and none in the data behind it. The rows
// go through `providerRequestView` (lib/requests), whose parameter type does
// not even NAME contactName, phone or email — so a careless spread cannot carry
// them through. That is the enforcement; this comment is only the sign on it.
//
// A provider sees the problem, the budget band, the deadline, the city and how
// many places are left. The name and the number arrive when the client picks
// them, and not before. That is the product, not a courtesy.

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { providerRequestView, timeAgoKa, REQUEST_KINDS, KIND, type RequestKindName } from '@/lib/requests'
import { PageHeader } from '@/components/PageHeader'
import { AutoRefresh } from '@/components/AutoRefresh'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: {
  searchParams: Promise<{ kind?: string }>
}) {
  await ensureDbReady()

  // The kind filter, from the URL — a link, not client state, so a provider
  // can bookmark „მასწავლებელი" and land straight on their half of the queue.
  // An unrecognised value shows everything rather than an empty page.
  const { kind: rawKind } = await searchParams
  const kindFilter = (REQUEST_KINDS as readonly string[]).includes(rawKind ?? '')
    ? (rawKind as RequestKindName)
    : null

  const rows = await prisma.serviceRequest.findMany({
    // Verified and not yet full. The place filter is a field comparison rather
    // than a fetch-then-filter so a full request never reaches the page at all
    // — a card that says „0 ადგილი" is a card that wastes a read.
    where: {
      status: 'VERIFIED',
      offerCount: { lt: prisma.serviceRequest.fields.offerLimit },
      ...(kindFilter ? { kind: kindFilter } : {}),
    },
    // ⚠️ ORDERED BY OPPORTUNITY, NOT BY DATE. „Newest first" is the wrong
    // sort for this queue: the speed-to-lead research says the first responder
    // takes ~78% of clients, so a request with NO offers yet is worth more to
    // a provider than a fresher one that already has two — and a three-day-old
    // request nobody has answered is still winnable, while a two-hour-old one
    // with 2/3 places gone mostly is not.
    //
    // So: fewest offers first (where you can still be first), then newest
    // within that. The card's „იყავი პირველი" line is the same fact said in
    // words, and now the sort agrees with it instead of scattering those rows
    // through the list.
    orderBy: [{ offerCount: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    // The select is the shape providerRequestView takes, and nothing wider.
    select: {
      id: true, publicRef: true, kind: true, topic: true, description: true,
      budgetMin: true, budgetMax: true, budgetUnit: true,
      timing: true, format: true, city: true, status: true, details: true,
      offerCount: true, offerLimit: true, createdAt: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  })
  const requests = rows.map(providerRequestView)

  return (
    <>
      <PageHeader
        eyebrow="მოთხოვნები"
        title="ღია მოთხოვნები"
        sub="დამოწმებული მოთხოვნები, რომლებზეც ჯერ ადგილი რჩება."
        actions={<AutoRefresh />}
      />

      {/* The kind filter — links, so the state lives in the URL. „ყველა" is
          the default and first, for the same reason the admin queue's is. */}
      <div className="mt-5 flex flex-wrap gap-2">
        {([['', 'ყველა'], ...REQUEST_KINDS.map(k => [k, KIND[k].label] as const)] as [string, string][]).map(([v, l]) => {
          const on = (kindFilter ?? '') === v
          return (
            <Link
              key={v || 'all'}
              href={v ? `/provider/requests?kind=${v}` : '/provider/requests'}
              aria-current={on ? 'page' : undefined}
              className={`h-11 px-4 rounded-btn inline-flex items-center font-display text-small font-semibold border transition-colors duration-fast ${
                on ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50'
              }`}
            >
              {l}
            </Link>
          )
        })}
      </div>

      {requests.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Icon.search className="w-6 h-6" />}
            title="ჯერ არაფერია"
            description="ახალი მოთხოვნა აქ გამოჩნდება, როგორც კი გადამოწმდება."
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {requests.map(r => (
            <Card key={r.id} className="flex flex-col">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-display text-h3 font-bold text-ink-900">
                  {r.topicLabel}
                </span>
                {/* The one number a provider decides on: how many places are
                    left. tabular-nums so it does not jump between cards. */}
                <span className="text-small text-ink-600 tabular-nums shrink-0">
                  {r.placesLeft} ადგილი {r.offerLimit}-დან
                </span>
              </div>

              {/* line-clamp on the card, full text on the detail page. A queue
                  you scan needs the shape of each request, not all of it. */}
              {/* Optional now — an empty paragraph would be a blank stripe on
                  every card whose author trusted the taps to speak. */}
              {r.description && (
                <p className="mt-2 text-body text-ink-700 leading-relaxed line-clamp-4">{r.description}</p>
              )}

              <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
                {/* Every label is shaped by providerRequestView, so the same
                    request cannot read „40–70₾" here and „40–70₾ ერთ
                    გაკვეთილზე" on the detail page — the unit is what the
                    number means, not decoration. */}
                {([
                  ['ბიუჯეტი', r.budgetLabel],
                  [r.kindLabel === 'მასწავლებელი' ? 'სიხშირე' : 'ვადა', r.timingLabel],
                  // The clarifying answers — the reason a tutor can quote from
                  // the card instead of asking.
                  ...r.extras.map(e => [e.label, e.value] as [string, string]),
                  ['ფორმატი', r.formatLabel],
                  ['ქალაქი', r.cityLabel],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-meta text-ink-500">{k}</dt>
                    <dd className="text-small text-ink-900 font-display font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 pt-4 border-t border-ink-100 flex items-center justify-between gap-3">
                {/* AGE and COMPETITION replaced the reference code here — the
                    two facts the speed-to-lead research says a provider
                    actually triages on. „იყავი პირველი" is not decoration: the
                    first responder takes ~78% of clients, and a provider who
                    can see that races for it. The ref still lives on the
                    detail page, where it belongs. */}
                <span className="text-meta text-ink-500">
                  {timeAgoKa(r.createdAt)}
                  {r.offerLimit - r.placesLeft === 0
                    ? <span className="text-brand-700 font-semibold"> · იყავი პირველი</span>
                    : ` · ${r.offerLimit - r.placesLeft} შეთავაზება უკვე შესულია`}
                </span>
                <Btn href={`/provider/requests/${r.id}`} variant="secondary" size="sm">
                  ნახვა
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
