// The admin's half of lib/outbound: which registered messages actually go out.
//
// The registry (code) says what the site CAN send and when. This says what it
// DOES, and an admin owns it rather than a deploy — the owner's „მინდა ვმართოთ".
//
// ⚠️ A ROW IS AN OVERRIDE, NOT THE TRUTH. No row = the registry's default, so a
// message nobody has touched needs no row, and a message added next month
// arrives switched on with no backfill. Exactly the shape SiteText has over
// lib/siteTextDefs, for the same reason: defaults live with the code that uses
// them, and the database holds only the decisions somebody actually made.
//
// ⚠️ WHY THE CACHE. `sendMail` is called in a loop over every routable provider,
// and without this each letter in that loop would cost a settings read on top of
// the cutoff read it already pays. Five seconds is long enough to collapse one
// fan-out and short enough that an admin flipping a switch sees it work.

import { prisma } from './prisma'
import { OUTBOUND, outboundDef, canToggle, type Channel, type OutboundKey } from './outbound'

export { canToggle }

export type MessageState = { mailOn: boolean; smsOn: boolean }

/**
 * The registry's answer before any override.
 *
 * ⚠️ MAIL ON, SMS OFF — and the asymmetry is the bill. A letter costs nothing
 * and every message here was designed to be one; a text is charged per part and
 * lands on somebody's phone, so it starts off and an operator turns it on
 * deliberately. `smsByDefault` is carried by the hand tool alone, whose whole
 * job is to send one.
 */
export const defaultState = (key: string): MessageState => ({
  mailOn: true,
  smsOn: Boolean(outboundDef(key) && 'smsByDefault' in outboundDef(key)!),
})

/* ── reading ──────────────────────────────────────────────────────────────── */

let cache: { at: number; map: Map<string, MessageState> } | null = null
const TTL_MS = 5_000

async function loadAll(): Promise<Map<string, MessageState>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map
  const map = new Map<string, MessageState>()
  try {
    for (const r of await prisma.messageSetting.findMany()) {
      map.set(r.key, { mailOn: r.mailOn, smsOn: r.smsOn })
    }
    cache = { at: Date.now(), map }
  } catch (err) {
    // ⚠️ FAILS OPEN, and that is the opposite of lib/mailer's cutoff lookup.
    // The cutoff protects somebody from a message they never asked for, so a
    // failed read there holds the letter. This one decides whether a message
    // the product depends on goes at all — a database hiccup must not silently
    // stop every letter the site sends. An override that cannot be read is
    // treated as absent, which is the registry's own default.
    console.error('[server-error]', JSON.stringify({ scope: 'outboundSettings', err: String(err) }))
    return new Map()
  }
  return map
}

/** The state of one message, override applied. */
export async function messageState(key: string): Promise<MessageState> {
  const m = await loadAll()
  return m.get(key) ?? defaultState(key)
}

/** Every registered message with its current state — what the admin tab lists. */
export async function allMessageStates(): Promise<Record<string, MessageState>> {
  const m = await loadAll()
  const out: Record<string, MessageState> = {}
  for (const d of OUTBOUND) out[d.key] = m.get(d.key) ?? defaultState(d.key)
  return out
}

/* ── writing ──────────────────────────────────────────────────────────────── */

/**
 * Flip one channel of one message. Returns the new state, or null when the
 * change is refused — an unknown key, or a switch `canToggle` does not allow.
 *
 * The refusal is HERE rather than in the route, because a rule enforced only by
 * a hidden toggle is a rule anybody with `curl` can walk around.
 */
export async function setMessageState(
  key: string,
  channel: Channel,
  on: boolean,
): Promise<MessageState | null> {
  if (!outboundDef(key)) return null
  if (!on && !canToggle(key, channel)) return null
  if (on && channel === 'sms' && !canToggle(key, 'sms')) return null

  const current = await messageState(key)
  const next: MessageState = channel === 'mail' ? { ...current, mailOn: on } : { ...current, smsOn: on }

  await prisma.messageSetting.upsert({
    where: { key },
    create: { key, ...next },
    update: next,
  })
  cache = null // the next read is the fresh one; an admin must see their own click
  return next
}

/** For the senders: is this channel live for this message right now? */
export async function channelOn(key: OutboundKey, channel: Channel): Promise<boolean> {
  const s = await messageState(key)
  return channel === 'mail' ? s.mailOn : s.smsOn
}
