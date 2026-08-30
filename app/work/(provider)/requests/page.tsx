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
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requestsViewer, providerQueueScope } from '@/lib/requestsServer'
import { ensureDbReady } from '@/lib/dbBoot'
import { providerRequestView, timeAgoKa, REQUEST_KINDS, KIND, PROVIDER_ROUTE, type RequestKindName } from '@/lib/requests'
import { queueWhere } from '@/lib/requestRouting'
import { PageHeader } from '@/components/PageHeader'
import { WorkTabs } from '@/app/work/_components/WorkTabs'
import { AutoRefresh } from '@/components/AutoRefresh'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { DIRECT_WINDOW_MS } from '@/lib/requestLive'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: {
  searchParams: Promise<{ kind?: string }>
}) {
  // ⚠️ ITS OWN GATE, not the layout's (2026-08-17, found in review). The segment
  // layout checks `providerAllowed`, and this page checked NOTHING — so the
  // allowlist was enforced in exactly one place for the whole open queue.
  // lib/requestsServer states the rule this file was breaking: „Every route
  // checks here as well… neither layer is load-bearing alone." A layout is not
  // a reliable authorization boundary in the App Router, and every API route in
  // this subsystem already double-checks. What this page hands out — every open
  // request, with descriptions and budgets — is worth the one line.
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) notFound()

  await ensureDbReady()

  // The kind filter, from the URL — a link, not client state, so a provider
  // can bookmark „სწავლება" and land straight on their half of the queue.
  // An unrecognised value shows everything rather than an empty page.
  const { kind: rawKind } = await searchParams
  const kindFilter = (REQUEST_KINDS as readonly string[]).includes(rawKind ?? '')
    ? (rawKind as RequestKindName)
    : null

  // ── WHAT THIS PROVIDER ACTUALLY DOES ─────────────────────────────────────
  //
  // ⚠️ THE QUEUE SHOWED EVERYBODY EVERYTHING UNTIL 2026-08-18, and that is what
  // made the workspace read as broken rather than empty. A plumber signed in
  // and the first three cards were ქიმია, მათემატიკა and ბინის დალაგება — not
  // one of them plumbing. Owner: „საერთოდ არაფერში წერია… გაურკვეველია."
  //
  // ⚠️ AND IT WENT ON SHOWING EVERYTHING TO EVERYBODY WITHOUT A SERVICE
  // PROFILE UNTIL 2026-08-21, which is the same bug wearing the fix. The
  // narrowing read `ServiceProfile` alone and treated its absence as „no
  // filter" — so an expert holding only CONSULT, an admin and a company member
  // each got the whole platform. Measured that day: 12 open requests with room
  // left, all 12 in those queues, ქიმია · მათემატიკა · ეროვნული გამოცდები
  // included. Owner: „რეალურად უსარგებლო მოთხოვნები არ უნდა შედიოდეს — თუ
  // ქიმიის მასწავლებელს ეძებენ, არ უნდა მიუვიდეს დამლაგებელს."
  //
  // The narrowing now asks BOTH halves of what a person offers — the trades
  // they ticked and the sphere/professions they are filed under — using the
  // same three facts that decide who gets MAILED, and it says which silence an
  // empty result is. All of that lives in lib/requestRouting → queueScope, so
  // the nav badge (app/work/layout) and the home board (app/work/page) apply
  // the identical one; they disagreed for a day once and the badge was
  // advertising work the list would never show.
  const scope = await providerQueueScope(viewer.user)
  const mine = queueWhere(scope)

  const me = viewer.provider
  /**
   * WHICH REQUESTS WERE ADDRESSED TO *ME* — asked BEFORE the feed, because the
   * answer is both a filter and a label.
   *
   * A client standing on somebody's profile aims their request with `?to=<slug>`
   * (app/experts/[slug]/_providerCta), which opens an INVITED offer through
   * lib/requestInvite the moment the request is written, and — since 2026-08-20
   * — drops that request's `offerLimit` to 1. Owner: „თუ მცოდნესთან აგზავნის,
   * მხოლოდ მცოდნესთან უნდა მივიდეს."
   *
   * So an addressed request must be invisible to everybody EXCEPT the person it
   * names, and unmistakable TO them. Both come from this one list.
   */
  const mineInvited = me
    ? await prisma.requestOffer.findMany({
        where: {
          status: 'INVITED',
          ...(me.kind === 'EXPERT' ? { expertUserId: me.userId } : { companyId: me.companyId }),
        },
        select: { requestId: true, createdAt: true },
      })
    : []
  // requestId → when the client addressed it. The card turns this into the one
  // thing that makes exclusivity fair: a clock the PROVIDER carries.
  const invited = new Map(mineInvited.map(o => [o.requestId, o.createdAt]))

  const rows = await prisma.serviceRequest.findMany({
    // Verified and not yet full. The place filter is a field comparison rather
    // than a fetch-then-filter so a full request never reaches the page at all
    // — a card that says „0 ადგილი" is a card that wastes a read.
    where: {
      status: 'VERIFIED',
      offerCount: { lt: prisma.serviceRequest.fields.offerLimit },
      // ⚠️ AN ADDRESSED REQUEST BELONGS TO ONE PERSON (2026-08-20). `offerLimit`
      // is 1 only on a request that named somebody (app/api/requests), so this
      // is the whole rule: the open queue shows requests with room for anybody,
      // plus the ones addressed to ME. It cannot leak — a request addressed to
      // somebody else has offerLimit 1 and is not in my invited set, so neither
      // arm matches. And when the client presses „გავხსნა სხვებისთვის?" the
      // limit goes back to 3 and it appears here for everyone, with nothing
      // else to update.
      OR: [
        { offerLimit: { gt: 1 } },
        ...(invited.size ? [{ id: { in: [...invited.keys()] } }] : []),
      ],
      ...(kindFilter ? { kind: kindFilter } : {}),
      ...mine,
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
      // ⚠️ NOT publicRef — it is the client's credential and no provider
      // surface may hold it, let alone render it. See lib/requests →
      // ProviderRequestRow.
      id: true, kind: true, topic: true, description: true,
      budgetMin: true, budgetMax: true, budgetUnit: true,
      timing: true, format: true, city: true, status: true, details: true,
      offerCount: true, offerLimit: true, createdAt: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  })
  const requests = rows.map(providerRequestView)

  return (
    <>
      {/* ⚠️ ONE HEADING FOR THE WHOLE FLOW (2026-08-29). This page called itself
          „მოთხოვნები / ღია მოთხოვნები" and /work/jobs called itself
          „სამუშაოები", which is how three stages of one job read as two
          products. The heading is the job now; which stage you are looking at
          is the bar below it. Owner: „ერთი ნაკადი გახდეს." */}
      <PageHeader
        title="სამუშაოები"
        sub="დამოწმებული მოთხოვნები, რომლებზეც ჯერ ადგილი რჩება."
        actions={<AutoRefresh />}
      />
      <WorkTabs showOffers openRequests={rows.length} />

      {/* THE KIND FILTER, IN THE WORKSPACE'S ONE TAB GRAMMAR (2026-08-19).
          It was a row of pill buttons; /work/jobs one directory over is an
          underlined tab strip. Same space, two vocabularies, and a person who
          learns one has to learn the other.

          ⚠️ THEY STAY LINKS, DELIBERATELY. /work/jobs switches with
          `history.replaceState` because it already holds every booking on the
          client and a tab is a filter over an array. Here the kind is part of
          the DATABASE query (see the `where` above) — making it instant would
          mean fetching every kind and filtering in the browser, which is a
          rewrite of the one thing on this page that must not be got wrong.
          A server round-trip is the honest cost of a server filter; what was
          worth fixing was the two grammars, and that is what changed. */}
      <div className="mt-5 flex items-end border-b border-ink-200">
        <div className="flex min-w-0 overflow-x-auto scrollbar-hide rail-fade-end">
          {([['', 'ყველა'], ...REQUEST_KINDS.map(k => [k, KIND[k].label] as const)] as [string, string][]).map(([v, l]) => {
            const on = (kindFilter ?? '') === v
            return (
              <Link
                key={v || 'all'}
                href={v ? `/work/requests?kind=${v}` : '/work/requests'}
                aria-current={on ? 'page' : undefined}
                className={`relative inline-flex items-center min-h-[40px] pt-2 pb-3 px-1 mr-5 font-display text-small font-semibold whitespace-nowrap transition-colors duration-fast ${
                  on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                {l}
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand-500 rounded-full" />}
              </Link>
            )
          })}
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="mt-6">
          {/* ⚠️ EMPTY HAS FOUR CAUSES AND THEY NEED DIFFERENT SENTENCES.
              „ჯერ არაფერია" is true when the whole queue is quiet; it is a LIE
              when the queue is busy and this provider's own services simply do
              not match it, and that reading — „the site is broken" — is exactly
              what an unexplained empty screen produces (2026-08-18).

              The third was invisible until 2026-08-18: they switched THEMSELVES
              off. That used to fall through to „no profile, no filter" and
              quietly WIDEN the queue instead of emptying it — somebody staring
              at noise they caused and could not see.

              The fourth arrived with the fix on 2026-08-21 and is the one this
              screen owes the most explanation. They offer nothing we can narrow
              by: a master who ticked no trade, a company member, an expert with
              no sphere and no profession. Until today they saw EVERY open
              request on the platform, which is the bug; „nothing", said without
              a reason, is a different bug. So it names the gap and links to the
              editor that owns it — `scope.fix` is „ჩემი სერვისები" for the
              trades half and „პროფილი" for the expert half.

              ⚠️ EVERY STRING HERE ALREADY EXISTED. „აირჩიე ერთი სერვისი მაინც"
              is the owner's own sentence from lib/serviceProfile → profileGaps,
              which is the wording the services editor already shows this exact
              person; the two link labels are the nav's. Nothing on this screen
              was authored here — see CLAUDE.md, „The copy is the owner's".

              ⚠️ AN ADMIN IS NOT A SILENCE AT ALL. `mode: 'ALL'` means the queue
              really is empty, so it gets the quiet sentence — and the shell
              above already prints „ხედავ როგორც ადმინი" on every one of these
              screens, so the unnarrowed view is labelled where it is read
              rather than explained twice. */}
          <EmptyState
            icon={<Icon.search className="w-6 h-6" />}
            title={
              scope.mode === 'PAUSED' ? 'შენ თავი გამორთე'
              : scope.mode === 'UNLISTED' ? 'აირჩიე ერთი სერვისი მაინც'
              : scope.mode === 'FILTERED' ? 'შენს სერვისებზე ჯერ არაფერია'
              : 'ჯერ არაფერია'
            }
            description={
              scope.mode === 'PAUSED' ? 'სანამ გამორთული ხარ, მოთხოვნები არ მოგდის. ჩართვა „ჩემი სერვისები“-შია.'
              : scope.mode === 'UNLISTED' || scope.mode === 'FILTERED'
                ? 'ჩანს მხოლოდ ის მოთხოვნები, რაც შენს სერვისებსა და ქალაქებს ემთხვევა. სია „ჩემი სერვისები“-ში იცვლება.'
                : 'ახალი მოთხოვნა აქ გამოჩნდება, როგორც კი გადამოწმდება.'
            }
            cta={
              scope.mode === 'PAUSED' ? { label: 'ჩემი სერვისები', href: `${PROVIDER_ROUTE}/services` }
              : scope.mode === 'UNLISTED'
                ? (scope.fix === 'PROFILE'
                    ? { label: 'პროფილი', href: '/work/profile' }
                    : { label: 'ჩემი სერვისები', href: `${PROVIDER_ROUTE}/services` })
                : undefined
            }
          />
        </div>
      ) : (
        // The queue enters as a queue: `.stagger` is the site's own cascade
        // (rise-in per child, 40ms apart) and reduced motion lands every card
        // on its end state, which is the visible one.
        <div className="mt-6 grid gap-3 md:grid-cols-2 stagger">
          {requests.map(r => {
            // The last place is the one worth hurrying for; before that the
            // count is information, not pressure.
            const last = r.placesLeft === 1
            // ⚠️ THE DESCRIPTION IS THE TITLE (2026-08-19). `topicLabel` headed
            // every card, so four cleaning jobs were four cards reading „ბინის
            // დალაგება" and the only thing that told them apart — what the
            // client actually wrote — was set smaller, below, and optional.
            // The category did not disappear; it became the caption it always
            // was. When there is no description the category is the title
            // again, because a card with no title is worse than a repeated one.
            const titled = (r.description ?? '').trim() !== ''
            /* ⚠️ THE CLOCK THAT MAKES EXCLUSIVITY FAIR (2026-08-20). This
               request is not in anybody else's queue — the client chose this
               provider and the request was closed to everyone else
               (app/api/requests → `offerLimit: 1`). Exclusivity that costs
               nothing invites sitting on it, and the client is the one who
               waits. So the card says how long is left of the window after
               which THEY are offered a way out (lib/requestLive →
               DIRECT_WINDOW_MS). Nothing expires here: past zero the provider
               can still answer, and the request is still theirs until the
               client presses a button. */
            const since = invited.get(r.id)
            const hoursLeft = since
              ? Math.max(0, Math.ceil((since.getTime() + DIRECT_WINDOW_MS - Date.now()) / 3_600_000))
              : null
            // The money, split so the NUMBER carries the weight and the unit
            // does not. `budgetLabel` is „60–120₾ ერთ გამოძახებაზე" — one
            // string by design, so the two screens that print it cannot
            // disagree about what the number means. The unit is this kind's
            // own (KIND[r.kind].unitLabel), so the split is exact rather than
            // a guess at where the spaces fall: „15 000₾-ზე მეტი" has its own.
            const unit = KIND[r.kind].unitLabel
            const amount = r.budgetLabel.endsWith(unit)
              ? r.budgetLabel.slice(0, -unit.length).trim()
              : r.budgetLabel
            return (
            // `h-full` + `flex-col` + a footer on `mt-auto`: grid items stretch
            // to the tallest in their row by default, so the cards match height
            // and their action rows line up instead of each footer floating.
            <Card key={r.id} className="flex flex-col h-full hover-lift">
              <div className="flex items-start justify-between gap-3">
                {/* The shelf: what it is filed under, and where. City is
                    context — it is „თბილისი" on almost every row — so it sits
                    here rather than competing in the facts line. */}
                <p className="text-meta text-ink-500 min-w-0">
                  {/* ⚠️ THE ONE FACT THAT CHANGES HOW THIS CARD IS READ. When
                      the client aimed the request at this provider, the row
                      above the title says so — before the budget, before the
                      places-left count, because it reframes both: this is not a
                      three-way race, somebody read your profile and picked you.
                      Brand-tinted and tiny, in the caption row rather than as a
                      pill beside the title: it is a PROPERTY of the request,
                      like the city, not a badge on the provider. Drawn only
                      when true, which by definition is a minority of the feed —
                      the same rule that keeps EntityKinds off a single-kind
                      list. */}
                  {invited.has(r.id) && (
                    <span className="text-brand-700 font-display font-bold">შენ აგირჩია · </span>
                  )}
                  {titled ? <>{r.topicLabel} · {r.cityLabel}</> : r.cityLabel}
                  {hoursLeft !== null && (
                    <span className="block mt-0.5 text-ink-600">
                      {hoursLeft > 0 ? <>უპასუხე <span className="font-display font-bold tabular-nums">{hoursLeft} საათში</span></> : 'ვადა გავიდა — ჯერ კიდევ შენია'}
                    </span>
                  )}
                </p>
                {/* ⚠️ THE ONE NUMBER A PROVIDER DECIDES ON, and until 2026-08-19
                    it was the weakest thing on the card — small grey text in a
                    corner. It is a badge now, in the site's grammar (hairline
                    border, coloured text, no pastel fill), and it is the ONLY
                    colour on the card while places remain. The last place turns
                    it warning, because „one left" is the only state that
                    changes what the provider does next. */}
                <span className={`inline-flex items-center h-7 px-2.5 rounded-pill border text-meta font-display font-semibold tabular-nums shrink-0 ${
                  last ? 'border-warning-300 text-warning-700' : 'border-brand-200 text-brand-700'
                }`}>
                  {r.placesLeft} ადგილი {r.offerLimit}-დან
                </span>
              </div>

              {/* THE JOB. Two lines on the card, the whole thing on the detail
                  page — a queue you scan needs the shape of each request, not
                  all of it. */}
              <h3 className="mt-1.5 font-display text-body-lg font-semibold text-ink-900 leading-snug line-clamp-2">
                {titled ? r.description : r.topicLabel}
              </h3>

              {/* ⚠️ THE SIX-FIELD `<dl>` IS GONE (2026-08-19). Budget, timing,
                  every clarifier, format and city wrapped as a flex row, so one
                  card broke after four fields and its neighbour after six and
                  nothing lined up between them. Worse, all six weighed the
                  same: „ბიუჯეტი 60–120₾" was set exactly like „ქალაქი
                  თბილისი", when one decides and the other is almost always the
                  same word.
                  `r.extras` moved to the detail page. Those are the clarifying
                  answers — what you read before QUOTING, not what you read to
                  decide whether to open the card at all. */}
              <p className="mt-4 mb-5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-h3 font-bold text-ink-900 tabular-nums">{amount}</span>
                <span className="text-small text-ink-600">{unit} · {r.timingLabel}</span>
              </p>

              <div className="mt-auto pt-5 border-t border-ink-100 flex items-center justify-between gap-3">
                {/* AGE and COMPETITION — the two facts the speed-to-lead
                    research says a provider actually triages on. „იყავი
                    პირველი" is not decoration: the first responder takes ~78%
                    of clients, so it LEADS the line and carries weight, where
                    it used to trail the date in `text-meta` grey. Once offers
                    are in there is nothing to race for and the line goes quiet
                    again. */}
                <span className="text-meta text-ink-500 min-w-0">
                  {r.offerLimit - r.placesLeft === 0
                    ? <><span className="text-small font-display font-semibold text-brand-700">იყავი პირველი</span>{' · '}</>
                    : <>{r.offerLimit - r.placesLeft} შეთავაზება უკვე შესულია{' · '}</>}
                  {timeAgoKa(r.createdAt)}
                </span>
                {/* The action names the intention, not the page. „ნახვა" on a
                    secondary button described what the browser would do; the
                    provider came here to bid. Same address. */}
                <Btn href={`/work/requests/${r.id}`} size="sm" className="shrink-0">
                  შეთავაზება
                </Btn>
              </div>
            </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
