import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { extractYouTubeId, canonicalYouTubeUrl } from '@/lib/youtube'
import { notifyMany } from '@/lib/notify'

const Body = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  city: z.string().optional(),
  specialty: z.string().min(2),
  yearsExp: z.number().int().min(0).max(80),
  hourlyRate: z.number().int().min(10).max(5000),
  motivation: z.string().min(20).max(2000),
  linkedinUrl: z.string().max(500).optional().nullable(),
  websiteUrl: z.string().max(500).optional().nullable(),
  // Intro video — YouTube URL (unlisted per our onboarding guidance). We
  // validate + extract the ID server-side and reject any URL we can't parse,
  // so what lands in the DB is always a real YouTube reference.
  introVideoUrl: z.string().max(500).optional().nullable(),
  professionData: z.record(z.string(), z.any()).optional().nullable(),
  // Verification docs — data: URLs (or https) produced by /api/uploads. Stored
  // admin-only on the application, never on the public profile.
  idDocUrl: z.string().max(15_000_000).optional().nullable(),
  selfieUrl: z.string().max(15_000_000).optional().nullable(),
  certificates: z.array(z.object({
    title: z.string().max(200),
    url: z.string().max(35_000_000),
  })).max(20).optional().nullable(),
})

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  // Only STUDENTs apply to become experts. A TUTOR is already one; an ADMIN
  // must never hold a pending application (approving it would demote them out
  // of the admin role and lock everyone out of /admin — the exact bug this
  // guards). Admins who want to inspect the flow can impersonate a student.
  if (user.role !== 'STUDENT') {
    return NextResponse.json({ ok: false, error: 'ONLY_STUDENTS_CAN_APPLY' }, { status: 403 })
  }

  // Verified-email gate — applications become part of the tutor's public record;
  // require confirmed inbox before we take the submission.
  if (!(user as any).emailVerified) {
    return NextResponse.json({ ok: false, error: 'EMAIL_NOT_VERIFIED' }, { status: 403 })
  }

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const { linkedinUrl, websiteUrl, introVideoUrl, professionData, idDocUrl, selfieUrl, certificates, ...rest } = parsed.data

  // Normalize the intro video: extract the canonical 11-char ID; reject any
  // non-empty string that isn't a valid YouTube URL. Missing is fine (video
  // is recommended but not blocking at submit time — moderation flags it).
  const rawVideo = introVideoUrl?.trim() || null
  let introVideoId: string | null = null
  let introVideoUrlNormalized: string | null = null
  if (rawVideo) {
    introVideoId = extractYouTubeId(rawVideo)
    if (!introVideoId) {
      return NextResponse.json({ ok: false, error: 'INVALID_VIDEO_URL' }, { status: 400 })
    }
    introVideoUrlNormalized = canonicalYouTubeUrl(introVideoId)
  }

  const data = {
    ...rest,
    linkedinUrl: linkedinUrl?.trim() || null,
    websiteUrl: websiteUrl?.trim() || null,
    introVideoUrl: introVideoUrlNormalized,
    introVideoId,
    professionData: professionData ?? undefined,
    idDocUrl: idDocUrl || null,
    selfieUrl: selfieUrl || null,
    certificates: certificates && certificates.length ? certificates : undefined,
  }

  const app = await prisma.tutorApplication.upsert({
    where: { userId: user.id },
    create: { ...data, userId: user.id, status: 'SUBMITTED' },
    update: { ...data, status: 'SUBMITTED' },
  })

  // Ping every admin's bell — a submission (or re-submission after rejection)
  // enters the moderation queue and previously sat there silently until an
  // admin happened to open the dashboard. APPLICATION_NEW is deliberately not
  // pref-gated (admin ops signal, like the GENERIC dispute pings).
  try {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await notifyMany(admins.map(a => a.id), {
      type: 'APPLICATION_NEW',
      title: 'ახალი განაცხადი',
      body: `${parsed.data.fullName} · ${parsed.data.specialty}`,
      href: '/admin#moderation',
    })
  } catch { /* notification is a side-effect — never fail the submit */ }

  return NextResponse.json({ ok: true, id: app.id })
}
