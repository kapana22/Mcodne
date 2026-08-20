// The signed-in CLIENT'S OWN service requests — one query, two readers
// (app/me/requests, the /me home's section via /api/me/requests), so „mine"
// cannot develop two definitions. Server-only: prisma.
//
// ⚠️ THE OWNER, BY ACCOUNT. `ServiceRequest.userId` is set when the intake
// creates or recognises an account (app/api/requests → accountForRequest); a
// request made with no account has no owner and appears in nobody's list —
// its reference is the only key to it, by design (lib/requests). Nothing here
// widens that: the where is `userId = me`, never a phone or an email match,
// which would let one shared number read another person's thread.
import { prisma } from '@/lib/prisma'
import { KIND, kindOf, topicLabel } from '@/lib/requestTopics'
import { STATUS_LABEL, requestHeadline, type RequestStatusName } from '@/lib/requests'

export type MyRequestRow = {
  id: string
  /** The client's own credential — this list is the ONE place it is shown to
   *  somebody other than the thanks screen, and only to its owner. */
  publicRef: string
  kindLabel: string
  topicLabel: string
  /** ⚠️ THE TITLE, AND IT IS THE CLIENT'S OWN WORDS (2026-08-19). The list used
   *  to be headed by `topicLabel`, so a client with three cleaning requests
   *  read three identical cards. Shaped HERE rather than in the page, so the
   *  client's list and the provider's queue cannot title the same request two
   *  different ways — see requestHeadline in lib/requests. */
  headline: string
  status: RequestStatusName
  statusLabel: string
  offerCount: number
  createdAt: string
}

export async function myRequests(userId: string, take = 50): Promise<MyRequestRow[]> {
  const rows = await prisma.serviceRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    // `description` is the client's own text, read back to the client — no
    // contact field is added and nothing else about the query changes.
    select: { id: true, publicRef: true, kind: true, topic: true, description: true, status: true, offerCount: true, createdAt: true },
  })
  return rows.map(r => {
    const status = r.status as RequestStatusName
    return {
      id: r.id,
      publicRef: r.publicRef,
      kindLabel: KIND[kindOf(r.kind)].label,
      topicLabel: topicLabel(r.topic),
      headline: requestHeadline(r.description, topicLabel(r.topic)),
      status,
      statusLabel: STATUS_LABEL[status] ?? r.status,
      offerCount: r.offerCount,
      createdAt: r.createdAt.toISOString(),
    }
  })
}
