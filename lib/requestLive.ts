// THE LIVE ROOM'S FACTS — counted once, served two ways.
//
// `/api/requests/[ref]/status` answers a poll with the payload below;
// `/api/requests/[ref]/events` pushes the SAME payload down a stream whenever it
// changes. Both call this file, so a number cannot be true on one and stale on
// the other — the stream is a delivery path, not a second source.
//
// ⚠️ EVERY NUMBER HERE IS COUNTED, NEVER SIMULATED, and that is the whole
// design. The obvious way to make a waiting screen feel busy is to say „N
// ექსპერტი ათვალიერებს" and animate it — and at the moment somebody presses
// send that is FALSE by construction: the request is NEW, no provider has been
// told anything, and none will be until an operator phones (or triage releases
// it). Zero people are looking. A number invented there is the „3 people are
// viewing this room" pattern, and it is worse here than on a hotel site: this
// person is being asked to WAIT on the strength of it, and what they are
// waiting for is a phone call we would have just misrepresented.
//
// So the panel gets facts instead, and they turn out to be better ones:
//   status          where the request actually is
//   notified        how many providers we HAVE told — 0 until routing runs,
//                   then the real audience
//   expertsInField  how many experts are filed under this sphere at all. True
//                   the second the request is written, which is what makes it
//                   worth showing on the screen where nothing has happened yet.
//   offerCount      offers actually received
//
// Authorised by POSSESSION OF THE REFERENCE, like every other client surface —
// the ROUTES do that (requestsViewer + normalizePublicRef, 404 never 403); this
// file only counts, for a reference the caller has already normalised.

import { prisma } from '@/lib/prisma'
import { PROVIDER_ROUTE } from '@/lib/requests'
import { PRESENCE_TTL_MS } from '@/lib/requestThread'
import { avatarSrc } from '@/lib/avatarSrc'

type LiveExpert = {
  id: string
  href: string
  name: string
  headline: string | null
  verified: boolean
  rating: number | null
  avatar: string | null
}

/** What `/status` returns and what the `status` stream event carries. */
type RequestLiveStatus = {
  status: string
  /** 'OFFERS' | 'SELF' — what this person asked for in the wizard. */
  pickMode: string
  offerCount: number
  offerLimit: number
  notified: number
  expertsInField: number
  experts: LiveExpert[]
  /** Set only while this request belongs to ONE named provider — see
   *  DIRECT_WINDOW_MS and app/api/requests → `offerLimit: 1`. */
  addressedTo: { name: string; waitingSince: string; overdue: boolean } | null
}

/**
 * HOW LONG THE CHOSEN PROVIDER HAS BEFORE THE CLIENT IS OFFERED A WAY OUT.
 *
 * 24 hours, and it is a fairness clock, not a deadline that does anything by
 * itself: nothing expires, nothing opens, no offer is cancelled. All it changes
 * is whether the client's own page shows the „გავხსნა სხვებისთვის?" button.
 *
 * ⚠️ NOTHING HERE IS AUTOMATIC, ON PURPOSE. Auto-opening would publish a
 * private choice to strangers without the client pressing anything — and this
 * platform has no SMS (see the note on `email` in lib/requests), so every
 * automated message is an email that arrives while nobody is looking. The
 * client would discover the change by receiving quotes they never asked for.
 * Owner, 2026-08-20: „თუ მცოდნესთან აგზავნის, მხოლოდ მცოდნესთან უნდა მივიდეს."
 */
export const DIRECT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * The full panel payload. Four reads — the row, „who did we tell", „how many
 * are in this sphere", and up to six faces — so it is what a POLL answers and
 * what the stream sends ON CHANGE, never what the stream runs every tick.
 */
export async function requestLiveStatus(ref: string): Promise<RequestLiveStatus | null> {
  const r = await prisma.serviceRequest.findFirst({
    where: { publicRef: ref },
    // `kind`, `topic` and `city` are read because a SERVICE request is counted
    // by what masters cover, not by a sphere it does not have — see below.
    select: {
      id: true, status: true, pickMode: true, offerCount: true, offerLimit: true,
      categoryId: true, kind: true, topic: true, city: true,
      // ⚠️ WHO THIS WAS ADDRESSED TO, AND WHEN (2026-08-20). A request that
      // named somebody carries `offerLimit: 1` and one INVITED offer (see
      // app/api/requests). The client's own page has to be able to say
      // „გაგზავნილია X-სთან · პასუხს ელოდება" rather than the tender copy —
      // and, once the provider's window has passed, to offer opening it up.
      // ONE row at most: the invite is written once and leaves INVITED the
      // moment a price is sent, so this is empty on every ordinary request.
      offers: {
        where: { status: 'INVITED' },
        select: {
          createdAt: true,
          expertUser: { select: { fullName: true } },
          company: { select: { name: true } },
        },
        take: 1,
      },
    },
  })
  if (!r) return null

  // ── The experts this request could go to, as cards ───────────────────────
  //
  // ⚠️ THE SECOND ROUTE, MADE CONCRETE (owner, 2026-08-17: „ექსპერტების
  // ქარდებიც უნდა ჩანდეს — ექსპერტიც უნდა ნახოს"). Waiting for offers is one
  // way to be helped; the other is going and picking somebody, and until now
  // that was a LINK to a filtered list. A link is a decision to make later; a
  // face and a name is a decision you can make now.
  //
  // ⚠️ NO CONTACT DETAILS AND NO RAW AVATARS. The card carries what the public
  // catalogue already shows anybody — name, sphere, rating, verified — and the
  // avatar goes through `avatarSrc`, because `User.avatarUrl` holds a data: URI
  // and passing it raw is what made /experts half a megabyte of HTML (see
  // lib/avatarSrc, which says USE IT IN EVERY LIST PAYLOAD).
  //
  // Six, ordered the way the catalogue orders itself: verified first, then
  // rating. More than six is a directory, and this screen is not one.
  const [notified, expertsInField, experts] = await Promise.all([
    requestNotifiedCount(r.id),
    // Everyone filed under this sphere, by the same filter the admin panel
    // lists candidates with (`available: true`). Not „online", not „looking" —
    // „this many exist", which is the honest and more useful number.
    // ⚠️ THE SPHERE COUNT IS THE EXPERT SIDE'S ANSWER AND IT IS ZERO FOR EVERY
    // TRADES REQUEST (2026-08-18). `categoryId` is the EXPERT taxonomy — no
    // service topic maps into it — so „ნახავ ვინ მუშაობს" resolved to an empty
    // list every single time somebody chose to pick for themselves. The mode
    // promised a list and delivered the other mode's screen.
    //
    // A trades request is counted the way it is ROUTED: by the topic the
    // masters list and the city they travel to (lib/serviceProfile →
    // routingWhere is the same rule, in the same shape).
    // ⚠️ ONE TABLE SINCE 2026-08-24 — the topic branch and the sphere branch
    // are two ways of asking the same row a question, not two rosters.
    r.topic
      ? prisma.serviceProfile.count({
          where: {
            available: true, services: { has: r.topic },
            ...(r.city ? { OR: [{ areas: { has: r.city } }, { areas: { isEmpty: true } }] } : {}),
            user: { requestAccess: { active: true } },
          },
        })
      : r.categoryId
        ? prisma.serviceProfile.count({ where: { categoryId: r.categoryId, available: true } })
        : Promise.resolve(0),
    // ⚠️ THE LIST IS NO LONGER „EXPERT-ONLY" (2026-08-24). It used to be, with
    // a reason that has expired: it renders cards linking to a public profile,
    // and `ServiceProfile` „has no slug and no public page". It has had both
    // since stage 5, and it is now the ONLY profile — so the cards are drawn
    // for whoever covers the sphere, which is what the count beside them
    // already measured.
    suggestedProfiles(r.categoryId),
  ])

  // The addressed state, resolved once here so no screen has to reconstruct it
  // from `offerLimit` and an offer array. `waitingSince` is what the countdown
  // and the „open it up" line are both measured from.
  const invitedTo = r.offers[0] ?? null
  const addressedTo = invitedTo
    ? {
        name: invitedTo.expertUser?.fullName ?? invitedTo.company?.name ?? 'ექსპერტი',
        waitingSince: invitedTo.createdAt.toISOString(),
        /** True once the provider's window has passed with no answer — the only
         *  moment the client is offered the open queue. Never automatic: the
         *  request stays theirs until the client presses the button. */
        overdue: Date.now() - invitedTo.createdAt.getTime() > DIRECT_WINDOW_MS,
      }
    : null

  return {
    status: r.status,
    offerCount: r.offerCount,
    offerLimit: r.offerLimit,
    pickMode: r.pickMode,
    /** Set only while this request belongs to ONE named provider. */
    addressedTo,
    notified,
    expertsInField,
    experts: experts.map(e => ({
      id: e.id,
      // The profile URL prefers the slug: a cuid href 308s to the slug, and
      // that redirect downgrades a client-side navigation to a full load.
      href: `/experts/${e.slug ?? e.id}`,
      name: e.user?.fullName ?? 'ექსპერტი',
      headline: e.headline,
      verified: e.verified,
      rating: e.rating,
      avatar: e.user ? avatarSrc(e.user.id, e.user.avatarUrl) : null,
    })),
  }
}

/**
 * The stream's TICK — the cheap question „did anything move?", asked every few
 * seconds for as long as a room is open. Two fingerprints, one per event the
 * stream can send:
 *
 *   status    the row (status, offerCount, updatedAt), the offer count from
 *             the relation, and „who did we tell". The full payload above is
 *             recomputed only when THIS changes.
 *   messages  the newest message id, how many have been read by the other
 *             side (the „წაკითხულია" line moving), and whether anybody is at
 *             the desk (lib/requestThread → presence). A pane refetches its
 *             own thread when THIS changes.
 *
 * ⚠️ ONE `findUnique` PLUS TWO COUNTS, and nothing heavier — this runs
 * ~15 times a minute per open room. The `notified` count is not derivable from
 * the row: routing writes Notification rows without touching the request (the
 * auto-verified path creates the row VERIFIED and routes it in `after()`), and
 * „N ექსპერტს ვაცნობეთ" appearing is exactly the first thing a room shows.
 */
export type RequestLiveMark = { status: string; messages: string }

export async function requestLiveMark(ref: string): Promise<RequestLiveMark | null> {
  const r = await prisma.serviceRequest.findUnique({
    where: { publicRef: ref },
    select: {
      id: true, status: true, offerCount: true, updatedAt: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } },
      _count: {
        select: {
          offers: true,
          // Read receipts — either side opening the other's message.
          messages: { where: { OR: [{ readByClientAt: { not: null } }, { readByProviderAt: { not: null } }] } },
        },
      },
    },
  })
  if (!r) return null
  const [notified, staff] = await Promise.all([
    prisma.notification.count({ where: { type: 'GENERIC', href: `${PROVIDER_ROUTE}/requests/${r.id}` } }),
    prisma.user.count({
      where: { role: 'ADMIN', suspendedAt: null, supportSeenAt: { gt: new Date(Date.now() - PRESENCE_TTL_MS) } },
    }),
  ])
  return {
    status: [r.status, r.offerCount, r._count.offers, notified, r.updatedAt.getTime()].join('|'),
    messages: [r.messages[0]?.id ?? '', r._count.messages, staff > 0 ? 1 : 0].join('|'),
  }
}

/* ═══════════ the two facts the client's own room prints ═══════════════════
 *
 * ⚠️ EXPORTED SO THERE IS ONE DEFINITION, NOT TWO (2026-09-04). The request
 * room (app/request/[ref]/_room) draws „N ექსპერტს გაეგზავნა" and the list of
 * people the client can write to first, straight from the owner's canvas. Both
 * numbers were already computed HERE for the live stream, and copying either
 * query into the loader is how the two screens start disagreeing about who was
 * told — the stream saying six and the page saying five, with no way to tell
 * which is lying.
 */

/**
 * Literally „who did we tell" — one Notification row per provider, written by
 * lib/requestJobs when the request was routed. Counting the ROWS rather than
 * recomputing the audience means this can never claim somebody was told who
 * was not.
 *
 * `type` is named so the count rides the `[type, href]` index (lib/requestJobs
 * writes exactly this pair) — the stream asks it on every tick, so a sequential
 * scan here would be one per open room.
 */
export function requestNotifiedCount(requestId: string): Promise<number> {
  return prisma.notification.count({
    where: { type: 'GENERIC', href: `${PROVIDER_ROUTE}/requests/${requestId}` },
  })
}

/**
 * Up to six providers the client may write to before anybody has bid — the
 * canvas's „შესაფერისი ექსპერტები".
 *
 * ⚠️ `published` IS REQUIRED HERE AND IS NOT A COPY-PASTE. This list draws
 * CARDS at a client, which is exactly the surface the completeness gate exists
 * for (lib/profileCompleteness): an unfinished card must not be offered to
 * somebody choosing who to hire. That is the opposite of `coveredTopicIds`,
 * which asks „could anybody DO this" and must NOT narrow on it — the two
 * questions look alike and are not.
 *
 * Ordered the way the catalogue orders itself. More than six is a directory,
 * and this screen is not one.
 */
export function suggestedProfiles(categoryId: string | null) {
  if (!categoryId) return Promise.resolve([])
  return prisma.serviceProfile.findMany({
    where: { categoryId, available: true, published: true },
    orderBy: [{ verified: 'desc' }, { rating: 'desc' }],
    take: 6,
    select: {
      id: true, slug: true, verified: true, rating: true, headline: true, priceFrom: true,
      user: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  })
}
