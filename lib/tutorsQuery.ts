import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { expandQuery } from '@/lib/searchSynonyms'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'
import { computeOpenStarts } from '@/lib/availability'

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

export async function queryTutors(params: TutorsQueryParams = {}) {
  await ensureDbReady()

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
  }
  // Restrict to publicly live categories; also filter by slug if requested.
  if (category) {
    where.category = { slug: category, isLive: true }
  } else {
    where.category = { is: { isLive: true } }
  }
  if (serviceType) where.serviceType = serviceType
  if (onlyFeatured) where.featured = true
  if (q) {
    // Expand the query through the synonym map so colloquial terms
    // ("იურისტი") still hit tutors whose stored specialty is the formal
    // cognate ("სამართალი"). expandQuery always includes the original term.
    const terms = expandQuery(q)
    const searchOr = terms.flatMap(t => ([
      { headline:  { contains: t, mode: 'insensitive' as const } },
      { specialty: { contains: t, mode: 'insensitive' as const } },
      { bio:       { contains: t, mode: 'insensitive' as const } },
      { user: { fullName: { contains: t, mode: 'insensitive' as const } } },
      // Also match the category's display name so searching a sphere by its
      // visible label (e.g. „მარკეტინგი") returns that sphere's experts
      // instead of dead-ending on the empty "no match" fallback.
      { category: { name: { contains: t, mode: 'insensitive' as const } } },
    ]))
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }]
      delete where.OR
    } else {
      where.OR = searchOr
    }
  }

  // Verified experts first, then by rating.
  const orderBy = [
    { verified: 'desc' as const },
    { rating: 'desc' as const },
  ]

  const tutors = await prisma.tutorProfile.findMany({
    where,
    take: limit,
    orderBy,
    // Public endpoint — never send passwordHash or private User columns.
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true, bio: true } },
      category: { select: { id: true, slug: true, name: true, icon: true } },
    },
  })

  // Attach each expert's soonest genuinely BOOKABLE start so the listing can
  // signal availability. A published row is a WINDOW, not a ticket: `booked` is
  // meaningless now, so "soonest row with booked = false" advertised times that
  // the booking API then refused. The real answer is windows − active bookings −
  // the service length, i.e. computeOpenStarts (lib/availability).
  const now = new Date()
  const ids = tutors.map(t => t.id)
  // TWO bounded queries total, never one per tutor. Each uses a per-tutor
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

  const shaped = tutors.map(t => ({
    // Drop the unbounded professionData JSON, legacy base64 video, and any
    // oversized base64 avatar before this list (also SSR-embedded) ships.
    ...stripTutorBlobs(t)!,
    nextSlotAt: nextByTutor.get(t.id)?.toISOString() ?? null,
  }))
  // Stable sort keeps the DB verified+rating order WITHIN each group, but lifts
  // experts who actually have a bookable slot above those who don't.
  shaped.sort((a, b) => (a.nextSlotAt ? 0 : 1) - (b.nextSlotAt ? 0 : 1))

  return shaped
}

export type TutorListRow = Awaited<ReturnType<typeof queryTutors>>[number]
