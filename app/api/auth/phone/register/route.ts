import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { firstGeorgianMessage, georgianNameRefine } from '@/lib/georgianText'
import { redeemPhoneTicket } from '@/lib/phoneAuth'
import { ensureDbReady } from '@/lib/dbBoot'
import { ROLE } from '@/lib/roles'

// STEP 3 OF 3 — the name, and the account.
//
// ⚠️ THE PHONE COMES FROM THE TICKET, NEVER FROM THE BODY. The ticket is what
// step 2 handed back after a code was answered on that number; taking a phone
// field here as well would mean this endpoint could mint a verified account for
// any number somebody typed. There is no phone in `Body` on purpose.
//
// NB: `role` is not accepted from the client either — every self-registration
// creates a USER, and selling is a separate, moderated door (/join).

const Body = z.object({
  // The same front-door rule as /api/auth/signup. It is the reason every
  // Latin-named row on the site got in before it existed.
  fullName: z.string().min(2).max(80).superRefine(georgianNameRefine('სახელი')),
  ticket: z.string().length(64),
})

export async function POST(req: Request) {
  await ensureDbReady()

  const ip = clientIp(req)
  const rl = rateLimit(`phonesignup:${ip}`, 5, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // The name rule states WHY it refused; a bare INVALID throws that sentence
    // away, and this is the front door — there is no other screen to learn it on.
    const msg = firstGeorgianMessage(parsed.error)
    return NextResponse.json(
      { ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', field: msg ? 'fullName' : undefined, message: msg ?? undefined },
      { status: 400 },
    )
  }

  // Single use: a replayed ticket finds nothing and creates no second account.
  const phone = await redeemPhoneTicket(parsed.data.ticket)
  if (!phone) return NextResponse.json({ ok: false, error: 'TICKET_EXPIRED' }, { status: 400 })

  let user
  try {
    user = await prisma.user.create({
      data: {
        // ⚠️ NO EMAIL AND NO PASSWORD, and neither is a placeholder. A synthetic
        // address („555123456@mcodne.ge") would be a row the mailer then tries
        // to deliver to, and CLAUDE.md rule 6 is about exactly this kind of
        // invented value. Both columns are nullable as of 2026-09-04.
        email: null,
        passwordHash: null,
        fullName: parsed.data.fullName.trim(),
        phone,
        phoneVerified: true,
        role: ROLE.USER,
      },
    })
  } catch (e: unknown) {
    /* The partial unique index on a VERIFIED phone. Somebody else finished
       registering this number between the code and the name — rare, and the
       honest answer is „start again", because the number now belongs to them
       and the next code will sign them in. */
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'PHONE_TAKEN' }, { status: 409 })
    }
    throw e
  }

  await createSession(user.id)
  // ⚠️ NO WELCOME MESSAGE. The letter has no address to go to, and an SMS
  // welcome would bill a part to say nothing the screen has not already said.
  return NextResponse.json({ ok: true, role: user.role, userId: user.id, home: '/me' })
}
