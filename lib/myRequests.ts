// The signed-in CLIENT'S OWN service requests — one query, one reader
// (app/me), so „mine" cannot develop two definitions. Server-only: prisma.
//
// ⚠️ THE OWNER, BY ACCOUNT. `ServiceRequest.userId` is set when the intake
// creates or recognises an account (app/api/requests → accountForRequest); a
// request made with no account has no owner and appears in nobody's list —
// its reference is the only key to it, by design (lib/requests). Nothing here
// widens that: the where is `userId = me`, never a phone or an email match,
// which would let one shared number read another person's thread.
//
// ⚠️ THE ROW CARRIES ITS OWN META LINE SINCE 2026-08-31, from the owner's
// design canvas („Client Space"). The canvas's row reads
//
//     სერვისი 1 · 3 შეთავაზება · 90₾-დან          [3 შეთავაზება]   ნახე
//     სერვისი 3 · არჩეული: ექსპერტი 2             [დასრულებული]   შეაფასე
//
// — a category, a count, a PRICE FLOOR and the name of whoever was chosen. Two
// of those four were not in this shape and the canvas fills them with
// placeholders, which CLAUDE.md rule 6 makes unshippable. So they are read:
// `lowestOfferGel` is the minimum `RequestOffer.priceGel` actually on the table
// and `chosenName` is the accepted offer's provider. Nobody is shown a figure
// nobody wrote.
import { prisma } from '@/lib/prisma'
import { KIND, kindOf, topicLabel, groupIdOf } from '@/lib/requestTopics'
import { STATUS_LABEL, requestHeadline, type RequestStatusName } from '@/lib/requests'

export type MyRequestRow = {
  id: string
  /** The client's own credential — this list is the ONE place it is shown to
   *  somebody other than the thanks screen, and only to its owner. */
  publicRef: string
  kindLabel: string
  topicLabel: string
  /** The FAMILY this request belongs to — what the row draws its mark from
   *  (lib/topicMarks). Undefined for „სხვა" and for a topic the catalogue has
   *  since dropped; the row then has no icon, which is the honest answer. */
  groupId: string | undefined
  /** ⚠️ THE TITLE, AND IT IS THE CLIENT'S OWN WORDS (2026-08-19). The list used
   *  to be headed by `topicLabel`, so a client with three cleaning requests
   *  read three identical cards. Shaped HERE rather than in the page, so the
   *  client's list and the provider's queue cannot title the same request two
   *  different ways — see requestHeadline in lib/requests. */
  headline: string
  status: RequestStatusName
  statusLabel: string
  offerCount: number
  /** MEASURED: the cheapest offer on the table, in ₾, or null while nobody has
   *  quoted. The canvas's „90₾-დან". */
  lowestOfferGel: number | null
  /** Who the client chose, by their public display name, or null before a
   *  choice. The canvas's „არჩეული: ექსპერტი 2". */
  chosenName: string | null
  /** The accepted offer is finished and carries no review yet — the one state
   *  whose action is „შეაფასე" rather than „ნახე". The form itself lives on
   *  /request/<ref> (app/request/[ref]/OfferList → ReviewForm); this only says
   *  the row should send them to it. */
  awaitingReview: boolean
  createdAt: string
}

/**
 * The statuses a request is still LIVE in — what the sidebar badge counts.
 *
 * REJECTED and CLOSED are exits, not stations (lib/requests → REQUEST_STATIONS
 * says so), and a badge is a „these want you" signal: counting a request that
 * finished in March would make the number grow for ever and mean nothing.
 */
export const LIVE_REQUEST_STATUSES = ['NEW', 'VERIFIED', 'MATCHED'] as const

/** How many live requests this client has — the rail badge, and it is a real
 *  `count()`. Cheap enough to run in app/me/layout on every /me/* request. */
export async function liveRequestCount(userId: string): Promise<number> {
  return prisma.serviceRequest.count({
    where: { userId, status: { in: [...LIVE_REQUEST_STATUSES] } },
  })
}

/**
 * WHAT THE CLIENT'S ROW SAYS, in the client's words — the pill and the link,
 * derived once so a list and any later reader cannot disagree.
 *
 * ⚠️ `STATUS_LABEL` IS NOT THIS. Its own comment calls it „the admin's words for
 * each state" — „დამოწმებული", „შერჩეულია" — and it is what the shared
 * RequestStatusPill prints on the operator's and the provider's screens. A
 * client asking „what is happening to my request" is asking a different
 * question, and the canvas answers it with three states rather than five:
 * something arrived, nothing yet, it is over. Every word below is already in
 * the product's vocabulary (REQUEST_STATIONS, STATUS_LABEL) — none is minted.
 *
 * `tone` names the canvas's three hues, resolved to TILE_HUES at the pill.
 */
export type ClientRequestTone = 'offers' | 'waiting' | 'done'

export type ClientRequestState = {
  tone: ClientRequestTone
  /** The pill. */
  label: string
  /** The row's trailing link — „ნახე" when there is something new to read,
   *  „შეაფასე" when the only thing left to do is rate it, else „გახსენი". */
  cta: string
}

export function clientRequestState(
  r: Pick<MyRequestRow, 'status' | 'offerCount' | 'awaitingReview'>,
): ClientRequestState {
  // Rejected first: it is an exit, and „ველოდები" on a request nobody will ever
  // answer is the one thing this pill must never say.
  if (r.status === 'REJECTED') return { tone: 'done', label: STATUS_LABEL.REJECTED, cta: 'გახსენი' }
  if (r.awaitingReview) return { tone: 'done', label: 'დასრულებული', cta: 'შეაფასე' }
  if (r.status === 'CLOSED') return { tone: 'done', label: 'დასრულებული', cta: 'ნახე' }
  // A choice has been made — station four, and the canvas's green.
  if (r.status === 'MATCHED') return { tone: 'offers', label: 'არჩეული', cta: 'გახსენი' }
  if (r.offerCount > 0) return { tone: 'offers', label: `${r.offerCount} შეთავაზება`, cta: 'ნახე' }
  // NEW means a person is about to pick up a phone (lib/requests →
  // stationsReached), which is not the same wait as „verified, nobody has
  // written yet" — so it keeps the station's own word.
  if (r.status === 'NEW') return { tone: 'waiting', label: 'ვამოწმებთ', cta: 'გახსენი' }
  return { tone: 'waiting', label: 'ველოდები', cta: 'გახსენი' }
}

export async function myRequests(userId: string, take = 50): Promise<MyRequestRow[]> {
  const rows = await prisma.serviceRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    // `description` is the client's own text, read back to the client — no
    // contact field is added and nothing else about the query changes.
    select: {
      id: true, publicRef: true, kind: true, topic: true, description: true,
      status: true, offerCount: true, createdAt: true,
      // ⚠️ THE SAME THREE COLUMNS /request/[ref] ALREADY SELECTS for this
      // reader, and no more. WITHDRAWN and DECLINED are excluded for the reason
      // the request page excludes WITHDRAWN: an offer nobody can accept is not
      // on the table, so it must not move the floor price.
      //
      // No phone, no email, no message body — a meta line needs a number and a
      // name. `expertUser.fullName` and `company.name` are the same public pair
      // the catalogue card prints (app/me/favorites, app/experts/_providers).
      offers: {
        where: { status: { in: ['SENT', 'ACCEPTED'] } },
        select: {
          priceGel: true,
          status: true,
          doneAt: true,
          review: { select: { id: true } },
          expertUser: { select: { fullName: true } },
          company: { select: { name: true } },
        },
      },
    },
  })
  return rows.map(r => {
    const status = r.status as RequestStatusName
    const accepted = r.offers.find(o => o.status === 'ACCEPTED') ?? null
    const prices = r.offers.map(o => o.priceGel)
    return {
      id: r.id,
      publicRef: r.publicRef,
      kindLabel: KIND[kindOf(r.kind)].label,
      topicLabel: topicLabel(r.topic),
      groupId: groupIdOf(r.topic),
      headline: requestHeadline(r.description, topicLabel(r.topic)),
      status,
      statusLabel: STATUS_LABEL[status] ?? r.status,
      offerCount: r.offerCount,
      lowestOfferGel: prices.length ? Math.min(...prices) : null,
      chosenName: accepted ? (accepted.company?.name ?? accepted.expertUser?.fullName ?? null) : null,
      awaitingReview: !!accepted && accepted.doneAt !== null && accepted.review === null,
      createdAt: r.createdAt.toISOString(),
    }
  })
}
