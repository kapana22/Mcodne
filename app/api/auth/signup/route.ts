import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSession, hashPassword } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rateLimit'

// NB: `role` is intentionally NOT accepted from the client. Every self-signup
// creates a STUDENT; promotion to TUTOR happens only through the moderated
// application flow (POST /api/applications → PATCH /api/applications/[id]).
const Body = z.object({
  fullName: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(120),
})

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`signup:${ip}`, 5, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec },
      { status: 429 },
    )
  }

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const { fullName, email, password } = parsed.data
  const emailLc = email.toLowerCase().trim()
  const existing = await prisma.user.findUnique({ where: { email: emailLc } })
  if (existing) {
    return NextResponse.json({ ok: false, error: 'EMAIL_TAKEN' }, { status: 409 })
  }
  const user = await prisma.user.create({
    data: {
      email: emailLc,
      fullName: fullName.trim(),
      passwordHash: await hashPassword(password),
      role: 'STUDENT',
    },
  })
  await createSession(user.id)
  return NextResponse.json({ ok: true, role: user.role, userId: user.id })
}
