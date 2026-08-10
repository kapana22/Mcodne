import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { CONSULTATION_DURATIONS } from '@/lib/consultation'
import { extractYouTubeId, canonicalYouTubeUrl } from '@/lib/youtube'
import { georgianRefine } from '@/lib/georgianText'

/** First human-readable custom message from a zod error, if any. */
function firstCustomMessage(err: { issues: { code: string; message: string }[] }): string | null {
  const hit = err.issues.find(i => i.code === 'custom' && /[Ⴀ-ჿᲐ-Ჿ]/.test(i.message))
  return hit?.message ?? null
}


// Very loose URL validator — we don't want to reject unusual TLDs or protocols
// the tutor legitimately wants. Empty string is treated as "clear".
const optionalUrl = z.string().max(500).refine(
  v => v === '' || /^https?:\/\/\S+\.\S+/.test(v),
  { message: 'must be a full URL starting with http:// or https://' },
).nullable().optional()

const Body = z.object({
  headline: z.string().min(2).max(200).superRefine(georgianRefine('ერთი წინადადება შენზე')).optional(),
  bio: z.string().max(2000).superRefine(georgianRefine('აღწერა')).nullable().optional(),
  specialty: z.string().min(2).max(200).optional(),
  yearsExp: z.number().int().min(0).max(80).optional(),
  // Rate limits opened up — the old 10-5000 range was arbitrary and blocked
  // both low-cost tutors (₾5 for a quick homework check) and premium C-level
  // rates (₾6000+). 1-10000 still bounds obvious typos. Existing bookings are
  // unaffected — Booking.price is snapshotted at booking creation.
  hourlyRate: z.number().int().min(1).max(10000).optional(),
  languages: z.array(z.string().min(2).max(10)).max(20).optional(),
  // Product pivot fields.
  // The expert's browse category. Required (indirectly) for visibility — a
  // null-category profile is hidden from /tutors (lib/tutorsQuery.ts). Validated
  // against the live Category set in the handler so an arbitrary id can't be set.
  categoryId: z.string().min(1).max(40).nullable().optional(),
  serviceType: z.enum(['CONSULTATION', 'RECURRING']).optional(),
  // DEFAULT session length only — it does not slice the calendar. Availability
  // rows are windows and bookable starts are derived per service (lib/availability).
  consultationDurationMin: z.number().int().refine(
    n => (CONSULTATION_DURATIONS as readonly number[]).includes(n),
    { message: 'must be 15, 30, or 60' },
  ).optional(),
  // Gap reserved around every booked session (minutes). 0 = back-to-back allowed.
  // Bounded 0–60: the UI offers 0/5/10/15/30, and anything past an hour would
  // silently swallow a neighbouring session's worth of inventory.
  bufferMin: z.number().int().min(0).max(60).optional(),
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
  if (!parsed.success) {
    // Surface OUR validation copy (e.g. the Georgian-language gate); zod's
    // own English messages stay behind the generic code.
    const msg = firstCustomMessage(parsed.error)
    return NextResponse.json({ ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', message: msg ?? undefined }, { status: 400 })
  }

  const data: any = {}
  const {
    headline, bio, specialty, yearsExp, hourlyRate, languages,
    serviceType, consultationDurationMin, bufferMin, categoryId,
    videoUrl, available, linkedinUrl, websiteUrl, responseHours,
  } = parsed.data
  if (available !== undefined) data.available = available
  if (categoryId !== undefined) {
    if (categoryId === null) {
      data.categoryId = null
    } else {
      // Only a SPHERE can be chosen — otherwise the profile would set an
      // invalid FK, or point at a hidden category and vanish from browse. An
      // expert already sitting in an absorbed category keeps it (nothing is
      // re-pointed); they simply cannot move INTO one.
      const cat = await prisma.category.findFirst({ where: { id: categoryId, status: 'VISIBLE' }, select: { id: true } })
      if (!cat) return NextResponse.json({ ok: false, error: 'BAD_CATEGORY' }, { status: 400 })
      data.categoryId = cat.id
    }
  }
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
  if (bufferMin !== undefined) data.bufferMin = bufferMin

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
