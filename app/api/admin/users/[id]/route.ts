import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { stripTutorBlobs, stripAvatar } from '@/lib/stripTutorBlobs'

// Full admin drilldown for a single user: profile + tutor row (if any) +
// all bookings (as student and as tutor) + reviews written + reviews received
// + recent notifications. Kept in one endpoint so the modal makes a single call.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireRole('ADMIN')
  const { id } = await ctx.params

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      tutor: {
        include: { category: { select: { id: true, slug: true, name: true } } },
        // featured + videoUrl are new fields — Prisma default is `include: true`
        // which returns all scalar columns, so no explicit select needed.
      },
      _count: {
        select: {
          bookingsAsStudent: true,
          reviewsGiven: true,
          sentMessages: true,
          notifications: true,
          favorites: true,
        },
      },
    },
  })
  if (!user) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const [bookingsAsStudent, bookingsAsTutor, reviewsWritten, reviewsReceived, recentNotifications] =
    await Promise.all([
      prisma.booking.findMany({
        where: { studentId: id },
        orderBy: { startAt: 'desc' },
        take: 30,
        include: {
          tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        },
      }),
      user.tutor
        ? prisma.booking.findMany({
            where: { tutorId: user.tutor.id },
            orderBy: { startAt: 'desc' },
            take: 30,
            include: {
              student: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          })
        : Promise.resolve([]),
      prisma.review.findMany({
        where: { studentId: id },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        },
      }),
      user.tutor
        ? prisma.review.findMany({
            where: { tutorId: user.tutor.id },
            orderBy: { createdAt: 'desc' },
            take: 15,
            include: { student: { select: { id: true, fullName: true, avatarUrl: true } } },
          })
        : Promise.resolve([]),
      prisma.notification.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

  // Never leak passwordHash to admin UI either.
  const { passwordHash: _ph, ...safeUser } = user as any

  // Each counterparty row carries a full TutorProfile / User — strip the blobs
  // so this one-shot modal call doesn't drag ~45 avatars/profession blobs along.
  return NextResponse.json({
    user: safeUser,
    bookingsAsStudent: bookingsAsStudent.map(b => ({ ...b, tutor: stripTutorBlobs(b.tutor) })),
    bookingsAsTutor: bookingsAsTutor.map(b => ({ ...b, student: stripAvatar(b.student) })),
    reviewsWritten: reviewsWritten.map(r => ({ ...r, tutor: stripTutorBlobs(r.tutor) })),
    reviewsReceived: reviewsReceived.map(r => ({ ...r, student: stripAvatar(r.student) })),
    recentNotifications,
  })
}

/* ── Admin safety actions: suspend / unsuspend ──
   Guarded identically to every other /api/admin route (requireRole('ADMIN'))
   and audit-logged, following app/api/admin/tutors/[id]/featured as the
   pattern. Suspend requires a non-empty reason (kept in the audit meta). */
const PatchBody = z.object({
  action: z.enum(['suspend', 'unsuspend', 'makeAdmin', 'revokeAdmin']),
  reason: z.string().max(300).optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireRole('ADMIN')
  const { id } = await ctx.params
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { action } = parsed.data
  const reason = parsed.data.reason?.trim() || null

  if (action === 'suspend' && !reason) {
    return NextResponse.json(
      { ok: false, error: 'REASON_REQUIRED', message: 'შეჩერების მიზეზი სავალდებულოა' },
      { status: 400 },
    )
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, suspendedAt: true },
  })
  if (!target) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  // ── Role changes (grant / revoke ADMIN) ──────────────────────────────────
  // Guarded hard because of the 2026-07-18 incident where a demotion left ZERO
  // admins and locked everyone out: you can never demote yourself, and never
  // demote the last remaining admin.
  if (action === 'makeAdmin' || action === 'revokeAdmin') {
    if (action === 'makeAdmin' && target.role === 'ADMIN') {
      return NextResponse.json({ ok: false, error: 'ALREADY_ADMIN', message: 'უკვე ადმინია' }, { status: 400 })
    }
    if (action === 'revokeAdmin') {
      if (target.role !== 'ADMIN') {
        return NextResponse.json({ ok: false, error: 'NOT_ADMIN', message: 'ეს მომხმარებელი ადმინი არ არის' }, { status: 400 })
      }
      if (target.id === admin.id) {
        return NextResponse.json({ ok: false, error: 'CANNOT_DEMOTE_SELF', message: 'საკუთარ თავს ვერ მოხსნი ადმინობას' }, { status: 400 })
      }
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) {
        return NextResponse.json({ ok: false, error: 'LAST_ADMIN', message: 'ბოლო ადმინს ვერ მოხსნი — ჯერ სხვა ადმინი დანიშნე' }, { status: 400 })
      }
    }
    const newRole = action === 'makeAdmin' ? 'ADMIN' : 'STUDENT'
    const u = await prisma.user.update({ where: { id }, data: { role: newRole }, select: { id: true, role: true } })
    // Demotion: wipe sessions so the ex-admin's shell drops its admin access now.
    if (action === 'revokeAdmin') await prisma.session.deleteMany({ where: { userId: id } }).catch(() => {})
    await audit(admin.id, action === 'makeAdmin' ? 'user.makeAdmin' : 'user.revokeAdmin', { targetType: 'User', targetId: id })
    return NextResponse.json({ ok: true, user: u })
  }

  // Admins can't suspend admins (or themselves) — removes the foot-gun of
  // locking the whole staff out via the UI.
  if (action === 'suspend' && (target.role === 'ADMIN' || target.id === admin.id)) {
    return NextResponse.json(
      { ok: false, error: 'FORBIDDEN_TARGET', message: 'ადმინის ანგარიშის შეჩერება არ შეიძლება' },
      { status: 400 },
    )
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { suspendedAt: action === 'suspend' ? new Date() : null },
    select: { id: true, suspendedAt: true },
  })

  // Revoke every live session so a suspended user is logged out immediately,
  // not just blocked on next login. getCurrentUser also rejects suspended users
  // defensively, but wiping sessions makes the lockout instant and clean.
  if (action === 'suspend') {
    await prisma.session.deleteMany({ where: { userId: id } }).catch(() => {})
  }

  await audit(admin.id, action === 'suspend' ? 'user.suspend' : 'user.unsuspend', {
    targetType: 'User',
    targetId: id,
    meta: { reason },
  })

  return NextResponse.json({ ok: true, user: updated })
}
