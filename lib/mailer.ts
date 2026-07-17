// Email sender stub. Swap for Resend/SendGrid/SES in production.
// For dev, logs to console. Set MAILER_MODE=send to attempt real send via fetch to Resend API.

type MailPayload = {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendMail({ to, subject, html, text }: MailPayload) {
  const mode = process.env.MAILER_MODE || 'log'
  if (mode === 'log') {
    console.log('📧 [MAIL]', { to, subject, text: text ?? html.slice(0, 200) })
    return { ok: true, mode }
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM || 'noreply@mcodne.ge'
  if (!apiKey) {
    console.warn('📧 [MAIL] no RESEND_API_KEY set, falling back to log')
    console.log({ to, subject, text: text ?? html.slice(0, 200) })
    return { ok: true, mode: 'log-fallback' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    })
    return { ok: res.ok, status: res.status, mode: 'resend' }
  } catch (err) {
    console.error('📧 [MAIL] send failed', err)
    return { ok: false, mode: 'error' }
  }
}
