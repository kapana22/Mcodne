// The conversation rules — who may speak, who may read, and what a message may
// carry before the contact is open.
//
// PURE: no prisma, no react. The endpoint enforces these; the pages render
// them; the tests execute them. One copy of every rule.
//
// ⚠️ THE CLIENT HAS NO ACCOUNT, and that shapes the whole file. They are
// authenticated by POSSESSION OF THE REFERENCE — the same publicRef that opens
// their page, minted from crypto randomness precisely so it can carry this
// weight. That is a real authentication decision, not a shortcut: the
// alternative was a signup step, and „no registration, ever" is what the intake
// was rebuilt on.

import { z } from 'zod'

/** Who is speaking. Derived at the endpoint from the ref or the session — never
 *  sent by the caller, because „which side am I" is exactly the thing a crafted
 *  request would lie about. */
export type ChatSide = 'CLIENT' | 'PROVIDER'

/* ═══════════ what a message may say ═════════════════════════════════════ */

export const RequestMessageInput = z.object({
  offerId: z.string().trim().min(1).max(40),
  // 2000 is the ceiling a person types in a chat box, not the ceiling of a
  // document: the existing Message model's own consumers sit in the same
  // range, and a request conversation is questions and answers, never an
  // attachment in prose. The floor is 1 non-blank character — a blank message
  // is a mis-tap, and the database CHECK refuses it too.
  body: z.string().trim().min(1).max(2000),
  /** The client's key. Present on client sends, absent on provider sends —
   *  the endpoint decides the side from which one it got, never from a
   *  caller-supplied flag. */
  ref: z.string().trim().max(16).optional(),
})
export type RequestMessageInput = z.infer<typeof RequestMessageInput>

/* ═══════════ when the conversation is open ══════════════════════════════ */

/**
 * May this thread be written to at all?
 *
 * OPEN FROM THE MOMENT AN OFFER EXISTS — the reference model, and the reason
 * it is not a weakening of the contact seal: without it a client must either
 * choose blind from a price and a paragraph, or hand out their number early to
 * ask one question. The phone still opens only on acceptance.
 *
 * It closes when the REQUEST is settled and this offer was not the one chosen.
 * A declined provider writing into a thread the client has stopped reading is
 * not a conversation, and leaving it open would let a losing bidder keep
 * pitching after the decision.
 */
export function chatIsOpen(
  request: { status: string },
  offer: { status: string },
): boolean {
  if (offer.status === 'WITHDRAWN') return false
  if (request.status === 'MATCHED') return offer.status === 'ACCEPTED'
  // ⚠️ NEW IS NOW A LEGAL STATE FOR AN INVITED THREAD (2026-08-18). It used to
  // be refused on the reasoning that no offers can exist yet — true then, and
  // no longer: a client may now write to an expert before anybody has bid, and
  // that conversation is the whole point of the change. It must not have to
  // wait for an admin's phone call to become writable, because the wait is
  // exactly what it exists to fill.
  //
  // The seal is untouched: an INVITED row carries no price, cannot be accepted
  // (`accept` matches SENT), and its messages are masked like every other
  // pre-acceptance message.
  if (offer.status === 'INVITED') return request.status === 'NEW' || request.status === 'VERIFIED'
  return request.status === 'VERIFIED'
}

/** Why it is closed, in the words the screen shows. Null when it is open. */
export function chatClosedReason(
  request: { status: string },
  offer: { status: string },
): string | null {
  if (chatIsOpen(request, offer)) return null
  if (offer.status === 'WITHDRAWN') return 'შეთავაზება გატანილია.'
  if (offer.status === 'DECLINED' || request.status === 'MATCHED') {
    return 'კლიენტმა სხვა შეთავაზება აირჩია.'
  }
  return 'მიმოწერა დახურულია.'
}

/* ═══════════ the contact firewall ═══════════════════════════════════════
 *
 * ⚠️ THE ONE PLACE A PHONE NUMBER COULD LEAK EARLY, and the research on
 * marketplace disintermediation names it directly: in-app messaging is where
 * contact details are traded, and every serious platform scrubs them (Airbnb's
 * regex stripping is the canonical example). Here the stake is not commission —
 * there is none — it is the PRODUCT: „we open the contact when you choose" is
 * the whole promise, and a provider who pastes their number into the first
 * message has taken the choice away from the client and the record away from us.
 *
 * MASKED, NOT BLOCKED, and the difference is deliberate. A refused message
 * teaches the sender to write „ხუთი ხუთი ხუთი…" and tells us nothing; a masked
 * one delivers the sentence, removes the number, and says so to both sides. The
 * conversation survives, the leak does not.
 *
 * ONLY BEFORE ACCEPTANCE. Afterwards both parties already have each other's
 * details, and scrubbing a number they can read on the same screen would be
 * theatre.
 */

/** A Georgian mobile, an international number, or a long digit run — with the
 *  separators people actually type between them. Deliberately loose: a false
 *  positive costs a masked number in a sentence that did not need one, a false
 *  negative costs the product rule. */
const PHONE_RE = /(\+?\d[\d\s\-().]{7,}\d)/g
/** Anything shaped like an address a conversation could move to. */
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g
/** Messenger handles are the other half of the same move. */
const HANDLE_RE = /(?:^|\s)@[A-Za-z0-9._]{3,}/g

export const MASK = '•••'

type MaskResult = { body: string; masked: boolean }

/**
 * Strip contact details from a message, unless the contact is already open.
 *
 * Returns whether anything was removed so the endpoint can tell the sender —
 * a silent edit of somebody's words is worse than the leak it prevents.
 */
export function maskContacts(body: string, contactIsOpen: boolean): MaskResult {
  if (contactIsOpen) return { body, masked: false }
  let out = body.replace(EMAIL_RE, MASK).replace(HANDLE_RE, ` ${MASK}`)
  // Phones last: an email's digits would otherwise be masked twice and the
  // result would read as a mangled address rather than a removed one.
  out = out.replace(PHONE_RE, MASK)
  return { body: out, masked: out !== body }
}

/* ═══════════ what each side may see ═════════════════════════════════════ */

type ChatMessageRow = {
  id: string
  fromClient: boolean
  body: string
  createdAt: Date | string
  readByClientAt: Date | string | null
  readByProviderAt: Date | string | null
}

/**
 * One message, as the given side reads it.
 *
 * `mine` rather than a name: the client has no account and the provider needs
 * no reminder of their own name, so the bubble side is the whole identity this
 * view carries. Read receipts are exposed only for messages YOU sent — „did
 * they read mine" is useful, „when did I read theirs" is noise.
 */
export function chatMessageView(m: ChatMessageRow, side: ChatSide) {
  const mine = side === 'CLIENT' ? m.fromClient : !m.fromClient
  const readByOther = m.fromClient ? m.readByProviderAt : m.readByClientAt
  return {
    id: m.id,
    mine,
    body: m.body,
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : m.createdAt.toISOString(),
    readByOther: mine ? readByOther !== null : false,
  }
}

/** How many messages this side has not read. Drives the „N ახალი" badges. */
export function unreadFor(messages: ChatMessageRow[], side: ChatSide): number {
  return messages.filter(m =>
    side === 'CLIENT' ? !m.fromClient && m.readByClientAt === null
                      : m.fromClient && m.readByProviderAt === null,
  ).length
}
