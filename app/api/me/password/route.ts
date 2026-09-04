import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PasswordChangeInput } from '@/lib/passwordPolicy'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hashPassword, verifyPassword, revokeOtherSessions } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'

// ⚠️ THE SCHEMA IS SHARED, AND THAT IS THE FIX FOR A REAL SHIPPED BUG. It used
// to be declared here; app/work/account posted `{ current, next }` at it and
// every provider password change had been failing since. One object in
// lib/passwordPolicy, parsed by this route and used by both forms to build
// their body — see the note there.
const Body = PasswordChangeInput

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const rl = rateLimit(`pwchange:${user.id}`, 5, 15 * 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  /* ⚠️ A PASSWORDLESS ACCOUNT IS SETTING ITS FIRST PASSWORD, NOT SKIPPING A
     CHECK (2026-09-04). `passwordHash` is null only for somebody who registered
     by phone or through Google; they hold a live session, which is a stronger
     proof than a password they have never had. An account that DOES have one
     must still prove it — that rule is enforced here rather than in the parser,
     because the parser cannot see the account. */
  if (user.passwordHash) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json({ ok: false, error: 'CURRENT_PASSWORD_REQUIRED' }, { status: 400 })
    }
    const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash)
    if (!ok) return NextResponse.json({ ok: false, error: 'BAD_CURRENT' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  })
  await revokeOtherSessions(user.id)
  return NextResponse.json({ ok: true })
}
