import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { sendMail } from '@/lib/mailer'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { normalizeRoute } from '@/lib/helpTopics'
import { MAX_QUERY_CHARS } from '@/lib/helpSearch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * „მოგვწერე პრობლემის შესახებ" — the help chat's way out to a human.
 *
 * WHY THIS IS NOT `/api/contact`. That route only sends an email; nothing is
 * stored. For a general contact form that is fine — the inbox IS the queue. But
 * this message is created at the exact moment the product failed somebody, and
 * two things follow from that: the admin panel has to be able to SHOW the list
 * (an email is not a queue you can count, sort or close), and the failure has
 * to travel with the request — which page, and what they had just asked the bot
 * that it could not answer.
 *
 * It still emails as well. If nobody opens the admin panel for a week, a person
 * waiting for an answer must not depend on that. Storage is the queue; the mail
 * is the alarm. The write is what decides the response — a failed email is
 * logged, never surfaced, and never loses the message.
 */

const Body = z.object({
  // 10 chars is the same floor /api/contact uses: below that it is not a
  // problem description, it is a mis-tap.
  message: z.string().trim().min(10).max(2000),
  // Optional, because demanding an address from someone who is already stuck is
  // how you lose the report. Without it the admin still sees the problem and
  // can fix the page — they just cannot reply.
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  name: z.string().trim().max(120).optional().or(z.literal('')),
  // What they asked the bot right before giving up.
  question: z.string().trim().max(MAX_QUERY_CHARS).optional().or(z.literal('')),
  route: z.string().trim().max(64).optional().or(z.literal('')),
})

export async function POST(req: NextRequest) {
  // Unauthenticated write → hard IP limit, same shape and reasoning as
  // /api/contact. Generous for a person, hostile to a script.
  const rl = rateLimit(`helpmsg:${clientIp(req)}`, 5, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })
  }

  let json: unknown
  try { json = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const parsed = Body.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const { message, email, name, question, route } = parsed.data

  const user = await getCurrentUser().catch(() => null)
  // A signed-in person's own address beats whatever is typed in the box — it is
  // the one we know reaches them.
  const replyEmail = (user?.email || email || '').trim() || null
  const displayName = (user?.fullName || name || '').trim() || null

  await ensureDbReady().catch(() => {})

  const id = randomUUID()
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "HelpMessage" ("id","route","question","message","email","name","userId","status")
       VALUES ($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,'new')`,
      id,
      route ? normalizeRoute(route) : null,
      question || null,
      message,
      replyEmail,
      displayName,
      user?.id ?? null,
    )
  } catch (err) {
    // The STORE is the contract. If it fails the person must be told to try
    // again rather than thanked for a message that does not exist.
    console.error('[help/message] store failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false, error: 'STORE_FAILED' }, { status: 500 })
  }

  // The alarm. Deliberately after the write and deliberately non-fatal: the
  // message is already safe, and a mail outage must not turn into a 500 that
  // makes someone send it twice.
  void sendMail({
    to: process.env.CONTACT_INBOX || SUPPORT_EMAIL,
    replyTo: replyEmail ?? undefined,
    subject: `[მცოდნე] დახმარების ჩათი — ${(displayName || 'ანონიმური').replace(/[\r\n]+/g, ' ')}`,
    html: `<div style="font-family:sans-serif;line-height:1.6;color:#181B20">
      <h2 style="margin:0 0 12px">ახალი პრობლემა დახმარების ჩათიდან</h2>
      <p><b>გვერდი:</b> ${esc(route || '—')}</p>
      <p><b>ბოტს ჰკითხა:</b> ${esc(question || '—')}</p>
      <p><b>ელფოსტა:</b> ${esc(replyEmail || 'არ დატოვა')}</p>
      <hr style="border:none;border-top:1px solid #DCDFE4;margin:16px 0" />
      <p style="white-space:pre-wrap">${esc(message)}</p>
    </div>`,
    text: `დახმარების ჩათი\n\nგვერდი: ${route || '—'}\nბოტს ჰკითხა: ${question || '—'}\nელფოსტა: ${replyEmail || 'არ დატოვა'}\n\n${message}`,
  }).catch(err => {
    console.error('[help/message] mail failed (message IS stored):', err instanceof Error ? err.message : err)
  })

  return NextResponse.json({ ok: true, id })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
