import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { expandQuery } from '@/lib/searchSynonyms'

export async function GET(req: Request) {
  await ensureDbReady()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const category = searchParams.get('category')
  const typeParam = searchParams.get('type')
  const serviceType = typeParam === 'CONSULTATION' || typeParam === 'RECURRING' ? typeParam : null
  const onlyFeatured = searchParams.get('featured') === '1'
  const limit = Math.min(Number(searchParams.get('limit') ?? 40), 100)

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
    ...t,
    nextSlotAt: nextByTutor.get(t.id)?.toISOString() ?? null,
  }))
  // Stable sort keeps the DB verified+rating order WITHIN each group, but lifts
  // experts who actually have a bookable slot above those who don't.
  shaped.sort((a, b) => (a.nextSlotAt ? 0 : 1) - (b.nextSlotAt ? 0 : 1))

  return NextResponse.json(shaped)
}
