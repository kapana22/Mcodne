import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { sendSms } from '@/lib/sms'
import { messageText } from '@/lib/messageText'
import { phoneLoginKey, issuePhoneCode } from '@/lib/phoneAuth'
import { ensureDbReady } from '@/lib/dbBoot'

// STEP 1 OF 3 — the number. Sends a code and says nothing else.
//
// ⚠️ THE ANSWER IS THE SAME WHETHER OR NOT THE NUMBER IS REGISTERED, and that
// is the whole reason registration and sign-in are one flow. A response that
// differed would turn this endpoint into a directory: type nine digits, learn
// whether that person has an account here. The screen that follows asks for the
// code either way, and only the person holding the handset ever learns which it
// was.

const Body = z.object({ phone: z.string().min(1).max(40) })

export async function POST(req: Request) {
  await ensureDbReady()

  const ip = clientIp(req)
  // Five numbers per address per 15 minutes. A person mistyping their own
  // number needs two or three; a script harvesting „which numbers exist" needs
  // thousands, and gets five.
  const rl = rateLimit(`phonestart:${ip}`, 5, 15 * 60)
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID_PHONE' }, { status: 400 })

  const phone = phoneLoginKey(parsed.data.phone)
  // ⚠️ THIS ONE *IS* TOLD, and it is not an existence leak. „That is not a
  // Georgian mobile" is a fact about the string they typed, not about our
  // database — and sender.ge cannot dial anything else (lib/sms), so silence
  // here would leave somebody waiting for a message that was never sendable.
  if (!phone) {
    return NextResponse.json({ ok: false, error: 'NOT_GEORGIAN_MOBILE' }, { status: 400 })
  }

  // Per-NUMBER cap beside the per-address one. `clientIp` reads a
  // client-controlled X-Forwarded-For, so without this a header-rotating script
  // could ring one person's phone all night at our expense.
  const rlPhone = rateLimit(`phonestart:num:${phone}`, 5, 15 * 60)
  if (!rlPhone.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rlPhone.retryInSec }, { status: 429 })
  }

  const { code } = await issuePhoneCode(phone)

  // The words are the owner's, in /admin. Only `{code}` is filled here, and
  // nowhere else — MessageLog stores no body and a live send never prints one.
  const t = await messageText()
  const text = t('auth.phoneCode', 'sms', { code })

  /* ⚠️ `skipSubscriptionCheck` — THE ONE HONEST USE OF IT. lib/sms documents
     the rule: an opt-out is for messages we decided to send. This person is at
     that moment watching the field the code goes in, and for a passwordless
     account a silently dropped code is a locked door with no error behind it. */
  const r = await sendSms({ key: 'auth.phoneCode', to: phone, text, skipSubscriptionCheck: true })

  /* ⚠️ A HELD MESSAGE IS A FAILURE HERE, THOUGH `sendSms` CALLS IT `ok`. That
     is right for a product notification — nothing broke, we chose not to send —
     and wrong for the front door: the admin switch for `auth.phoneCode` being
     off would otherwise show „code sent" to somebody who will never get one.
     `log` mode is a success on purpose; that is how the whole flow works in dev
     with no credential and no money spent. */
  if (!r.ok || r.mode.startsWith('held-')) {
    console.error('[server-error]', JSON.stringify({ scope: 'phone-auth', stage: 'send', mode: r.mode }))
    return NextResponse.json({ ok: false, error: 'SMS_FAILED' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
