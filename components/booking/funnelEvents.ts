// Booking-funnel instrumentation — the CONTRACT shared by the browser
// (BookingFlow) and the server (app/api/events/route.ts).
//
// WHY the names live here and not in `lib/events.ts`: lib/events.ts is the
// SERVER writer — it imports `@/lib/prisma` and `@/lib/dbBoot`, so a
// `'use client'` component importing it would drag PrismaClient into the
// browser bundle. Its own `EVENTS` map is likewise server-emitted only (the
// browse-search signals). The funnel names — the only ones a BROWSER may send —
// therefore live in this plain, dependency-free module that both the client
// component and `app/api/events/route.ts` import. The route re-checks every
// name against BOOKING_FUNNEL_EVENTS before anything reaches lib/events'
// `track()`, so the browser can never mint a row name.
//
// This module is the outer, stricter gate; lib/events' own boundProps() is the
// inner one. Bounds here are deliberately tighter than its PROPS_* caps.
//
// Discipline for anyone extending this:
//   • names are added HERE, never typed inline at a call site;
//   • props carry FACTS, never words the user wrote. The topic/notes are a
//     person describing a personal problem — a length or a boolean is a
//     funnel signal, the text itself is not ours to log.

import { APPLY_FUNNEL_EVENT_NAMES, APPLY_FUNNEL_PROP_KEYS } from '@/app/join/_expert/applyFunnelEvents'
import { REQUEST_FUNNEL_EVENT_NAMES, REQUEST_FUNNEL_PROP_KEYS, REQUEST_SLUG_RE } from '@/app/request/requestFunnelEvents'
import { HELP_EVENT_NAMES, HELP_EVENTS, HELP_ROUTE_RE, HELP_TOPIC_IDS } from '@/lib/helpTopics'

/** Every event the booking funnel may emit. The API allow-list is derived from this. */
export const BOOKING_FUNNEL_EVENTS = {
  /** Sheet opened — the denominator of the whole funnel. */
  opened: 'booking_flow_opened',
  /** A consultation tier was picked on the „სერვისი" step. */
  serviceChosen: 'booking_service_chosen',
  /** A concrete start was picked on the „დრო" step. */
  timeChosen: 'booking_time_chosen',
  /** The „დეტალები" step was completed (intake valid, user advanced/submitted). */
  detailsSubmitted: 'booking_details_submitted',
  /** POST /api/bookings succeeded. */
  created: 'booking_created',
  /** Terminal failure — carries the server's error code, so „blocked" is
   *  distinguishable from „lost interest". */
  failed: 'booking_failed',
  /** The picker had nothing bookable for this service length — a dead end the
   *  user did not choose. */
  noSlots: 'booking_no_slots',
} as const

export type BookingFunnelEvent = typeof BOOKING_FUNNEL_EVENTS[keyof typeof BOOKING_FUNNEL_EVENTS]

/** Flat list — what the route turns into its allow-list Set. */
export const BOOKING_FUNNEL_EVENT_NAMES: readonly BookingFunnelEvent[] =
  Object.values(BOOKING_FUNNEL_EVENTS)

/**
 * Every prop key the funnel may send. Anything else is a 400 — an allow-list
 * (rather than a size cap alone) is what makes it structurally impossible for
 * free text to arrive under an improvised key.
 */
export const BOOKING_FUNNEL_PROP_KEYS = [
  'flowId',        // stable per-attempt id, anonymous (see newFlowId)
  'tutorId',       // WHICH expert the attempt targeted — without it a funnel row
                   // cannot be tied to a profile, so an expert can never be told
                   // „N people started booking you". Not personal data: it is the
                   // public TutorProfile id already present in the page URL.
  'preloaded',     // profile handed the payload over vs the sheet self-fetched
  'prefilledTime', // arrived with a start already chosen (inline availability)
  'prefilledService', // arrived with a tier already chosen (services section)
  'tierCount',     // how many services the expert offers (0/1 → no tier step)
  'durationMin',   // length actually being booked
  'priceGel',      // flat price of the chosen service
  'leadDays',      // whole days between "now" and the chosen start
  'notesLen',      // CHARACTER COUNT of the intake — never the intake
  'topicCustom',   // topic came from ?topic= rather than the preset list
  'hasWindows',    // expert published availability at all (vs none)
  'code',          // server error code on the failure terminal
] as const

export type BookingFunnelPropKey = typeof BOOKING_FUNNEL_PROP_KEYS[number]

/** Public TutorProfile id (cuid). Constrained so this key can't smuggle text. */
export const TUTOR_ID_RE = /^[a-z0-9]{20,32}$/

/** Scalars only — no nesting, no arrays. Keeps the JSONB row small and boring. */
export type BookingFunnelProps = Partial<Record<BookingFunnelPropKey, string | number | boolean>>

/** Hard caps the route enforces; exported so the test asserts the same numbers. */
export const MAX_PROP_KEYS = 16
export const MAX_PROP_STRING = 64
export const MAX_BODY_CHARS = 2000
/** flowId shape: lowercase alphanumeric, long enough to be unique, short enough to be cheap. */
export const FLOW_ID_RE = /^[a-z0-9]{8,32}$/
/** Error codes are SCREAMING_SNAKE server constants — nothing free-form. */
export const CODE_RE = /^[A-Za-z0-9_]{1,40}$/

/**
 * A per-attempt id so the steps of ONE booking attempt can be stitched
 * together. Deliberately NOT persisted (no cookie, no localStorage) and not
 * derived from anything about the person: it is born when the sheet opens and
 * dies when it closes, which is exactly the lifetime of the thing we measure.
 */
export function newFlowId(): string {
  try {
    const c = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined
    if (c?.getRandomValues) {
      const b = new Uint8Array(8)
      c.getRandomValues(b)
      return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    // fall through to the Math.random path
  }
  return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 16)
}

/**
 * Fire-and-forget. NEVER awaited, never throws, never on the render path.
 * `keepalive` so an event fired immediately before a navigation (the 401 →
 * /signin bounce, „მიწერე ექსპერტს") still leaves the tab.
 */
export function trackFunnel(name: BookingFunnelEvent, props: BookingFunnelProps): void {
  if (typeof window === 'undefined') return
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, props }),
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {})
  } catch {
    // Analytics may never break a booking.
  }
}

/** Whole days from now to `start` — a coarse, non-identifying planning signal. */
export function leadDays(start: Date, now: number = Date.now()): number {
  return Math.max(0, Math.round((start.getTime() - now) / 86_400_000))
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Server-side validation, kept HERE (not in the route) for two reasons:
 *  1. Next only permits the HTTP-handler exports from a `route.ts`, so a pure
 *     helper exported from there would fail the route type-check;
 *  2. it makes the allow-list, the caps and the reject path unit-testable with
 *     no server, no DB and no dev server — see tests/bookingFunnelEvents.test.ts.
 * ────────────────────────────────────────────────────────────────────────── */

export type ParsedEvent =
  | { ok: true; name: BookingFunnelEvent; props: Record<string, string | number | boolean> }
  | { ok: false; reason: string }

// The allow-lists are the UNION of both browser-emitted funnels. The apply
// funnel (app/apply/applyFunnelEvents.ts) follows exactly the same discipline —
// fixed names, allow-listed scalar prop keys, no free text — so it shares this
// one validator rather than growing a second, drift-prone copy of it.
// Constants only: that module has no dependencies of its own.
// The help widget posts through this same route, so its names and prop keys
// have to be here too — an event not on the allow-list is rejected with 400 and
// the widget's instrumentation would be silently dead. Imported rather than
// re-typed so a renamed event cannot pass here and fail at the writer.
const NAME_SET: ReadonlySet<string> = new Set<string>([
  ...BOOKING_FUNNEL_EVENT_NAMES,
  ...APPLY_FUNNEL_EVENT_NAMES,
  ...HELP_EVENT_NAMES,
  // The request wizard (app/request/requestFunnelEvents) — fourth funnel, same
  // discipline: fixed names, allow-listed scalar keys, no free text.
  ...REQUEST_FUNNEL_EVENT_NAMES,
])

/**
 * The help widget is NOT a funnel: it has no attempt to stitch, so it sends no
 * `flowId`. The blanket „every event carries a flowId" rule below therefore
 * 400'd all three of its events — and because the beacon is fire-and-forget,
 * nothing surfaced and not one help row was ever written. The requirement is a
 * booking/apply-funnel invariant, so it is scoped to those funnels rather than
 * dropped: a booking event without a flowId is still useless and still refused.
 */
const HELP_NAME_SET: ReadonlySet<string> = new Set<string>(HELP_EVENT_NAMES)
const KEY_SET: ReadonlySet<string> = new Set<string>([
  ...BOOKING_FUNNEL_PROP_KEYS,
  ...APPLY_FUNNEL_PROP_KEYS,
  ...REQUEST_FUNNEL_PROP_KEYS,
  // help widget: which page it was opened from, which question, how many
  // answers were read before giving up — and `text`, the one exception below.
  'route', 'q', 'seen', 'text',
])

/**
 * ⚠️ THE ONE HOLE IN THE FREE-TEXT FIREWALL, AND WHY IT IS HERE.
 *
 * Everything else in this file exists to make it structurally impossible for
 * words a user typed to reach the database. `text` breaks that, on purpose,
 * for exactly one event: `help_unanswered` — a question somebody typed into
 * the help widget that our local matcher had no answer for.
 *
 * The reason it is worth the exception: that list IS the backlog of answers to
 * write, and it is the only signal here that cannot be reconstructed from
 * counts. „14 unanswered questions on the booking page" tells you nothing;
 * „nine of them ask whether the expert sees their phone number" is a page to
 * fix and an answer to add. Every other prop in this file is a fact precisely
 * because the fact was enough — here it is not.
 *
 * What keeps the hole small, all of it enforced rather than promised:
 *   · ONE event name. `text` on any other event is a 400 (pinned by a test).
 *   · Redacted in the browser BEFORE sending — emails, phone-shaped digit runs,
 *     long numbers and URLs are replaced (lib/helpSearch#redactQuery).
 *   · Capped at 120 chars, so a pasted document cannot arrive through it.
 *   · Recorded ONLY when we failed. An answered question is not kept at all.
 *   · Disclosed in the widget itself, under the input, in plain Georgian.
 *   · Pruned with everything else at 90 days (lib/events EVENT_RETENTION_DAYS).
 *
 * Do not widen this to a second event name without an equally concrete reason.
 */
const TEXT_EVENT: string = HELP_EVENTS.unanswered
/** Matches the browser-side cap in lib/helpSearch#MAX_QUERY_CHARS. */
export const MAX_TEXT_PROP = 120

/**
 * Turn an untrusted request body into a row we are willing to write, or a
 * reason to answer 400. Rejects — never coerces, never truncates-and-accepts:
 * a silently trimmed event is a lie in the funnel.
 */
export function parseEventBody(raw: unknown): ParsedEvent {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'BODY' }
  const body = raw as Record<string, unknown>

  const name = body.name
  if (typeof name !== 'string' || !NAME_SET.has(name)) return { ok: false, reason: 'NAME' }

  const rawProps = body.props === undefined ? {} : body.props
  if (rawProps === null || typeof rawProps !== 'object' || Array.isArray(rawProps)) {
    return { ok: false, reason: 'PROPS' }
  }
  const entries = Object.entries(rawProps as Record<string, unknown>)
  if (entries.length > MAX_PROP_KEYS) return { ok: false, reason: 'PROPS_TOO_MANY' }

  const props: Record<string, string | number | boolean> = {}
  for (const [k, v] of entries) {
    if (!KEY_SET.has(k)) return { ok: false, reason: `PROP_KEY:${k.slice(0, 24)}` }
    if (typeof v === 'boolean') { props[k] = v; continue }
    if (typeof v === 'number') {
      // No NaN/Infinity (unserialisable), no absurd magnitudes.
      if (!Number.isFinite(v) || Math.abs(v) > 1e9) return { ok: false, reason: `PROP_NUM:${k}` }
      props[k] = v
      continue
    }
    if (typeof v === 'string') {
      // The documented exception (TEXT_EVENT above): a typed question that we
      // failed to answer, on that ONE event, under its own longer cap. Checked
      // FIRST so the generic 64-char string cap does not reject it, and scoped
      // to the name so `text` on anything else falls through to the refusal.
      if (k === 'text' && name === TEXT_EVENT) {
        const t = v.trim()
        if (!t || t.length > MAX_TEXT_PROP) return { ok: false, reason: 'PROP_TEXT' }
        props[k] = t
        continue
      }
      if (v.length > MAX_PROP_STRING) return { ok: false, reason: `PROP_LEN:${k}` }
      // The only two string props are structurally constrained. Anything else
      // string-typed is refused outright — that is the free-text firewall.
      if (k === 'flowId' && FLOW_ID_RE.test(v)) { props[k] = v; continue }
      if (k === 'code' && CODE_RE.test(v)) { props[k] = v; continue }
      // Same firewall shape as the two above: a structurally-constrained id, so
      // free text still cannot reach the column through this key.
      if (k === 'tutorId' && TUTOR_ID_RE.test(v)) { props[k] = v; continue }
      // Help widget. Both are structurally constrained exactly like the three
      // above, so the firewall shape is unchanged — string props are allowed
      // only where the legal values are a closed set or a strict shape:
      //   route → a lowercase pathname, normalised by lib/helpTopics before it
      //           is sent (never a full URL, never a query string);
      //   q     → an ID we ship, checked against the actual topic list, so a
      //           browser cannot put a word of its own in the column.
      if (k === 'route' && HELP_ROUTE_RE.test(v)) { props[k] = v; continue }
      if (k === 'q' && HELP_TOPIC_IDS.has(v)) { props[k] = v; continue }
      // Request wizard: three vocabulary slugs (lib/requestTopics ids). Same
      // firewall shape — a strict pattern, so free text cannot ride these keys.
      if ((k === 'kind' || k === 'topic' || k === 'band') && REQUEST_SLUG_RE.test(v)) { props[k] = v; continue }
      return { ok: false, reason: `PROP_STR:${k}` }
    }
    // objects, arrays, null, undefined, functions → out.
    return { ok: false, reason: `PROP_TYPE:${k}` }
  }

  // Without a flowId a FUNNEL row cannot be stitched to an attempt, which is
  // the entire point of that instrumentation. Help events have no attempt (see
  // HELP_NAME_SET above) and are exempt — every other name still must carry one.
  if (!HELP_NAME_SET.has(name) && typeof props.flowId !== 'string') {
    return { ok: false, reason: 'FLOW_ID' }
  }

  return { ok: true, name: name as BookingFunnelEvent, props }
}
