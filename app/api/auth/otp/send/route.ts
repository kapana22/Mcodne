import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomInt } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { rateLimit, clientIp } from '@/lib/rateLimit'

const Body = z.object({
  email: z.string().email(),
  purpose: z.enum(['verify', 'reset']).default('verify'),
})

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`otp:${ip}`, 5, 15 * 60)
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const email = parsed.data.email.toLowerCase().trim()

  // Per-email cap alongside the IP cap. The IP key comes from client-controlled
  // X-Forwarded-For and is spoofable, so without this a header-rotating attacker
  // could bomb a single inbox with OTP mail. Keyed on the target address.
  const rlEmail = rateLimit(`otp-email:${email}`, 5, 15 * 60)
  if (!rlEmail.ok) return NextResponse.json({ ok: true })

  const user = await prisma.user.findUnique({ where: { email } })
  // Do not leak existence — return ok regardless
  if (!user) return NextResponse.json({ ok: true })

  // crypto.randomInt is a CSPRNG; Math.random is not — an attacker who knows
  // the server start-time PRNG seed could predict codes.
  const code = String(randomInt(100000, 1_000_000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await prisma.otpCode.deleteMany({
    where: { userId: user.id, purpose: parsed.data.purpose, consumed: false },
  })
  await prisma.otpCode.create({
    data: { userId: user.id, code, purpose: parsed.data.purpose, expiresAt },
  })

  const mailResult = await sendMail({
    to: email,
    subject: parsed.data.purpose === 'verify' ? 'დაადასტურე ელფოსტა — მცოდნე' : 'პაროლის აღდგენა — მცოდნე',
    html: `<p>შენი კოდი: <b>${code}</b></p><p>ვადა: 10 წუთი</p>`,
    text: `შენი კოდი: ${code}. ვადა 10 წუთი.`,
  })

  if (!mailResult.ok) {
    // Bubble the failure to the UI so the user isn't left waiting for an email
    // that will never arrive. The code was persisted; a retry can resend.
    return NextResponse.json({ ok: false, error: 'MAIL_FAILED' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
