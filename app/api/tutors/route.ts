import { NextResponse, after } from 'next/server'
import { queryTutors } from '@/lib/tutorsQuery'
import { EVENTS, normalizeQuery, track } from '@/lib/events'

// Thin wrapper over the shared queryTutors() (lib/tutorsQuery) — the SAME
// function the server-rendered /tutors page calls for its initial list, so the
// SSR seed and every client refetch share one query + one output shape. This
// route only parses searchParams; the query/shaping logic lives in the lib.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  // Validate instead of silently defaulting: limit=abc used to become 40 while
  // the route's own literal default is 200 (two different rosters for one
  // request shape), and limit=-5 clamped to a single row. Garbage → 400.
  const rawLimit = new URL(req.url).searchParams.get('limit')
  if (rawLimit !== null && (!/^\d{1,6}$/.test(rawLimit) || Number(rawLimit) < 1)) {
    return NextResponse.json({ ok: false, error: 'BAD_LIMIT' }, { status: 400 })
  }
  const rawQ = new URL(req.url).searchParams.get('q')
  if (rawQ !== null && rawQ.length > 200) {
    return NextResponse.json({ ok: false, error: 'BAD_QUERY' }, { status: 400 })
  }
  const typeParam = searchParams.get('type')
  const serviceType =
    typeParam === 'CONSULTATION' || typeParam === 'RECURRING' ? typeParam : null
  const category = searchParams.get('category')
  const onlyFeatured = searchParams.get('featured') === '1'

  const shaped = await queryTutors({
    q: searchParams.get('q'),
    category,
    serviceType,
    onlyFeatured,
    limit: Number(searchParams.get('limit') ?? 200),
  })

  /* ── Instrumentation: what people search for, and what they DON'T find ──
   *
   * A search that returns zero experts is the single most valuable signal this
   * marketplace produces — it names, in the visitor's own words, the expert we
   * are missing — and until now it evaporated: the visitor saw an empty state
   * and left.
   *
   * SERVER-SIDE on purpose. A client beacon would cost a round-trip, add a
   * public write endpoint to rate-limit, and be silently dropped by every ad
   * blocker — i.e. it would under-count exactly the visitors who bounce.
   *
   * The non-zero `search` event is recorded too, and it is not decoration: a
   * zero-result COUNT is meaningless without the denominator. Same single
   * INSERT either way, so it costs one row per search, not two.
   *
   * `after()` runs this once the response is already flushed — nothing here
   * touches the browse latency, and track() cannot throw (lib/events).
   *
   * NOT recorded: who searched. Resolving the session would mean a cookie +
   * DB lookup on a hot public endpoint to learn something the zero-result
   * signal doesn't need. `userId` stays null here by design.
   */
  const q = normalizeQuery(searchParams.get('q'))
  if (q) {
    const n = shaped.length
    after(() =>
      track(n === 0 ? EVENTS.SEARCH_ZERO : EVENTS.SEARCH, {
        q,
        n,
        // Undefined keys are omitted by boundProps, so an unfiltered search
        // writes the small `{q, n}` row and nothing else.
        category: category || undefined,
        type: serviceType || undefined,
        featured: onlyFeatured || undefined,
      }),
    )
  }

  return NextResponse.json(shaped)
}
