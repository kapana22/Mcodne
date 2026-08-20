// /me/requests — the client's own service requests (D7, stage 6, 2026-08-19).
//
// Newest first: reference, what it is, where it stands, how many offers, and
// the way into the request's own page (/request/<ref> — the same page a client
// with no account reaches by reference; here the owner reaches it by account).
//
// TWO GATES, both in this file. requestsOn() → notFound(): the page belongs to
// the subsystem and must not exist on a deployment where the subsystem does
// not. requireUser() → /signin: unlike the subsystem's own routes this is a
// workspace page inside /me, so a signed-out visitor is sent to sign in, the
// same as every other /me page — nothing here reveals anything about the
// subsystem beyond what the header's own „მოთხოვნა" item already does. The list
// is `userId = me` (lib/myRequests) and nothing wider.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { requestsOn, REQUEST_ROUTE } from '@/lib/requests'
import { myRequests } from '@/lib/myRequests'
import { fmtDateTime, TBILISI } from '@/lib/tz'
import { Container } from '@/components/Container'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { RequestStatusPill } from '@/components/requests/StatusPills'

export const dynamic = 'force-dynamic'

export default async function MyRequestsPage() {
  if (!requestsOn()) notFound()
  const user = await requireUser()
  const rows = await myRequests(user.id)

  return (
    <Container as="main" className="w-full py-8 lg:py-10 flex-1">
      <PageHeader className="mb-8" eyebrow="ჩემი სივრცე" title="მოთხოვნები" sub="შენი მოთხოვნები და მათი შეთავაზებები" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon.list className="w-6 h-6" />}
          title="მოთხოვნა ჯერ არ გაქვს"
          description="აღწერე რა გჭირდება და მიიღე შეთავაზებები."
          cta={{ label: 'მოთხოვნის დატოვება', href: REQUEST_ROUTE }}
        />
      ) : (
        // The rows arrive one after another rather than all at once — the
        // site's own `.stagger`, which is `rise-in` on each child with the
        // established 40ms cascade. Reduced motion crushes it to its end state,
        // which is the visible one.
        <ul className="flex flex-col gap-3 motion-safe:stagger">
          {rows.map(r => (
            <li key={r.id} id={r.publicRef} className="scroll-mt-24">
              <Card as={Link} href={`${REQUEST_ROUTE}/${r.publicRef}`} padding="compact" interactive className="block sm:p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-display text-meta font-semibold text-ink-500 tabular-nums">{r.publicRef}</span>
                  <RequestStatusPill status={r.status} label={r.statusLabel} />
                  <span className="ml-auto text-meta text-ink-500">
                    {fmtDateTime(r.createdAt, { day: '2-digit', month: 'long', year: 'numeric' }, TBILISI).local}
                  </span>
                </div>
                {/* The shelf, then the request. Category and kind were the
                    TITLE until 2026-08-19, which made every row of one topic
                    read the same; they are what this request is filed under,
                    and that is a caption. */}
                <p className="mt-2 text-meta text-ink-500">{r.topicLabel} · {r.kindLabel}</p>
                <p className="mt-0.5 font-display text-body-lg font-semibold text-ink-900 leading-snug line-clamp-2">
                  {r.headline}
                </p>
                {/* ⚠️ THE ONE NUMBER THIS PAGE EXISTS FOR. A client opens it to
                    ask „did anybody answer?" — so an answer that arrived is the
                    loudest thing on the row, and „not yet" stays quiet rather
                    than being dressed up as news. */}
                <div className="mt-2">
                  {r.offerCount > 0 ? (
                    <span className="font-display text-body font-bold text-brand-700 tabular-nums">
                      {r.offerCount} შეთავაზება
                    </span>
                  ) : (
                    <span className="text-small text-ink-500">შეთავაზება ჯერ არ არის</span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
