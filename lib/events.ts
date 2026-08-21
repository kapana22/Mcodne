import { createHash, randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'

/* ═══════════════════ Product instrumentation (server-side) ═══════════════════
 *
 * ONE append-only table ("Event", created idempotently in lib/dbBoot) and ONE
 * function: track(). The point is to be able to answer „what do people look for
 * and not find?" — GA counts pageviews, which cannot answer that.
 *
 * FOUR HARD RULES, in priority order. Analytics is the least important thing in
 * any request it rides along with:
 *
 *   1. NEVER THROWS. Every path here is wrapped; a broken/absent Event table,
 *      a dead DB, an unserialisable prop — all degrade to a console line. A
 *      request must never 500 because a counter failed to increment.
 *   2. NEVER BLOCKS. track() awaits a DB write, so callers MUST invoke it
 *      inside `after()` (next/server) — the response is already flushed by
 *      then. Nothing here belongs on a request's critical path.
 *   3. BOUNDED. `name` is capped, `props` is capped per-string, per-key-count
 *      and in total serialised bytes, and the raw user query is normalised +
 *      capped before it is ever stored. An analytics table is the easiest
 *      place in a codebase to accidentally store an unbounded blob.
 *   4. NO PII. The only identifier stored is `userId` (already ours). No IP, no
 *      user-agent, no email, no name. Free text that the user typed is the one
 *      thing we DO keep — that is the whole signal — so normalizeQuery()
 *      redacts the two shapes that could smuggle an identity into it
 *      (e-mail-like tokens and long digit runs).
 *
 * The event-name constants live here so producer and reader can't drift: the
 * admin panel reads by these exact strings.
 */

/** Canonical event names. Never write a bare string at a call site. */
export const EVENTS = {
  /** A browse search that returned ≥1 expert. Props: { q, n, category?, … } */
  SEARCH: 'search',
  /**
   * A browse search that returned NOTHING. The highest-value signal on the
   * marketplace: it names the expert we are missing. Same props as SEARCH
   * (n is always 0), so the two divide into a zero-result RATE.
   */
  SEARCH_ZERO: 'search_zero',
  /**
   * An expert's public profile payload was served to a real, human, non-owner
   * viewer. Props: `{ tutorId, signedIn }`.
   *
   * This is the ONE number an approved expert has no other way to learn: „did
   * anybody look at me?". Without it, „nobody has seen you" and „people see you
   * and don't book" are indistinguishable — and they have opposite fixes.
   *
   * Deliberately EXCLUDED from the count (see countsAsProfileView): the expert
   * viewing their own profile, ADMIN, and anything whose user-agent looks
   * automated. A crawler that hits every profile would make the number a lie,
   * and an expert refreshing their own page would make it a flattering one.
   */
  PROFILE_VIEW: 'profile_view',
} as const

type EventName = (typeof EVENTS)[keyof typeof EVENTS]

/* ───── bounds (exported so tests and readers pin the same numbers) ───── */

export const NAME_MAX = 64
export const PROPS_JSON_MAX = 2000
export const PROPS_MAX_KEYS = 24
export const PROPS_KEY_MAX = 40
export const PROPS_STRING_MAX = 200
export const PROPS_ARRAY_MAX = 20
/** Longest search string we store. Anything past this is padding, not intent. */
export const QUERY_MAX = 120
/** Shorter than this is a keystroke, not a query — never recorded. */
export const QUERY_MIN = 2
/** Rows older than this are prunable. See pruneEvents() / EVENT_PRUNE_SQL. */
export const EVENT_RETENTION_DAYS = 90

/* ───── pure helpers (unit-tested — tests/events.test.ts) ───── */

/**
 * Cap + sanitise an event name. Names are code constants, so anything that
 * isn't a plain non-empty string is a bug at the call site → drop the event
 * rather than write a row nobody can query.
 */
export function normalizeEventName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const n = name.trim().slice(0, NAME_MAX)
  return n.length ? n : null
}

// An e-mail is the one PII shape a search box realistically receives (people
// paste one in the wrong field). A 7+ digit run covers phone/ID numbers. Both
// are removed BEFORE anything else, so neither can survive truncation.
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g
const LONG_DIGITS_RE = /\d{7,}/g
const CONTROL_RE = /[\u0000-\u001f\u007f]/g
const HAS_MEANING_RE = /[\p{L}\p{N}]/u

/**
 * Normalise a raw search string into the value we are willing to store, or
 * null when it isn't worth storing at all.
 *
 * - redacts e-mail-like tokens and long digit runs (rule 4)
 * - strips control characters, collapses whitespace, trims
 * - lowercases so „Marketing" and „marketing" aggregate as one row (a no-op
 *   for Georgian, which has no case — but the box also takes Latin)
 * - caps at QUERY_MAX
 * - returns null for junk: empty, single character, or nothing but punctuation
 */
export function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let s = raw
    .replace(EMAIL_RE, ' ')
    .replace(LONG_DIGITS_RE, ' ')
    .replace(CONTROL_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (s.length > QUERY_MAX) s = s.slice(0, QUERY_MAX).trim()
  if (s.length < QUERY_MIN) return null
  if (!HAS_MEANING_RE.test(s)) return null
  return s
}

/**
 * Serialise `props` to a bounded JSON string. Scalars survive; strings and
 * arrays are clipped; anything else (objects, Dates, class instances) is
 * String()-ed — deliberately, because a nested object is how an analytics
 * column silently becomes a blob store. If the result still exceeds
 * PROPS_JSON_MAX the row keeps a marker instead of the payload, so the event
 * itself (the count) is never lost to a fat prop.
 */
export function boundProps(props?: Record<string, unknown> | null): string {
  try {
    if (!props || typeof props !== 'object' || Array.isArray(props)) return '{}'
    const clip = (v: unknown): unknown => {
      if (typeof v === 'string') return v.slice(0, PROPS_STRING_MAX)
      if (typeof v === 'number') return Number.isFinite(v) ? v : null
      if (typeof v === 'boolean' || v === null) return v
      return String(v).slice(0, PROPS_STRING_MAX)
    }
    const out: Record<string, unknown> = {}
    let keys = 0
    for (const [k, v] of Object.entries(props)) {
      if (keys >= PROPS_MAX_KEYS) break
      // `undefined` is how a call site says "not applicable" — omit the key
      // instead of writing a JSON null that reads as a real value.
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue
      out[String(k).slice(0, PROPS_KEY_MAX)] = Array.isArray(v)
        ? v.slice(0, PROPS_ARRAY_MAX).map(clip)
        : clip(v)
      keys++
    }
    const json = JSON.stringify(out)
    if (typeof json !== 'string') return '{}'
    return json.length <= PROPS_JSON_MAX
      ? json
      : JSON.stringify({ _truncated: true, _bytes: json.length })
  } catch {
    return '{}'
  }
}

/* ───── profile views: who counts ────────────────────────────────────────────
 * A view number is only worth showing an expert if it is TRUE. Three things
 * would make it a lie, so all three are excluded before anything is written:
 *
 *   • the expert looking at their own profile (they check it constantly);
 *   • ADMIN (moderation traffic is not demand);
 *   • automated clients — one crawler sweeping every profile would hand every
 *     expert on the platform the same fake number.
 *
 * The bot check is deliberately a SHORT deny-list on the user-agent, not a
 * detection framework: cheap, no state, no fingerprinting. It errs toward
 * NOT counting (a missing UA is treated as automated), because under-reporting
 * views is honest and over-reporting is exactly the lie we are avoiding.
 */

/** Substrings that mark a user-agent as automated. Lowercase; matched with `includes`. */
export const BOT_UA_MARKERS = [
  'bot',            // googlebot, bingbot, applebot, ahrefsbot, telegrambot, …
  'crawl', 'spider', 'slurp', 'scrapy',
  'headless',       // headlesschrome — puppeteer/playwright/lighthouse runners
  'curl', 'wget', 'python-requests', 'httpx', 'axios', 'okhttp', 'java/',
  'go-http-client', 'node-fetch', 'postman',
  'lighthouse', 'pingdom', 'uptime', 'monitoring',
  'facebookexternalhit', 'preview', 'embedly', 'feedfetcher',
] as const

/**
 * True when the request did not come from a human browser. `null`/empty/
 * non-string user-agent counts as a bot: every real browser sends one, and a
 * request that doesn't is either a script or a probe.
 */
export function isBotUserAgent(ua: unknown): boolean {
  if (typeof ua !== 'string') return true
  const s = ua.trim().toLowerCase()
  if (!s) return true
  return BOT_UA_MARKERS.some(m => s.includes(m))
}

type ProfileViewer = {
  userAgent?: string | null
  /** Signed-in viewer's User.id, or null when anonymous. */
  viewerUserId?: string | null
  viewerRole?: string | null
  /** The User.id BEHIND the expert profile — not the TutorProfile id. */
  tutorUserId?: string | null
}

/**
 * The whole self-view/bot/admin rule in one pure predicate, so the route reads
 * as a single `if` and the rule itself is unit-testable without a request.
 */
export function countsAsProfileView(v: ProfileViewer): boolean {
  if (isBotUserAgent(v.userAgent)) return false
  if (v.viewerRole === 'ADMIN') return false
  // An expert must never inflate their own number by reloading their profile.
  if (v.viewerUserId && v.tutorUserId && v.viewerUserId === v.tutorUserId) return false
  return true
}

/* ───── profile views: counting one visit ONCE ───────────────────────────────
 * /api/tutors/[id] is fetched by the profile page AND (separately) by the
 * booking sheet when it opens without a preloaded payload, and again by the
 * reschedule picker. One human looking at one expert can therefore hit this
 * route several times in a minute. A short in-memory dedupe window collapses
 * those into the single visit they actually are.
 *
 * PRIVACY: the key is a SHA-256 of (tutorId, userId|ip, ua) and lives only in
 * this process's memory for the length of the window — it is never written to
 * the Event table, which still stores nothing but `userId`. Rule 4 holds.
 *
 * PER-INSTANCE + BOUNDED, like lib/rateLimit's store. Worst case on a restart
 * or a second instance is a visit counted twice — i.e. exactly the behaviour
 * we'd have with no dedupe at all, never a dropped-to-zero number.
 */

export const PROFILE_VIEW_DEDUPE_MS = 30 * 60_000
/** Ceiling on the in-memory window. Past it, expired keys go first, then all. */
const PROFILE_VIEW_DEDUPE_MAX = 20_000

const viewWindow = new Map<string, number>()

/**
 * Stable, non-reversible key for „this viewer, this expert". Signed-in viewers
 * key on their user id (stable across devices); anonymous ones on ip+ua, which
 * is coarse on purpose — a shared NAT collapsing two visitors for 30 minutes
 * under-counts, and under-counting is the safe direction.
 */
export function profileViewKey(
  tutorId: string,
  viewerUserId: string | null | undefined,
  ip: string | null | undefined,
  ua: string | null | undefined,
): string {
  const who = viewerUserId ? `u:${viewerUserId}` : `a:${ip ?? 'unknown'}|${ua ?? ''}`
  return createHash('sha256').update(`${tutorId}::${who}`).digest('hex').slice(0, 32)
}

/**
 * True the FIRST time `key` is seen in the current window (and records it);
 * false for every repeat inside PROFILE_VIEW_DEDUPE_MS. `now` is injectable so
 * the window is testable without sleeping.
 */
export function firstViewInWindow(key: string, now: number = Date.now()): boolean {
  const seenAt = viewWindow.get(key)
  if (seenAt !== undefined && now - seenAt < PROFILE_VIEW_DEDUPE_MS) return false
  if (viewWindow.size >= PROFILE_VIEW_DEDUPE_MAX) {
    for (const [k, t] of viewWindow) if (now - t >= PROFILE_VIEW_DEDUPE_MS) viewWindow.delete(k)
    // Still full → drop everything. A cleared window can only ever cause an
    // extra count, never a missing one, and keeps memory flat under a flood.
    if (viewWindow.size >= PROFILE_VIEW_DEDUPE_MAX) viewWindow.clear()
  }
  viewWindow.set(key, now)
  return true
}

/* ───── the one API ───── */

/**
 * Record a product event. Fire-and-forget by contract:
 *
 *     after(() => track(EVENTS.SEARCH_ZERO, { q, n: 0 }))
 *
 * Awaiting it directly in a handler would put a DB write on the response path —
 * don't. Resolves to void in every case, including failure.
 */
export async function track(
  name: string,
  props?: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  try {
    const evName = normalizeEventName(name)
    if (!evName) return
    const payload = boundProps(props)
    // The table is created by lib/dbBoot (no `prisma db push` needed). On a
    // cold process this resolves the same memoised boot promise every other
    // query awaits, so it costs nothing here.
    await ensureDbReady()
    // Raw INSERT on purpose: "Event" is intentionally NOT in schema.prisma —
    // it is a boot-time DDL table, so there is no generated client model.
    // Every value is a bound parameter; the ::casts only tell Postgres the
    // parameter types (an untyped NULL bind can't be inferred otherwise).
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Event" ("id", "name", "userId", "props")
       VALUES ($1::text, $2::text, $3::text, $4::jsonb)`,
      randomUUID(),
      evName,
      userId ?? null,
      payload,
    )
  } catch (err) {
    // Rule 1. A dropped analytics row is never worth a failed request — and it
    // must not be worth a noisy stack either, so only the message is logged.
    console.error('[events] track failed:', err instanceof Error ? err.message : err)
  }
}

/* ───── retention ─────────────────────────────────────────────────────────
 * "Event" is append-only and every browse search writes one row, so it grows
 * without bound unless something trims it. The maintenance sweep
 * (lib/sweepRunner / api/internal/cleanup) is the right owner — it already runs
 * every 15 min and is the one place recurring deletes live. It should call
 * pruneEvents() once per sweep, or run EVENT_PRUNE_SQL directly.
 *
 * The delete is index-backed ("Event_name_at_idx" leads with name, so this is a
 * range scan per name) and idempotent — a second call the same minute deletes
 * nothing. LIMIT-free on purpose: at this volume the daily delta is small, and
 * a partial delete would just be repeated 15 minutes later anyway.
 */
export const EVENT_PRUNE_SQL =
  `DELETE FROM "Event" WHERE "at" < now() - interval '${EVENT_RETENTION_DAYS} days'`

/** Drop events older than EVENT_RETENTION_DAYS. Never throws; returns rows deleted. */
export async function pruneEvents(): Promise<number> {
  try {
    await ensureDbReady()
    return await prisma.$executeRawUnsafe(EVENT_PRUNE_SQL)
  } catch (err) {
    console.error('[events] prune failed:', err instanceof Error ? err.message : err)
    return 0
  }
}
