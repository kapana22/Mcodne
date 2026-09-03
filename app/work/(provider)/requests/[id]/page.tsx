// /provider/requests/[id] — the full request, and what to do about it.
//
// ⚠️ REDRAWN FROM THE OWNER'S DESIGN CANVAS (2026-09-01, „Expert Jobs" screens
// 2 and 4). It was one reading column: the request card, the contact, then the
// offer form stacked under it. The canvas splits it — the JOB on the left, the
// DECISION in a sticky card on the right — and moves the form to a screen of
// its own (./offer). The reason is the new order of the money: a provider reads
// a job, answers for free, and pays only if they are chosen, so the right-hand
// card exists to state the fee and the freeness TOGETHER, before either has
// happened. Stacked, those two facts were forty pixels apart and read as
// unrelated.
//
// Same contact rule as the list it came from: the row is shaped by
// `providerRequestView` (lib/requests) and the client's name, phone and email
// are not parameters of that function.
//
// ⚠️ AND THAT IS EXACTLY WHY THIS PAGE HAS A SECOND SELECT (2026-08-21). The
// client's contact is something a provider BUYS, so this screen has to be able
// to show it. It does so without widening `ProviderRequestRow`: the three
// columns are fetched by their own query, `CLIENT_CONTACT_SELECT`, reachable
// only inside `if (unlocked)`. A rule enforced by what is FETCHED is a rule a
// future render cannot forget; a nullable field on the shared row would be one
// a future render forgets on its first day.

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import {
  providerRequestView, timeAgoKa, KIND, kindOf, offerPriceLabel,
  CLIENT_CONTACT_SELECT, clientContactView, type ClientContact,
} from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { contactUnlocked } from '@/lib/creditsServer'
import { CONTACT_FEE_LABEL, contactCostTetri, OFFER_FREE_TITLE, OFFER_FREE_BODY, gelLabel } from '@/lib/credits'
import { Eyebrow } from '@/components/Eyebrow'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { ContactCard } from './_contact'
import { JobTracker } from '../../_tracker'

export const dynamic = 'force-dynamic'

/** The kind's own mark, so four cards in a row are four silhouettes rather than
 *  one stamp repeated — the argument components/Icon's own header makes. Every
 *  glyph is an existing one; nothing is drawn for this screen. */
const KIND_ICON = {
  LEARNING: Icon.doc,
  MEETING: Icon.chat,
  PROJECT: Icon.briefcase,
  SERVICE: Icon.home,
} as const

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // The layout already gated the segment; this call is for the provider
  // IDENTITY, which decides whether the form is offered and whether their own
  // offer already exists.
  const viewer = await requestsViewer()
  // ⚠️ THE ALLOWLIST, CHECKED HERE TOO (2026-08-17). lib/requestsServer states
  // the rule: „Every route checks here as well… neither layer is load-bearing
  // alone." A layout is not a reliable authorization boundary in the App
  // Router, and what this page hands out — a whole request, with descriptions
  // and budgets — is worth the one line.
  if (!viewer.providerAllowed) notFound()
  const { id } = await params

  await ensureDbReady()

  const row = await prisma.serviceRequest.findUnique({
    where: { id },
    select: {
      // ⚠️ NOT publicRef — it is the client's credential and no provider
      // surface may hold it, let alone render it. See lib/requests →
      // ProviderRequestRow.
      id: true, kind: true, topic: true, description: true,
      budgetMin: true, budgetMax: true, budgetUnit: true,
      timing: true, format: true, city: true, status: true, details: true,
      offerCount: true, offerLimit: true, createdAt: true,
      // ⚠️ THE ONE SCREEN THAT MAY SELECT THE BLOBS (2026-08-29). `photos` is a
      // `String[]` of base64 data URIs — a list payload must never carry it
      // (see prisma/schema) — and this is the DETAIL page for exactly one
      // request, which is the whole reason it may. It is also the screen where
      // the photos do their work: a provider naming a price wants to see the
      // tap, not read about it.
      photos: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!row) notFound()

  // Has this provider already answered? One offer per provider per request is a
  // database constraint (the two unique indexes), so the form would fail with
  // ALREADY_OFFERED — telling them beforehand is the difference between a
  // screen that knows what it is showing and one that finds out on submit.
  //
  // ⚠️ AN INVITED ROW IS NOT AN ANSWER (2026-08-18). A client can write to an
  // expert before anybody has bid, so this provider may already OWN a row
  // without having offered anything — without the filter the page would say
  // „უკვე გაქვს გაგზავნილი" and hide the form, so the one expert the client
  // actually reached out to would be the one expert who could not answer.
  //
  // ⚠️ IT CARRIES THE PRICE NOW (2026-09-01). The „chosen" card shows the
  // provider their own accepted figure beside the client's name — the canvas's
  // „შენი შეთავაზება 90₾" — so the winner is looking at what they committed to
  // at the moment they pay to ring about it.
  const p = viewer.provider
  const mine = p
    ? await prisma.requestOffer.findFirst({
        where: {
          requestId: row.id,
          status: { not: 'INVITED' },
          ...(p.kind === 'EXPERT' ? { expertUserId: p.userId } : { companyId: p.companyId }),
        },
        select: { id: true, status: true, priceGel: true, priceKind: true },
      })
    : null

  // ── WHO MAY OPEN THIS, BY STATUS ─────────────────────────────────────────
  //
  // NEW and REJECTED 404 for everyone: nobody has read them yet, they may be
  // spam, and „this exists but you cannot see it" is information a bidder has
  // no use for.
  //
  // MATCHED and CLOSED are visible to the people who have a stake in them — a
  // provider who actually made an offer, and an admin. Not to a passer-by: that
  // would turn a settled request into a browsable archive of what other people
  // asked for.
  const isAdmin = viewer.user?.role === 'ADMIN'
  const settled = row.status === 'MATCHED' || row.status === 'CLOSED'
  const mayOpen =
    row.status === 'VERIFIED' ||
    (settled && (mine !== null || isAdmin))
  if (!mayOpen) notFound()

  const r = providerRequestView(row)
  // What this provider is looking at, in one word — the tracker, the heading
  // and the card on the right must agree, and deriving all three from one value
  // is how they stay agreeing.
  const outcome: 'OPEN' | 'WON' | 'LOST' | 'SETTLED' =
    !settled ? 'OPEN'
    : mine?.status === 'ACCEPTED' ? 'WON'
    : mine ? 'LOST'
    : 'SETTLED'

  // ── The contact: has this provider paid for it? ──────────────────────────
  //
  // ⚠️ ASKED ON EVERY OUTCOME, AND THAT IS NOT A LEFTOVER (2026-09-01).
  //
  // The unlock is gated on an ACCEPTED offer from today, so it is tempting to
  // ask only when this provider has won. That would be wrong for a group of
  // real people: everybody who BOUGHT A CONTACT UNDER THE OLD ORDER. Until
  // today a provider paid 1₾ on an open request, before bidding and before any
  // client had chosen — and some of those requests are still open, and some of
  // those providers later lost. Reading the ledger only for winners would take
  // a phone number away from somebody who paid for it, which is the one thing
  // lib/credits says must never happen: „Charging twice for the same phone
  // number is theft" has an obvious twin.
  //
  // So the LEDGER decides what is shown, exactly as it always has; what changed
  // is only who may make a NEW purchase.
  //
  // ⚠️ THE LEDGER IS THE AUTHORISATION, not this page. `contactUnlocked` reads
  // the one row `contactKey(requestId)` writes (lib/creditsServer), so „may I
  // see this number" has exactly one answer and it is the same one the charge
  // wrote. Only when it says yes are the columns fetched at all.
  //
  // ⚠️ A COMPANY MEMBER IS NEVER UNLOCKED, because they can never be charged —
  // the ledger is keyed on a USER and a company's lead must not come out of a
  // personal balance. The endpoint refuses them with COMPANY_UNSUPPORTED and
  // this simply never asks.
  const expertUserId = p?.kind === 'EXPERT' ? p.userId : null
  const won = outcome === 'WON' && expertUserId !== null
  const unlocked = expertUserId ? await contactUnlocked(expertUserId, row.id) : false
  const contact: ClientContact | null = unlocked
    ? clientContactView(await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: row.id },
        select: CLIENT_CONTACT_SELECT,
      }))
    : null
  // The client's NAME is legitimate the moment they choose somebody — that is
  // what `clientIdentityOpen` (lib/requests) has released on acceptance since
  // 2026-08-21, and it is fetched only inside that case.
  const clientName = won || unlocked
    ? (await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: row.id }, select: { contactName: true },
      })).contactName
    : ''

  // How many have answered — the canvas's own words for this number come from
  // the client's artboard („2 ექსპერტმა უკვე უპასუხა"), which is the same fact
  // said to the other side.
  const answered = row.offerCount
  const KindIcon = KIND_ICON[r.kind]

  /* ── THE QUESTIONS AND THEIR ANSWERS ────────────────────────────────────
     ⚠️ THE `<dl>` CAME BACK, AND IT IS NOT THE 2026-08-19 ROW RETURNING. That
     one was six label/value pairs wrapping as a text run, every fact at one
     weight, and it was replaced by tiles for exactly that reason. The canvas
     draws something different: a stacked LIST of question → answer, each on its
     own line with a hairline under it, read top to bottom before quoting. Tiles
     are for scanning a card; this is for reading one job.

     Built from the same expressions the queue card and the mail use, so a kind
     whose timing means „how often" is never headed „ვადა" on one screen and
     „სიხშირე" on the next. */
  const qa: { k: string; v: string }[] = [
    { k: 'რა უნდა გაკეთდეს', v: r.topicLabel },
    { k: 'ბიუჯეტი', v: r.budgetLabel },
    { k: r.kind === 'LEARNING' ? 'სიხშირე' : r.kind === 'SERVICE' ? 'როდის' : 'ვადა', v: r.timingLabel },
    // The clarifying answers the client gave in the wizard. Safe by
    // construction: `extrasLabels` reads the bag through the question list, so
    // a poisoned column cannot render.
    ...r.extras.map(e => ({ k: e.label, v: e.value })),
    // ⚠️ NO „ფორმატი" ON A SERVICE. The kind decides it — somebody has to be in
    // the room — so the row would print „ადგილზე" on every single one, which is
    // a line that has never told anybody anything.
    ...(r.kind === 'SERVICE' ? [] : [{ k: 'ფორმატი', v: r.formatLabel }]),
    { k: 'ქალაქი', v: r.cityLabel },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Btn href="/work/requests" variant="secondary" size="sm" iconLeft={<Icon.back className="h-4 w-4" />}>
          უკან
        </Btn>
      </div>

      {/* ⚠️ THE TRACKER IS DRAWN ONLY WHILE IT IS TRUE. On a lost or settled
          request the three steps describe a journey that ended somewhere else,
          and a progress bar frozen at step one is a screen telling somebody
          they are still in a race they lost. */}
      {/* ⚠️ THREE STATES, NOT TWO (2026-09-01, found by walking the flow). This
          read „won ? 1 : 0", so a provider who had been chosen AND had already
          paid to open the contact still saw the tracker frozen on
          „დადასტურების მიღება" — the step they had finished. The third dot,
          „სამუშაოს დაწყება", is exactly what opening the contact begins, and
          `unlocked` is the fact that says it happened. A progress marker that
          does not move when the person moves is worse than none: it tells them
          the site has not noticed what they just did. */}
      {(outcome === 'OPEN' || outcome === 'WON') && (
        <JobTracker active={outcome === 'WON' ? (unlocked ? 2 : 1) : 0} />
      )}

      {/* ⚠️ A CONTACT ALREADY PAID FOR IS SHOWN WHEREVER ITS OWNER LANDS. A
          provider who bought one under the old order and then lost is on the
          LOST branch below, and the number they paid for is drawn there rather
          than only in the „you were chosen" column. */}
      {outcome === 'WON' ? (
        /* ── CHOSEN → OPEN THE CONTACT (the canvas, screen 4) ──────────────
           One column, narrow: there is exactly one thing to do here and a
           second column would be somewhere for the eye to go instead. */
        <div className="flex max-w-[640px] flex-col gap-5">
          <div>
            <h1 className="font-display text-h1 font-extrabold tracking-tight text-ink-900">კლიენტმა შეგარჩია</h1>
            <p className="mt-2.5 text-body-lg leading-relaxed text-ink-700">
              გახსენი კონტაქტი, რომ შეთანხმდე დეტალებზე და დაიწყო სამუშაო.
            </p>
          </div>

          {expertUserId ? (
            <ContactCard
              requestId={r.id}
              offerLimit={row.offerLimit}
              clientName={clientName}
              // Through the one function that words a price, so this card and
              // the client's own list cannot describe the same offer two ways.
              priceLabel={offerPriceLabel(mine!.priceGel, mine!.priceKind)}
              feeTetri={contactCostTetri(row.budgetMin, row.budgetMax)}
              initial={contact}
            />
          ) : (
            // A company member: the ledger is keyed on a user and cannot bill
            // them. Said here rather than met on a button that answers 409.
            <Card>
              <p className="text-body text-ink-600">კომპანიის ანგარიშით კონტაქტის გახსნა ჯერ არ მუშაობს.</p>
            </Card>
          )}

          {/* The job itself, under the action — on this screen it is reference,
              not the decision. */}
          <Card>
            <Eyebrow tone="muted" className="mb-2">კლიენტის აღწერა</Eyebrow>
            <p className="whitespace-pre-line text-body leading-relaxed text-ink-800">{r.description}</p>
          </Card>

          {/* ⚠️ STRAIGHT INTO THE THREAD, NOT INTO THE LIST (2026-09-01, found by
              walking the flow). This pointed at /work/offers — the list of every
              offer this provider has sent — so answering the client who had just
              chosen them meant: press „მიმოწერა", land on a list, find the right
              row among all the others, press „მიმოწერა" again. Two clicks and a
              search for the one conversation the screen is already about.
              `mine` is this provider's accepted offer on THIS request and the
              thread is keyed on it, so the address is already in hand. */}
          <div>
            <Btn href={`/work/offers/${mine!.id}`} variant="secondary" size="sm">მიმოწერა</Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          {/* ── LEFT: the job ──────────────────────────────────────────── */}
          <div className="flex min-w-[320px] flex-[1_1_480px] flex-col gap-3.5">
            <Card>
              <div className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-tile border border-brand-200 bg-brand-50 text-brand-700"
                >
                  <KindIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  {/* The TITLE is what the client wrote, so this page and the
                      card it was opened from say the same thing — see
                      requestHeadline in lib/requests. */}
                  <h1 className="font-display text-h2 font-extrabold leading-tight tracking-tight text-ink-900">
                    {r.headline}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-600">
                    <span>{r.cityLabel}</span>
                    <span>{timeAgoKa(r.createdAt)}</span>
                    {settled && <span className="font-display font-semibold text-ink-700">დახურულია</span>}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <Eyebrow tone="muted">კითხვები და პასუხები</Eyebrow>
              <dl className="mt-4">
                {qa.map((q, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-ink-100 py-3 last:border-b-0"
                  >
                    <dt className="min-w-[140px] flex-[0_0_180px] text-small text-ink-600">{q.k}</dt>
                    <dd className="min-w-[160px] flex-1 font-display text-body font-semibold leading-normal text-ink-900">{q.v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5">
                <Eyebrow tone="muted">კლიენტის აღწერა</Eyebrow>
                <p className="mt-2.5 whitespace-pre-line text-body-lg leading-relaxed text-ink-800">{r.description}</p>
              </div>
            </Card>

            {/* ⚠️ NOTHING IS DRAWN WHEN THERE ARE NONE — a heading over an empty
                row is the page apologising for somebody (2026-08-29). */}
            {r.photos.length > 0 && (
              <Card>
                <Eyebrow tone="muted" className="mb-3">ფოტო კლიენტისგან</Eyebrow>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {r.photos.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="aspect-[4/3] w-full rounded-tile border border-ink-200 bg-ink-100 object-cover"
                    />
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* ── RIGHT: the fee, the freeness, and the one action ─────────── */}
          <div className="sticky top-24 flex min-w-[280px] flex-[0_1_320px] flex-col gap-3">
            <Card>
              {/* ⚠️ THE FEE IS STATED BEFORE ANYTHING HAS BEEN SPENT, on the
                  screen where the provider decides whether to answer at all.
                  Under the old order they met the price on a button they had to
                  press before bidding; now they meet it here, as a fact about
                  the job, with the condition under it. */}
              <p className="text-small text-ink-600">{CONTACT_FEE_LABEL}</p>
              <p className="mt-1 font-display text-h1 font-extrabold tracking-tight text-ink-900 tabular-nums">
                {/* ⚠️ THIS JOB'S FEE, NOT THE PLATFORM'S (2026-09-03). A
                    contact costs 1–10₾ by the budget the client named, so the
                    figure the provider reads before deciding has to be the one
                    that will actually leave their balance. */}
                {gelLabel(contactCostTetri(row.budgetMin, row.budgetMax))}
              </p>

              <div className="mt-4 rounded-tile border border-brand-200 bg-brand-50 p-4">
                <p className="font-display text-small font-bold text-brand-800">{OFFER_FREE_TITLE}</p>
                <p className="mt-1.5 text-small leading-relaxed text-brand-800">{OFFER_FREE_BODY}</p>
              </div>

              {/* ⚠️ THE CANVAS SAYS „მოკლე სიაში" AND THIS SAYS WHAT IS TRUE.
                  Nobody has been shortlisted — the client has not chosen yet —
                  so the honest fact behind that row is how many providers have
                  already answered. The wording is not invented for it: it is the
                  canvas's OWN line from the other artboard („Request Room v2":
                  „2 ექსპერტმა უკვე უპასუხა"), which is this same number said to
                  the client. */}
              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-ink-100 pt-3.5">
                <span className="text-small text-ink-600">უკვე უპასუხა</span>
                <span className="font-display text-body font-bold text-ink-900 tabular-nums">{answered}</span>
              </div>
            </Card>

            {outcome === 'LOST' ? (
              <>
                <Card>
                  <h2 className="font-display text-h3 font-bold tracking-tight text-ink-900">კლიენტმა სხვა აირჩია</h2>
                  {/* Said plainly and once — the same sentence the closed thread
                      shows, so a provider is not told two different things about
                      one outcome. */}
                  <p className="mt-2 text-body text-ink-600">ეს მოთხოვნა დახურულია.</p>
                </Card>
                {contact && expertUserId && (
                  <ContactCard
                    requestId={r.id} offerLimit={row.offerLimit} clientName={clientName}
                    priceLabel={mine ? offerPriceLabel(mine.priceGel, mine.priceKind) : ''}
                    feeTetri={contactCostTetri(row.budgetMin, row.budgetMax)}
                    initial={contact}
                  />
                )}
              </>
            ) : outcome === 'SETTLED' ? (
              // Only an admin reaches this — a provider with no offer on a
              // settled request was 404ed above.
              <Card><p className="text-body text-ink-600">მოთხოვნა დახურულია.</p></Card>
            ) : mine ? (
              <>
                <Card>
                  <h2 className="font-display text-h3 font-bold tracking-tight text-ink-900">გაგზავნილია</h2>
                  <p className="mt-2 text-body text-ink-600">კლიენტი თუ აგირჩევს, შეტყობინებას მიიღებ.</p>
                  <div className="mt-4">
                    <Btn href="/work/offers" variant="secondary" size="sm">ჩემი შეთავაზებები</Btn>
                  </div>
                </Card>
                {contact && expertUserId && (
                  <ContactCard
                    requestId={r.id} offerLimit={row.offerLimit} clientName={clientName}
                    priceLabel={offerPriceLabel(mine.priceGel, mine.priceKind)}
                    feeTetri={contactCostTetri(row.budgetMin, row.budgetMax)}
                    initial={contact}
                  />
                )}
              </>
            ) : p ? (
              <>
                <Btn href={`/work/requests/${r.id}/offer`} size="lg" className="w-full">შეთავაზება</Btn>
                {/* ⚠️ „გამოტოვება" IS A LINK BACK, AND DELIBERATELY NOT A
                    FEATURE. The canvas draws it beside the primary action; a
                    real skip would need a per-provider dismissal column, a way
                    to undo it, and an answer to „what happens when the client
                    re-opens the request". None of that is in this change, and a
                    button that pretended to remember something it did not would
                    be worse than the honest one: leaving is exactly what
                    skipping means when there is nothing to store. */}
                <Btn href="/work/requests" variant="ghost" size="sm" className="w-full">გამოტოვება</Btn>
              </>
            ) : (
              // The admin case. The shell already says it at the top; repeating
              // it where the action would be is what stops them looking for one.
              <Card>
                <p className="text-body text-ink-600">შეთავაზების დაწერა ადმინს არ შეუძლია.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
