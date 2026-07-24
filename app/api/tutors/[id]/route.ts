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
        user: { select: { id: true, fullName: true, avatarUrl: true, bio: true } },
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
    prisma.availabilitySlot.findMany({
      where: { tutorId: id, startAt: { gte: now } },
      orderBy: { startAt: 'asc' },
      take: 200,
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
    prisma.booking.findMany({
      where: {
        tutorId: id,
        status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
        startAt: { gte: now },
      },
      select: { startAt: true, durationMin: true },
      orderBy: { startAt: 'asc' },
      take: 200,
    }),
  ])
  if (!tutor) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const busySlots = busyBookings.map(b => ({
    startAt: b.startAt.toISOString(),
    endAt: new Date(b.startAt.getTime() + b.durationMin * 60_000).toISOString(),
  }))

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
    availability,
    certificates,
    education,
    experience,
    busySlots,
  })
}
