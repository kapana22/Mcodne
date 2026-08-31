// Transactional email sender. Three modes, chosen automatically:
//
//   1. Gmail SMTP  — when GMAIL_USER + GMAIL_APP_PASSWORD are set. Sends real
//      mail from the mcodne Gmail via nodemailer. (App Password, NOT the account
//      password — requires 2FA enabled on the Gmail account.)
//   2. Resend      — when MAILER_MODE=send + RESEND_API_KEY are set (legacy path).
//   3. log         — default. Console-logs the email instead of sending, so the
//      whole app works with zero config and dev never emails real users.
//
// Every trigger calls sendMail fire-and-forget (inside `after()`), so a mail
// failure NEVER blocks or fails the user's request.
//
// ⚠️ SENDING ≠ RECEIVING. Sending is live and verified (Resend, domain
// mcodne.ge, MAIL_FROM=noreply@mcodne.ge). RECEIVING is a separate setup: the
// domain needs MX records / Cloudflare Email Routing. As of 2026-07 mcodne.ge
// had NO MX (the apex is a CNAME to Railway, and a CNAME apex blocks MX), so
// every message sent TO any @mcodne.ge address — a customer's reply, a contact
// form forwarded to hi@ — was accepted nowhere and dropped without a bounce.
// That asymmetry is exactly what hid the problem: outgoing mail looked healthy
// while nothing came back. Before advertising an address (lib/supportEmails.ts)
// or pointing CONTACT_INBOX at one, confirm the domain can actually receive.

import nodemailer, { type Transporter } from 'nodemailer'
import { SUPPORT_EMAIL } from './supportEmails'

type MailPayload = {
  to: string
  subject: string
  html: string
  text?: string
  /** Where a human reply should land. Defaults to the support inbox. */
  replyTo?: string
}

// One reused SMTP transport per server process (creating one per send is slow
// and can exhaust connections). Created lazily on first Gmail send.
let gmailTransport: Transporter | null = null
function getGmailTransport(user: string, pass: string): Transporter {
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      // Bound each send so one hung SMTP connection can't stall the reminder
      // cron for minutes (nodemailer's socket default is 10 min).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    })
  }
  return gmailTransport
}

export async function sendMail({ to, subject, html, text, replyTo }: MailPayload): Promise<{ ok: boolean; mode: string; status?: number }> {
  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD
  const explicitMode = process.env.MAILER_MODE // 'send' opts into Resend
  const fromName = process.env.MAIL_FROM_NAME || 'mcodne'
  // Mail goes out from noreply@ — without Reply-To a customer who hits Reply
  // writes into a void. CR/LF stripped as a last line of defence: callers must
  // validate before passing an address, but a header must never carry a newline.
  const replyToAddr = (replyTo || process.env.SUPPORT_EMAIL || SUPPORT_EMAIL).replace(/[\r\n]/g, '').trim()

  /* ── 0. THE OFF SWITCH, AND IT COMES BEFORE BOTH TRANSPORTS ──────────────
     ⚠️ MAILER_MODE USED TO GATE ONLY RESEND (2026-08-31). The Gmail branch
     below was reached first and read nothing but its own two credentials, so a
     deployment with GMAIL_USER and GMAIL_APP_PASSWORD set went on sending no
     matter what MAILER_MODE said — the switch that looks like the off switch
     turned off one of the two ways out.
     Owner, on a pre-launch site that was mailing people: „ჯერ არაფერი არ უნდა
     მისდიოდეს მეილებზე… სანამ საიტი არ გამიმართება." A kill switch that one
     environment variable can walk around is not a kill switch.
     `off` is explicit and it is the only value that stops everything; anything
     else keeps the old behaviour exactly, so this cannot change a deployment
     that has not asked for it. The message is still logged, so what WOULD have
     been sent is still visible in the deploy logs. */
  if (explicitMode === 'off') {
    console.log('📧 [MAIL:off]', { to, replyTo: replyToAddr, subject })
    return { ok: true, mode: 'off' }
  }

  // ── 1. Gmail SMTP ────────────────────────────────────────────────────────
  if (gmailUser && gmailPass) {
    try {
      const info = await getGmailTransport(gmailUser, gmailPass).sendMail({
        from: `"${fromName}" <${gmailUser}>`,
        to,
        replyTo: replyToAddr,
        subject,
        html,
        text: text ?? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
      })
      if (!info.accepted?.length) {
        console.error('[server-error]', JSON.stringify({ scope: 'mailer', mode: 'gmail', to, subject, rejected: info.rejected }))
        return { ok: false, mode: 'gmail-rejected' }
      }
      return { ok: true, mode: 'gmail' }
    } catch (err) {
      console.error('[server-error]', JSON.stringify({ scope: 'mailer', mode: 'gmail', to, subject, err: String(err) }))
      return { ok: false, mode: 'gmail-error' }
    }
  }

  // ── 2. Resend (legacy) ───────────────────────────────────────────────────
  if (explicitMode === 'send') {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.MAIL_FROM || 'noreply@mcodne.ge'
    if (!apiKey) {
      console.warn('📧 [MAIL] MAILER_MODE=send but no RESEND_API_KEY — falling back to log')
      console.log('📧 [MAIL]', { to, replyTo: replyToAddr, subject })
      return { ok: true, mode: 'log-fallback' }
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, reply_to: replyToAddr, subject, html, text }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        // A non-2xx here (revoked key, unverified domain, rate limit) silently
        // drops a real transactional email. Prod monitoring is `grep
        // [server-error]` in the Railway logs (instrumentation.ts convention),
        // so the failure MUST carry that prefix or it leaves no trace at all.
        const detail = await res.text().catch(() => '')
        console.error('[server-error]', JSON.stringify({ scope: 'mailer', mode: 'resend', status: res.status, to, subject, detail: detail.slice(0, 300) }))
        return { ok: false, status: res.status, mode: 'resend-http-error' }
      }
      return { ok: true, status: res.status, mode: 'resend' }
    } catch (err) {
      console.error('[server-error]', JSON.stringify({ scope: 'mailer', mode: 'resend', to, subject, err: String(err) }))
      return { ok: false, mode: 'resend-error' }
    }
  }

  // ── 3. log (default — no email provider configured) ──────────────────────
  console.log('📧 [MAIL]', { to, replyTo: replyToAddr, subject, preview: (text ?? html.slice(0, 200)) })
  return { ok: true, mode: 'log' }
}
