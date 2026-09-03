import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { z } from 'zod'
import { allMessageStates, setMessageState } from '@/lib/outboundSettings'
import { smsBalance } from '@/lib/sms'
import { OUTBOUND } from '@/lib/outbound'
import { MESSAGE_TEXTS, messageTextKey } from '@/lib/messageTextDefs'
import { previewOf } from '@/lib/outboundPreview'
import { audit } from '@/lib/audit'

// What the site sends, and what it actually sent — for the admin „შეტყობინებები"
// tab.
//
// Owner, 2026-09-02: „სად მიდის როდის მიდის და ასეთი დეტალები რომ კარგად იყოს
// მოწესრიგებული და არ გაგვეპაროს შეცდომები."
//
// Two halves, and they answer different questions:
//   • the TRANSPORT — is anything going out at all, and by which road
//   • the LOG (MessageLog) — what happened, per message, per attempt
//
// ⚠️ SECRETS ARE NEVER RETURNED, only whether they are SET — the same rule
// /api/admin/health follows. A key rendered into an admin page is a key in a
// browser cache, a screenshot and a support ticket.
//
// ⚠️ AND NO MESSAGE BODY EXISTS TO RETURN. MessageLog stores none by design
// (see the model's own comment): most of what goes out is a one-time code.

export const dynamic = 'force-dynamic'

const PAGE = 60

export async function GET(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const url = new URL(req.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 7, 1), 90)
  const status = url.searchParams.get('status') || ''
  const key = url.searchParams.get('key') || ''
  const channel = url.searchParams.get('channel') || ''
  const skip = Math.max(Number(url.searchParams.get('skip')) || 0, 0)

  const since = new Date(Date.now() - days * 86_400_000)
  const where = {
    createdAt: { gte: since },
    ...(status ? { status } : {}),
    ...(key ? { key } : {}),
    ...(channel ? { channel } : {}),
  }

  // ⚠️ THE TABLE MAY NOT BE THERE YET. lib/dbBoot creates it at first request,
  // and this route can be the request that arrives first on a cold process. A
  // 500 on the tab that exists to show failures would be a poor joke, so the
  // read degrades to „nothing yet" and says so.
  let rows: Awaited<ReturnType<typeof prisma.messageLog.findMany>> = []
  let total = 0
  let grouped: { key: string; channel: string; status: string; _count: { _all: number } }[] = []
  let tableReady = true
  try {
    ;[rows, total, grouped] = await Promise.all([
      prisma.messageLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: PAGE, skip }),
      prisma.messageLog.count({ where }),
      prisma.messageLog.groupBy({
        by: ['key', 'channel', 'status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ])
  } catch {
    tableReady = false
  }

  // Last attempt per key, so the registry row can say „ბოლოს: …" without a
  // query per message. One extra read over the same window.
  const lastByKey: Record<string, string> = {}
  if (tableReady) {
    const recent = await prisma.messageLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { key: true, createdAt: true },
      take: 2000,
    }).catch(() => [])
    for (const r of recent) if (!lastByKey[r.key]) lastByKey[r.key] = r.createdAt.toISOString()
  }

  // ⚠️ THE BALANCE IS FETCHED, NOT STORED, and it is allowed to fail. It is one
  // outbound call to sender.ge per tab open; a slow or down provider must show
  // the tab without it rather than 500 the page that exists to report trouble.
  const [balance, settings] = await Promise.all([
    smsBalance().catch(() => null),
    allMessageStates().catch(() => ({})),
  ])

  // What each message SAYS, rendered from the real builders. Pure functions, no
  // database — cheap enough to send with the page rather than behind a click,
  // and „what does this one actually say" is the question a switch raises.
  // ⚠️ AWAITED, and `Record<string, unknown>` is why that had to be noticed by
  // hand: a forgotten await here type-checks perfectly and ships a page whose
  // every preview is an empty object.
  const previews: Record<string, unknown> = {}
  for (const d of OUTBOUND) {
    const pv = await previewOf(d.key)
    if (pv) previews[d.key] = pv
  }

  /* ── the words themselves, ready to edit in place ───────────────────────
     ⚠️ READ HERE, SAVED THROUGH /api/admin/site-texts. The rows ARE site texts
     (lib/messageTextDefs rides SITE_TEXTS), so the existing PATCH — with its
     key check, its audit line and its cache invalidation — is the only writer.
     A second save route for the same table is a second set of rules to keep in
     step, and the first thing to drift would be the audit trail. */
  const overrides = new Map(
    (await prisma.siteText.findMany({ select: { key: true, value: true } }).catch(() => []))
      .map(r => [r.key, r.value] as const),
  )
  const copy = MESSAGE_TEXTS.map(g => ({
    key: g.key,
    label: g.label,
    texts: g.texts.map(x => {
      const k = messageTextKey(g.key, x.part)
      return {
        key: k,
        label: x.label,
        value: overrides.get(k) ?? x.default,
        fallback: x.default,
        multiline: Boolean(x.multiline),
        vars: x.vars ?? [],
        overridden: overrides.has(k),
      }
    }),
  }))

  return NextResponse.json({
    balance,
    settings,
    previews,
    copy,
    tableReady,
    days,
    transport: {
      // The exact strings lib/mailer and lib/sms branch on — printed rather
      // than interpreted, because „what did you actually read" is the question
      // an operator has when a message did not go.
      mailerMode: process.env.MAILER_MODE || '(unset → gmail if configured, else log)',
      mailOnlyAfter: process.env.MAIL_ONLY_AFTER || null,
      gmailConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
      smsMode: process.env.SMS_MODE || '(unset → log)',
      smsOnlyAfter: process.env.SMS_ONLY_AFTER || null,
      smsKeySet: Boolean(process.env.SENDER_GE_API_KEY),
    },
    counts: grouped.map(g => ({ key: g.key, channel: g.channel, status: g.status, n: g._count._all })),
    lastByKey,
    total,
    rows: rows.map(r => ({
      id: r.id, channel: r.channel, key: r.key, to: r.to, status: r.status,
      mode: r.mode, detail: r.detail, ref: r.ref, parts: r.parts,
      delivery: r.delivery,
      at: r.createdAt.toISOString(),
    })),
    hasMore: skip + rows.length < total,
  })
}

/* ── flipping one switch ─────────────────────────────────────────────────── */

const Patch = z.object({
  key: z.string().min(1).max(80),
  channel: z.enum(['mail', 'sms']),
  on: z.boolean(),
})

/**
 * Turn one channel of one message on or off.
 *
 * ⚠️ THE REFUSALS LIVE IN lib/outboundSettings, NOT HERE. A password-reset code
 * has no switch on screen, and it must have none behind `curl` either — the rule
 * is applied where the write happens, and this route only reports it. A refusal
 * is a 409 rather than a 400: the request was well formed, the state change is
 * not allowed.
 */
export async function PATCH(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const parsed = Patch.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const { key, channel, on } = parsed.data
  const next = await setMessageState(key, channel, on)
  if (!next) return NextResponse.json({ ok: false, error: 'NOT_ALLOWED' }, { status: 409 })

  // Who silenced which letter, and when. A message that stopped arriving is a
  // support question, and the audit trail is where that question is answered.
  await audit(auth.user!.id, on ? 'message.on' : 'message.off', {
    targetType: 'MessageSetting', targetId: key, meta: { channel },
  })
  return NextResponse.json({ ok: true, state: next })
}
