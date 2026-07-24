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

import nodemailer, { type Transporter } from 'nodemailer'

type MailPayload = {
  to: string
  subject: string
  html: string
  text?: string
}

// One reused SMTP transport per server process (creating one per send is slow
// and can exhaust connections). Created lazily on first Gmail send.
let gmailTransport: Transporter | null = null
function getGmailTransport(user: string, pass: string): Transporter {
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })
  }
  return gmailTransport
}

export async function sendMail({ to, subject, html, text }: MailPayload): Promise<{ ok: boolean; mode: string; status?: number }> {
  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD
  const explicitMode = process.env.MAILER_MODE // 'send' opts into Resend
  const fromName = process.env.MAIL_FROM_NAME || 'mcodne'

  // ── 1. Gmail SMTP ────────────────────────────────────────────────────────
  if (gmailUser && gmailPass) {
    try {
      const info = await getGmailTransport(gmailUser, gmailPass).sendMail({
        from: `"${fromName}" <${gmailUser}>`,
        to,
        subject,
        html,
        text: text ?? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
      })
      return { ok: !!info.accepted?.length, mode: 'gmail' }
    } catch (err) {
      console.error('📧 [MAIL] gmail send failed', err)
      return { ok: false, mode: 'gmail-error' }
    }
  }

  // ── 2. Resend (legacy) ───────────────────────────────────────────────────
  if (explicitMode === 'send') {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.MAIL_FROM || 'noreply@mcodne.ge'
    if (!apiKey) {
      console.warn('📧 [MAIL] MAILER_MODE=send but no RESEND_API_KEY — falling back to log')
      console.log('📧 [MAIL]', { to, subject })
      return { ok: true, mode: 'log-fallback' }
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html, text }),
      })
      return { ok: res.ok, status: res.status, mode: 'resend' }
    } catch (err) {
      console.error('📧 [MAIL] resend send failed', err)
      return { ok: false, mode: 'resend-error' }
    }
  }

  // ── 3. log (default — no email provider configured) ──────────────────────
  console.log('📧 [MAIL]', { to, subject, preview: (text ?? html.slice(0, 200)) })
  return { ok: true, mode: 'log' }
}
