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
import type { Prisma } from '@prisma/client'
import { requestsViewer, providerQueueScope } from '@/lib/requestsServer'
import { providerUserIdsOf } from '@/lib/offerLifecycle'
import { ensureDbReady } from '@/lib/dbBoot'
import { providerRequestView, timeAgoKa, PROVIDER_ROUTE } from '@/lib/requests'
import { queueWhere } from '@/lib/requestRouting'
import { PageHeader } from '@/components/PageHeader'
import { WorkTabs } from '@/app/work/_components/WorkTabs'
import { AutoRefresh } from '@/components/AutoRefresh'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
// The card's plate colour, by position — `TILE_HUES`' own rule, and the reason
// is its own: a hue that means „plumbing" is a taxonomy nobody maintains.
import { tileHue } from '@/app/_home/data'
import { DIRECT_WINDOW_MS } from '@/lib/requestLive'

export const dynamic = 'force-dynamic'

/** The kind's own mark, so a column of cards is a column of silhouettes rather
 *  than one stamp repeated — the argument components/Icon's own header makes.
 *  Every glyph is an existing one; nothing is drawn for this screen. */
const KIND_ICON = {
  LEARNING: Icon.doc,
  MEETING: Icon.chat,
  PROJECT: Icon.briefcase,
  SERVICE: Icon.home,
} as const

export default async function Page({ searchParams }: {
  searchParams: Promise<{ q?: string }>
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

  /* ⚠️ THE KIND FILTER IS GONE (2026-09-02), AND WHAT REPLACED IT IS NOTHING —
   * because the answer it gave was already given upstream.
   *
   * It was a second row under `WorkTabs`: „ყველა · სწავლება · შეხვედრა ·
   * სამუშაო · სერვისი", five links over a list that `providerQueueScope` has
   * ALREADY narrowed to the services this person sells. A provider who sells
   * one thing was being offered four ways to narrow a queue that was one thing
   * wide — nine controls above a list that is empty for most of them, which is
   * exactly what the owner saw on /work/requests and called excess.
   *
   * The pattern this follows is Thumbtack's, which is the closest thing to a
   * standard here: what a pro wants to see is a STORED preference („job types",
   * „travel areas"), set once in their own settings, and the jobs feed itself
   * carries stages, not filters. mcodne already has that preference — it is the
   * service list on /work/profile, and `queueScope` reads it.
   *
   * ⚠️ AND `?kind=` GOES WITH THE CHIPS rather than being left honoured-but-
   * unreachable. Nothing in the codebase linked to it (checked) and no test
   * pinned it, so keeping the parameter would leave a filter a provider could
   * land on from an old bookmark with no control on screen to see or clear it —
   * a queue that is silently short and says nothing about why. CLAUDE.md's own
   * rule for a control nobody reaches: delete it rather than leave it switched
   * off. */
  const { q: rawQ } = await searchParams

  /* ── THE SEARCH BOX (2026-09-01, the owner's design canvas → „Expert Jobs") ──
   *
   * ⚠️ IT SEARCHES THE DESCRIPTION, WHICH IS THE ONLY HONEST TARGET. `topic` is
   * a latin id („plumbing"), so matching it would answer Georgian queries with
   * nothing and latin ones with rows nobody asked for; what the provider is
   * reading on every card, and therefore what they will type at, is the
   * sentence the client wrote.
   *
   * ⚠️ A LINK AND A GET FORM, NOT CLIENT STATE — the same argument the kind
   * filter makes one block down. This is part of the DATABASE query, so making
   * it instant would mean fetching every open request and filtering in the
   * browser. A round-trip is the honest cost of a server filter, and it buys a
   * URL a provider can bookmark.
   *
   * Trimmed and capped: an unbounded string goes into an ILIKE, and 80
   * characters is longer than anything anybody types into a search box.
   */
  const q = (rawQ ?? '').trim().slice(0, 80)

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

  // 🔒 MY OWN REQUEST IS NOT WORK (2026-08-31). The offer endpoint refuses it
  // and that is the guard; this is so nobody has to meet the guard. A card in
  // the queue that answers 409 „NOT_OPEN" when you press it is the same
  // confusion the owner asked to remove („ირევა ძალიან კოდი") — and the 409 is
  // deliberately vague about WHY, so it could not explain itself even if it
  // wanted to. Same list as the endpoint's, so the two cannot disagree.
  const selfIds = me
    ? await providerUserIdsOf({
        expertUserId: me.kind === 'EXPERT' ? me.userId : null,
        companyId: me.kind === 'COMPANY' ? me.companyId : null,
      })
    : []

  // ⚠️ `userId` IS NULLABLE AND MOST REQUESTS ARE ANONYMOUS — somebody who
  // filled the form without an account. In SQL `NULL NOT IN (…)` is NULL, which
  // is not true, so a bare `notIn` would have hidden the majority of the queue
  // from every provider. The two cases are written out.
  const notMine: Prisma.ServiceRequestWhereInput[] = selfIds.length
    ? [{ OR: [{ userId: null }, { userId: { notIn: selfIds } }] }]
    : []
  const scopeAnd: Prisma.ServiceRequestWhereInput[] =
    Array.isArray(mine.AND) ? (mine.AND as Prisma.ServiceRequestWhereInput[]) : []

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
      // `mode: 'insensitive'` is an ILIKE. Georgian has no case, so it costs
      // nothing here and is correct the day somebody types a latin brand name.
      ...(q ? { description: { contains: q, mode: 'insensitive' as const } } : {}),
      ...mine,
      // ⚠️ THE TWO `AND`s ARE MERGED, NOT SPREAD SIDE BY SIDE. `queueWhere`
      // returns `{ AND: [...] }` for every provider who is not on the ALL
      // scope — which is almost everyone — so writing this as its own `AND`
      // key means the later spread wins and ONE OF THE TWO RULES DISAPPEARS
      // with nothing to show for it: either the trade narrowing or this. Stated
      // after `...mine` and built from it, so whichever gains a rule next still
      // arrives here whole.
      ...(scopeAnd.length || notMine.length ? { AND: [...scopeAnd, ...notMine] } : {}),
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
  /* ── HOW MANY PHOTOS EACH ONE HAS, WITHOUT READING ONE ──────────────────
   *
   * ⚠️ THE SELECT ABOVE STILL MAY NOT NAME `photos`, and this is how the card
   * gets a picture anyway. The column is a `String[]` of base64 data URIs
   * (prisma/schema, and `ProviderRequestRow`'s own note): 100 rows × up to 3
   * images is megabytes inside the HTML of a page read on phones. `array_length`
   * is computed in Postgres and returns an integer per row, so what crosses the
   * wire is one small number — and the image itself is fetched by the browser,
   * on demand, from /api/provider/requests/[id]/photo.
   *
   * `array_length` is NULL on an empty array in Postgres, not 0, hence the
   * COALESCE — without it every request with no photos would come back with a
   * count of `null` and the badge would render „null ფოტო".
   */
  const ids = rows.map(r => r.id)
  const photoCounts = new Map<string, number>(
    ids.length
      ? (await prisma.$queryRawUnsafe<{ id: string; n: number }[]>(
          `SELECT "id", COALESCE(array_length("photos", 1), 0)::int AS n
             FROM "ServiceRequest" WHERE "id" = ANY($1::text[])`,
          ids,
        )).map(r => [r.id, r.n])
      : [],
  )

  const requests = rows.map(providerRequestView)

  return (
    <>
      {/* ⚠️ ONE HEADING FOR THE WHOLE FLOW (2026-08-29). This page called itself
          „მოთხოვნები" and /work/jobs called itself „სამუშაოები", which is how
          three stages of one job read as two products. The heading is the job
          now; which stage you are looking at is the bar below it. Owner: „ერთი
          ნაკადი გახდეს."

          ⚠️ AND IT IS NOT „ახალი სამუშაოები" (2026-09-01). The owner's design
          canvas heads this screen that way, and the chip bar directly under it
          already lights „ახალი" — porting the heading literally would put the
          same word on the screen twice, forty pixels apart, as a title and as a
          state. The canvas draws one artboard with no tab bar; the product has
          four stages at two addresses, and the bar is what carries them. */}
      <PageHeader
        title="სამუშაოები"
        sub="დამოწმებული მოთხოვნები, რომლებზეც ჯერ ადგილი რჩება."
        actions={<AutoRefresh />}
      />
      <WorkTabs showOffers openRequests={rows.length} />

      {/* ── FINDING ONE JOB IN THE LIST (2026-09-01, the canvas) ────────────
          ⚠️ A PLAIN GET FORM. It needs no JavaScript, it leaves a URL the
          provider can bookmark, and the filter it drives is part of the
          database query — see the `where` above. Submitting reloads with
          `?q=`, and the kind chips below keep whatever is typed because each
          one carries it.

          ⚠️ AND THERE IS NO LOCATION SELECT TODAY, WHICH IS THE CANVAS BEING
          FOLLOWED RATHER THAN IGNORED. It draws „ნებისმიერ ადგილას / თბილისი",
          and `ONE_CITY` (lib/requestTopics) is true: Tbilisi is the only city
          this product serves, so the control would have exactly one real
          option. That file states the rule for its own existence — „the
          question „which city?" has exactly one answer, and therefore must not
          be asked". The select appears on its own the day a second city opens.

          ⚠️ NOR A „ფილტრი" BUTTON, and since 2026-09-02 nothing else either.
          The canvas's „ფილტრი" opens what the kind chips under this form used
          to be, and both are gone for the same reason: the queue arrives
          already narrowed to what this person sells, so a filter over it is a
          control that mostly returns an empty list. One search box is the whole
          bar. */}
      <form method="get" className="mt-5 flex flex-wrap items-center gap-2.5">
        <label className="flex h-12 min-w-[240px] flex-1 items-center gap-2.5 rounded-field border border-ink-200 bg-white px-4 focus-within:border-brand-500">
          <Icon.search className="h-[18px] w-[18px] shrink-0 text-ink-500" />
          <span className="sr-only">მოძებნე სამუშაო</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="მოძებნე სამუშაო"
            maxLength={80}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-body text-ink-900 placeholder-ink-400 outline-none"
          />
        </label>
        <Btn type="submit" variant="secondary" size="lg" className="shrink-0">ძებნა</Btn>
        {q && (
          <Btn href="/work/requests" variant="ghost" size="sm" className="shrink-0">
            გასუფთავება
          </Btn>
        )}
      </form>

      {requests.length === 0 ? (
        <div className="mt-6">
          {/* ⚠️ EMPTY HAS FIVE CAUSES AND THEY NEED DIFFERENT SENTENCES.
              „ჯერ არაფერია" is true when the whole queue is quiet; it is a LIE
              when the queue is busy and this provider's own services simply do
              not match it, and that reading — „the site is broken" — is exactly
              what an unexplained empty screen produces (2026-08-18).

              The fifth arrived with the search box (2026-09-01) and is the one
              the reader can fix in a second: they typed something nothing
              matches. It is checked FIRST, because it is true regardless of
              which of the other four also holds — a provider who searched
              „ქიმია" does not need to be told about their service list. */}
          {q ? (
            <EmptyState
              icon={<Icon.search className="w-6 h-6" />}
              title="ვერაფერი მოიძებნა"
              description={`„${q}“ — ამ სიტყვაზე ღია სამუშაო არ არის.`}
              cta={{ label: 'ყველა სამუშაო', href: '/work/requests' }}
            />
          ) : (
            <EmptyState
              icon={<Icon.search className="w-6 h-6" />}
              /* The drawing belongs to THIS branch and not to the search miss
                 above it: „ჯერ არაფერია" is the state the style guide names
                 („/work/requests ან მოთხოვნები არ არის"), and a folder with a
                 card in it says „the queue is empty" — which is a lie about a
                 word that simply matched nothing. `icon` stays as the fallback
                 the component picks when the file is absent. */
              illustration="workRequests"
              title={
                scope.mode === 'PAUSED' ? 'შენ თავი გამორთე'
                : scope.mode === 'UNLISTED' ? 'აირჩიე ერთი სერვისი მაინც'
                : scope.mode === 'FILTERED' ? 'შენს სერვისებზე ჯერ არაფერია'
                : 'ჯერ არაფერია'
              }
              description={
                scope.mode === 'PAUSED' ? 'სანამ გამორთული ხარ, მოთხოვნები არ მოგდის. ჩართვა „ანგარიში“-შია.'
                : scope.mode === 'UNLISTED' || scope.mode === 'FILTERED'
                  ? 'ჩანს მხოლოდ შენს სერვისებზე მორგებული მოთხოვნები.'
                  : 'ახალი მოთხოვნა აქ გამოჩნდება, როგორც კი გადამოწმდება.'
              }
              cta={
                // PAUSED goes to the switch, not to the editor: it is the one of
                // these that is not fixed by filling a field in.
                scope.mode === 'PAUSED' ? { label: 'ანგარიში', href: `${PROVIDER_ROUTE}/account` }
                : scope.mode === 'UNLISTED'
                  ? { label: 'ჩემი გვერდი', href: `${PROVIDER_ROUTE}/profile` }
                  : undefined
              }
            />
          )}
        </div>
      ) : (
        <>
          {/* ⚠️ A COUNT, BECAUSE THE CANVAS ASKS FOR ONE AND IT IS MEASURED.
              „მოიძებნა 41 სამუშაო" is `rows.length` — the rows actually on this
              page, after the trade narrowing and after the search. It is capped
              at the query's own `take: 100`, so it is honestly „what is here",
              never a platform-wide total this provider cannot see. */}
          <p className="mt-4 text-small text-ink-600">
            მოიძებნა <b className="font-display font-bold text-ink-900 tabular-nums">{requests.length}</b> სამუშაო
          </p>

          {/* The queue enters as a queue: `.stagger` is the site's own cascade
              (rise-in per child, 40ms apart) and reduced motion lands every card
              on its end state, which is the visible one. */}
          <div className="mt-3 flex flex-col gap-2.5 stagger">
            {requests.map(r => {
              /* ⚠️ THE CARD IS ONE ROW WITH A PICTURE IN IT (2026-09-01, the
                 canvas). It was a two-column grid of tinted tiles. The photo is
                 the change that forced the shape: a client's photograph of the
                 job is the single most useful thing on the card — it is what
                 lets a price be named rather than a conversation opened — and it
                 needs width, which a half-width grid cell did not have.

                 ⚠️ THE PICTURE IS NEVER IN THIS PAGE'S PAYLOAD. `photos` is
                 base64 and the select above refuses it; what the card holds is a
                 COUNT and a URL. See /api/provider/requests/[id]/photo. */
              const photos = photoCounts.get(r.id) ?? 0
              // What the headline did not already say. `requestHeadline` may
              // return the first sentence, the whole description, or a
              // truncation of it — in the last two cases there is no remainder
              // and the line is not drawn.
              const flat = r.description.replace(/\s+/g, ' ').trim()
              const rest = flat.startsWith(r.headline) ? flat.slice(r.headline.length).trim() : flat
              const hue = tileHue(r.topicLabel.length + r.kind.length)
              const mineInvite = invited.has(r.id)
              const made = r.offerLimit - r.placesLeft
              const KindIcon = KIND_ICON[r.kind]

              /* THE THREE FACTS. The canvas's own three are „ადგილი / მოცულობა
                 / მასალა" — and the last two are not columns: they are the
                 CLARIFYING ANSWERS a client gave in the wizard, which live in
                 `extras` and exist only for the topics that ask for them
                 (lib/requestTopics → extrasFor). So the row is built from what
                 this request actually has: the city, then whatever it was
                 asked, then the money and the deadline to make three. A card
                 that printed „მასალა —" on every learning request would be the
                 canvas ported as a picture rather than as a design. */
              const facts = [
                { k: 'ადგილი', v: r.cityLabel },
                ...r.extras.slice(0, 2).map(e => ({ k: e.label, v: e.value })),
                { k: 'ბიუჯეტი', v: r.budgetLabel },
                { k: r.kind === 'LEARNING' ? 'სიხშირე' : r.kind === 'SERVICE' ? 'როდის' : 'ვადა', v: r.timingLabel },
              ].slice(0, 3)

              return (
                <Link
                  key={r.id}
                  href={`/work/requests/${r.id}`}
                  className="group flex flex-wrap items-stretch overflow-hidden rounded-card border border-ink-200 bg-white transition-[border-color,box-shadow] duration-fast hover:border-ink-300 hover-lift"
                >
                  {/* ── The picture, or the mark that stands in for one ─────
                      A tinted plate with the kind's glyph is not a placeholder
                      apologising for a missing photo — it is what most requests
                      will always look like, and a row of grey boxes would make
                      the ones WITH a photo read as the only real jobs. */}
                  <span
                    className="relative block min-h-[172px] w-full min-w-[160px] max-w-full shrink-0 sm:w-[200px] sm:max-w-[220px] sm:flex-[1_1_200px]"
                    style={{ backgroundColor: hue.bg }}
                  >
                    {photos > 0 && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/provider/requests/${r.id}/photo?n=0`}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    <span
                      aria-hidden
                      className="absolute left-3 top-3 grid h-[38px] w-[38px] place-items-center rounded-tile bg-white/95"
                      style={{ color: hue.ink }}
                    >
                      <KindIcon className="h-5 w-5" />
                    </span>
                    {photos > 0 && (
                      <span className="absolute bottom-3 left-3 inline-flex h-[26px] items-center whitespace-nowrap rounded-pill bg-ink-900/85 px-2.5 font-display text-meta font-bold text-white">
                        {photos} ფოტო
                      </span>
                    )}
                  </span>

                  <span className="flex min-w-[260px] flex-[1_1_320px] flex-col gap-3 p-5 sm:p-6">
                    <span className="flex flex-wrap items-start gap-3">
                      {/* ⚠️ THE DESCRIPTION IS THE TITLE (2026-08-19).
                          `topicLabel` headed every card, so four cleaning jobs
                          were four cards reading „ბინის დალაგება". When there is
                          no description the category is the title again, because
                          a card with no title is worse than a repeated one — see
                          requestHeadline. */}
                      <span className="min-w-[180px] flex-1 font-display text-body-lg font-bold leading-snug tracking-tight text-ink-900 line-clamp-2">
                        {r.headline}
                      </span>
                      {/* ⚠️ THE CHIP IS THE TIMING, WHICH IS WHAT THE CANVAS'S
                          OWN VALUES ARE („სასწრაფო", „ამ თვეში", „ვადა
                          მოქნილია"). It is tinted only when the client was
                          addressing THIS provider — the one fact that changes
                          how the whole card is read, and the only one worth
                          spending colour on in a list. */}
                      <span
                        className={`inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-pill border px-2.5 font-display text-meta font-bold ${
                          mineInvite ? '' : 'border-ink-200 bg-ink-75 text-ink-700'
                        }`}
                        style={mineInvite ? { backgroundColor: hue.bg, borderColor: hue.border, color: hue.ink } : undefined}
                      >
                        {mineInvite ? 'შენ აგირჩია' : r.timingLabel}
                      </span>
                    </span>

                    <span className="flex flex-wrap gap-x-6 gap-y-2.5">
                      {facts.map((f, i) => (
                        <span key={i} className="min-w-0">
                          <span className="block text-meta text-ink-500">{f.k}</span>
                          <span className="mt-0.5 block whitespace-nowrap font-display text-small font-semibold text-ink-900">{f.v}</span>
                        </span>
                      ))}
                    </span>

                    {/* ⚠️ ONLY WHAT THE TITLE LEFT OUT (2026-09-01, found in
                        review). `requestHeadline` DERIVES the title from the
                        description's first sentence, so rendering the whole
                        description underneath printed the same words twice on
                        every short request — once bold, once grey. That is
                        verbatim the defect the offers row next door already
                        forbids. A queue you scan needs the SHAPE of each
                        request, not all of it; the whole thing is on the page
                        the card opens. */}
                    {rest && (
                      <span className="truncate text-small leading-relaxed text-ink-600">{rest}</span>
                    )}

                    <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-100 pt-3.5">
                      <span className="whitespace-nowrap text-small text-ink-600">{timeAgoKa(r.createdAt)}</span>
                      <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-pill bg-ink-300" />
                      {/* AGE and COMPETITION — the two facts the speed-to-lead
                          research says a provider actually triages on. „იყავი
                          პირველი" is not decoration: the first responder takes
                          ~78% of clients, so it carries weight while it is true.
                          Once offers are in, the count takes over. */}
                      {made === 0
                        ? <span className="whitespace-nowrap font-display text-small font-semibold text-brand-700">იყავი პირველი</span>
                        : <span className={`whitespace-nowrap text-small font-semibold ${r.placesLeft === 1 ? 'text-warning-700' : 'text-ink-600'}`}>
                            {made} შეთავაზება {r.offerLimit}-დან
                          </span>}
                      <span className="flex-1" />
                      {/* Not a nested <button>: the whole card is the link, and a
                          control inside it would be a second tab stop to the same
                          place. It reads as the affordance and is one. */}
                      <span
                        aria-hidden
                        className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-field bg-ink-100 px-4 font-display text-small font-semibold text-ink-900 transition-colors duration-fast group-hover:bg-ink-200"
                      >
                        ნახვა
                        <Icon.chevR className="h-4 w-4" />
                      </span>
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
