import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hashPassword, verifyPassword, revokeOtherSessions } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'

const Body = z.object({
  // currentPassword only needs to be non-empty (it's checked against the hash).
  currentPassword: z.string().min(1),
  // New password must meet the SAME min-8 policy as signup + reset, so the
  // change endpoint can't be used to downgrade to a weaker password.
  newPassword: z.string().min(8).max(120),
})

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const rl = rateLimit(`pwchange:${user.id}`, 5, 15 * 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash)
  if (!ok) return NextResponse.json({ ok: false, error: 'BAD_CURRENT' }, { status: 400 })

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  })
  await revokeOtherSessions(user.id)
  return NextResponse.json({ ok: true })
}
