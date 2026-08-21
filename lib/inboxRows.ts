// ONE INBOX — the row shape every conversation in the supply side's list is
// built into, whatever kind of conversation it is.
//
// ⚠️ WHY THIS FILE EXISTS. A provider talked to clients in TWO places: the
// booking inbox (/work/messages) and an offer chat embedded in every row of
// /work/offers. Two lists in one workspace is not two features, it is somebody
// not knowing where they were written to — owner, 2026-08-19: „რექვესთები
// ვფიქრობ რომ მიმოწერაში უნდა გამოდიოდეს აქტიურად, და გადაყავხარ საიტზე
// არაკომფორტულად და სად რა არის ვერ ხვდები." So the LIST is one; the two panes
// behind it are untouched, because merging THEM would merge two different sets
// of rules (a booking has a counterparty with an account; an offer thread has a
// client who has none and a contact that stays sealed until acceptance).
//
// ⚠️ THE MASKING HAPPENS HERE, ONCE. `peerName` on an OFFER row is „კლიენტი"
// until that offer is ACCEPTED, decided by lib/requests → clientIdentityOpen, the
// same function the offers page renders the contact block through. The row
// builder is never handed a phone or an email AT ALL (see OfferInboxSource) —
// a shared row type is exactly the place where „it is only a label" turns into
// a leak, so the type makes the leak unrepresentable rather than forbidden.
//
// PURE ON TOP, one query at the bottom. The builders take rows and return rows
// so the tests can EXECUTE the masking against a fake accepted and a fake
// pending offer; the loader below is the one query the two readers share.
//
// ⚠️ PRISMA IS IMPORTED LAZILY, inside the loader. This module's type is what
// the browser inbox is written against (components/chat/ConversationList imports
// it with `import type`) and its builders are what the tests execute — a
// top-level `import { prisma }` would drag a database client into both.

import { clientIdentityOpen, requestsOn, topicLabel } from './requests'
import type { ProviderIdentity } from './requestsServer'

/* ═══════════ the shape ══════════════════════════════════════════════════ */

type InboxKind = 'BOOKING' | 'OFFER'

export type InboxRow = {
  kind: InboxKind
  /**
   * Stable and kind-prefixed: `b-<bookingId>`, `u-<userId>`, `o-<offerId>`.
   * It is the React key AND the „which row is open" test, so the two kinds may
   * never collide — a booking id and an offer id are both cuids.
   */
  id: string
  href: string
  /** ⚠️ On an OFFER row this is masked. See offerPeerName. */
  peerName: string | null
  avatarUrl: string | null
  /** The quiet third line — a booking's subject, or the request's topic. */
  topic: string
  /** ISO. Newest activity first is the whole ordering of the list. */
  lastAt: string
  lastPreview: string
  lastFromMe: boolean
  lastHasFile: boolean
  /** Unread FOR THE READER of this list. Summed by inboxUnreadTotal — the one
   *  number the sidebar pill and the header badge both show. */
  unread: number
}

const iso = (d: Date | string): string => (typeof d === 'string' ? d : d.toISOString())

/* ═══════════ the masking ════════════════════════════════════════════════ */

/** What a client is called before they have chosen anybody. */
export const MASKED_CLIENT_NAME = 'კლიენტი'

/**
 * The name an offer thread may print for the client.
 *
 * ⚠️ ONE FUNCTION DECIDES IT, and since 2026-08-21 the name is ALL it decides:
 * `clientIdentityOpen` is false for every status except ACCEPTED, so „when does
 * the client stop being „კლიენტი"" has one answer on this platform and not two.
 * The phone and the email it used to release beside the name are gone from the
 * product entirely — see lib/requests.
 */
export function offerPeerName(offer: { status: string }, contactName: string | null): string {
  const name = clientIdentityOpen(offer) ? (contactName ?? '').trim() : ''
  return name ? name : MASKED_CLIENT_NAME
}

/* ═══════════ the builders ═══════════════════════════════════════════════ */

/** Where an offer thread is read in the supply side's inbox. */
export function offerThreadHref(offerId: string): string {
  return `/work/messages/o/${offerId}`
}

/**
 * As much of an offer as a LIST row may see.
 *
 * ⚠️ NO `phone`, NO `email`, and that is the point: the builder cannot leak
 * what it is never given. `contactName` is here because the masking rule needs
 * something to reveal on acceptance, and it is the only contact field that
 * passes through this file.
 */
export type OfferInboxSource = {
  id: string
  status: string
  createdAt: Date | string
  request: { topic: string; contactName: string }
  /** The newest message first, `take: 1` — the preview. */
  messages: { body: string; fromClient: boolean; createdAt: Date | string }[]
  /** Client messages this provider has not opened. */
  _count: { messages: number }
}

export function offerInboxRow(o: OfferInboxSource): InboxRow {
  const last = o.messages[0]
  return {
    kind: 'OFFER',
    id: `o-${o.id}`,
    href: offerThreadHref(o.id),
    peerName: offerPeerName(o, o.request.contactName),
    // A masked client has no face to show, and a stock one beside a real name
    // reads as a fake identity (the invariant tests/regression-invariants pins).
    avatarUrl: null,
    topic: topicLabel(o.request.topic),
    lastAt: iso(last?.createdAt ?? o.createdAt),
    lastPreview: last?.body ?? '',
    lastFromMe: last ? !last.fromClient : false,
    // The offer thread carries no attachments — the composer has no file input.
    lastHasFile: false,
    unread: o._count.messages,
  }
}

/**
 * A booking / pre-booking thread, as app/api/messages already builds it.
 *
 * Deliberately the endpoint's OWN object rather than a second query: that code
 * folds a suppressed pre-booking thread's unread into its booking host, and a
 * parallel derivation would drop the fold and disagree with the badge — the
 * exact bug this subsystem has hit before.
 */
export type BookingInboxSource = {
  key: string
  href: string
  name: string | null
  avatarUrl: string | null
  topic: string
  preview: string
  lastFromMe: boolean
  lastHasFile: boolean
  at: Date | string
  unreadCount: number
}

export function bookingInboxRow(t: BookingInboxSource): InboxRow {
  return {
    kind: 'BOOKING',
    id: t.key,
    href: t.href,
    peerName: t.name,
    avatarUrl: t.avatarUrl,
    topic: t.topic,
    lastAt: iso(t.at),
    lastPreview: t.preview,
    lastFromMe: t.lastFromMe,
    lastHasFile: t.lastHasFile,
    unread: t.unreadCount,
  }
}

/* ═══════════ the list, and the one number ═══════════════════════════════ */

/** Newest activity first. The list is a list of conversations, not of objects,
 *  so the order is when somebody last spoke — never when a row was created. */
export function sortInboxRows(rows: InboxRow[]): InboxRow[] {
  return [...rows].sort((a, z) => Date.parse(z.lastAt) - Date.parse(a.lastAt))
}

/**
 * THE unread number for this reader — both kinds, one total.
 *
 * ⚠️ ONE SOURCE. The sidebar pill (/api/tutor/nav-badges) and the inbox
 * (/api/messages) both end at this function over the same rows; two counts of
 * one thing is the bug that leaves a badge nothing can clear.
 */
export function inboxUnreadTotal(rows: InboxRow[]): number {
  return rows.reduce((n, r) => n + r.unread, 0)
}

/* ═══════════ the loader — the one query the two readers share ═══════════ */

/**
 * Every offer conversation this provider is a party to, as inbox rows.
 *
 * `messages: { some: {} }` — an offer nobody has written in is not a
 * conversation, and printing it would fill the inbox with rows whose preview is
 * empty. The offer itself still lives on /work/offers, which is the list of
 * offers; this is the list of conversations.
 *
 * Returns [] with the subsystem off or for somebody who is not a provider, so
 * the caller needs no second gate.
 */
export async function offerInboxRows(provider: ProviderIdentity | null): Promise<InboxRow[]> {
  if (!provider || !requestsOn()) return []
  const { prisma } = await import('./prisma')
  const rows = await prisma.requestOffer.findMany({
    where: {
      ...(provider.kind === 'EXPERT'
        ? { expertUserId: provider.userId }
        : { companyId: provider.companyId }),
      messages: { some: {} },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, status: true, createdAt: true,
      // ⚠️ contactName ONLY. The offers page selects phone and email because it
      // is the screen a chosen provider finds out who to call on; a list row
      // has no such moment, so it never reads them.
      request: { select: { topic: true, contactName: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, fromClient: true, createdAt: true } },
      _count: { select: { messages: { where: { fromClient: true, readByProviderAt: null } } } },
    },
  })
  return rows.map(offerInboxRow)
}

/** The offer half of the one unread number — same rows, same total. */
export async function offerUnreadTotal(provider: ProviderIdentity | null): Promise<number> {
  return inboxUnreadTotal(await offerInboxRows(provider))
}
