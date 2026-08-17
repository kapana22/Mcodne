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
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import {
  normalizePublicRef, clientOfferView, kindOf, KIND,
  budgetLabel, timingLabel, formatLabel, cityLabel, topicLabel, extrasLabels,
  REQUEST_STATIONS, stationsReached,
} from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { AutoRefresh } from '@/components/AutoRefresh'
import { RequestChat } from '@/components/RequestChat'
import { RequestShell } from '../_shell'
import { OfferList } from './OfferList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'მოთხოვნა — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) notFound()

  const { ref: raw } = await params
  // A garbage segment is answered without a query at all — the shape check is
  // free and the database round-trip is not.
  const ref = normalizePublicRef(raw)
  if (!ref) notFound()

  await ensureDbReady()

  const request = await prisma.serviceRequest.findUnique({
    where: { publicRef: ref },
    select: {
      // `id` is for the platform thread's unread count below — never rendered.
      id: true,
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
          id: true, priceGel: true, daysEstimate: true, message: true,
          status: true, createdAt: true,
          // Unread FOR THE CLIENT: provider messages this side has not opened.
          // A count, never the bodies — the pane fetches those when opened.
          _count: { select: { messages: { where: { fromClient: false, readByClientAt: null } } } },
          expertUser: {
            select: {
              fullName: true, phone: true, email: true,
              // The PUBLIC profile facts for the offer card — slug, verified,
              // rating. Public by definition (/tutors/[slug] shows them to
              // anyone), so this widens nothing the seal protects.
              tutor: { select: { slug: true, verified: true, rating: true, reviewsCount: true } },
            },
          },
          company: { select: { name: true } },
        },
      },
    },
  })
  if (!request) notFound()

  // Shaped through the ONE function that decides who sees whose contact. Note
  // that the company branch has no phone or email at all — a Company row holds
  // neither, and the contact for a company request is arranged on the call the
  // admin makes. Passing nulls is honest; inventing a member's number here
  // would hand out a person's details they never offered.
  const unreadByOffer = new Map(request.offers.map(o => [o.id, o._count.messages]))

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
      <Eyebrow>{KIND[kind].label} · {topicLabel(request.topic)}</Eyebrow>
      <h1 className="mt-1 font-display text-h1 font-bold text-ink-900 tracking-tight tabular-nums">
        {request.publicRef}
      </h1>

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
            ['ფორმატი', formatLabel(request.format)],
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
      </div>

      {offers.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Icon.mail className="w-6 h-6" />}
            title="ჯერ არაფერია"
            description={
              request.status === 'VERIFIED'
                ? 'ექსპერტები ხედავენ მოთხოვნას. შეთავაზება აქ გამოჩნდება.'
                : 'ჯერ გადავამოწმებთ და დაგირეკავთ.'
            }
          />
        </div>
      ) : (
        <OfferList
          publicRef={request.publicRef}
          offers={offers.map(o => ({ ...o, unread: unreadByOffer.get(o.id) ?? 0 }))}
          matched={matched}
        />
      )}

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
        <RequestChat
          thread={{ kind: 'PLATFORM', refCode: request.publicRef }}
          unread={platformUnread}
          peerName="მცოდნე"
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
