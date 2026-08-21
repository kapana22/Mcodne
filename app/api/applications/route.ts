import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { extractYouTubeId, canonicalYouTubeUrl } from '@/lib/youtube'
import { notifyMany } from '@/lib/notify'
import { after } from 'next/server'
import { sendMail } from '@/lib/mailer'
import { newApplicationAdminEmail } from '@/lib/emailTemplates'
import { georgianRefine } from '@/lib/georgianText'
import { isUploadedFileUrl } from '@/lib/safeUrl'
import {
  APPLY,
  applyValidationFailure,
  bioError,
  nameError,
  phoneRequiredError,
  priceError,
  refine,
  specialtyError,
  urlError,
  videoError,
  yearsError,
} from '@/lib/applyValidation'
import { ROLE } from '@/lib/roles'

// EVERY rule below is a function from lib/applyValidation, which the /apply
// form calls too. That is the whole point: a rule stated in two places is a
// rule that will be stated differently, and the applicant is the one who finds
// out — see the file header for the production failure that proves it.
const Body = z.object({
  fullName: z.string().superRefine(refine(nameError)),
  // Optional since the 2026-07-28 onboarding simplification — the apply form no
  // longer requires a phone number (the admin reaches applicants by email).
  // `''` is accepted and normalised to undefined below so an empty input from
  // an older cached client doesn't 400 with the useless generic INVALID.
  phone: z.string().superRefine(refine(phoneRequiredError)),
  city: z.string().max(120).optional(),
  specialty: z.string().superRefine(refine(specialtyError)),
  yearsExp: z.number().superRefine(refine(yearsError)),
  hourlyRate: z.number().superRefine(refine(priceError)),
  motivation: z.string().superRefine(refine(v => bioError(v, APPLY.BIO_MIN_API))),
  linkedinUrl: z.string().optional().nullable().superRefine(refine(v => urlError(v, 'LinkedIn-ის ბმული'))),
  websiteUrl: z.string().optional().nullable().superRefine(refine(v => urlError(v, 'ვებგვერდის ბმული'))),
  // Intro video — YouTube URL (unlisted per our onboarding guidance). We
  // validate + extract the ID server-side and reject any URL we can't parse,
  // so what lands in the DB is always a real YouTube reference.
  introVideoUrl: z.string().optional().nullable().superRefine(refine(videoError)),
  // THE HOLE THIS CLOSES. `headline` is public — it is the lead sentence under
  // the expert's name — but it travels inside this blob, so the schema saw
  // `any` and only the BROWSER ever checked it. Anything posted straight to the
  // API got in. The blob stays open (it carries languages, services and the
  // weekly pattern, all shaped elsewhere); the one public STRING in it is
  // checked by the same rule the form uses.
  professionData: z.record(z.string(), z.any()).optional().nullable().superRefine((pd, ctx) => {
    const h = pd && typeof pd === 'object' ? (pd as Record<string, unknown>).headline : null
    if (typeof h === 'string') georgianRefine('ერთი წინადადება შენზე')(h, ctx)
  }),
  // Verification docs — data: URLs (or https) produced by /api/uploads. Stored
  // admin-only on the application, never on the public profile.
  idDocUrl: z.string().max(15_000_000).optional().nullable(),
  selfieUrl: z.string().max(15_000_000).optional().nullable(),
  certificates: z.array(z.object({
    title: z.string().max(200),
    // Captured on /apply since 2026-07-29 so the approved profile shows a real
    // issuer instead of a placeholder. Optional — an expert may not know it.
    issuer: z.string().max(200).optional(),
    // Copied verbatim onto Certificate.fileUrl at approval, so it obeys the
    // same scheme rule the certificates route now states.
    url: z.string().max(35_000_000).refine(isUploadedFileUrl, 'BAD_FILE_URL'),
  })).max(20).optional().nullable(),
})

// GET — the caller's own application status, so /apply can show a real
// "under review" / "rejected (reason)" screen instead of a blank form to
// someone who already applied. Returns { application: null } if none.
//
// Also returns the applicant's own submitted TEXT fields (never the heavy
// base64 verification media — that stays admin-only and, like the localStorage
// draft, is not persisted across sessions). This lets the „needs revision"
// re-edit seed the wizard server-side, so an applicant returning from another
// device — or after the 7-day draft expired — isn't forced to retype everything.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const application = await prisma.tutorApplication.findUnique({
    where: { userId: user.id },
    select: {
      status: true,
      moderatorNote: true,
      createdAt: true,
      reviewedAt: true,
      fullName: true,
      phone: true,
      city: true,
      specialty: true,
      yearsExp: true,
      hourlyRate: true,
      motivation: true,
      linkedinUrl: true,
      websiteUrl: true,
      introVideoUrl: true,
      // Small structured JSON (languages / headline / services / requested
      // category) — safe to return; the heavy media fields are omitted above.
      professionData: true,
    },
  })
  return NextResponse.json({ application })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  // Only STUDENTs apply to become experts. A TUTOR is already one; an ADMIN
  // must never hold a pending application (approving it would demote them out
  // of the admin role and lock everyone out of /admin — the exact bug this
  // guards). Admins who want to inspect the flow can impersonate a student.
  if (user.role !== ROLE.USER) {
    return NextResponse.json({
      ok: false,
      error: 'ONLY_STUDENTS_CAN_APPLY',
      message: user.role === ROLE.PROVIDER
        ? 'შენ უკვე ექსპერტი ხარ — განაცხადი აღარ გჭირდება. პროფილს „ჩემი სივრციდან“ მართავ.'
        : 'ამ ანგარიშიდან განაცხადს ვერ გააგზავნი. შედი როგორც კლიენტი და სცადე თავიდან.',
    }, { status: 403 })
  }

  // Email verification is intentionally NOT required to apply (removed
  // 2026-07-20) — the application is moderated by an admin regardless.

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // A 400 must always answer WHICH field and WHAT TO DO — the form uses
    // `field` to jump the applicant there (even across steps) and renders
    // `message` beside the input. `error` stays a stable code for the funnel.
    const fail = applyValidationFailure(parsed.error)
    return NextResponse.json(
      { ok: false, error: fail.code, field: fail.field, message: fail.message },
      { status: 400 },
    )
  }

  const { linkedinUrl, websiteUrl, introVideoUrl, professionData, idDocUrl, selfieUrl, certificates, phone, ...rest } = parsed.data

  // Normalize the intro video: extract the canonical 11-char ID; reject any
  // non-empty string that isn't a valid YouTube URL. Missing is fine (video
  // is recommended but not blocking at submit time — moderation flags it).
  const rawVideo = introVideoUrl?.trim() || null
  let introVideoId: string | null = null
  let introVideoUrlNormalized: string | null = null
  if (rawVideo) {
    introVideoId = extractYouTubeId(rawVideo)
    if (!introVideoId) {
      // Unreachable: the schema already ran videoError() (the same predicate) on
      // this field. Kept as the belt to that pair of braces — and it answers
      // with the same field + sentence, so it can never be a silent 400.
      return NextResponse.json(
        { ok: false, error: 'INVALID_VIDEO_URL', field: 'introVideoUrl', message: videoError(rawVideo) },
        { status: 400 },
      )
    }
    introVideoUrlNormalized = canonicalYouTubeUrl(introVideoId)
  }

  const data = {
    ...rest,
    // TutorApplication.phone is NOT NULL in the schema, and phone became
    // optional in onboarding — coerce a missing one to '' rather than adding a
    // migration. The admin panel renders empty, which is the truth.
    phone: phone?.trim() || '',
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
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true } })
    await notifyMany(admins.map(a => a.id), {
      type: 'APPLICATION_NEW',
      title: 'ახალი განაცხადი',
      body: `${parsed.data.fullName} · ${parsed.data.specialty}`,
      href: '/admin#moderation',
    })
    // …and by EMAIL (2026-08-03). The bell alone only lands if an admin happens
    // to open /admin — a submission could sit unreviewed for days because
    // nobody was told. Off the response path (`after`) and fully guarded, since
    // a mail failure must never fail a submit that already committed. NOT
    // pref-gated: this is an ops signal to staff, like APPLICATION_NEW itself.
    after(async () => {
      try {
        const { subject, html } = newApplicationAdminEmail({
          name: parsed.data.fullName,
          specialty: parsed.data.specialty,
          city: parsed.data.city,
          yearsExp: parsed.data.yearsExp,
          rate: parsed.data.hourlyRate,
          email: user.email,
          phone: parsed.data.phone || null,
        })
        for (const a of admins) {
          if (a.email) await sendMail({ to: a.email, subject, html })
        }
      } catch { /* email is best-effort */ }
    })
  } catch { /* notification is a side-effect — never fail the submit */ }

  return NextResponse.json({ ok: true, id: app.id })
}
