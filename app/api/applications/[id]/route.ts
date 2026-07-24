import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { audit } from '@/lib/audit'

const Body = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().optional(),
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
  const { action, note } = parsed.data

  // Reject must carry a reason — it is sent to the applicant and kept in the
  // audit trail. The admin UI enforces this too; the server is the backstop.
  if (action === 'reject' && !note?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'REASON_REQUIRED', message: 'უარყოფის მიზეზი სავალდებულოა' },
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
          headline: app.specialty,
          specialty: app.specialty,
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
    await notify(app.userId, {
      type: 'APPLICATION_STATUS',
      title: 'შენი განაცხადი დამტკიცდა',
      body: note?.trim() || 'გილოცავ — ახლა ხარ ექსპერტი. დაასრულე პროფილი.',
      href: '/tutor/profile',
    })
    await audit(admin.id, 'application.approve', { targetType: 'TutorApplication', targetId: id, meta: { note, applicantUserId: app.userId } })
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
