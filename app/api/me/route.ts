import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { getCurrentUser, hashPassword, verifyPassword, revokeOtherSessions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// The header/nav reads role from here to decide what to render. If the browser
// serves a cached response, the top bar keeps showing the PREVIOUS role after
// an admin impersonation swap or exit — no-store guarantees every read is live.
export const dynamic = 'force-dynamic'

// Applied to every response so no browser/proxy layer caches an identity.
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ user: null }, { headers: NO_STORE })
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      bio: (user as any).bio,
      emailVerified: (user as any).emailVerified,
      // Exposed so the client can detect "brand-new account" and show the
      // onboarding welcome banner for the first few days.
      createdAt: (user as any).createdAt ?? null,
    },
  }, { headers: NO_STORE })
}

const Patch = z.object({
  fullName: z.string().min(2).max(80).optional(),
  phone: z.string().max(40).optional(),
  bio: z.string().max(500).optional(),
  // Only a same-origin uploaded image (data:image/…) or an https URL — never a
  // `javascript:`/`data:text/html` string that could be reflected elsewhere.
  avatarUrl: z.string().max(500_000)
    .refine(v => /^data:image\/(png|jpeg|webp|gif);base64,/.test(v) || /^https:\/\//.test(v), 'BAD_AVATAR')
    .nullable().optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).max(120).optional(),
})

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const parsed = Patch.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const { fullName, phone, bio, avatarUrl, currentPassword, newPassword } = parsed.data

  const data: any = {}
  if (fullName !== undefined) data.fullName = fullName.trim()
  if (phone !== undefined) data.phone = phone.trim() || null
  if (bio !== undefined) data.bio = bio.trim() || null
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl

  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ ok: false, error: 'CURRENT_PASSWORD_REQUIRED' }, { status: 400 })
    }
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
    if (!fresh) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
    const ok = await verifyPassword(currentPassword, fresh.passwordHash)
    if (!ok) return NextResponse.json({ ok: false, error: 'BAD_CURRENT_PASSWORD' }, { status: 400 })
    data.passwordHash = await hashPassword(newPassword)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'NOTHING_TO_UPDATE' }, { status: 400 })
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  if (data.passwordHash) {
    await revokeOtherSessions(user.id)
  }
  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      fullName: updated.fullName,
      phone: updated.phone,
      bio: (updated as any).bio,
      avatarUrl: updated.avatarUrl,
    },
  })
}

const DeleteBody = z.object({
  currentPassword: z.string().min(6),
  confirm: z.literal('DELETE'),
})

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash)
  if (!ok) return NextResponse.json({ ok: false, error: 'BAD_CURRENT_PASSWORD' }, { status: 400 })

  // Refuse if the account has live obligations (upcoming/live sessions in either role).
  const [asStudent, asTutor] = await Promise.all([
    prisma.booking.count({
      where: {
        studentId: user.id,
        status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
      },
    }),
    prisma.booking.count({
      where: {
        tutor: { userId: user.id },
        status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
      },
    }),
  ])
  if (asStudent + asTutor > 0) {
    return NextResponse.json({
      ok: false,
      error: 'HAS_ACTIVE_BOOKINGS',
      count: asStudent + asTutor,
    }, { status: 409 })
  }

  // Cascade deletes via Prisma schema (User has onDelete: Cascade for sessions, otp,
  // reset tokens, tutor profile, application, favorites, notifications).
  // Historical bookings, messages, and reviews use FK-restrict — if any exist we
  // refuse rather than orphan referential integrity.
  try {
    await prisma.user.delete({ where: { id: user.id } })
  } catch (e: any) {
    if (e?.code === 'P2003' || e?.code === 'P2014') {
      return NextResponse.json({
        ok: false,
        error: 'HAS_HISTORY',
        hint: 'ანგარიშს აქვს დასრულებული ჯავშნები ან შეტყობინებები. მიმართე support-ს ხელით წაშლისთვის.',
      }, { status: 409 })
    }
    throw e
  }

  const jar = await cookies()
  jar.delete('mcodne_session')
  return NextResponse.json({ ok: true })
}
