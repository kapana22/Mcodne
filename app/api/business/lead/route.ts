// POST /api/business/lead — an enquiry from /business.
//
// Shaped on app/api/contact/route.ts, which is the site's other public,
// unauthenticated form endpoint, with two deliberate differences:
//
//   1. IT IS GATED. /api/contact is public because /contact is. This endpoint
//      belongs to a dark vertical, so it answers 404 to anyone canSeeB2B() does
//      not admit — 404 and not 403, matching the page, because a 403 confirms
//      the endpoint is there. Without this the vertical would be dark in the
//      browser and wide open to a POST, which is the failure mode that makes
//      „hidden" meaningless.
//
//   2. IT WRITES A ROW FIRST. /contact only emails, and that is a real gap: a
//      dropped SMTP delivery there loses the message with nothing to recover
//      from. A B2B enquiry is a sales lead, so the DB row is the deliverable
//      and the email is a NOTIFICATION about it. The response is decided by the
//      write; the mail goes out afterwards via after(), best-effort.

import { NextResponse, after } from 'next/server'
import { messageText } from '@/lib/messageText'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { canSeeB2B, BusinessLeadInput, businessLeadRow, B2B_ROUTE } from '@/lib/b2b'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { validationIssueMessage } from '@/lib/validationMessages'
import { sendMail } from '@/lib/mailer'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

export async function POST(req: Request) {
  // The gate first — before the rate-limit bucket, before the body is read, and
  // before any DB work. A caller who may not see this vertical must not be able
  // to learn anything from it, including how fast it rate-limits.
  const me = await getCurrentUser()
  if (!canSeeB2B(me?.role)) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }

  // Unauthenticated at the 'public' stage → rate-limit hard by IP so the table
  // and the inbox cannot be flooded. Same budget as /api/contact: 5 per hour is
  // generous for a real company and hostile for a script.
  const ip = clientIp(req)
  const rl = rateLimit(`b2b-lead:${ip}`, 5, 60 * 60)
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

  // THE SAME schema the form validated with (lib/b2b). A crafted POST is judged
  // by exactly the rules the browser applied, never by a second hand-written copy.
  const parsed = BusinessLeadInput.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({
      ok: false, error: 'INVALID',
      field: typeof issue?.path[0] === 'string' ? issue.path[0] : null,
      message: validationIssueMessage(issue, 'შეავსეთ ველები სწორად.'),
    }, { status: 400 })
  }
  const row = businessLeadRow(parsed.data)

  // The service they asked for, VERIFIED against the catalogue rather than
  // trusted. An unknown or hidden id is dropped to null rather than rejected:
  // a stale bookmark must not cost us the enquiry, and „they asked for
  // something" is still worth more than a 400.
  const wantedId = (parsed.data.serviceId ?? '').trim()
  const service = wantedId
    ? await prisma.b2BService.findFirst({
        where: { id: wantedId, visible: true },
        select: { id: true, title: true, direction: true },
      }).catch(() => null)
    : null

  // BusinessLead is a dbBoot-created table — make sure the boot DDL has run on
  // this process before the first enquiry touches it. Idempotent and already
  // resolved after the first call, so it costs nothing on a warm process.
  await ensureDbReady()

  // The write decides the response. If this throws, the person is told it
  // failed and can send again — which is the honest outcome, because nothing
  // was recorded.
  const lead = await prisma.businessLead.create({
    data: { ...row, serviceId: service?.id ?? null },
    select: { id: true },
  })

  // …and the notification, AFTER the response has flushed. Mail costs a remote
  // round-trip and the sender should not wait for it; a failure here loses a
  // notification, never the lead itself — the row is already committed and the
  // admin list reads from the table, not from the inbox.
  after(async () => {
    try {
      const esc = escapeHtml
      const lines: [string, string | null][] = [
        ['კომპანია', row.companyName],
        ['საიდენტიფიკაციო კოდი', row.taxId],
        ['საკონტაქტო პირი', row.contactName],
        ['ტელეფონი', row.phone],
        ['ელფოსტა', row.email],
        ['მიმართულება', row.interest],
        // Named first-class in the notification: „which service" is the one
        // thing that decides who the owner assigns, and burying it under the
        // free-text fields would mean opening the panel to find out.
        ['სერვისი', service ? `${service.direction} · ${service.title}` : null],
      ]
      const html = `
        <div style="font-family:sans-serif;line-height:1.6;color:#181B20">
          <h2 style="margin:0 0 12px">ახალი B2B განაცხადი — მცოდნე</h2>
          ${lines.filter(([, v]) => v).map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(v!)}</p>`).join('')}
          ${row.message
            ? `<hr style="border:none;border-top:1px solid #DCDFE4;margin:16px 0" />
               <p style="white-space:pre-wrap">${esc(row.message)}</p>`
            : ''}
          <p style="color:#6B7280;font-size:13px;margin-top:16px">${esc(B2B_ROUTE)} · #${esc(lead.id)}</p>
        </div>`
      const text = lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
        + (row.message ? `\n\n${row.message}` : '')

      await sendMail({ key: 'inbox.businessLead',
        // Same destination as the contact form: CONTACT_INBOX overrides, and the
        // fallback is the one advertised support address. Deliberately NOT a new
        // B2B_INBOX env var — a second address to configure is a second address
        // to forget, and until this vertical has its own owner it is the same
        // person reading both.
        to: process.env.CONTACT_INBOX || SUPPORT_EMAIL,
        // Reply-To = the person who wrote in, so hitting Reply answers them. It
        // is user input, so it becomes a header only after CR/LF stripping —
        // an unvalidated string here is a header-injection hole. The value
        // already passed zod's .email(), which admits no newline.
        replyTo: row.email.replace(/[\r\n]/g, '').trim() || undefined,
        subject: (await messageText())('inbox.businessLead', 'subject', { company: row.companyName.replace(/[\r\n]+/g, ' ').trim() }),
        html,
        text,
      })
    } catch { /* email is best-effort — the row is what matters */ }
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
