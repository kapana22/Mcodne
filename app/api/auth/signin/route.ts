import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSession, postAuthHome, verifyPassword } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rateLimit'

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Optional — when the client sends `false`, the session is shortened to 12h
  // instead of the default 30d. Missing / true keeps the "remember me" default.
  rememberMe: z.boolean().optional(),
})

// Pre-computed dummy bcrypt hash. Running verifyPassword against this when the
// user record is missing keeps signin's response time constant, closing the
// timing side-channel that leaks whether an email is registered.
const DUMMY_HASH =
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8aBz3ZoR1P8f4bH2v8f4bH2v8f4bH2'

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`signin:${ip}`, 8, 15 * 60)
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
  const { email, password, rememberMe } = parsed.data
  const normEmail = email.toLowerCase().trim()

  // Per-ACCOUNT limiter. The IP limiter above is bypassable by spoofing
  // X-Forwarded-For (attacker-controlled header → attacker-chosen bucket), so a
  // second limiter keyed on the target email caps brute force against a single
  // account regardless of source IP: 8 failed attempts / 15 min.
  const rlAcct = rateLimit(`signin-acct:${normEmail}`, 8, 15 * 60)
  if (!rlAcct.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryInSec: rlAcct.retryInSec },
      { status: 429 },
    )
  }

  const user = await prisma.user.findUnique({ where: { email: normEmail } })
  const hash = user?.passwordHash ?? DUMMY_HASH
  const passwordOk = await verifyPassword(password, hash)
  if (!user || !passwordOk) {
    return NextResponse.json({ ok: false, error: 'BAD_CREDENTIALS' }, { status: 401 })
  }
  await createSession(user.id, { rememberMe: rememberMe !== false })
  // `home` is the server-decided landing (role home, or /apply for a pending
  // expert applicant). The client prefers it over its own role mapping; an
  // explicit ?redirect= deep-link still wins client-side.
  return NextResponse.json({ ok: true, role: user.role, home: await postAuthHome(user) })
}
