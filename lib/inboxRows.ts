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

import { clientIdentityOpen, offerPriceLabel, requestsOn, topicLabel } from './requests'
import type { ProviderIdentity } from './requestsServer'

/* ═══════════ the shape ══════════════════════════════════════════════════ */

// ⚠️ ONE KIND SINCE 2026-08-26. It was `'BOOKING' | 'OFFER'`; the booking half
// had no builder left (see the note further down). Kept as a named union rather
// than inlined, because the id-prefix rule below is about kinds not colliding
// and that rule comes back the day a second kind does.
//
// ⚠️ AND „ONE KIND" STILL HOLDS WITH TWO READERS (2026-08-31). The client got
// their own inbox back on that date (/me/messages, from the owner's Messages
// artboard), and it lists THE SAME OBJECT: an offer conversation. What differs
// is who the peer is and which unread column counts — two builders, one row
// type, one list component, so the two sides cannot drift the way the booking
// inbox and the offer accordion did.
type InboxKind = 'OFFER'

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
  /**
   * ⚠️ THE AGREED FIGURE, IN THE ROW SINCE 2026-08-31. The owner's Messages
   * artboard prints „სერვისი 1 · 60₾" as the chip under every conversation, and
   * it is the one thing that told two threads apart and was not on screen: a
   * provider with three jobs open can have two of them under the same topic.
   * The thread PANE has carried it since 2026-08-29 for exactly that reason;
   * the list had not caught up.
   *
   * Null where there is no figure to print — see `offerRowPrice`. Never „0₾".
   */
  price: string | null
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

/* ═══════════ the money on a row ═════════════════════════════════════════ */

/**
 * The chip's figure, or nothing at all.
 *
 * ⚠️ „0₾" IS NOT A PRICE, IT IS AN EMPTY COLUMN. `priceGel` is `Int` and not
 * nullable, and an INVITED thread — the client writing to somebody before
 * anybody has bid — is created with `priceGel: 0` (lib/requestInvite). Printing
 * `gel(0)` there would put a number on the screen that nobody named, which is
 * the one thing this codebase never does.
 *
 * ON_SITE is the exception and it is a real one: a zero call-out fee IS the
 * offer („გამოძახება უფასოდ"), and `offerPriceLabel` already says so in words.
 */
export function offerRowPrice(o: { status: string; priceGel: number; priceKind: string }): string | null {
  if (o.status === 'INVITED') return null
  if (o.priceGel <= 0 && o.priceKind !== 'ON_SITE') return null
  return offerPriceLabel(o.priceGel, o.priceKind)
}

/* ═══════════ the builders ═══════════════════════════════════════════════ */

/** Where an offer thread is read in the supply side's inbox. */
export function offerThreadHref(offerId: string): string {
  return `/work/messages/o/${offerId}`
}

/** …and where the CLIENT reads the same conversation, in their own room. */
export function clientThreadHref(offerId: string): string {
  return `/me/messages/o/${offerId}`
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
  /** The chip's figure — see `offerRowPrice`. Not a contact detail: it is the
   *  sum the two of them agreed, and it is what tells two threads on one topic
   *  apart. */
  priceGel: number
  priceKind: string
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
    price: offerRowPrice(o),
    lastAt: iso(last?.createdAt ?? o.createdAt),
    lastPreview: last?.body ?? '',
    lastFromMe: last ? !last.fromClient : false,
    // The offer thread carries no attachments — the composer has no file input.
    lastHasFile: false,
    unread: o._count.messages,
  }
}

/* ═══════════ the same conversation, from the client's chair ═════════════ */

/** What a provider is called when the row cannot name them. Only reachable for
 *  a company row whose name is blank, which the admin form does not allow —
 *  it exists so the type has no `null` branch the list has to render. */
export const UNNAMED_PROVIDER = 'ექსპერტი'

/**
 * As much of an offer as the CLIENT'S list row may see.
 *
 * ⚠️ THE MIRROR OF `OfferInboxSource`, AND IT IS AS NARROW. The provider's name
 * is not sealed — it is what the client is choosing between, and lib/requests →
 * clientOfferView has always released it — but their PHONE and EMAIL are, in
 * both directions since 2026-08-21, so neither is named here. Same guarantee as
 * the other builder: the leak is unrepresentable rather than forbidden.
 */
export type ClientInboxSource = {
  id: string
  status: string
  createdAt: Date | string
  priceGel: number
  priceKind: string
  request: { topic: string }
  expertUser: { fullName: string } | null
  company: { name: string } | null
  /** The newest message first, `take: 1` — the preview. */
  messages: { body: string; fromClient: boolean; createdAt: Date | string }[]
  /** Provider messages this client has not opened. */
  _count: { messages: number }
}

export function clientInboxRow(o: ClientInboxSource): InboxRow {
  const last = o.messages[0]
  return {
    kind: 'OFFER',
    id: `o-${o.id}`,
    href: clientThreadHref(o.id),
    peerName: o.expertUser?.fullName?.trim() || o.company?.name?.trim() || UNNAMED_PROVIDER,
    // ⚠️ NO FACE, AND IT IS A COST DECISION AS WELL AS A DESIGN ONE. The
    // artboard draws a neutral disc in every row, and `User.avatarUrl` holds a
    // `data:` URI — ~32KB of base64 per row that no cache can reuse (see
    // app/api/avatars). Faces here mean going through AVATAR_SHAPE_SQL /
    // avatarRouteSrc, never `avatarUrl: true`.
    avatarUrl: null,
    topic: topicLabel(o.request.topic),
    price: offerRowPrice(o),
    lastAt: iso(last?.createdAt ?? o.createdAt),
    lastPreview: last?.body ?? '',
    // `fromClient` IS „mine" on this side — the one line that inverts.
    lastFromMe: last ? last.fromClient : false,
    lastHasFile: false,
    unread: o._count.messages,
  }
}

// ⚠️ `BookingInboxSource` AND `bookingInboxRow` WERE HERE AND ARE GONE
// (2026-08-26). They built the second kind of inbox row from „app/api/messages",
// a route that went with the `Message` table on 2026-08-24 — so the builder had
// no source and no caller, and no row of kind BOOKING could be produced by
// anything. The inbox is offer threads.

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
      priceGel: true, priceKind: true,
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

/**
 * Every offer conversation on THIS CLIENT'S OWN requests, as inbox rows.
 *
 * ⚠️ THE OWNERSHIP IS IN THE `where` (`request.userId`), never in a branch after
 * the read — the same rule /api/request-chat resolves the side by, and the
 * reason a guessed offer id cannot return a row to compare against.
 *
 * ⚠️ AND IT IS NOT THE `ref`. A signed-in client reaches their conversations by
 * SESSION here; possession of the reference is still what authorises the
 * account-less client at /request/<ref>, and both doors end at the same rows.
 * The two are alternatives, not a chain: this list must never require a person
 * to hold a credential they have no way to type.
 *
 * WITHDRAWN offers are included on purpose, and that is a deliberate difference
 * from /request/<ref>, which hides them: an offer nobody can accept is noise on
 * a page about choosing, and a conversation that happened is still a
 * conversation. `chatIsOpen` closes the composer on those; the transcript stays
 * readable.
 *
 * Returns [] with the subsystem off, so the caller needs no second gate.
 */
export async function clientInboxRows(userId: string | null | undefined): Promise<InboxRow[]> {
  if (!userId || !requestsOn()) return []
  const { prisma } = await import('./prisma')
  const rows = await prisma.requestOffer.findMany({
    where: { request: { userId }, messages: { some: {} } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, status: true, createdAt: true,
      priceGel: true, priceKind: true,
      // The topic and nothing else: the client wrote this request, so the row
      // has nothing to tell them about themselves.
      request: { select: { topic: true } },
      // NAME ONLY, on both branches. The provider's phone and email left every
      // client-facing shape on 2026-08-21 (lib/requests → clientOfferView) and
      // a list row is the last place they would ever belong.
      expertUser: { select: { fullName: true } },
      company: { select: { name: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, fromClient: true, createdAt: true } },
      _count: { select: { messages: { where: { fromClient: false, readByClientAt: null } } } },
    },
  })
  return rows.map(clientInboxRow)
}

/**
 * The client half of the one unread number — the exact twin of
 * `offerUnreadTotal`, over the exact rows `/me/messages` draws.
 *
 * ⚠️ IT IS THE SAME ROWS AND NOT A CHEAPER `count()` (2026-09-02). A direct
 * count on RequestMessage would be one round trip instead of this one, and it
 * would drift: `clientInboxRows` caps at 100 conversations and requires
 * `messages: { some: {} }`, so a count written against the message table would
 * eventually print a number the list on the other side of the click cannot
 * account for — „a badge nothing can clear", which is the failure
 * `inboxUnreadTotal`'s own header was written about. The supply side already
 * pays this shape on every /work/∗ page.
 *
 * ⚠️ AND THE RAIL HAD NO BADGE AT ALL UNTIL TODAY. components/me/navConfig
 * left the `მიმოწერა` row without one deliberately („a badgeKey naming a count
 * nobody passes draws nothing for ever") and said the badge was its own
 * change. This is that change — owner, 2026-09-02: „მესიჯები რომ მოდიოდეს
 * შეტყობინებებში კარგი იქნება. რადგან ესე დაიკარგება."
 */
export async function clientUnreadTotal(userId: string | null | undefined): Promise<number> {
  return inboxUnreadTotal(await clientInboxRows(userId))
}
