// /request/[ref] — the client's own page: where their request stands and what
// they have been offered.
//
// REACHED BY REFERENCE, and the reference is the key. It is minted from crypto
// randomness (lib/requests → makePublicRef) rather than being a sequence,
// because it is the only thing between a stranger and this page — and once an
// offer is accepted this page carries a phone number.
//
// ⚠️ THE CONTACT RULE LIVES IN lib/requests → clientOfferView, not here. This
// page renders whatever that function returns and cannot widen it: the
// provider's phone and email are null on every offer except the accepted one.
// A page that picked its own columns would be a second place the rule is
// stated, and the second place is where it stops matching.

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import {
  normalizePublicRef, clientOfferView, kindOf, KIND,
  budgetLabel, timingLabel, formatLabel, cityLabel, topicLabel, extrasLabels,
  REQUEST_STATIONS, stationsReached,
} from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { refBudgetSpent, noteRefMiss } from '@/lib/refGuard'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { AutoRefresh } from '@/components/AutoRefresh'
import { RequestChat } from '@/components/RequestChat'
import { RequestShell } from '../_shell'
import { LiveRefresh } from '../_liveRefresh'
import { OfferList } from './OfferList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'მოთხოვნა — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) notFound()

  // ⚠️ THE REFERENCE IS THE ONLY CREDENTIAL ON THIS PAGE, and after an offer is
  // accepted the page carries a phone number — so wrong guesses are counted and
  // an address that has spent its budget gets the same 404 as an empty code
  // (lib/refGuard). A client holding a real reference never spends any of it.
  const req = { headers: await headers() }
  if (refBudgetSpent(req)) notFound()

  const { ref: raw } = await params
  // A garbage segment is answered without a query at all — the shape check is
  // free and the database round-trip is not.
  const ref = normalizePublicRef(raw)
  if (!ref) { noteRefMiss(req); notFound() }

  await ensureDbReady()

  const request = await prisma.serviceRequest.findUnique({
    where: { publicRef: ref },
    select: {
      // `id` is for the platform thread's unread count below — never rendered.
      id: true,
      // `userId` decides whether a review can be signed (lib/offerLifecycle →
      // reviewGate): a request without an account has nobody to write as.
      userId: true,
      publicRef: true, description: true, status: true,
      kind: true, topic: true, details: true,
      budgetMin: true, budgetMax: true, budgetUnit: true,
      timing: true, format: true, city: true, createdAt: true,
      // `adminNote` is deliberately NOT selected. It is the operator's own
      // scratch note about this person and their call — the one column on the
      // row that must never reach the person it is about.
      offers: {
        // WITHDRAWN offers are not shown: a provider who took theirs back has
        // said they are not available, and a listed offer nobody can accept is
        // three seconds of the client's attention spent on nothing.
        where: { status: { in: ['SENT', 'ACCEPTED', 'DECLINED'] } },
        orderBy: { priceGel: 'asc' },
        select: {
          id: true, priceGel: true, priceKind: true, daysEstimate: true, message: true,
          status: true, createdAt: true,
          // After the choice (stage 7): finished? reviewed? — the accepted
          // offer's „დასრულდა" button and the ★ picker read these.
          kind: true, doneAt: true,
          review: { select: { rating: true, body: true } },
          // Unread FOR THE CLIENT: provider messages this side has not opened.
          // A count, never the bodies — the pane fetches those when opened.
          _count: { select: { messages: { where: { fromClient: false, readByClientAt: null } } } },
          expertUser: {
            select: {
              fullName: true, phone: true, email: true,
              // The PUBLIC profile facts for the offer card — slug, verified,
              // rating. Public by definition (/experts/[slug] shows them to
              // anyone), so this widens nothing the seal protects.
              tutor: { select: { slug: true, verified: true, rating: true, reviewsCount: true } },
            },
          },
          company: { select: { name: true } },
        },
      },
    },
  })
  if (!request) { noteRefMiss(req); notFound() }

  // Shaped through the ONE function that decides who sees whose contact. Note
  // that the company branch has no phone or email at all — a Company row holds
  // neither, and the contact for a company request is arranged on the call the
  // admin makes. Passing nulls is honest; inventing a member's number here
  // would hand out a person's details they never offered.
  const unreadByOffer = new Map(request.offers.map(o => [o.id, o._count.messages]))
  // The lifecycle state beside each shaped offer — clientOfferView owns the
  // CONTACT rule and is not widened; these three columns hide nothing.
  const lifecycleByOffer = new Map(request.offers.map(o => [o.id, {
    kind: o.kind,
    doneAt: o.doneAt ? o.doneAt.toISOString() : null,
    review: o.review ? { rating: o.review.rating, body: o.review.body } : null,
  }]))

  // ── Conversations the client started ─────────────────────────────────────
  // A SECOND query rather than widening the one above, deliberately: that
  // query's `where` names the statuses an OFFER can have, and adding INVITED to
  // it would put a priceless row into the list the client compares prices in.
  // Two questions, two queries.
  const invited = await prisma.requestOffer.findMany({
    where: { requestId: request.id, status: 'INVITED' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      expertUser: { select: { fullName: true } },
      _count: { select: { messages: { where: { fromClient: false, readByClientAt: null } } } },
    },
  })

  // The platform thread's unread count — ours to them, still unread. Counted
  // here rather than joined into the query above because it hangs off the
  // REQUEST, not off an offer: `offerId: null` is the thread selector, and
  // leaving it out would count every provider conversation as well.
  const platformUnread = await prisma.requestMessage.count({
    where: {
      requestId: request.id,
      offerId: null,
      fromClient: false,
      readByClientAt: null,
    },
  })
  const offers = request.offers.map(o =>
    clientOfferView({
      ...o,
      provider: o.expertUser
        ? {
            name: o.expertUser.fullName, phone: o.expertUser.phone, email: o.expertUser.email,
            profile: o.expertUser.tutor
              ? {
                  slug: o.expertUser.tutor.slug,
                  verified: o.expertUser.tutor.verified,
                  rating: o.expertUser.tutor.rating,
                  reviewsCount: o.expertUser.tutor.reviewsCount,
                }
              : null,
          }
        : { name: o.company?.name ?? '—', phone: null, email: null, profile: null },
    }),
  )

  const matched = request.status === 'MATCHED'

  const kind = kindOf(request.kind)

  return (
    // The same chrome the wizard uses — this page is the other half of the same
    // errand, and it must not suddenly look like a page of the site.
    <RequestShell>
      {/* ⚠️ THE HEADING IS WHAT THEY ASKED FOR, NOT OUR FILING CODE
          (2026-08-18). `MC-T7UAG` was the h1 — the largest thing on a page
          somebody opened because their house needs cleaning. A reference is how
          WE find the row and how an operator reads it down a phone; it is not
          what the page is about. Owner, looking at it live: „ძალიან
          არაკომფორტულია."

          The code keeps its place and its `tabular-nums` — it still has to be
          readable aloud — but as meta beside the eyebrow, at the size of a
          thing you look up rather than a thing you are here for. */}
      <Eyebrow>{KIND[kind].label}</Eyebrow>
      <h1 className="mt-1 font-display text-h1 font-bold text-ink-900 tracking-tight text-balance">
        {topicLabel(request.topic)}
      </h1>
      <p className="mt-1 text-meta text-ink-500 tabular-nums">{request.publicRef}</p>

      <StatusTrack status={request.status} />

      <Card className="mt-6">
        {request.description && (
          <p className="mb-5 text-body text-ink-800 whitespace-pre-wrap leading-relaxed">{request.description}</p>
        )}
        <dl className="mt-0 grid sm:grid-cols-2 gap-x-6 gap-y-3">
          {([
            ['ბიუჯეტი', budgetLabel(kind, request.budgetMin, request.budgetMax)],
            [KIND[kind].timingLabel, timingLabel(kind, request.timing)],
            // The clarifying answers, when any were given — the same lines the
            // provider reads, from the same function.
            ...extrasLabels(kind, request.topic, request.details).map(e => [e.label, e.value] as [string, string]),
            // ⚠️ NOT ON A SERVICE. The kind decides it — somebody has to be in
            // the room — so this row prints „ადგილზე" on every service request
            // ever written. The provider's page already stopped showing it;
            // this is the client's half of the same fix.
            ...(kind === 'SERVICE' ? [] : [['ფორმატი', formatLabel(request.format)] as [string, string]]),
            ...(request.format !== 'ONLINE' ? [['ქალაქი', cityLabel(request.city)] as [string, string]] : []),
          ] as [string, string][]).map(([k, v]) => (
            <div key={k}>
              <dt className="text-meta text-ink-500">{k}</dt>
              <dd className="text-body text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-10 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">შეთავაზებები</h2>
        {/* The page a client parks open after submitting. Live only while
            there is something to wait FOR — a settled request has no next
            event, and a liveness promise on it would be furniture. */}
        {(request.status === 'NEW' || request.status === 'VERIFIED') && <AutoRefresh />}
        {/* The stream (stage 10): the same page, re-asked the moment the
            request moves rather than every half-minute. AutoRefresh above stays
            as the fallback; both go through router.refresh(). Same condition —
            a settled request has no next event. */}
        {(request.status === 'NEW' || request.status === 'VERIFIED') && <LiveRefresh publicRef={request.publicRef} />}
      </div>

      {/* ⚠️ THE EMPTY STATE IS PASSED INTO OfferList, NOT SWAPPED FOR IT
          (stage 10). The list has to stay MOUNTED across „nothing yet" → „one
          offer", because that is the moment its entrance is for: a component
          that mounts with the first offer already in it cannot tell that
          offer from one that was always there. The words stay here, on the
          server page, where the status is known. */}
      <OfferList
        publicRef={request.publicRef}
        offers={offers.map(o => ({
          ...o,
          unread: unreadByOffer.get(o.id) ?? 0,
          kind: lifecycleByOffer.get(o.id)?.kind ?? 'QUOTE',
          doneAt: lifecycleByOffer.get(o.id)?.doneAt ?? null,
          review: lifecycleByOffer.get(o.id)?.review ?? null,
        }))}
        matched={matched}
        canReview={request.userId !== null}
        empty={
          <EmptyState
            icon={<Icon.mail className="w-6 h-6" />}
            title="ჯერ არაფერია"
            description={
              request.status === 'VERIFIED'
                // ⚠️ NOT „ექსპერტები ხედავენ" (2026-08-18). Present tense
                // claiming people are looking at it — and nobody is: a
                // notification row was written and a mail was sent. That is the
                // „3 people are viewing this room" pattern that both
                // /api/requests/[ref]/status and app/request/_live refuse in
                // writing, at length. The refusal held in the live component
                // and leaked into this server page.
                //
                // „ექსპერტები" was wrong for a second reason on the trades
                // side: a plumber is not an expert.
                ? 'მოთხოვნა გადაცემულია. შეთავაზება აქ გამოჩნდება.'
                : 'ჯერ გადავამოწმებთ და დაგირეკავთ.'
            }
          />
        }
      />

      {/* ── The experts the client wrote to first ───────────────────────────
          Threads opened from the waiting panel, before anybody had bid
          (2026-08-18). They are NOT offers and are not listed as ones: no
          price, no „choose" button, no place taken. What they are is the
          conversation the client started while waiting — and the moment that
          expert names a price the same row becomes a real offer above, keeping
          every message already in it. */}
      {invited.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-h3 font-bold text-ink-900">მიმოწერა ექსპერტებთან</h2>
          <p className="mt-1 text-small text-ink-500">
            შეთავაზება ჯერ არ გამოუგზავნიათ.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {invited.map(o => (
              <Card key={o.id} padding="compact">
                <div className="font-display text-small font-semibold text-ink-900">
                  {o.expertUser?.fullName ?? 'ექსპერტი'}
                </div>
                <RequestChat
                  thread={{ kind: 'OFFER', offerId: o.id, refCode: request.publicRef }}
                  unread={o._count.messages}
                  peerName={o.expertUser?.fullName ?? 'ექსპერტი'}
                  emptyHint="დაწერე — ტელეფონის ნომრის გაზიარების გარეშე."
                />
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── The thread with us ──────────────────────────────────────────────
          The same conversation the thanks screen opened, found again. This is
          the page the reference points at and the one the emails link to, so a
          thread that lived only on the screen you saw once would be a thread
          nobody could return to.
          LAST, and collapsed: on this page the offers are the news. Its unread
          count is what says „there is something here" — the same job the
          collapsed offer threads above do. */}
      <div className="mt-6">
        {/* ⚠️ OPEN WHILE THERE IS NOTHING ELSE (2026-08-18). This was collapsed
            on the reasoning that „on this page the offers are the news" — true
            once offers exist, and exactly wrong before they do: on a page whose
            whole job is waiting, the only live thing was a small underlined
            link at the bottom, under an empty state. Now the two comments agree:
            open while the reader is waiting, folded once there is news. */}
        <RequestChat
          thread={{ kind: 'PLATFORM', refCode: request.publicRef }}
          unread={platformUnread}
          peerName="მცოდნე"
          defaultOpen={offers.length === 0}
          emptyHint="დაწერე, თუ რამე დასამატებელი გაქვს."
        />
      </div>
    </RequestShell>
  )
}

/* ── Where the request stands, drawn ─────────────────────────────────────────
   Four stations, because that is the whole journey the client cares about.
   REJECTED and CLOSED are not stations — they are exits, and get a plain
   sentence instead of a track that would have to show progress going nowhere. */
function StatusTrack({ status }: { status: string }) {
  if (status === 'REJECTED' || status === 'CLOSED') {
    return (
      <p className="mt-2 text-small text-ink-600">
        {status === 'REJECTED' ? 'ამ მოთხოვნაზე ვერ დაგეხმარებით.' : 'მოთხოვნა დახურულია.'}
      </p>
    )
  }
  // ⚠️ THE LABELS AND THE MAPPING COME FROM lib/requests (2026-08-17). The
  // thanks screen draws the same four stations from a polling client component,
  // and two copies of this list is how one request comes to read „ვამოწმებთ" on
  // one screen and „შეთავაზებები" on the other.
  const STATIONS = REQUEST_STATIONS.map(label => ({ label }))
  const reached = stationsReached(status)
  return (
    <ol className="mt-4 flex items-center gap-0" aria-label="სტატუსი">
      {STATIONS.map((st, i) => {
        const done = i < reached - 1
        const current = i === reached - 1
        return (
          <li key={st.label} className="flex items-center flex-1 last:flex-none min-w-0">
            <span className="flex flex-col items-center gap-1.5 shrink-0">
              <span
                className={`w-7 h-7 rounded-full border-2 inline-flex items-center justify-center text-meta font-bold ${
                  done
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : current
                      ? 'border-brand-600 text-brand-700 bg-white'
                      : 'border-ink-200 text-ink-400 bg-white'
                }`}
                aria-hidden
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`text-meta whitespace-nowrap ${current ? 'font-semibold text-ink-900' : done ? 'text-ink-700' : 'text-ink-400'}`}>
                {st.label}
              </span>
            </span>
            {i < STATIONS.length - 1 && (
              <span aria-hidden className={`h-0.5 flex-1 mx-2 mb-5 rounded ${done ? 'bg-brand-600' : 'bg-ink-200'}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
