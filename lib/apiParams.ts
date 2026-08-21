// Shared query-param parsing for the paginated admin list routes.
//
// WHY THIS EXISTS. Six routes each carried their own copy of
//
//     const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
//
// and every one of them had the same two holes. `?limit=abc` → `Number('abc')`
// is `NaN`, `Math.min(NaN, 200)` is `NaN`, and Prisma receives `take: NaN` and
// throws — a 500 where a clamp was intended. `?limit=-5` sailed through the
// upper clamp untouched and asked Postgres for a negative page. Neither is
// reachable from our own UI, which is exactly why it survived: nothing that
// ever ran hit it.
//
// `app/api/tutors/route.ts` (the PUBLIC list) already got this right and 400s on
// a malformed limit. These are admin-only, so the friendlier behaviour is to
// clamp to the default rather than fail the whole panel over a typo'd URL —
// but the parsing has to be one function either way, or the next route to be
// added copies the broken line again.

/** How a route describes its own page size. */
type LimitSpec = {
  /** Used when `?limit=` is absent, empty, or unparseable. */
  fallback: number
  /** Hard ceiling; a larger request is clamped down to it. */
  max: number
}

/**
 * A safe `take` from `?limit=`.
 *
 * Guarantees an integer in `[1, max]` for EVERY input — including `null`,
 * `''`, `'abc'`, `'-5'`, `'1e999'`, `'3.7'` and `'NaN'`. Anything that is not a
 * finite number ≥ 1 falls back to `spec.fallback`; a valid number is floored
 * and clamped. There is no input for which this returns `NaN`.
 */
export function parseLimit(raw: string | null | undefined, spec: LimitSpec): number {
  const n = Number(raw)
  // `Number('')` is 0 and `Number(null)` is 0, so the emptiness cases fall out
  // of the `< 1` test rather than needing their own branch.
  if (!Number.isFinite(n) || n < 1) return spec.fallback
  return Math.min(Math.floor(n), spec.max)
}

/**
 * A bounded integer from any numeric query param — the same guarantees as
 * `parseLimit`, for filters rather than page sizes (e.g. `?maxRating=`).
 * Out-of-range values are CLAMPED, not rejected, and garbage falls back.
 */
export function parseIntParam(
  raw: string | null | undefined,
  { fallback, min, max }: { fallback: number; min: number; max: number },
): number {
  // ABSENT must be distinguished from out-of-range here, unlike in parseLimit.
  // `Number(null)` and `Number('')` are both 0 — finite — so a missing param
  // would clamp to `min` instead of falling back. For `?maxRating=` that turned
  // „no filter" into „only 1-star reviews", which is a wrong answer rather than
  // an error: the admin sees an almost-empty list and no sign anything is off.
  if (raw == null || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), min), max)
}
