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
import { prisma } from './prisma'
import { logMessage } from './messageLog'
import { channelOn } from './outboundSettings'
import { isCredential, type OutboundKey } from './outbound'

type MailPayload = {
  /** WHICH message this is (lib/outbound). Required by the compiler, so a new
   *  letter cannot exist without appearing in the registry the admin reads —
   *  the registry then cannot drift from the 27 places that send. */
  key: OutboundKey
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

type MailResult = { ok: boolean; mode: string; status?: number }

/**
 * Send, then write down that we sent. Every path out of `deliver` is logged
 * here rather than at the call sites, for the reason lib/sms gives: a caller
 * that logs its own send is a caller that can forget one, and the table an
 * operator trusts would then be quietly incomplete.
 */
export async function sendMail(payload: MailPayload): Promise<MailResult> {
  const r = await deliver(payload)
  await logMessage({
    channel: 'mail',
    key: payload.key,
    to: payload.to,
    ok: r.ok,
    mode: r.mode,
    detail: r.ok ? null : r.mode,
    ref: null,
  })
  return r
}

async function deliver({ key, to, subject, html, text, replyTo }: MailPayload): Promise<MailResult> {
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

  /* ── 0a. THE ADMIN'S SWITCH, and it sits UNDER the environment's ─────────
     `MAILER_MODE=off` above is the hard kill and nothing in a browser can walk
     around it; this one is per message, owned by whoever is in /admin. The
     order is the point: an operator can silence one letter, and only a
     deployment can silence them all.
     ⚠️ A CODE HAS NO SWITCH TO FIND — lib/outboundSettings refuses to write the
     row, on the server, so this can never be reached for `auth.otp*`. */
  if (!(await channelOn(key, 'mail'))) {
    console.log('📧 [MAIL:admin-off]', { to, subject, key })
    return { ok: true, mode: 'held-admin-off' }
  }

  /* ── 0b. NOBODY WHO WAS ALREADY HERE ─────────────────────────────────────
     Owner, 2026-08-31: „ვინც user არის ახლანდელი, იმათ არ გაუგზავნო, და ახლებს
     გაუგზავნე." The site is pre-launch and the people in it are the owner's own
     test rows; the ones who arrive from now on are real and should hear from it.
     MAIL_ONLY_AFTER is an ISO instant. An address the system already knew at
     that instant is held; everything newer goes out normally. Unset = no
     filtering at all, which is what every deployment that has not asked for
     this does.
     ⚠️ TWO TABLES, NOT ONE. The obvious check is User.createdAt, and it would
     have missed the mail that caused this: cleanup-cron reminds the CLIENT at
     `request.email` (lib/offerLifecycle), which is the address typed into the
     intake and need not belong to a User row at all. Whoever was reachable
     before the cutoff is held, by either name.
     ⚠️ AND IT FAILS CLOSED. A lookup that throws holds the letter rather than
     sending it. On a pre-launch site a missed mail costs nothing and a mail to
     somebody who was promised silence is the whole of the complaint. */
  /* ⚠️ A CODE THE PERSON IS WAITING FOR IS NEVER HELD BY THE CUTOFF
     (2026-09-04). The cutoff exists so the site does not INITIATE contact with
     people who were here before it launched — owner: „ვინც user არის ახლანდელი,
     იმათ არ გაუგზავნო". Somebody who has just typed their number into the reset
     form and is staring at the code field is not being contacted by us; they
     asked. Holding that message does not protect them, it locks them out of
     their own account with no error anywhere — and since the reset code is
     the only way back into an account whose password is forgotten.

     This was already true of the password-reset code on the mail side and had
     simply never been exercised. `credential: true` in lib/outbound is exactly
     the set of messages this applies to. */
  const onlyAfter = isCredential(key) ? null : process.env.MAIL_ONLY_AFTER
  if (onlyAfter) {
    const cutoff = new Date(onlyAfter)
    if (Number.isNaN(cutoff.getTime())) {
      console.error('[server-error]', JSON.stringify({ scope: 'mailer', err: 'MAIL_ONLY_AFTER is not a date', value: onlyAfter }))
      return { ok: true, mode: 'held-bad-cutoff' }
    }
    const addr = to.trim().toLowerCase()
    try {
      const [user, request] = await Promise.all([
        prisma.user.findFirst({ where: { email: addr, createdAt: { lte: cutoff } }, select: { id: true } }),
        prisma.serviceRequest.findFirst({ where: { email: addr, createdAt: { lte: cutoff } }, select: { id: true } }),
      ])
      if (user || request) {
        console.log('📧 [MAIL:held]', { to, subject, why: user ? 'user predates cutoff' : 'request predates cutoff' })
        return { ok: true, mode: 'held-pre-existing' }
      }
    } catch (err) {
      console.error('[server-error]', JSON.stringify({ scope: 'mailer', stage: 'cutoff-lookup', to, err: String(err) }))
      return { ok: true, mode: 'held-lookup-failed' }
    }
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
