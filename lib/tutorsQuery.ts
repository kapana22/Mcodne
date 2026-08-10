import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { expandQuery } from '@/lib/searchSynonyms'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'
import { computeOpenStarts } from '@/lib/availability'
import { BROWSABLE_CATEGORY, BROWSABLE_CATEGORY_SQL, categorySlugFilter } from '@/lib/categoryTree'

// Single source of truth for the public expert-list query. Both the JSON API
// (app/api/tutors/route.ts) and the server-rendered /tutors page
// (app/tutors/page.tsx) call this so the initial SSR list and every subsequent
// client refetch share EXACTLY the same shape + ordering. Do not change the
// returned object shape without updating both consumers + the client mapper.

export type TutorsQueryParams = {
  q?: string | null
  category?: string | null
  serviceType?: 'CONSULTATION' | 'RECURRING' | null
  onlyFeatured?: boolean
  limit?: number
}

/* ══════════════ Georgian-aware search (Postgres pg_trgm) ══════════════════
 *
 * WHY `contains` IS THE WRONG TOOL HERE
 * Georgian has no capitalisation but very heavy declension: „კონსულტაცია",
 * „კონსულტაციას", „კონსულტაციის", „კონსულტაციებისთვის" are the same word, and
 * a substring match sees none of them in the others. „მარკეტინგში" found ZERO
 * experts on the live DB while three of them have the specialty „მარკეტინგი".
 * Trigram similarity compares 3-character shingles instead of exact runs, so a
 * changed case ending (or a typo) costs a couple of trigrams instead of the
 * whole match.
 *
 * RANKING RULE — for every (term, field) pair we take
 *     GREATEST( word_similarity(term, field),
 *               1 when field ILIKE %term% ) × Wfield × Wterm
 * and a row's score is the MAX over all pairs. `word_similarity(a, b)` is
 * „the best match of a against any run of whole words in b" — exactly the
 * „does this field MENTION this word (in some form)?" question. Plain
 * `similarity()` would be diluted to ~0 by a 1700-character bio.
 *
 * THRESHOLD 0.45. Worked examples (word_similarity = shared trigrams ÷
 * trigrams of the query, per pg_trgm):
 *     „კონსულტაციას"       vs „კონსულტაცია"  = 11/13 = 0.85
 *     „მარკეტინგის"        vs „მარკეტინგი"   = 10/12 = 0.83
 *     „კონსულტაციებისთვის" vs „კონსულტაცია"  = 10/19 = 0.53
 * i.e. even a four-syllable case ending still clears 0.45, while unrelated
 * words sit far below it (see tests/tutorSearch.test.ts, which reimplements
 * pg_trgm's exact math so these numbers are pinned without a DB).
 *
 * NON-REGRESSION — the ILIKE arm makes this predicate a strict SUPERSET of the
 * old `contains` one: an exact substring hit scores at WORST
 * bio(0.65) × synonym(0.80) = 0.52 > 0.45, so nothing that used to match can
 * stop matching. Keep that inequality true if you retune the weights.
 */
export const SEARCH_SIMILARITY_THRESHOLD = 0.45
/** Synonym-map expansions rank below the term the user actually typed. */
export const SYNONYM_TERM_WEIGHT = 0.8
/** Per-field confidence. A name/specialty hit means more than a bio mention. */
export const SEARCH_FIELD_WEIGHTS = {
  specialty: 1,
  headline: 0.95,
  fullName: 0.9,
  categoryName: 0.85,
  bio: 0.65,
} as const
export type SearchField = keyof typeof SEARCH_FIELD_WEIGHTS
/**
 * Cap on expanded terms. Each term costs 5 word_similarity() calls per candidate
 * row, so this bounds the scan: 8 × 5 = 40 comparisons per expert, worst case.
 */
export const MAX_SEARCH_TERMS = 8

export type SearchTerm = { term: string; weight: number }

/**
 * Normalise a raw user query into the weighted term list both the trigram
 * predicate and the `contains` fallback run on. Pure — unit-tested.
 * The term the user typed always comes first and always carries weight 1.
 */
export function normalizeSearchTerms(q: string): SearchTerm[] {
  const base = q.trim().toLowerCase()
  if (!base) return []
  const seen = new Set<string>()
  const out: SearchTerm[] = []
  // `base` first even though expandQuery() also includes it — order decides
  // which terms survive the MAX_SEARCH_TERMS cap, and the typed one must.
  for (const raw of [base, ...expandQuery(q)]) {
    const term = raw.trim().toLowerCase()
    if (!term || seen.has(term)) continue
    seen.add(term)
    out.push({ term, weight: term === base ? 1 : SYNONYM_TERM_WEIGHT })
    if (out.length >= MAX_SEARCH_TERMS) break
  }
  return out
}

/**
 * The pre-trigram predicate, kept verbatim as the fallback for a database
 * without pg_trgm. Pure — unit-tested against the shape the Prisma `where`
 * expects.
 */
export function buildContainsOr(terms: SearchTerm[]) {
  return terms.flatMap(({ term }) => ([
    { headline:  { contains: term, mode: 'insensitive' as const } },
    { specialty: { contains: term, mode: 'insensitive' as const } },
    { bio:       { contains: term, mode: 'insensitive' as const } },
    { user: { fullName: { contains: term, mode: 'insensitive' as const } } },
    // Also match the category's display name so searching a sphere by its
    // visible label (e.g. „მარკეტინგი") returns that sphere's experts
    // instead of dead-ending on the empty "no match" fallback.
    { category: { name: { contains: term, mode: 'insensitive' as const } } },
  ]))
}

/**
 * Score a single (field, term) pair the way the SQL does. Exported so the test
 * can pin the SQL's arithmetic without a database; the SQL below is the
 * authority and must be edited in lockstep.
 */
export function pairScore(field: SearchField, termWeight: number, wordSimilarity: number, containsHit: boolean) {
  return Math.max(wordSimilarity, containsHit ? 1 : 0) * SEARCH_FIELD_WEIGHTS[field] * termWeight
}

// Column expressions, in the same order as SEARCH_FIELD_WEIGHTS. These are
// LITERALS FROM THIS FILE — the only thing ever spliced with Prisma.raw. Every
// piece of user input below travels as a bound parameter.
const SEARCH_SQL_FIELDS: { key: SearchField; expr: string }[] = [
  { key: 'specialty',    expr: 'tp."specialty"' },
  { key: 'headline',     expr: 'tp."headline"' },
  { key: 'fullName',     expr: 'u."fullName"' },
  { key: 'categoryName', expr: 'c."name"' },
  { key: 'bio',          expr: `COALESCE(tp."bio", '')` },
]

/**
 * Candidate-id + relevance query. Applies only the HARD public-visibility gates
 * (self-pause, admin suspension, live category) — every optional filter
 * (category slug, serviceType, featured) is re-applied by the Prisma findMany
 * that consumes these ids, so this stays one small, cacheable shape.
 */
function searchCandidateSql(terms: SearchTerm[], cap: number): Prisma.Sql {
  const parts: Prisma.Sql[] = []
  for (const { term, weight } of terms) {
    const like = `%${term}%`
    for (const f of SEARCH_SQL_FIELDS) {
      const col = Prisma.raw(f.expr)
      const col2 = Prisma.raw(f.expr)
      parts.push(Prisma.sql`GREATEST(
        word_similarity(${term}::text, ${col}),
        CASE WHEN ${col2} ILIKE ${like}::text THEN 1::real ELSE 0::real END
      ) * ${SEARCH_FIELD_WEIGHTS[f.key] * weight}::float8`)
    }
  }
  return Prisma.sql`
    SELECT s."id", s."score" FROM (
      SELECT tp."id" AS "id", ${Prisma.join(parts, ', ', 'GREATEST(', ')')} AS "score"
        FROM "TutorProfile" tp
        JOIN "User" u ON u."id" = tp."userId"
        LEFT JOIN "Category" c ON c."id" = tp."categoryId"
       WHERE tp."available" = true
         AND u."suspendedAt" IS NULL
         -- Same no-service rule as the Prisma path above. The two MUST agree,
         -- or a search would surface someone the browse list deliberately hides.
         AND EXISTS (SELECT 1 FROM "Consultation" c2 WHERE c2."tutorId" = tp."id")
         -- The visibility rule, from lib/categoryTree — the SQL twin of what
         -- the Prisma path above applies, so a search can never surface
         -- someone the browse list hides, or hide someone it shows.
         AND ${Prisma.raw(BROWSABLE_CATEGORY_SQL)}
    ) s
    WHERE s."score" >= ${SEARCH_SIMILARITY_THRESHOLD}::float8
    ORDER BY s."score" DESC, s."id" ASC
    LIMIT ${cap}
  `
}

// Sticky per-process verdict. pg_trgm is created idempotently by lib/dbBoot at
// boot; if that CREATE EXTENSION was refused (no permission on some managed
// Postgres) the first search throws „function word_similarity does not exist",
// we log ONCE and every later search takes the `contains` path instead. A fresh
// deploy resets the flag and re-attempts the extension, which is the only time
// the answer can change.
let trigramAvailable = true

export async function queryTutors(params: TutorsQueryParams = {}) {
  // A transient boot/DDL failure degrades to a plain query instead of
  // 500ing /tutors — the query itself surfaces any real schema problem.
  await ensureDbReady().catch(() => {})

  const q = params.q?.trim()
  const category = params.category
  const serviceType =
    params.serviceType === 'CONSULTATION' || params.serviceType === 'RECURRING'
      ? params.serviceType
      : null
  const onlyFeatured = params.onlyFeatured ?? false
  // Coerce defensively: a non-numeric ?limit=abc reaches here as NaN, and
  // `?? 40` does NOT catch NaN (it's not null/undefined) → `take: NaN` would
  // reach Prisma. Clamp to [1, 200] with a 40 default. Cap raised 40→200 so
  // category/filter deep-links don't dead-end once there are >40 live experts
  // (the browse fetches the full set and filters client-side). Rows are stripped
  // of heavy blobs (stripTutorBlobs) so 200 small rows stay a light payload.
  const rawLimit = typeof params.limit === 'number' && Number.isFinite(params.limit) ? params.limit : 40
  const limit = Math.min(Math.max(1, rawLimit), 200)

  const where: any = {
    // Tutors can pause their public listing via the visibility toggle on
    // /tutor/profile — hidden tutors don't appear in the browse list.
    // Their /tutors/[id] page still resolves so existing bookings can link
    // back; the detail page renders a "paused" banner instead of the
    // booking flow.
    available: true,
    // Admin-suspended accounts (User.suspendedAt set from the admin panel)
    // must vanish from every public surface — browse, home featured, and the
    // category pages all flow through here. Unlike the self-pause `available`
    // flag above, a suspension fully removes the expert (their /tutors/[id]
    // detail 404s too — see app/tutors/[id]/page.tsx).
    user: { is: { suspendedAt: null } },
    // A profile with ZERO services cannot be booked by ANYONE: the flow has no
    // tier to enumerate and the CTA has nothing to sell. Listing it spends a
    // browse slot on a guaranteed dead end — the 2026-07-29 production audit
    // found exactly such an expert holding the TOP position with 54 free
    // windows and nothing to book. Their /tutors/[id] page still resolves, so
    // deep links keep working, exactly like a self-paused expert; they are
    // simply not advertised. They come back the moment they add a service —
    // lib/expertActivation is what tells them to.
    consultations: { some: {} },
  }
  // Category is a LABEL, not a gate. Filtering by slug still restricts to that
  // sphere, but with no filter an expert whose category is unset stays
  // visible: a taxonomy field must never be able to hide a person (it did,
  // twice). An admin-HIDDEN category DOES still hide them — that is a
  // deliberate action, and the admin panel warns how many experts it affects.
  //
  // Filtering by a sphere also returns the experts of everything folded into
  // it, so „ბიზნესი და ფინანსები" answers for the old „ფინანსები" too. The rule
  // lives in lib/categoryTree, once, in both Prisma and SQL.
  if (category) {
    where.category = categorySlugFilter(category)
  } else {
    where.OR = [{ categoryId: null }, { category: { is: BROWSABLE_CATEGORY } }]
  }
  if (serviceType) where.serviceType = serviceType
  if (onlyFeatured) where.featured = true

  // Relevance score per candidate id — set only when the trigram path ran.
  let scores: Map<string, number> | null = null
  if (q) {
    // Expand the query through the synonym map so colloquial terms
    // ("იურისტი") still hit tutors whose stored specialty is the formal
    // cognate ("სამართალი"). normalizeSearchTerms always includes the term the
    // user typed, first and at full weight.
    const terms = normalizeSearchTerms(q)
    if (terms.length && trigramAvailable) {
      try {
        // Ask for more candidates than we return so the OPTIONAL filters below
        // (category slug / serviceType / featured) can narrow the set without
        // silently truncating the relevance ranking. Bounded at 300.
        const cap = Math.min(limit * 3, 300)
        const rows = await prisma.$queryRaw<{ id: string; score: number }[]>(searchCandidateSql(terms, cap))
        scores = new Map(rows.map(r => [r.id, Number(r.score)]))
      } catch (err) {
        // No pg_trgm on this database → degrade to the pre-trigram behavior
        // rather than 500 a public browse page.
        trigramAvailable = false
        console.error('[tutorsQuery] pg_trgm unavailable — falling back to substring search:', err)
      }
    }
    if (scores) {
      // Empty map = genuinely nothing matched (the trigram predicate is a
      // superset of `contains`), so an empty `in` is the honest answer.
      where.id = { in: Array.from(scores.keys()) }
    } else if (terms.length) {
      const searchOr = buildContainsOr(terms)
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }]
        delete where.OR
      } else {
        where.OR = searchOr
      }
    }
  }

  // Verified experts first, then by rating. With a query present this is only
  // the TIE-BREAK: the rows get re-ordered by relevance below (JS sort is
  // stable, so equal-score experts keep verified→rating order).
  const orderBy = [
    { verified: 'desc' as const },
    { rating: 'desc' as const },
  ]

  let tutors = await prisma.tutorProfile.findMany({
    where,
    // With relevance ranking we must read every candidate before sorting,
    // otherwise Prisma's verified/rating `take` would pick the wrong subset.
    // (scores.size is already bounded by the candidate cap; Math.max keeps
    // `take` a legal positive integer when nothing matched.)
    take: scores ? Math.max(1, scores.size) : limit,
    orderBy,
    // Public endpoint — never send passwordHash or private User columns.
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true, bio: true } },
      category: { select: { id: true, slug: true, name: true, icon: true } },
      // Tier SHAPE only — minutes/price/tier, never the title or description.
      // Pre-tier surfaces (the home card, the browse card) must advertise the
      // FLAGSHIP service, i.e. the longest paid one, and until now they had no
      // way to know it: the payload carried only `consultationDurationMin`, the
      // profile-level default, so a card for an expert whose real offer is a
      // 60-minute consultation read „30-წუთიანი სესია". Three small numbers per
      // tier is a negligible payload next to being wrong on every card.
      consultations: { select: { minutes: true, price: true, tier: true } },
    },
  })

  // Order by relevance when (and only when) there is a query. With no query the
  // ordering is untouched — the curated verified→rating list browse relies on.
  if (scores) {
    const rank = scores
    tutors = [...tutors]
      .sort((a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0))
      .slice(0, limit)
  }

  // Attach each expert's soonest genuinely BOOKABLE start so the listing can
  // signal availability. A published row is a WINDOW, not a ticket: `booked` is
  // meaningless now, so "soonest row with booked = false" advertised times that
  // the booking API then refused. The real answer is windows − active bookings −
  // the service length, i.e. computeOpenStarts (lib/availability).
  const now = new Date()
  const ids = tutors.map(t => t.id)
  // TWO bounded queries total (three when a search query added the relevance
  // pass above), never one per tutor. Each uses a per-tutor
  // row_number cap instead of streaming an expert's whole calendar: this list
  // takes up to 200 experts, and legacy pre-sliced rows can run to hundreds per
  // expert — an uncapped read is exactly the payload blowup this file has been
  // burned by before. PER_TUTOR_ROWS=24 covers half a day of contiguous 30-min
  // legacy rows (far more under the windows model), which is plenty to find the
  // FIRST open start; an expert whose next 24 rows are fully booked simply
  // reports no upcoming time, which is honest enough for a browse hint.
  // Ids and instants are bound as parameters (Prisma.join / ${date}); the only
  // raw interpolation is PER_TUTOR_ROWS, a numeric constant from this file
  // (`rn` is a bigint, and an untyped bind param won't compare against it).
  const PER_TUTOR_ROWS = 24
  const HORIZON_MS = 60 * 24 * 60 * 60 * 1000
  const horizon = new Date(now.getTime() + HORIZON_MS)
  // Reach back one max-length session (240 min) so a window/booking already in
  // progress is still accounted for.
  const since = new Date(now.getTime() - 240 * 60_000)

  const [windowRows, busyRows] = ids.length
    ? await Promise.all([
        prisma.$queryRaw<{ tutorId: string; startAt: Date; endAt: Date }[]>`
          SELECT "tutorId", "startAt", "endAt" FROM (
            SELECT "tutorId", "startAt", "endAt",
                   row_number() OVER (PARTITION BY "tutorId" ORDER BY "startAt" ASC) AS rn
            FROM "AvailabilitySlot"
            WHERE "tutorId" IN (${Prisma.join(ids)})
              AND "endAt" > ${now}
              AND "startAt" < ${horizon}
          ) s WHERE rn <= ${Prisma.raw(String(PER_TUTOR_ROWS))}
        `,
        prisma.$queryRaw<{ tutorId: string; startAt: Date; durationMin: number }[]>`
          SELECT "tutorId", "startAt", "durationMin" FROM (
            SELECT "tutorId", "startAt", "durationMin",
                   row_number() OVER (PARTITION BY "tutorId" ORDER BY "startAt" ASC) AS rn
            FROM "Booking"
            WHERE "tutorId" IN (${Prisma.join(ids)})
              AND "status" IN ('PREPARING', 'CONFIRMED', 'LIVE')
              AND "startAt" >= ${since}
              AND "startAt" < ${horizon}
          ) b WHERE rn <= ${Prisma.raw(String(PER_TUTOR_ROWS))}
        `,
      ])
    : [[], []]

  const windowsByTutor = new Map<string, { start: Date; end: Date }[]>()
  for (const w of windowRows) {
    const list = windowsByTutor.get(w.tutorId) ?? []
    list.push({ start: w.startAt, end: w.endAt })
    windowsByTutor.set(w.tutorId, list)
  }
  const busyByTutor = new Map<string, { start: Date; end: Date }[]>()
  for (const b of busyRows) {
    const list = busyByTutor.get(b.tutorId) ?? []
    list.push({ start: b.startAt, end: new Date(b.startAt.getTime() + b.durationMin * 60_000) })
    busyByTutor.set(b.tutorId, list)
  }

  const nextByTutor = new Map<string, Date>()
  for (const t of tutors) {
    const windows = windowsByTutor.get(t.id)
    if (!windows) continue
    // The expert's DEFAULT session length is the right probe for a browse hint —
    // an individual service's own length is re-derived at booking time.
    const [first] = computeOpenStarts({
      windows,
      busy: busyByTutor.get(t.id) ?? [],
      serviceMin: t.consultationDurationMin,
      bufferMin: t.bufferMin,
      now,
      limit: 1,
    })
    if (first) nextByTutor.set(t.id, first)
  }

  const shaped = tutors.map(t => {
    // Drop the unbounded professionData JSON, legacy base64 video, and any
    // oversized base64 avatar before this list (also SSR-embedded) ships.
    // ALSO drop `responseHours`: it is typed in by the expert themselves, so it
    // must not travel to a public surface where it would read as a measured
    // fact. The card reads `responseMedianMin`/`responseSampleN` instead —
    // real columns computed from Message history (lib/responseTime), which ride
    // along with the row already selected here, costing no extra query on this
    // hot path.
    const { responseHours: _selfDeclared, ...row } = stripTutorBlobs(t)!
    return {
      ...row,
      nextSlotAt: nextByTutor.get(t.id)?.toISOString() ?? null,
    }
  })
  // Stable sort keeps the incoming order WITHIN each group (verified+rating with
  // no query, trigram relevance with one), but lifts experts who actually have a
  // bookable slot above those who don't. Unchanged by the search rewrite: a
  // bookable expert still outranks an unbookable one, relevance breaks ties.
  shaped.sort((a, b) => (a.nextSlotAt ? 0 : 1) - (b.nextSlotAt ? 0 : 1))

  return shaped
}

export type TutorListRow = Awaited<ReturnType<typeof queryTutors>>[number]
