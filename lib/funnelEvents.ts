// FUNNEL INSTRUMENTATION — the CONTRACT shared by the browser and the server
// (app/api/events/route.ts).
//
// ⚠️ IT WAS `components/booking/funnelEvents.ts` AND ITS OWN HALF WAS THE
// BOOKING FUNNEL (2026-08-24). Six event names — sheet opened, tier chosen,
// time chosen, details submitted, created, failed — plus the props that only a
// booking has (`tutorId`, `durationMin`, `leadDays`, `tierCount`,
// `prefilledTime`). The product went; the file stayed, because two OTHER
// funnels were always parsed through it: the request wizard's and the help
// widget's. It lives in lib/ now, where a contract shared by three surfaces
// belongs.
//
// WHY the names are not in `lib/events.ts`: that is the SERVER writer — it
// imports `@/lib/prisma` and `@/lib/dbBoot`, so a `'use client'` component
// importing it would drag PrismaClient into the browser bundle. The names a
// BROWSER may send therefore live in this plain, dependency-free module that
// both the client components and the route import. The route re-checks every
// name against the allow-list before anything reaches lib/events' `track()`, so
// the browser can never mint a row name.
//
// This module is the outer, stricter gate; lib/events' own boundProps() is the
// inner one. Bounds here are deliberately tighter than its PROPS_* caps.
//
// Discipline for anyone extending this:
//   • names are added HERE, never typed inline at a call site;
//   • props carry FACTS, never words the user wrote. The topic/notes are a
//     person describing a personal problem — a length or a boolean is a funnel
//     signal, the text itself is not ours to log.

import { REQUEST_FUNNEL_EVENT_NAMES, REQUEST_FUNNEL_PROP_KEYS, REQUEST_SLUG_RE } from '@/app/request/requestFunnelEvents'
import { HELP_EVENT_NAMES, HELP_EVENTS, HELP_ROUTE_RE, HELP_TOPIC_IDS } from '@/lib/helpTopics'

/** Any name on the allow-list below. It was a union of the booking funnel's six
 *  literals; the surviving funnels own their own literal types, so what this
 *  module needs is only „a name that passed the gate". */
export type FunnelEvent = string

/** ⚠️ THE BOOKING NAMES ARE GONE (2026-08-24) — `BOOKING_FUNNEL_EVENTS` held
 *  six of them and nothing emits any. The two surviving funnels declare their
 *  own names next to themselves (app/request/requestFunnelEvents, lib/helpTopics)
 *  and this file is what admits them. */
export const FUNNEL_EVENTS = {} as const
export const FUNNEL_EVENT_NAMES: readonly string[] = Object.values(FUNNEL_EVENTS)

/**
 * Every prop key the funnel may send. Anything else is a 400 — an allow-list
 * (rather than a size cap alone) is what makes it structurally impossible for
 * free text to arrive under an improvised key.
 */
export const FUNNEL_PROP_KEYS = [
  'flowId',        // stable per-attempt id, anonymous (see newFlowId)
  'notesLen',      // CHARACTER COUNT of a description — never the description
  'code',          // server error code on a failure terminal
  // ⚠️ TEN BOOKING KEYS LEFT THIS LIST ON 2026-08-24 — `tutorId`, `preloaded`,
  // `prefilledTime`, `prefilledService`, `tierCount`, `durationMin`,
  // `priceGel`, `leadDays`, `topicCustom`, `hasWindows` — with the regex that
  // constrained the first of them. Every one described a booking sheet. The
  // request wizard's and the help widget's own keys are declared beside those
  // funnels and folded into KEY_SET below.
] as const

type FunnelPropKey = typeof FUNNEL_PROP_KEYS[number]

/** Scalars only — no nesting, no arrays. Keeps the JSONB row small and boring. */
type FunnelProps = Partial<Record<FunnelPropKey, string | number | boolean>>

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
export function trackFunnel(name: FunnelEvent, props: FunnelProps): void {
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
    // Analytics may never break the thing it is measuring.
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
 * Server-side validation, kept HERE (not in the route) for two reasons:
 *  1. Next only permits the HTTP-handler exports from a `route.ts`, so a pure
 *     helper exported from there would fail the route type-check;
 *  2. it makes the allow-list, the caps and the reject path unit-testable with
 *     no server, no DB and no dev server.
 * ────────────────────────────────────────────────────────────────────────── */

type ParsedEvent =
  | { ok: true; name: FunnelEvent; props: Record<string, string | number | boolean> }
  | { ok: false; reason: string }

// The allow-lists are the UNION of every browser-emitted funnel. Each follows
// the same discipline — fixed names, allow-listed scalar prop keys, no free
// text — so they share this one validator rather than growing a second,
// drift-prone copy of it.
// The help widget posts through this same route, so its names and prop keys
// have to be here too — an event not on the allow-list is rejected with 400 and
// the widget's instrumentation would be silently dead. Imported rather than
// re-typed so a renamed event cannot pass here and fail at the writer.
const NAME_SET: ReadonlySet<string> = new Set<string>([
  ...FUNNEL_EVENT_NAMES,
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
 * funnel invariant, so it is scoped to those funnels rather than dropped: a
 * wizard event without a flowId is still useless and still refused.
 */
const HELP_NAME_SET: ReadonlySet<string> = new Set<string>(HELP_EVENT_NAMES)
const KEY_SET: ReadonlySet<string> = new Set<string>([
  ...FUNNEL_PROP_KEYS,
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
const MAX_TEXT_PROP = 120

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

  return { ok: true, name: name as FunnelEvent, props }
}
