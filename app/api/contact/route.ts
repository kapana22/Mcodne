import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendMail } from '@/lib/mailer'
import { rateLimit, clientIp } from '@/lib/rateLimit'

const Body = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  topic: z.enum(['general', 'expert', 'billing', 'press', 'other']).default('general'),
  message: z.string().min(10).max(4000),
})

const TOPIC_LABELS: Record<string, string> = {
  general: 'ზოგადი კითხვა',
  expert: 'ექსპერტთა შერჩევა',
  billing: 'გადახდა / ინვოისი',
  press: 'პრესა / პარტნიორობა',
  other: 'სხვა',
}

export async function POST(req: Request) {
  // Unauthenticated endpoint → rate-limit hard by IP so the inbox can't be
  // spammed / mail-bombed. 5 messages per hour per IP is generous for a
  // legitimate visitor; hostile for a script.
  const ip = clientIp(req)
  const rl = rateLimit(`contact:${ip}`, 5, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec },
      { status: 429 },
    )
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 })
  }

  const parsed = Body.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  const { name, email, topic, message } = parsed.data
  const topicLabel = TOPIC_LABELS[topic] ?? topic

  // TODO: wire real deliverability (Resend / SES) + reply-to headers. Currently
  // sendMail() falls back to console log when MAILER_MODE !== 'send'.
  const html = `
    <div style="font-family:sans-serif;line-height:1.6;color:#181B20">
      <h2 style="margin:0 0 12px">ახალი შეტყობინება — მცოდნე</h2>
      <p><b>სახელი:</b> ${escapeHtml(name)}</p>
      <p><b>ელფოსტა:</b> ${escapeHtml(email)}</p>
      <p><b>თემა:</b> ${escapeHtml(topicLabel)}</p>
      <hr style="border:none;border-top:1px solid #DCDFE4;margin:16px 0" />
      <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
    </div>`

  const text = `ახალი შეტყობინება — მცოდნე\n\nსახელი: ${name}\nელფოსტა: ${email}\nთემა: ${topicLabel}\n\n${message}`

  await sendMail({
    to: process.env.CONTACT_INBOX || 'hi@mcodne.ge',
    subject: `[მცოდნე] ${topicLabel} — ${name}`,
    html,
    text,
  })

  return NextResponse.json({ ok: true })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
