import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { destroySession, createSession, getCurrentUser, getImpersonatorId } from '@/lib/auth'
import { audit } from '@/lib/audit'

// POST /api/admin/impersonate/exit
// Restores the original admin's session. The admin's id is read from the
// CURRENT session's server-side `impersonatorId` — set only by an
// admin-authenticated /impersonate call — so this route cannot be used to
// escalate: without an active impersonated session there is nothing to restore.
export async function POST() {
  // Must be inside a real, live session (the impersonated user's).
  const current = await getCurrentUser()
  if (!current) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const originalAdminId = await getImpersonatorId()
  if (!originalAdminId) {
    return NextResponse.json({ ok: false, error: 'NOT_IMPERSONATING' }, { status: 400 })
  }

  const admin = await prisma.user.findUnique({
    where: { id: originalAdminId },
    select: { id: true, role: true },
  })
  if (!admin || admin.role !== 'ADMIN') {
    // Original admin no longer valid (deleted / demoted). Drop the impersonated
    // session and force a clean sign-in rather than restoring a non-admin.
    await destroySession()
    return NextResponse.json({ ok: false, error: 'ORIGINAL_ADMIN_INVALID' }, { status: 400 })
  }

  await destroySession()
  await createSession(admin.id)

  await audit(admin.id, 'user.impersonate.end', {
    targetType: 'User',
    targetId: current.id,
  })

  return NextResponse.json({ ok: true, redirect: '/admin' })
}
