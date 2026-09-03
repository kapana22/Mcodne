// THE REQUEST ROOM — one screen, and since 2026-09-02 it has TWO ADDRESSES.
//
// ⚠️ WHY IT WAS EXTRACTED. Owner, 2026-09-02, looking at their own request as a
// signed-in client: „ესე დახტუნავს ძალიან… ვფიქრობ გაცილებით მარტივად რომ
// მოვაწყოთ" and „10 ჯერ ერთი და იგივე რამის დახატვა და გამოტანა გადავიტანოთ და
// ერთი დიზაინ პატერნით ვიმუშაოთ."
//
// What they were looking at: /me lists their requests inside the client
// workspace — rail, top bar, bell, avatar — and clicking a row LEFT that room
// entirely for /request/<ref>, which wears the intake's chrome (a centred logo,
// nothing else). Same person, same errand, two websites one click apart. The
// jump was the whole complaint.
//
// So the room is a component now and the CHROME is the page's business:
//
//   app/request/[ref]   the account-less client, by reference   → RequestShell
//   app/me/r/[ref]      the signed-in owner, by session         → ClientShell
//
// ⚠️ AND IT IS ONE COMPONENT, NOT TWO SIMILAR ONES. Copying this file into the
// client room is the exact thing the owner asked us to stop doing: the offer
// card, the waiting screen and the close flow would then have two lives and
// would drift the first time one of them was touched. The two pages below hold
// nothing but a guard and a shell.
//
// ── WHAT DID NOT MOVE ────────────────────────────────────────────────────────
// Every rule the old page stated stays where it was and is restated nowhere:
//   · `clientOfferView` (lib/requests) is still the ONE function that decides
//     what a client may read about an offer. What it releases CHANGED on
//     2026-09-03 — the provider's phone passes through it again, so the client
//     can ring instead of writing — and the rule is still stated there and
//     nowhere else. No email passes, and nothing about the client does;
//   · `adminNote` is still not selected — the operator's note about this person
//     is the one column that must never reach them;
//   · WITHDRAWN offers are still absent from the compare list and INVITED ones
//     are still a second query, for the reasons written at each.

import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import {
  clientOfferView, kindOf,
  budgetLabel, timingLabel, formatLabel, cityLabel, topicLabel, extrasLabels,
  timeAgoKa, UNSTATED,
} from '@/lib/requests'
import { Card } from '@/components/Card'
import { CancelRequest } from './_cancel'
import { AutoRefresh } from '@/components/AutoRefresh'
import { RequestChat } from '@/components/RequestChat'
import { callableProviders } from '@/lib/creditsServer'
import { contactCostTetri } from '@/lib/credits'
import { LiveRefresh } from '../_liveRefresh'
import { OfferList } from './OfferList'
import { WaitingRoom } from './_waiting'

/* ⚠️ THE CLIENT'S WORD FOR THE STATE, NOT THE ADMIN'S. `STATUS_LABEL`
   (lib/requests) is documented as „the admin's words for each state" and says
   „დამოწმებული" — which describes what an operator did, not what the reader's
   request is doing. Five states collapse to three sentences here because the
   reader only has three questions: is it running, is it settled, is it over. */
const STATUS_WORD: Record<string, string> = {
  NEW: 'აქტიური მოთხოვნა',
  VERIFIED: 'აქტიური მოთხოვნა',
  MATCHED: 'ექსპერტი არჩეულია',
  CLOSED: 'დახურული მოთხოვნა',
  REJECTED: 'დახურული მოთხოვნა',
}

/** One offer, as the compare list reads it: what `clientOfferView` allows, plus
 *  the four facts only the server can supply (the unread count, the age in
 *  words, and the lifecycle columns the close screen needs). */
type RoomOffer = ReturnType<typeof clientOfferView> & {
  unread: number
  age: string
  priceIncludes: string | null
  kind: string
  doneAt: string | null
  review: { rating: number; body: string } | null
}

/** Everything the room draws, and NOTHING a Prisma row carries beyond it. The
 *  component below takes this and never a model — which is what stops a later
 *  edit rendering a column (`adminNote`, a phone) that was never meant to leave
 *  the loader. */
export type RequestRoomData = {
  publicRef: string
  /** The account that filed it, or null for a request left by reference alone.
   *  The cancel control and the review gate both read it. */
  ownerUserId: string | null
  status: string
  statusWord: string
  /** REJECTED or CLOSED — a sentence rather than a screen. */
  over: boolean
  matched: boolean
  /** NEW or VERIFIED: something is still expected to happen, so the page keeps
   *  a live connection and says so. */
  live: boolean
  description: string
  brief: string[]
  /** The one line under the waiting headline. Wording is state-dependent and
   *  is decided in the loader, so the component states no policy about it. */
  note: string
  offers: RoomOffer[]
  invited: { id: string; name: string; unread: number }[]
  canReview: boolean
}

/**
 * Load one request room, or null.
 *
 * ⚠️ `ownerId` IS THE SECOND DOOR AND IT IS PART OF THE `where`. Pass null and
 * the reference alone answers — which is what /request/<ref> has always meant,
 * and the only thing an account-less client can offer. Pass a user id and the
 * row must ALSO be theirs, so a signed-in reader on /me/r/<ref> can open
 * nothing but their own request no matter what they type in the address bar.
 * Ownership in the `where`, never a comparison after the read: the same rule
 * `clientInboxRows` and /api/request-chat both work by.
 */
export async function loadRequestRoom(
  ref: string,
  ownerId: string | null,
): Promise<RequestRoomData | null> {
  await ensureDbReady()

  const request = await prisma.serviceRequest.findFirst({
    where: { publicRef: ref, ...(ownerId ? { userId: ownerId } : {}) },
    select: {
      // `id` is for the platform thread's unread count below — never rendered.
      id: true,
      // `userId` decides whether a review can be signed (lib/offerLifecycle →
      // reviewGate): a request without an account has nobody to write as.
      userId: true,
      publicRef: true, description: true, status: true,
      offerLimit: true, offerCount: true,
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
          // ⚠️ WHAT THE PRICE COVERS (2026-09-01) — the ONE line the canvas
          // prints under every price, and the field a client compares three
          // offers on. Nullable: every offer written before the column existed
          // has none, and the list draws nothing where it would go.
          priceIncludes: true,
          status: true, createdAt: true,
          // After the choice (stage 7): finished? reviewed? — the close screen
          // („მოაგვარე?") and the read-only ★ row read these.
          kind: true, doneAt: true,
          review: { select: { rating: true, body: true } },
          // Unread FOR THE CLIENT: provider messages this side has not opened.
          // A count, never the bodies — the pane fetches those when opened.
          _count: { select: { messages: { where: { fromClient: false, readByClientAt: null } } } },
          expertUser: {
            select: {
              // The id is for `callableProviders` below — a ledger question,
              // never rendered.
              id: true,
              // NAME + the public profile facts.
              fullName: true,
              // ⚠️ READ, AND NEVER RENDERED (2026-09-03). It is here to answer
              // ONE boolean — „is there a number to ring at all" — which the
              // card needs before it may draw „დარეკვა". The number itself does
              // not travel: `clientOfferView` emits `providerCanCall`, and the
              // digits are sold by POST /api/requests/[ref]/call. See
              // lib/requests → ProviderContact for the whole decision.
              // `email` stays unfetched — a rule enforced by the query is one a
              // later render cannot forget.
              phone: true,
              // The PUBLIC profile facts for the offer card — slug, verified,
              // rating. Public by definition (/experts/[slug] shows them to
              // anyone), so this widens nothing the seal protects.
              serviceProfile: { select: { slug: true, verified: true, rating: true, reviewsCount: true } },
            },
          },
          company: { select: { name: true } },
        },
      },
    },
  })
  if (!request) return null

  const unreadByOffer = new Map(request.offers.map(o => [o.id, o._count.messages]))

  // The lifecycle state and the covered line beside each shaped offer —
  // clientOfferView owns the CONTACT rule and is not widened; none of these
  // four columns hides anything.
  const extraByOffer = new Map(request.offers.map(o => [o.id, {
    priceIncludes: o.priceIncludes,
    kind: o.kind,
    doneAt: o.doneAt ? o.doneAt.toISOString() : null,
    review: o.review ? { rating: o.review.rating, body: o.review.body } : null,
  }]))

  // ── Conversations the client started ─────────────────────────────────────
  // A SECOND query rather than widening the one above, deliberately: that
  // query's `where` names the statuses an OFFER can have, and adding INVITED to
  // it would put a priceless row into the list the client compares prices in.
  // Two questions, two queries.
  const invitedRows = await prisma.requestOffer.findMany({
    where: { requestId: request.id, status: 'INVITED' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      expertUser: { select: { fullName: true } },
      _count: { select: { messages: { where: { fromClient: false, readByClientAt: null } } } },
    },
  })

  /* ── Who can actually be rung ──────────────────────────────────────────
     The client's „დარეკვა" spends the PROVIDER's balance, so whether the
     button may be drawn depends on somebody else's ledger. Two queries for the
     whole list (lib/creditsServer → callableProviders), never one per offer,
     and asked only about the providers who have a number at all. */
  const phoneHolders = request.offers
    .map(o => o.expertUser)
    .filter((u): u is NonNullable<typeof u> => !!u && !!u.phone)
  const callable = await callableProviders(
    phoneHolders.map(u => u.id),
    request.id,
    // The same price the route will charge — asked from the same function, so
    // the button and the charge cannot disagree about what this job costs.
    contactCostTetri(request.budgetMin, request.budgetMax),
  )

  const kind = kindOf(request.kind)

  /* ── The brief, as chips ──────────────────────────────────────────────────
     The same answers the definition list under „რა დაწერე" used to spell out
     with a label each. The canvas prints the VALUES only, in a row: the client
     wrote them, and „ბიუჯეტი: 200–500₾ სულ" is two words of scaffolding around
     one fact they already know.

     ⚠️ AN UNANSWERED QUESTION GETS NO CHIP. `budgetLabel` says „არ არის
     მითითებული" for a request nobody asked about money and `timingLabel` says
     the same for an unstated deadline — honest in a labelled list, noise as a
     chip, and three of them in a row would be a brief that says nothing. */
  const brief = [
    topicLabel(request.topic),
    ...(request.budgetMin === 0 && request.budgetMax === null
      ? [] : [budgetLabel(kind, request.budgetMin, request.budgetMax)]),
    ...(request.timing === UNSTATED ? [] : [timingLabel(kind, request.timing)]),
    // The clarifying answers, when any were given — the same lines the
    // provider reads, from the same function.
    ...extrasLabels(kind, request.topic, request.details).map(e => e.value),
    // ⚠️ NOT ON A SERVICE. The kind decides it — somebody has to be in the
    // room — so this would print „ადგილზე" on every service request ever
    // written. The provider's page stopped showing it first.
    ...(kind === 'SERVICE' ? [] : [formatLabel(request.format)]),
    ...(request.format !== 'ONLINE' ? [cityLabel(request.city)] : []),
  ].filter((v): v is string => typeof v === 'string' && v.trim() !== '')

  return {
    publicRef: request.publicRef,
    ownerUserId: request.userId,
    status: request.status,
    statusWord: STATUS_WORD[request.status] ?? 'მოთხოვნა',
    over: request.status === 'REJECTED' || request.status === 'CLOSED',
    matched: request.status === 'MATCHED',
    live: request.status === 'NEW' || request.status === 'VERIFIED',
    description: request.description,
    brief,
    note:
      request.status === 'VERIFIED'
        // ⚠️ NOT „ექსპერტები ხედავენ" (2026-08-18). Present tense claiming
        // people are looking at it — and nobody is: a notification row was
        // written and a mail was sent. That is the „3 people are viewing
        // this room" pattern that both /api/requests/[ref]/status and
        // app/request/_live refuse in writing, at length.
        ? 'მოთხოვნა გადაცემულია.'
        : 'ჯერ გადავამოწმებთ და დაგირეკავთ.',
    offers: request.offers
      .map(o =>
        clientOfferView({
          ...o,
          provider: o.expertUser
            ? {
                name: o.expertUser.fullName,
                canCall: !!o.expertUser.phone && callable.has(o.expertUser.id),
                profile: o.expertUser.serviceProfile
                  ? {
                      slug: o.expertUser.serviceProfile.slug,
                      verified: o.expertUser.serviceProfile.verified,
                      rating: o.expertUser.serviceProfile.rating,
                      reviewsCount: o.expertUser.serviceProfile.reviewsCount,
                    }
                  : null,
              }
            /* ⚠️ A COMPANY OFFER CANNOT BE RUNG, and that is the same refusal
               /api/provider/requests/[id]/contact already makes: the ledger is
               keyed on a USER, so there is nobody to charge. No company holds
               active access today. The card draws one button instead of two. */
            : { name: o.company?.name ?? '—', canCall: false, profile: null },
        }),
      )
      .map(o => ({
        ...o,
        unread: unreadByOffer.get(o.id) ?? 0,
        // „12 წუთის წინ", worded here: the client component cannot read the
        // clock without disagreeing with the server it hydrates over.
        age: timeAgoKa(o.createdAt),
        priceIncludes: extraByOffer.get(o.id)?.priceIncludes ?? null,
        kind: extraByOffer.get(o.id)?.kind ?? 'QUOTE',
        doneAt: extraByOffer.get(o.id)?.doneAt ?? null,
        review: extraByOffer.get(o.id)?.review ?? null,
      })),
    invited: invitedRows.map(o => ({
      id: o.id,
      name: o.expertUser?.fullName ?? 'ექსპერტი',
      unread: o._count.messages,
    })),
    canReview: request.userId !== null,
  }
}

/**
 * The room itself — the three screens the owner's „Request Room v2" canvas
 * draws, in order:
 *
 *   ლოდინი       nobody has answered yet   → ./_waiting
 *   შეთავაზებები  offers to compare         → ./OfferList
 *   დახურვა      the job is over           → ./_close (reached from OfferList)
 *
 * ⚠️ NO CONTAINER AND NO SHELL. It renders a column and nothing around it, so
 * the two pages can put it in the chrome each of them owns — that separation
 * IS the fix. A `<Container>` here would fight whichever one wrapped it.
 */
export function RequestRoom({
  data,
  viewerUserId,
  selectedOfferId = null,
}: {
  data: RequestRoomData
  /** Who is reading, when anybody is. Only the cancel control asks. */
  viewerUserId: string | null
  /** One conversation to arrive already open, from /me/r/<ref>?o=<id> — what
   *  the bell and the inbox link to. Owner, 2026-09-02: „მთავარი ნიშა
   *  პარალელურად არის რომ სწრაფად მოხდეს კავშირი", and a person who followed
   *  „somebody wrote to you" should not have to find the message. */
  selectedOfferId?: string | null
}) {
/* ⚠️ THE PLATFORM THREAD LEFT THE CLIENT'S SCREENS (2026-09-02). Owner,
   looking at it at the foot of the request room: „ეს რომ პირდაპირ
   შეტყობინებებში მოვიდეს და ეს ველი აღარ იყოს, არ ჯობია?"

   MEASURED BEFORE REMOVING IT, on the local database that day:

       requests …………………………………… 15
       platform messages ……………………  3
         · from the client ……………………  3
         · FROM US ………………………………  0

   Three people wrote to us through it and we answered none of them. It was
   never a conversation; it was a box that accepted words and put them in a
   drawer (app/admin/_requests still renders the thread, so the three are not
   lost and an operator can still read and answer them). A composer that has
   produced a 0% reply rate is worse than no composer — the person who used it
   learnt that this site does not answer.

   ⚠️ NEITHER DIRECTION IS LEFT WITHOUT A CHANNEL, which is why this is a
   deletion rather than a regression:

     · US → CLIENT is the bell. `notify()` already carries every event that
       matters on a request — an offer arrived, an expert wrote, the work was
       marked done, a review is due — and as of today the client's chat
       messages too. It is the channel they actually see; the badge and the
       bell were both verified working on 2026-09-02.
     · CLIENT → US is `HelpWidget`, the bubble AppShell mounts on every
       non-provider page — including this one, in the corner of the very
       screenshot this note is about — plus /help and /contact.

   So what goes is the FOURTH door, on one page, that nobody was standing
   behind. */

  return (
    <>
      {/* The page a client parks open after submitting. Live only while there
          is something to wait FOR — a settled request has no next event, and a
          liveness promise on it would be furniture.
          Right-aligned above the screen, which is where it sat before: it is a
          property of the PAGE, and under either headline it would read as a
          sub-line of that headline. */}
      {data.live && <AutoRefresh className="mb-3 w-full justify-end" />}
      {/* The stream (stage 10): the same page, re-asked the moment the request
          moves rather than every half-minute. AutoRefresh above stays as the
          fallback; both go through router.refresh(). Same condition. */}
      {data.live && <LiveRefresh publicRef={data.publicRef} />}

      {data.over && (
        <p className="text-body text-ink-600">
          {data.status === 'REJECTED' ? 'ამ მოთხოვნაზე ვერ დაგეხმარებით.' : 'მოთხოვნა დახურულია.'}
        </p>
      )}

      {/* ═══ 1 · ლოდინი ═══ */}
      {!data.over && data.offers.length === 0 && (
        <WaitingRoom
          statusWord={data.statusWord}
          publicRef={data.publicRef}
          description={data.description}
          brief={data.brief}
          note={data.note}
        >
          {/* ── The way out ───────────────────────────────────────────────
              ⚠️ ONLY THE OWNER, AND ONLY BEFORE ANYBODY HAS OFFERED
              (2026-09-01). Until then a client could open a request and never
              close it — filed by mistake, filed twice, or simply no longer
              needed — and a standing request is a bill somebody else pays: a
              provider is charged 1₾ each time they open the contact on it.
              The two conditions are the route's own
              (app/api/requests/[ref]/cancel), repeated here so the control is
              never on screen promising something the server will refuse. */}
          {data.ownerUserId !== null && data.ownerUserId === viewerUserId
            && data.offers.length === 0
            && data.live && (
            <CancelRequest publicRef={data.publicRef} />
          )}
        </WaitingRoom>
      )}

      {/* ═══ 2 · შეთავაზებები · 3 · დახურვა ═══
          One component, because the second screen is reached FROM the first and
          the selection has to survive the move — see OfferList. */}
      {data.offers.length > 0 && (
        <OfferList
          publicRef={data.publicRef}
          statusWord={data.statusWord}
          offers={data.offers}
          matched={data.matched}
          canReview={data.canReview}
          selectedOfferId={selectedOfferId}
        />
      )}

      {/* ── The experts the client wrote to first ───────────────────────────
          Threads opened from the waiting panel, before anybody had bid
          (2026-08-18). They are NOT offers and are not listed as ones: no
          price, no „choose" button, no place taken. What they are is the
          conversation the client started while waiting — and the moment that
          expert names a price the same row becomes a real offer above, keeping
          every message already in it.

          ⚠️ NOT ON THE CANVAS, AND KEPT ANYWAY. The artboard draws the two
          panes and nothing under them; this block is the only way back into a
          conversation that has no price yet, and dropping it would strand every
          thread the „მე ავირჩევ" mode opens. */}
      {data.invited.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-h3 font-bold text-ink-900">მიმოწერა ექსპერტებთან</h2>
          <p className="mt-1 text-small text-ink-500">
            შეთავაზება ჯერ არ გამოუგზავნიათ.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {data.invited.map(o => (
              <Card key={o.id} padding="compact">
                <div className="font-display text-small font-semibold text-ink-900">{o.name}</div>
                <RequestChat
                  thread={{ kind: 'OFFER', offerId: o.id, refCode: data.publicRef }}
                  unread={o.unread}
                  peerName={o.name}
                  /* ⚠️ THE ONE THAT WAS LINKED TO ARRIVES OPEN. These threads
                     mount collapsed by design — opening one is the billable
                     „the client read it" signal (/api/request-chat's GET says
                     so at length), so every pane opening at once would bill
                     every expert for an intention nobody had. A pane the reader
                     ASKED for by following ?o=<this id> is exactly that
                     intention, which is why this one, and only this one,
                     opens. */
                  defaultOpen={o.id === selectedOfferId}
                  emptyHint="დაწერე — ტელეფონის ნომრის გაზიარების გარეშე."
                />
              </Card>
            ))}
          </div>
        </div>
      )}

    </>
  )
}
