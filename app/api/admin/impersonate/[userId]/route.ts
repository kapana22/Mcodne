import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole, destroySession, createSession, homeForRole } from '@/lib/auth'
import { audit } from '@/lib/audit'

const Params = z.object({ userId: z.string().min(1).max(64) })

// POST /api/admin/impersonate/[userId]
// Admin-only. Ends the admin's current session and mints a fresh session for
// the target user, tagging that session with the admin's id (server-side, on
// the Session row) so /exit can securely restore the admin. No client-readable
// cookie is used as the restore credential.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const admin = await requireRole('ADMIN')
  const { userId } = Params.parse(await ctx.params)

  if (userId === admin.id) {
    return NextResponse.json({ ok: false, error: 'CANNOT_IMPERSONATE_SELF' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  if (!target) {
    return NextResponse.json({ ok: false, error: 'USER_NOT_FOUND' }, { status: 404 })
  }
  // Never let one admin assume another admin's identity — lateral takeover and
  // muddied audit attribution. Impersonation is a support tool for reaching
  // student/tutor accounts only.
  if (target.role === 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'CANNOT_IMPERSONATE_ADMIN' }, { status: 403 })
  }

  // Destroy the admin's current session, then mint a fresh session for the
  // target user carrying `impersonatorId = admin.id`. The banner + /exit read
  // that value from the session row, so nothing client-forgeable is trusted.
  await destroySession()
  await createSession(target.id, { impersonatorId: admin.id })

  await audit(admin.id, 'user.impersonate.start', {
    targetType: 'User',
    targetId: target.id,
    meta: { targetRole: target.role },
  })

  // Only STUDENT/TUTOR reach here (ADMIN targets are rejected above).
  const redirect = homeForRole(target.role)

  return NextResponse.json({ ok: true, redirect })
}
