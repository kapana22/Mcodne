// /experts/<trade> — the TRADE landing (stage 8, restructuring v2 §3.6; moved
// out of app/services/[slug]/_trade in stage 11, 2026-08-19): the same [slug]
// route, when the slug is a live service group or a topic inside one
// (lib/serviceProfile → resolveTrade), resolved BEFORE either profile.
//
// ⚠️ IT SHARES THE SEGMENT WITH THREE OTHER THINGS NOW — the profession
// landing, the expert profile and the provider profile. The precedence and the
// reason for it are documented once, in ./page.tsx; both code-owned lists are
// tried before either database lookup, and both slug generators reserve every
// id in them (lib/slugSpace → RESERVED_SLUGS), which is what makes that safe.
//
// ⚠️ THE ≥3 RULE (lib/serviceProfile → TRADE_LANDING_MIN). At or above the bar
// the page is the trades catalogue filtered to this trade — the same rows,
// query and card /experts draws (app/experts/_masterData → queryMasters, _card →
// MasterCard), under a heading, with the intake CTA. Below it the page is THE
// DOOR ONLY: heading, one sentence, the CTA — and NEVER an empty list. A grid
// with nobody in it under „ელექტრიკოსები" tells a stranger the site is empty;
// a door tells them what to do.
//
// The CTA is `REQUEST_HREF` from the model (`for=service` baked in) and it is
// mounted only when the page says the subsystem exists — the same shape as
// `_providerCta` on the provider profile, and the reason tests/requests.test.ts
// already names this route as an entry point.

import { Link } from 'next-view-transitions'
import { Btn } from '@/components/Btn'
import { Container } from '@/components/Container'
import { Icon } from '@/components/Icon'
import type { Topic, TopicGroup } from '@/lib/requestTopics'
import { MasterCard } from '@/app/experts/_masterCard'
import { mastersHref, type MastersResult } from '@/app/experts/_masterData'
import { REQUEST_HREF } from './_providerData'

export type Trade = { group: TopicGroup; topic: Topic | null }

/** The words on the page: the topic's label when the slug named one, else the group's. */
export const tradeLabel = (t: Trade) => (t.topic ?? t.group).label

export function TradeLanding({
  trade,
  result,
  requestsEnabled,
}: {
  trade: Trade
  /** The filtered catalogue — null below the bar (the door renders no list;
   *  the count that decided it is printed nowhere there on purpose — „2
   *  ხელოსანი" over no list is a tease). */
  result: MastersResult | null
  requestsEnabled: boolean
}) {
  const label = tradeLabel(trade)
  return (
    <main className="bg-ink-50/40">
      <section className="bg-gradient-wash border-b border-ink-100">
        <Container className="py-7 sm:py-10">
          {/* The same trail the catalogue draws (app/experts/_hero) — hidden
              below sm, kept in the DOM for crawlers and assistive tech. Two
              steps since stage 10 („სერვისები" was a door that is gone and
              „ხელოსნები" a second name for the page „ექსპერტები" now is), and
              since stage 11 the trail is literally the path: /experts → this
              trade. */}
          <nav aria-label="ნავიგაცია" className="hidden sm:flex items-center gap-1.5 text-meta text-ink-500 mb-4">
            <Link href="/" className="hover:text-ink-800 transition-colors duration-fast">მთავარი</Link>
            <Icon.chevR className="w-3 h-3 text-ink-300" />
            <Link href="/experts" className="hover:text-ink-800 transition-colors duration-fast">ექსპერტები</Link>
            <Icon.chevR className="w-3 h-3 text-ink-300" />
            <span className="font-display font-semibold text-ink-800">{label}</span>
          </nav>

          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="min-w-0">
              <h1 className="font-display text-h1 sm:text-display font-bold text-ink-900 tracking-tight">
                {label}
              </h1>
              {result ? (
                <p className="mt-2 text-small text-ink-500 tabular-nums">ნაჩვენებია {result.rows.length} ექსპერტი</p>
              ) : (
                // The door's one sentence — plain, and it says what to do.
                <p className="mt-2 text-body text-ink-600">აღწერე, რა გჭირდება — გიპასუხებენ.</p>
              )}
            </div>
            {requestsEnabled && (
              <Btn href={REQUEST_HREF} variant="hero" size="lg">გამოაგზავნე მოთხოვნა</Btn>
            )}
          </div>
        </Container>
      </section>

      {result && (
        <Container className="py-8 sm:py-10 pb-14 sm:pb-20">
          {/* The catalogue's grid, two columns like /experts. */}
          <div className="grid gap-4 sm:grid-cols-2">
            {result.rows.map(m => <MasterCard key={m.id} m={m} />)}
          </div>
          {/* Every filter, in the catalogue proper — this page is one trade. */}
          <div className="mt-8">
            <Link
              href={mastersHref({ trades: [trade.topic?.id ?? trade.group.id] })}
              className="inline-flex items-center gap-1.5 min-h-[40px] text-body font-semibold text-brand-700 hover:underline"
            >
              ყველა ფილტრი <Icon.arrow className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Container>
      )}
    </main>
  )
}
