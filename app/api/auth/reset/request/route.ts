import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes, createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { siteUrl } from '@/lib/siteUrl'

const Body = z.object({ email: z.string().email() })

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`reset:${ip}`, 5, 60 * 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const email = parsed.data.email.toLowerCase().trim()

  // Per-email cap in addition to the IP cap above. The IP key is derived from
  // client-controlled X-Forwarded-For, so a header-rotating attacker can dodge
  // it and mail-bomb one victim's inbox; this limiter is keyed on the target
  // address and can't be spoofed away.
  const rlEmail = rateLimit(`reset-email:${email}`, 5, 60 * 60)
  if (!rlEmail.ok) return NextResponse.json({ ok: true })

  const user = await prisma.user.findUnique({ where: { email } })
  // Do not leak existence
  if (!user) return NextResponse.json({ ok: true })

  const token = randomBytes(24).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, consumed: false } })
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } })

  // Never derive the reset URL from the request Host / X-Forwarded-Host —
  // an attacker can forge those headers to make the email point at a domain
  // they control and steal the token. Use the trusted allowlist.
  const url = `${siteUrl(req)}/signin?view=reset&t=${token}`

  await sendMail({
    to: email,
    subject: 'პაროლის აღდგენა — მცოდნე',
    html: `<p>დააჭირე ბმულს ახალი პაროლის დასაყენებლად:</p><p><a href="${url}">${url}</a></p><p>ვადა: 1 საათი.</p>`,
    text: `პაროლის აღდგენა: ${url} (1 საათი)`,
  })

  return NextResponse.json({ ok: true })
}
