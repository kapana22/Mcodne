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

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireRole('ADMIN')
  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })
  const { action, note } = parsed.data

  // Only need userId to update; skip the full user include.
  const app = await prisma.tutorApplication.findUnique({ where: { id } })
  if (!app) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  if (action === 'approve') {
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
    await notify(app.userId, {
      type: 'APPLICATION_STATUS',
      title: 'შენი განაცხადი დამტკიცდა',
      body: note?.trim() || 'გილოცავთ — ახლა ხარ ექსპერტი. დაასრულე პროფილი.',
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
