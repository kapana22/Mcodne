import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { firstGeorgianMessage, georgianNameRefine } from '@/lib/georgianText'
import { prisma } from '@/lib/prisma'
import { createSession, hashPassword } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { sendMail } from '@/lib/mailer'
import { welcomeEmail } from '@/lib/emailTemplates'
import { normalizePhone, phoneFormatError } from '@/lib/phone'
import { ROLE } from '@/lib/roles'

// NB: `role` is intentionally NOT accepted from the client. Every self-signup
// creates a STUDENT; promotion to TUTOR happens only through the moderated
// application flow (POST /api/applications → PATCH /api/applications/[id]).
const Body = z.object({
  // THE FRONT DOOR, and it was open: `min(2).max(80)` and nothing else, which
  // is how every Latin-named row on the site got in.
  fullName: z.string().min(2).max(80).superRefine(georgianNameRefine('სახელი')),
  email: z.string().email(),
  password: z.string().min(8).max(120),
  // Required since 2026-08-09 (owner). The rule lives in lib/phone so the form,
  // this route, /apply and the profile editor all judge a number the same way.
  // Refused here as a NAMED field: a bare 400 INVALID on a required field the
  // form only just grew is the „wall with no sign on it" that lib/applyValidation
  // exists to prevent.
  phone: z.string().min(1).max(40),
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
    // The name rule right above states WHY it refused; a bare INVALID threw
    // that sentence away, and this is the front door — the person has no other
    // screen to learn it on. `field` is what the form focuses.
    const msg = firstGeorgianMessage(parsed.error)
    return NextResponse.json(
      { ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', field: msg ? 'fullName' : undefined, message: msg ?? undefined },
      { status: 400 },
    )
  }
  const { fullName, email, password, phone } = parsed.data
  const phoneMsg = phoneFormatError(phone, { required: true })
  if (phoneMsg) {
    return NextResponse.json(
      { ok: false, error: 'INVALID_PHONE', field: 'phone', message: phoneMsg },
      { status: 400 },
    )
  }
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
        phone: normalizePhone(phone),
        role: ROLE.CLIENT,
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
