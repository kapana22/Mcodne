import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { notify } from '@/lib/notify'
import { sendMail } from '@/lib/mailer'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import {
  adminDirectMessageEmail,
  adminMessageDestination,
  sanitizeSubject,
  ADMIN_MESSAGE_SUBJECT_MAX,
  ADMIN_MESSAGE_BODY_MAX,
} from '@/lib/emailTemplates'

/* ── POST /api/admin/users/[id]/message — write to ONE person ──────────────
   The admin panel could suspend a user, impersonate them or broadcast to
   everyone; it could not simply WRITE to one of them. This is that channel.

   Deliberately NOT the chat/messages system: app/api/messages/route.ts refuses
   any thread involving an ADMIN (`!roles.has('TUTOR') || roles.has('ADMIN')`),
   because threads carry client PII between the two people on a booking and an
   admin is not one of them. That trust boundary stays exactly where it is —
   the pair below (in-app notification + a REPLYABLE email) is the channel, and
   the reply lands in the support inbox rather than inside the product.

   Guarded like every sibling admin route (requireRoleApi('ADMIN')) and audited,
   because writing to a named user in the platform's voice is a privileged act. */

const Body = z.object({
  subject: z.string().min(1).max(ADMIN_MESSAGE_SUBJECT_MAX),
  body: z.string().min(1).max(ADMIN_MESSAGE_BODY_MAX),
  // Which prefilled starter the admin picked. Only ever selects a destination
  // (server-side map) — the href is never taken from the request.
  template: z.enum(['expert', 'info', 'blank']).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // Same sanitiser the email builder uses, so the notification title, the mail
  // subject and the audit row are byte-identical.
  const subject = sanitizeSubject(parsed.data.subject)
  const body = parsed.data.body.trim()
  if (!subject || !body) {
    return NextResponse.json({ ok: false, error: 'INVALID', message: 'სათაური და ტექსტი სავალდებულოა' }, { status: 400 })
  }
  const template = parsed.data.template ?? 'blank'
  const dest = adminMessageDestination(template)

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, fullName: true },
  })
  if (!target) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  // 1. In-app — through notify(), so the recipient's notificationPrefs gate is
  //    the same one every other producer respects. Type GENERIC on purpose: the
  //    opt-outable ADMIN_BROADCAST key exists for mass sends, and silently
  //    dropping a 1:1 message an operator wrote to one person would make the
  //    „sent" we report below a lie. GENERIC is the existing always-delivered
  //    ops lane (see lib/notify.ts), same as payout and dispute pings.
  await notify(target.id, { type: 'GENERIC', title: subject, body, href: dest.href })

  // 2. Email — AWAITED, not fire-and-forget. Everywhere else mail rides
  //    `after()` because nothing depends on the outcome; here the admin is
  //    standing in front of the dialog waiting to learn whether the person was
  //    actually reached. sendMail resolves { ok: false } on a provider failure
  //    (it logs its own [server-error]) — we pass that straight back instead of
  //    reporting success. replyTo = the support inbox: hitting Reply is what
  //    turns this into a conversation rather than a notice.
  let emailOk = false
  let emailMode = 'none'
  if (target.email) {
    const { subject: mailSubject, html } = adminDirectMessageEmail({
      name: target.fullName,
      subject,
      body,
      template,
    })
    const res = await sendMail({ to: target.email, subject: mailSubject, html, replyTo: SUPPORT_EMAIL })
    emailOk = res.ok
    emailMode = res.mode
  }

  await audit(admin.id, 'user.message', {
    targetType: 'User',
    targetId: target.id,
    // Key order matters: the audit table previews the first 80 chars of the
    // stringified meta, so WHO and WHAT-ABOUT must come first — the rest is
    // there for the tooltip and the CSV export.
    meta: {
      recipientName: target.fullName,
      subject,
      recipientEmail: target.email,
      template,
      emailOk,
      emailMode,
      href: dest.href,
      body: body.slice(0, 300),
    },
  })

  return NextResponse.json({ ok: true, emailOk, emailTo: target.email ?? null })
}
