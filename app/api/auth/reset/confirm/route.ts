import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword, createSession } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rateLimit'

const Body = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(120),
})

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`resetconfirm:${ip}`, 10, 60 * 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex')
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!rec || rec.consumed || rec.expiresAt < new Date()) {
    return NextResponse.json({ ok: false, error: 'BAD_TOKEN' }, { status: 400 })
  }

  const newHash = await hashPassword(parsed.data.password)

  // Atomically CLAIM the token: only proceed if it's still un-consumed. Two
  // concurrent requests with the same token can no longer both pass the check
  // above — the loser's updateMany matches 0 rows and bails.
  const claim = await prisma.passwordResetToken.updateMany({
    where: { id: rec.id, consumed: false },
    data: { consumed: true },
  })
  if (claim.count !== 1) {
    return NextResponse.json({ ok: false, error: 'BAD_TOKEN' }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: rec.userId },
      data: { passwordHash: newHash },
    }),
    // invalidate all sessions for security
    prisma.session.deleteMany({ where: { userId: rec.userId } }),
  ])

  await createSession(rec.userId)
  const user = await prisma.user.findUnique({ where: { id: rec.userId } })
  return NextResponse.json({ ok: true, role: user?.role })
}
