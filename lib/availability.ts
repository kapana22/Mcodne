// Availability math — stored rows are WINDOWS, never tickets.
//
// WHY THIS EXISTS (do not reintroduce pre-slicing):
// `AvailabilitySlot` rows have historically been PRE-SLICED into fixed pieces
// sized by the expert's single profile-level `consultationDurationMin`
// (15/30/60), and a booking claimed exactly ONE covering row by flipping
// `booked = true`. That model breaks the moment individual services
// (`Consultation.minutes`, 5–240) carry their own lengths:
//   • service LONGER than a row → a 60-min booking occupies an hour but consumes
//     only the first 30-min row; the next row still reads `booked = false` and is
//     advertised to students, yet the real booking-overlap guard rejects it. We
//     sell times that cannot be booked.
//   • service SHORTER than a row → a 15-min booking eats a whole 60-min row and
//     throws away 45 minutes of inventory.
// So a stored row is a WINDOW of availability. Bookable starts are derived at
// request time: windows − existing bookings − the required service length
// (+ buffer). `mergeIntervals` fusing exactly-touching rows is what silently
// repairs the legacy data — six consecutive 30-min rows become one 3-hour
// window, so a 60-min service becomes bookable across them with NO migration.
//
// Pure and timezone-agnostic: absolute instants only (never `getHours()`), no
// React/Prisma/I/O, no module-level `Date.now()` — everything time-dependent
// flows through `now`. Callers own the display timezone (see lib/tz.ts).

/* ───── Types ───── */

export type Interval = { start: Date; end: Date }

export type OpenStartsOpts = {
  windows: Interval[]        // raw availability rows as stored (may be legacy pre-sliced)
  busy: Interval[]           // active bookings as [startAt, startAt + durationMin)
  serviceMin: number         // length of the service being booked
  bufferMin?: number         // required gap around a session (default 0)
  granularityMin?: number    // start-time grid (default 15)
  leadMin?: number           // minimum notice from `now` (default 0)
  now?: Date                 // default new Date()
  limit?: number             // max starts returned (default 500)
}

/* ───── Internals ───── */

const MINUTE = 60_000
const DEFAULT_GRANULARITY_MIN = 15
const DEFAULT_LIMIT = 500
const MAX_LIMIT = 5_000        // response-size ceiling
const MAX_CANDIDATES = 20_000  // fuse: a year-long window must not mint a million Dates

type Span = [start: number, end: number]

// Millisecond bounds of an interval, or null when the row is unusable
// (missing/invalid Date, NaN time, or non-positive length).
function bounds(iv: Interval): Span | null {
  const s = iv && iv.start instanceof Date ? iv.start.getTime() : NaN
  const e = iv && iv.end instanceof Date ? iv.end.getTime() : NaN
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
  return [s, e]
}

const toSpans = (items: Interval[]): Span[] => {
  const out: Span[] = []
  if (!Array.isArray(items)) return out
  for (const iv of items) { const b = bounds(iv); if (b) out.push(b) }
  return out
}

const toIntervals = (spans: Span[]): Interval[] =>
  spans.map(([s, e]) => ({ start: new Date(s), end: new Date(e) }))

// Sort + merge in ms space. Touching (`a.end === b.start`) counts as one span —
// that is the legacy-repair rule the whole module rests on.
function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const out: Span[] = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) { if (e > last[1]) last[1] = e }
    else out.push([s, e])
  }
  return out
}

/* ───── Interval algebra ───── */

/** Sorted, with overlapping AND exactly-touching intervals merged into one. */
export function mergeIntervals(items: Interval[]): Interval[] {
  return toIntervals(mergeSpans(toSpans(items)))
}

/** windows minus busy, returning the remaining free intervals (sorted, merged). */
export function subtractIntervals(windows: Interval[], busy: Interval[]): Interval[] {
  const open = mergeSpans(toSpans(windows))
  const cuts = mergeSpans(toSpans(busy))
  const out: Span[] = []
  for (const [ws, we] of open) {
    let cursor = ws
    for (const [bs, be] of cuts) {
      if (be <= cursor) continue   // cut is entirely behind us
      if (bs >= we) break          // cuts are sorted — the rest are past this window
      if (bs > cursor) out.push([cursor, Math.min(bs, we)])
      cursor = Math.max(cursor, be)
      if (cursor >= we) break
    }
    if (cursor < we) out.push([cursor, we])
  }
  return toIntervals(out)
}

/* ───── Open-start derivation ─────
 * ONE predicate (`isOpenAt`) decides everything; `computeOpenStarts` only
 * enumerates candidates and `isStartOpen` only converts a Date — so the two
 * public entry points can never drift apart. A start S is open iff:
 *   (a) [S, S+service) fits entirely inside ONE merged window, on that window's
 *       own granularity grid (10:00–13:00 @15 → 10:00, 10:15, …; NOT anchored
 *       to midnight);
 *   (b) [S, S+service) overlaps no busy interval — the buffer is implemented by
 *       expanding every busy interval by bufferMin on BOTH sides, which is the
 *       whole buffer feature; and
 *   (c) S >= now + leadMin.
 * (a)+(b) are set-equivalent to "the session fits inside one interval of
 * subtractIntervals(windows, expandedBusy)"; we keep the window explicit because
 * the grid is anchored to the WINDOW start, not to the free region. */

type Prepared = {
  ok: boolean       // false → serviceMin unusable, nothing can ever be open
  windows: Span[]   // merged availability
  blocked: Span[]   // merged, buffer-expanded busy
  serviceMs: number
  stepMs: number
  earliest: number  // now + leadMin
  limit: number
}

const finite = (v: number | undefined, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

// Normalize the options once. Every bad input degrades to a sane default rather
// than throwing — this runs on user-supplied query params.
function prepare(o: OpenStartsOpts): Prepared {
  const serviceMin = finite(o?.serviceMin, NaN)
  const bufferMs = Math.max(0, finite(o?.bufferMin, 0)) * MINUTE
  const granMin = finite(o?.granularityMin, DEFAULT_GRANULARITY_MIN)
  const stepMs = (granMin > 0 ? granMin : DEFAULT_GRANULARITY_MIN) * MINUTE
  const leadMs = Math.max(0, finite(o?.leadMin, 0)) * MINUTE
  const nowMs = o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? o.now.getTime() : Date.now()

  // Buffer = fatter busy intervals; merging afterwards fuses sessions whose
  // buffers now touch, so a start can't sneak into the gap between them.
  const blocked = mergeSpans(toSpans(o?.busy ?? []).map(([s, e]): Span => [s - bufferMs, e + bufferMs]))

  return {
    ok: Number.isFinite(serviceMin) && serviceMin > 0,
    windows: mergeSpans(toSpans(o?.windows ?? [])),
    blocked,
    serviceMs: serviceMin * MINUTE,
    stepMs,
    earliest: nowMs + leadMs,
    limit: Math.max(0, Math.min(MAX_LIMIT, Math.floor(finite(o?.limit, DEFAULT_LIMIT)))),
  }
}

// The single rule. `limit` is deliberately NOT consulted here — it caps the size
// of an enumeration response, it is not part of "is this instant bookable".
function isOpenAt(startMs: number, p: Prepared): boolean {
  if (!p.ok || !Number.isFinite(startMs)) return false
  if (startMs < p.earliest) return false                                    // (c)
  const endMs = startMs + p.serviceMs
  const inWindow = p.windows.some(([ws, we]) =>
    ws <= startMs && endMs <= we && (startMs - ws) % p.stepMs === 0)        // (a)
  if (!inWindow) return false
  for (const [bs, be] of p.blocked) {                                       // (b)
    if (bs >= endMs) break                                                  // sorted — rest are later
    if (be > startMs) return false
  }
  return true
}

/** Bookable start instants, ascending. */
export function computeOpenStarts(o: OpenStartsOpts): Date[] {
  const p = prepare(o)
  const out: Date[] = []
  if (!p.ok || p.limit === 0) return out

  let scanned = 0
  for (const [ws, we] of p.windows) {
    const lastStart = we - p.serviceMs
    if (lastStart < ws) continue                                  // service longer than the window
    // Jump straight to the first grid tick at/after the lead-time floor instead
    // of walking a window that may start weeks in the past.
    const t0 = p.earliest > ws ? ws + Math.ceil((p.earliest - ws) / p.stepMs) * p.stepMs : ws
    for (let t = t0; t <= lastStart; t += p.stepMs) {
      if (++scanned > MAX_CANDIDATES) return out                   // pathological input — bail with what we have
      if (isOpenAt(t, p)) {
        out.push(new Date(t))
        if (out.length >= p.limit) return out
      }
    }
  }
  return out
}

/** Server-side check for one exact instant. Must agree with computeOpenStarts. */
export function isStartOpen(start: Date, o: OpenStartsOpts): boolean {
  return isOpenAt(start instanceof Date ? start.getTime() : NaN, prepare(o))
}
