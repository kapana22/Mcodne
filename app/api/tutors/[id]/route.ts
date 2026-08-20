import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'
import { responseTimeLabelKa } from '@/lib/responseTime'
import { getCurrentUser } from '@/lib/auth'
import { clientIp } from '@/lib/rateLimit'
import { EVENTS, track, isBotUserAgent, countsAsProfileView, profileViewKey, firstViewInWindow } from '@/lib/events'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: param } = await ctx.params
  const now = new Date()

  // Accept the public SLUG as well as the internal id.
  //
  // WHY THIS EXISTS: profile URLs became /experts/<slug>, and the client used to
  // pass the URL segment straight through to this endpoint — which only ever
  // matched on id, so every profile returned 404 and booking broke site-wide.
  // The client now sends the real id, and this resolver is the second line of
  // defence: any caller holding only a slug still gets a real answer.
  //
  // Cost is one extra round-trip ONLY when the param isn't already an id — the
  // id path short-circuits, so the hot case is unchanged.
  const resolved = await prisma.tutorProfile
    .findFirst({ where: { OR: [{ id: param }, { slug: param }] }, select: { id: true } })
    .catch(() => null)
  const id = resolved?.id ?? param

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
        category: { select: { id: true, slug: true, name: true, icon: true, status: true, parent: { select: { slug: true } } } },
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
    prisma.certificate.findMany({ where: { tutorId: id }, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }] }).then(rows => rows.map(({ fileUrl, ...c }) => ({
      ...c,
      // The scan NEVER travels in this payload — a few base64 diplomas would
      // add megabytes to the profile's highest-traffic response. `hasFile` tells
      // the UI a scan exists; it loads the image itself from
      // /api/certificates/<id>/file, which is cacheable per certificate.
      //
      // This used to null only `data:` URIs, which meant a base64 diploma was
      // silently invisible on the profile — the visible half of the bug where
      // uploads were never stored in the first place.
      hasFile: !!fileUrl,
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

  /* ── PROFILE VIEW (analytics) ────────────────────────────────────────────
   * The only place on the site that knows „somebody opened this expert". It
   * powers /api/tutor/insights, which answers the one question an approved
   * expert cannot otherwise answer: is my profile working?
   *
   * Everything happens in after(), so nothing below can delay or break this
   * payload — the response is already flushed. Both reads that feed it are
   * STARTED here (cookies/headers are only readable in request scope) and
   * awaited inside the callback. Deliberately placed after the 404 and the
   * suspended-expert guard: a view of a profile nobody can see is not a view.
   */
  const ua = req.headers.get('user-agent')
  const ip = clientIp(req)
  // The bot half of the rule needs nothing but the header, so it is settled
  // FIRST: a crawler sweeping every profile must not also cost a session
  // lookup on this endpoint. Only a plausible human opens a DB read.
  const viewerP = isBotUserAgent(ua) ? null : getCurrentUser().catch(() => null)
  after(async () => {
    try {
      if (!viewerP) return
      const viewer = await viewerP
      // Self-view, ADMIN and bot traffic never count (lib/events).
      if (!countsAsProfileView({
        userAgent: ua,
        viewerUserId: viewer?.id ?? null,
        viewerRole: viewer?.role ?? null,
        tutorUserId: tutor.user?.id ?? null,
      })) return
      // One human visit can hit this route more than once (profile page fetch,
      // booking sheet self-fetch, reschedule picker) — collapse them.
      if (!firstViewInWindow(profileViewKey(id, viewer?.id ?? null, ip, ua))) return
      // Props carry NO PII: the expert's own profile id (so views can be
      // grouped per expert) and whether the viewer had an account. The optional
      // userId column is the only identifier, exactly as everywhere else.
      await track(EVENTS.PROFILE_VIEW, { tutorId: id, signedIn: !!viewer }, viewer?.id ?? null)
    } catch {
      // track() is contractually non-throwing; this is belt-and-braces so a
      // regression there can never surface on the most-hit profile endpoint.
    }
  })

  return NextResponse.json({
    // Strip the unbounded apply-flow `professionData` JSON (PII, never rendered
    // on the profile) and any legacy base64 `videoUrl` blob before serializing —
    // this is the single most-hit profile endpoint and the same payload-bloat
    // class as the 9.4MB-avatar speed incident. Small fields (headline, price,
    // rating, YouTube videoUrl, category) are preserved; the detail client does
    // not read professionData.
    ...stripTutorBlobs(tutor),
    // MEASURED response time — the median wait on conversations the CLIENT
    // started, over the last 90 days, gated on a minimum sample
    // (lib/responseTime). `null` means we don't have enough answered
    // conversations to say anything true, and the profile must then render
    // NOTHING here — never a fallback to the self-declared `responseHours`,
    // which the expert types into their own profile editor and we cannot
    // verify. `label` is the display string; medianMin/sampleN are exposed so
    // the UI can show the sample if it ever wants to.
    // NOTE: `responseHours` still ships (above, via the profile row) only
    // because app/experts/[slug]/client.tsx has not migrated yet — it must stop
    // reading it and read `responseTime.label` instead.
    responseTime: responseTimeLabelKa(tutor.responseMedianMin, tutor.responseSampleN)
      ? {
          medianMin: tutor.responseMedianMin,
          sampleN: tutor.responseSampleN,
          label: responseTimeLabelKa(tutor.responseMedianMin, tutor.responseSampleN),
        }
      : null,
    consultations,
    reviews,
    availability: availabilityRows,
    certificates,
    education,
    experience,
    busySlots,
  })
}
