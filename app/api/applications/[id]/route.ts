import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { notify, normalizePrefs } from '@/lib/notify'
import { audit } from '@/lib/audit'
import { normalizeLangs } from '@/lib/languages'
import { sendMail } from '@/lib/mailer'
import { applicationApprovedEmail } from '@/lib/emailTemplates'

const Body = z.object({
  action: z.enum(['approve', 'reject', 'revise']),
  note: z.string().optional(),
  // Optional admin override for the approved expert's category (approve only).
  // Lets a niche/custom applicant — whose free-text specialty matches no
  // Category name — be assigned one at approval time instead of being born
  // category-less and invisible on /tutors.
  categoryId: z.string().min(1).max(64).optional(),
})

// Map an /apply service duration onto the Consultation tier enum.
function tierForMinutes(m: number): 'QUICK' | 'STANDARD' | 'DEEP' {
  if (m <= 20) return 'QUICK'
  if (m <= 45) return 'STANDARD'
  return 'DEEP'
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireRole('ADMIN')
  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })
  const { action, note, categoryId } = parsed.data

  // Reject AND revise must carry a reason — it is sent to the applicant and kept
  // in the audit trail. Revise IS the correction note ("write your name in
  // Georgian"), so it is meaningless empty. The admin UI enforces this too; the
  // server is the backstop.
  if ((action === 'reject' || action === 'revise') && !note?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'REASON_REQUIRED', message: action === 'revise' ? 'შესწორების მითითება სავალდებულოა' : 'უარყოფის მიზეზი სავალდებულოა' },
      { status: 400 },
    )
  }

  // Fetch the applicant's current role — approval promotes to TUTOR, and we
  // must NEVER demote an ADMIN (or anyone non-STUDENT) that way. An admin who
  // accidentally submitted an application and then approved it used to lose
  // their admin role and lock everyone out of /admin — this guard prevents it.
  const app = await prisma.tutorApplication.findUnique({
    where: { id },
    include: { user: { select: { role: true } } },
  })
  if (!app) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  if (action === 'approve') {
    if (app.user.role !== 'STUDENT') {
      // Only a STUDENT applicant can be promoted. ADMIN → refuse outright;
      // an existing TUTOR is already an expert (nothing to promote).
      return NextResponse.json(
        { ok: false, error: app.user.role === 'ADMIN' ? 'CANNOT_PROMOTE_ADMIN' : 'ALREADY_EXPERT' },
        { status: 400 },
      )
    }
    // Resolve the applicant's chosen category (stored as its NAME in `specialty`,
    // since /apply's preset list mirrors the live Category names) to a real
    // Category id. WITHOUT this the freshly-minted profile is born category-less
    // and is silently hidden from /tutors — the browse query hard-requires a live
    // category (lib/tutorsQuery.ts), so an approved+available expert would never
    // appear. A custom/niche specialty that matches nothing stays null (that's the
    // genuine "admin must add this category" case; the expert can also self-set it
    // from the profile editor once the category exists).
    const liveCats = await prisma.category.findMany({ where: { isLive: true }, select: { id: true, name: true, defaultServiceType: true } })
    const nrm = (s: string) => s.toLowerCase().trim()
    const sp = nrm(app.specialty || '')
    const matchedCat = sp
      ? (liveCats.find(c => nrm(c.name) === sp)
        ?? liveCats.find(c => { const n = nrm(c.name); const stem = n.slice(0, 4); return sp.includes(n) || n.includes(sp) || (stem.length >= 3 && sp.includes(stem)) }))
      : undefined
    // An explicit `categoryId` from the admin OVERRIDES the name match — that is
    // the whole point of the override (the name matched nothing, or matched the
    // wrong bucket). It must name a real LIVE category; anything else is a
    // mistake worth surfacing rather than silently ignoring.
    const overrideCat = categoryId ? liveCats.find(c => c.id === categoryId) : undefined
    if (categoryId && !overrideCat) {
      return NextResponse.json({ ok: false, error: 'BAD_CATEGORY' }, { status: 400 })
    }
    const chosenCat = overrideCat ?? matchedCat
    const resolvedCategoryId = chosenCat?.id

    // Carry the languages the applicant selected (stored in professionData as
    // free-text tags like „ქართული · მშობლიური") into the structured
    // TutorProfile.languages the cards/profile actually read — otherwise the
    // profile is born with the ["ka"] default and the applicant's real languages
    // are silently lost. Normalized to canonical CODES (lib/languages.ts) because
    // that is what the profile editor and the browse filter speak — writing the
    // raw Georgian name here left the expert with zero chips selected and a
    // duplicated „ქართული · English · ქართული · English" card after they re-picked.
    const resolvedLanguages = normalizeLangs((app.professionData as any)?.languages)
    await prisma.$transaction([
      prisma.tutorApplication.update({
        where: { id },
        data: { status: 'APPROVED', moderatorNote: note, reviewedAt: new Date() },
      }),
      prisma.user.update({ where: { id: app.userId }, data: { role: 'TUTOR' } }),
      prisma.tutorProfile.upsert({
        where: { userId: app.userId },
        create: {
          userId: app.userId,
          // Seed the real one-line pitch the applicant wrote (stashed in
          // professionData at submit) — falling back to the category name only
          // when they left it blank. Without this the profile's headline was
          // always just the category, and the expert had to retype it.
          headline: ((app.professionData as any)?.headline?.trim?.() || app.specialty),
          specialty: app.specialty,
          categoryId: resolvedCategoryId,
          // Inherit the category's default service type (admin-set) instead of
          // always falling back to the schema default.
          serviceType: chosenCat?.defaultServiceType ?? undefined,
          // Carry the applicant's „შესახებ" text over so the profile isn't born
          // with an empty bio the expert has to re-enter.
          bio: app.motivation?.trim() || null,
          // Preserve the applicant's real languages (see derivation above) — only
          // when we actually parsed some, otherwise let the ["ka"] default stand.
          languages: resolvedLanguages.length ? resolvedLanguages : undefined,
          yearsExp: app.yearsExp,
          price: app.hourlyRate,
          verified: false,
          linkedinUrl: app.linkedinUrl,
          websiteUrl: app.websiteUrl,
          professionData: app.professionData ?? undefined,
          // Carry the applicant's YouTube intro URL onto the freshly-minted
          // TutorProfile so they don't have to re-submit it. Same normalized
          // canonical form ("youtu.be/{id}") already stored on the application.
          videoUrl: (app as any).introVideoUrl ?? null,
        },
        update: {
          linkedinUrl: app.linkedinUrl,
          websiteUrl: app.websiteUrl,
          professionData: app.professionData ?? undefined,
          // videoUrl is deliberately NOT touched on re-approval — a tutor who
          // already exists may have edited their intro to a newer/better clip
          // since their original application. Only the `create` path seeds it.
        },
      }),
    ])
    // Turn the services the applicant defined during /apply into real
    // Consultation tiers. Runs OUTSIDE the promotion tx and is fully guarded, so
    // a malformed service row can NEVER block the approval itself. Skips if the
    // profile already has consultations (a re-approval mustn't duplicate them).
    try {
      const services = (app.professionData as any)?.services
      if (Array.isArray(services) && services.length) {
        const profile = await prisma.tutorProfile.findUnique({ where: { userId: app.userId }, select: { id: true } })
        if (profile) {
          const existing = await prisma.consultation.count({ where: { tutorId: profile.id } })
          if (existing === 0) {
            const rows = services
              .filter((s: any) => s && typeof s.name === 'string' && s.name.trim() && Number.isFinite(Number(s.dur)))
              .slice(0, 10)
              .map((s: any) => {
                const minutes = Math.min(240, Math.max(5, Math.round(Number(s.dur))))
                const title = String(s.name).trim().slice(0, 80)
                return {
                  tutorId: profile.id,
                  tier: tierForMinutes(minutes),
                  title,
                  description: (String(s.desc ?? '').trim() || title).slice(0, 400),
                  minutes,
                  price: Math.min(10000, Math.max(0, Math.round(Number(s.price) || 0))),
                }
              })
            if (rows.length) await prisma.consultation.createMany({ data: rows })
          }
        }
      }
    } catch { /* consultations are a convenience — never fail the approval on them */ }
    // Same guarded pattern for the diploma/certificate scans uploaded during
    // /apply ({ title, url }[] on TutorApplication.certificates) — without this
    // the fresh expert's certificates tab is empty and they must re-upload
    // everything they already sent us. The SCAN itself stays admin-only on the
    // application (schema comment: verification media is never copied to the
    // public profile), so only an http(s) link is carried over — a base64 data:
    // URL becomes a title-only row. issuer/year aren't captured by /apply, so
    // they're honest placeholders the expert edits in the profile editor.
    try {
      const certs = (app.certificates as any)
      if (Array.isArray(certs) && certs.length) {
        const profile = await prisma.tutorProfile.findUnique({ where: { userId: app.userId }, select: { id: true } })
        if (profile) {
          const existing = await prisma.certificate.count({ where: { tutorId: profile.id } })
          if (existing === 0) {
            const year = app.createdAt.getFullYear()
            const rows = certs
              .filter((c: any) => c && typeof c.title === 'string' && c.title.trim())
              .slice(0, 10)
              .map((c: any) => {
                const url = String(c.url ?? '').trim()
                return {
                  tutorId: profile.id,
                  title: String(c.title).trim().slice(0, 200),
                  issuer: 'მითითებული არ არის',
                  year,
                  fileUrl: /^https?:\/\//i.test(url) && url.length <= 500 ? url : null,
                }
              })
            if (rows.length) await prisma.certificate.createMany({ data: rows })
          }
        }
      }
    } catch { /* certificates are a convenience — never fail the approval on them */ }
    // Point the approval at the SCHEDULE, not the profile: booking is slot-gated,
    // so an approved expert with no published time is unbookable no matter how
    // complete their profile is. A moderator note still overrides the body.
    await notify(app.userId, {
      type: 'APPLICATION_STATUS',
      title: 'დამტკიცდი — გახსენი შენი დრო',
      body: note?.trim() || 'ახლა ხარ ექსპერტი. სანამ თავისუფალ დროს არ გამოაქვეყნებ, ვერავინ დაგიჯავშნის.',
      href: '/tutor/schedule',
    })
    // Same message by email — the in-app bell only lands if they come back on
    // their own. Runs off the response path (the admin shouldn't wait on a mail
    // round-trip) and is fully guarded + pref-gated on APPLICATION_STATUS, the
    // same toggle the notify() above respects. sendMail RESOLVES on a provider
    // failure (it logs its own [server-error]), so a dead mailbox can never fail
    // an approval that has already committed.
    after(async () => {
      try {
        const u = await prisma.user.findUnique({
          where: { id: app.userId },
          select: { email: true, fullName: true, notificationPrefs: true },
        })
        if (u?.email && normalizePrefs(u.notificationPrefs).APPLICATION_STATUS) {
          const { subject, html } = applicationApprovedEmail({ name: u.fullName, note: note?.trim() || undefined })
          await sendMail({ to: u.email, subject, html })
        }
      } catch { /* email is best-effort */ }
    })
    await audit(admin.id, 'application.approve', { targetType: 'TutorApplication', targetId: id, meta: { note, applicantUserId: app.userId } })
  } else if (action === 'revise') {
    // „გაასწორე" — softer than a reject. The application lands in NEEDS_REVISION
    // (not REJECTED), the applicant's role/profile is untouched, and the note is
    // the correction instruction they must address before re-submitting. The
    // /apply POST upsert resets them back to SUBMITTED on re-send.
    await prisma.tutorApplication.update({
      where: { id },
      data: { status: 'NEEDS_REVISION', moderatorNote: note, reviewedAt: new Date() },
    })
    await notify(app.userId, {
      type: 'APPLICATION_STATUS',
      title: 'შეასწორე განაცხადი',
      body: note!.trim(),
      href: '/apply',
    })
    await audit(admin.id, 'application.revise', { targetType: 'TutorApplication', targetId: id, meta: { note, applicantUserId: app.userId } })
  } else {
    await prisma.tutorApplication.update({
      where: { id },
      data: { status: 'REJECTED', moderatorNote: note, reviewedAt: new Date() },
    })
    await notify(app.userId, {
      type: 'APPLICATION_STATUS',
      title: 'შენი განაცხადი უარყოფილია',
      body: note?.trim() || 'შემდგომი შეკითხვებისთვის მოგვწერე.',
      href: '/apply',
    })
    await audit(admin.id, 'application.reject', { targetType: 'TutorApplication', targetId: id, meta: { note, applicantUserId: app.userId } })
  }
  return NextResponse.json({ ok: true })
}
