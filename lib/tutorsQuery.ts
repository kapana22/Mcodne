import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { expandQuery } from '@/lib/searchSynonyms'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'

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
  // reach Prisma. Clamp to [1, 100] with a 40 default.
  const rawLimit = typeof params.limit === 'number' && Number.isFinite(params.limit) ? params.limit : 40
  const limit = Math.min(Math.max(1, rawLimit), 100)

  const where: any = {
    // Tutors can pause their public listing via the visibility toggle on
    // /tutor/profile — hidden tutors don't appear in the browse list.
    // Their /tutors/[id] page still resolves so existing bookings can link
    // back; the detail page renders a "paused" banner instead of the
    // booking flow.
    available: true,
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

  // Attach each expert's soonest bookable slot so the listing can signal
  // availability. Since booking now REQUIRES a published slot, an expert with
  // no upcoming free slot is effectively unbookable — the client needs to see
  // that before clicking in (and we bubble bookable experts to the top).
  const now = new Date()
  const ids = tutors.map(t => t.id)
  const upcoming = ids.length
    ? await prisma.availabilitySlot.findMany({
        where: { tutorId: { in: ids }, booked: false, startAt: { gt: now } },
        select: { tutorId: true, startAt: true },
        orderBy: { startAt: 'asc' },
      })
    : []
  const nextByTutor = new Map<string, Date>()
  for (const s of upcoming) if (!nextByTutor.has(s.tutorId)) nextByTutor.set(s.tutorId, s.startAt)

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
