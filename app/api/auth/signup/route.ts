import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSession, hashPassword } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { sendMail } from '@/lib/mailer'
import { welcomeEmail } from '@/lib/emailTemplates'

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

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const { fullName, email, password } = parsed.data
  const emailLc = email.toLowerCase().trim()
  const existing = await prisma.user.findUnique({ where: { email: emailLc } })
  if (existing) {
    return NextResponse.json({ ok: false, error: 'EMAIL_TAKEN' }, { status: 409 })
  }
  let user
  try {
    user = await prisma.user.create({
      data: {
        email: emailLc,
        fullName: fullName.trim(),
        passwordHash: await hashPassword(password),
        role: 'STUDENT',
      },
    })
  } catch (e: unknown) {
    // Concurrent duplicate signup (double-submit / race with the existence
    // check) trips the @unique constraint → return the friendly 409 the client
    // handles, not an opaque 500.
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'EMAIL_TAKEN' }, { status: 409 })
    }
    throw e
  }
  await createSession(user.id)

  // Welcome email — fire-and-forget so a mail hiccup never blocks signup, and
  // registration itself is NOT gated on it (no verification wall).
  after(async () => {
    const { subject, html } = welcomeEmail(user.fullName)
    await sendMail({ to: user.email, subject, html }).catch(() => {})
  })

  return NextResponse.json({ ok: true, role: user.role, userId: user.id })
}
