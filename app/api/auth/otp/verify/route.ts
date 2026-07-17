import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { createSession } from '@/lib/auth'

const Body = z.object({
  email: z.string().email(),
  code: z.string().length(6),
})

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`otpverify:${ip}`, 10, 15 * 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const email = parsed.data.email.toLowerCase().trim()

  // Per-email rate limit closes the "rotate IPs to brute-force" hole. 5 wrong
  // codes per 15 min per email; enough for a legit user, hostile for
  // brute-forcing a 6-digit space.
  const rlEmail = rateLimit(`otpverify:email:${email}`, 5, 15 * 60)
  if (!rlEmail.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryInSec: rlEmail.retryInSec },
      { status: 429 },
    )
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return NextResponse.json({ ok: false, error: 'BAD_CODE' }, { status: 400 })

  const otp = await prisma.otpCode.findFirst({
    where: {
      userId: user.id,
      purpose: 'verify',
      code: parsed.data.code,
      consumed: false,
      expiresAt: { gt: new Date() },
    },
  })
  if (!otp) return NextResponse.json({ ok: false, error: 'BAD_CODE' }, { status: 400 })

  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } }),
    prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
  ])

  await createSession(user.id)
  return NextResponse.json({ ok: true, role: user.role })
}
