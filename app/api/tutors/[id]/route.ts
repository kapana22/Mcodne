import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const now = new Date()

  // All sub-lists run as CONCURRENT queries instead of nested includes.
  // Prisma executes nested includes as sequential round-trips — with the DB on
  // a remote Railway proxy (~300ms RTT) the old 8-include shape cost ~3s per
  // request and made the profile/booking UI feel broken. Parallel fan-out
  // brings wall time down to ~1 RTT.
  const [tutor, consultations, reviews, availability, certificates, education, experience, busyBookings] = await Promise.all([
    prisma.tutorProfile.findUnique({
      where: { id },
      // Public endpoint — narrow both User and Review.student selects so
      // passwordHash / phone / email never leave the server.
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true, bio: true, suspendedAt: true } },
        category: { select: { id: true, slug: true, name: true, icon: true } },
      },
    }),
    // Consultation tiers only matter for RECURRING tutors; still returned
    // for consistency, but the UI branches by serviceType.
    prisma.consultation.findMany({ where: { tutorId: id } }),
    prisma.review.findMany({
      where: { tutorId: id },
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { student: { select: { id: true, fullName: true, avatarUrl: true } } },
    }).then(rows => rows.map(r => ({
      ...r,
      // (1) Honor Review.anonymous — the reviewer's identity must never leave
      // the server for anonymous reviews (it used to ship name+avatar anyway).
      // (2) Strip huge inline base64 avatars: one reviewer's 3.5 MB data-URI
      // avatar made five tutors' detail payloads ~1000× larger than the rest
      // and stalled the profile page on slow links. The UI already has an
      // initials fallback, so nulling it is safe.
      student: r.anonymous
        ? null
        : {
            ...r.student,
            avatarUrl:
              r.student.avatarUrl && r.student.avatarUrl.startsWith('data:') && r.student.avatarUrl.length > 16_384
                ? null
                : r.student.avatarUrl,
          },
    }))),
    // Published availability WINDOWS. `endAt > now` (not `startAt >= now`) so a
    // window we are currently inside still ships — its remaining minutes are
    // bookable. The client derives concrete start times from these minus
    // `busySlots` (lib/availability), so both lists must be complete over the
    // horizon they cover; take raised 200 → 500 to keep truncation off the table
    // now that a missing row means a real time silently disappears.
    prisma.availabilitySlot.findMany({
      where: { tutorId: id, endAt: { gt: now } },
      select: { id: true, startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
      take: 500,
    }),
    prisma.certificate.findMany({ where: { tutorId: id }, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }] }).then(rows => rows.map(c => ({
      ...c,
      // The public profile only links http(s) cert scans (safeHttpUrl rejects
      // data: URIs), so a base64 scan is never rendered here — strip it so it
      // can't bloat the payload. Same defense as the review avatars above.
      fileUrl: c.fileUrl && c.fileUrl.startsWith('data:') ? null : c.fileUrl,
    }))),
    prisma.education.findMany({ where: { tutorId: id }, orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }] }),
    prisma.experience.findMany({ where: { tutorId: id }, orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }] }),
    // EVERY active booking in the returned horizon — this is now the ONLY
    // source of "busy" (nothing flips a window's `booked` any more), so an
    // omitted row would advertise a time that the server then refuses. The
    // lower bound reaches back one max-length session (240 min) so a session
    // already in progress still blocks its remaining minutes.
    prisma.booking.findMany({
      where: {
        tutorId: id,
        status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
        startAt: { gte: new Date(now.getTime() - 240 * 60_000) },
      },
      select: { startAt: true, durationMin: true },
      orderBy: { startAt: 'asc' },
      take: 500,
    }),
  ])
  if (!tutor) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  // Admin-suspended experts are hidden from the whole public site — the detail
  // fetch 404s just like a missing id so the profile page can't be viewed.
  if (tutor.user?.suspendedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const busySlots = busyBookings.map(b => ({
    startAt: b.startAt.toISOString(),
    endAt: new Date(b.startAt.getTime() + b.durationMin * 60_000).toISOString(),
  }))

  // Wire shape is unchanged: { id, startAt, endAt, booked }. `booked` is LEGACY
  // and always false — a window is never claimed, so the flag carries no
  // information; it is emitted only so older clients keep parsing. Openness is
  // `availability` minus `busySlots`, derived client-side by lib/availability.
  const availabilityRows = availability.map(s => ({ ...s, booked: false }))

  return NextResponse.json({
    // Strip the unbounded apply-flow `professionData` JSON (PII, never rendered
    // on the profile) and any legacy base64 `videoUrl` blob before serializing —
    // this is the single most-hit profile endpoint and the same payload-bloat
    // class as the 9.4MB-avatar speed incident. Small fields (headline, price,
    // rating, YouTube videoUrl, category) are preserved; the detail client does
    // not read professionData.
    ...stripTutorBlobs(tutor),
    consultations,
    reviews,
    availability: availabilityRows,
    certificates,
    education,
    experience,
    busySlots,
  })
}
