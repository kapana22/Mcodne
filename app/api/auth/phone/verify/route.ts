import { NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { createSession, postAuthHome } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { phoneLoginKey, checkPhoneCode, accountForPhone, markPhoneVerified } from '@/lib/phoneAuth'

// STEP 2 OF 3 — the code. This is where the two paths finally part, and the
// first moment it is safe for them to: only somebody holding the handset gets
// this far.
//
//   · an account exists  → signed in, `{ home }`
//   · none does          → `{ needsName: true, ticket }`, on to step 3

const Body = z.object({ phone: z.string().min(1).max(40), code: z.string().length(6) })

export async function POST(req: Request) {
  await ensureDbReady()

  const ip = clientIp(req)
  const rl = rateLimit(`phoneverify:${ip}`, 20, 15 * 60)
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'BAD_CODE' }, { status: 400 })

  const phone = phoneLoginKey(parsed.data.phone)
  if (!phone) return NextResponse.json({ ok: false, error: 'BAD_CODE' }, { status: 400 })

  // The real floor is `attempts` inside the row (lib/phoneAuth) — it survives a
  // deploy, which this limiter does not. This one only stops the noise.
  const rlPhone = rateLimit(`phoneverify:num:${phone}`, 10, 15 * 60)
  if (!rlPhone.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rlPhone.retryInSec }, { status: 429 })
  }

  const checked = await checkPhoneCode(phone, parsed.data.code)
  if (!checked.ok) return NextResponse.json({ ok: false, error: 'BAD_CODE' }, { status: 400 })

  const account = await accountForPhone(phone)

  /* ⚠️ TWO ACCOUNTS, NEITHER PROVED — WE DO NOT GUESS. Two production rows share
     one number (measured 2026-09-04), typed back when a phone was contact
     information rather than a credential. Handing the handset's owner one of two
     strangers' accounts is worse than sending them to the door they actually
     registered at. `lib/phoneAuth → accountForPhone` explains all three answers. */
  if (account.kind === 'ambiguous') {
    return NextResponse.json({ ok: false, error: 'PHONE_AMBIGUOUS' }, { status: 409 })
  }

  if (account.kind === 'none') {
    // No account — step 3 asks the name. The ticket is the proof that THIS
    // browser answered a code on THIS number; without it the register endpoint
    // would have to take a bare phone number on trust.
    return NextResponse.json({ ok: true, needsName: true, ticket: checked.ticket })
  }

  // A suspended account must not get a session by any door — same rule as
  // /api/auth/otp/verify and /api/auth/signin.
  if (account.suspended) return NextResponse.json({ ok: false, error: 'SUSPENDED' }, { status: 403 })

  /* The number was on the row but nobody had ever proved they hold it. They
     just did. This can still LOSE — the partial unique index refuses a second
     verified holder — and losing means the number is not theirs. */
  if (account.claim && !(await markPhoneVerified(account.userId))) {
    return NextResponse.json({ ok: false, error: 'PHONE_AMBIGUOUS' }, { status: 409 })
  }

  const user = await prisma.user.findUnique({ where: { id: account.userId } })
  if (!user) return NextResponse.json({ ok: false, error: 'BAD_CODE' }, { status: 400 })

  await createSession(user.id)
  // Same shape as /api/auth/signin: the server decides the landing, so a
  // half-finished applicant goes back to /join rather than to a room.
  return NextResponse.json({ ok: true, role: user.role, home: await postAuthHome(user) })
}
