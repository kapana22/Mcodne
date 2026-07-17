import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { CONSULTATION_DURATIONS } from '@/lib/consultation'
import { extractYouTubeId, canonicalYouTubeUrl } from '@/lib/youtube'

// Very loose URL validator — we don't want to reject unusual TLDs or protocols
// the tutor legitimately wants. Empty string is treated as "clear".
const optionalUrl = z.string().max(500).refine(
  v => v === '' || /^https?:\/\/\S+\.\S+/.test(v),
  { message: 'must be a full URL starting with http:// or https://' },
).nullable().optional()

const Body = z.object({
  headline: z.string().min(2).max(200).optional(),
  bio: z.string().max(2000).nullable().optional(),
  specialty: z.string().min(2).max(200).optional(),
  yearsExp: z.number().int().min(0).max(80).optional(),
  // Rate limits opened up — the old 10-5000 range was arbitrary and blocked
  // both low-cost tutors (₾5 for a quick homework check) and premium C-level
  // rates (₾6000+). 1-10000 still bounds obvious typos. Existing bookings are
  // unaffected — Booking.price is snapshotted at booking creation.
  hourlyRate: z.number().int().min(1).max(10000).optional(),
  languages: z.array(z.string().min(2).max(10)).max(20).optional(),
  // Product pivot fields.
  serviceType: z.enum(['CONSULTATION', 'RECURRING']).optional(),
  consultationDurationMin: z.number().int().refine(
    n => (CONSULTATION_DURATIONS as readonly number[]).includes(n),
    { message: 'must be 15, 30, or 60' },
  ).optional(),
  // Intro video — YouTube URL only (any of the accepted forms: watch, youtu.be,
  // shorts, embed, or a bare 11-char ID). The server normalizes to the canonical
  // "youtu.be/{id}" shape. Explicit `null` clears the video. Uploads of raw
  // video files are no longer supported — see /api/uploads (kind=video 410).
  videoUrl: z.string().max(500).nullable().optional(),
  // Public visibility. When false, the tutor is filtered out of /api/tutors
  // and their /tutors/[id] page shows a "paused" banner instead of the
  // booking flow. Existing bookings continue as normal — students who
  // already have a session can still message and join the video room.
  available: z.boolean().optional(),
  // Social / professional links shown on the tutor detail page. Kept in
  // schema since application flow, but now editable from the profile too so
  // tutors can update their LinkedIn / personal site without going through
  // admin. Empty string clears the field.
  linkedinUrl: optionalUrl,
  websiteUrl: optionalUrl,
  // Response-time promise (hours). Shown as a "replies in X hours" badge on
  // /tutors/[id] and browse cards — it's a real trust signal at booking time.
  // Constrained to a fixed list so the badge stays legible and the tutor
  // can't over-promise ("1 hour").
  responseHours: z.union([z.literal(4), z.literal(12), z.literal(24), z.literal(48)]).optional(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ profile: null }, { status: 401 })
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  return NextResponse.json({ profile })
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const data: any = {}
  const {
    headline, bio, specialty, yearsExp, hourlyRate, languages,
    serviceType, consultationDurationMin,
    videoUrl, available, linkedinUrl, websiteUrl, responseHours,
  } = parsed.data
  if (available !== undefined) data.available = available
  if (responseHours !== undefined) data.responseHours = responseHours
  if (linkedinUrl !== undefined) {
    const trimmed = (linkedinUrl ?? '').trim()
    data.linkedinUrl = trimmed === '' ? null : trimmed
  }
  if (websiteUrl !== undefined) {
    const trimmed = (websiteUrl ?? '').trim()
    data.websiteUrl = trimmed === '' ? null : trimmed
  }
  if (videoUrl !== undefined) {
    if (videoUrl === null || videoUrl.trim() === '') {
      data.videoUrl = null
    } else {
      const id = extractYouTubeId(videoUrl)
      if (!id) {
        return NextResponse.json({ ok: false, error: 'BAD_YOUTUBE_URL' }, { status: 400 })
      }
      data.videoUrl = canonicalYouTubeUrl(id)
    }
  }
  if (headline !== undefined) data.headline = headline.trim()
  if (bio !== undefined) data.bio = bio === null ? null : bio.trim() || null
  if (specialty !== undefined) data.specialty = specialty.trim()
  if (yearsExp !== undefined) data.yearsExp = yearsExp
  if (hourlyRate !== undefined) data.price = hourlyRate
  if (languages !== undefined) data.languages = languages
  if (serviceType !== undefined) data.serviceType = serviceType
  if (consultationDurationMin !== undefined) data.consultationDurationMin = consultationDurationMin

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'NOTHING_TO_UPDATE' }, { status: 400 })
  }

  const existing = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })
  }

  const updated = await prisma.tutorProfile.update({
    where: { userId: user.id },
    data,
  })
  return NextResponse.json({ ok: true, profile: updated })
}
