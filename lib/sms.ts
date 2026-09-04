// Transactional SMS. One provider — sender.ge, POST https://sender.ge/api/send.php,
// form-encoded, API key in the body.
//
// Three modes, and THE DEFAULT IS SILENCE:
//
//   1. send — SMS_MODE=send AND SENDER_GE_API_KEY set. Real messages, real money.
//   2. off  — SMS_MODE=off. Logged, never sent. The explicit kill switch.
//   3. log  — everything else, INCLUDING „the key is set but nobody said send".
//             Console-logs the message so the whole app works with zero config
//             and dev never texts a real phone.
//
// ⚠️ A KEY ALONE NEVER SENDS, AND THAT IS DELIBERATELY UNLIKE lib/mailer.
// The mailer's Gmail branch read nothing but its own two credentials, so a
// deployment with those set went on sending whatever MAILER_MODE said — the
// switch that looks like the off switch turned off one of the two ways out
// (fixed 2026-08-31; the comment there is the whole story). Owner, on a
// pre-launch site that was mailing people: „ჯერ არაფერი არ უნდა მისდიოდეს
// მეილებზე… სანამ საიტი არ გამიმართება." An SMS is that complaint with a price
// tag on it — it costs per part, it arrives on a phone at 3am, and it cannot be
// unsent. So the credential is necessary and never sufficient: somebody has to
// say `send` in the environment as well.
//
// ⚠️ THE BODY IS NEVER LOGGED IN `send` MODE. In log/off mode the whole text is
// printed — that is the point of those modes. Once messages are really going
// out, the text is very often a one-time code, and Railway's deploy log is not
// a place a credential belongs (the same rule as CLAUDE.md §5 on `MC-` refs).
// Failures log the destination and the status; never the words.

import { normalizePhone, isGeorgianMobile } from './phone'
import { isCredential } from './outbound'
import { prisma } from './prisma'
import { logMessage } from './messageLog'
import { channelOn } from './outboundSettings'
import type { OutboundKey } from './outbound'

const ENDPOINT = 'https://sender.ge/api/send.php'

/** How long we wait on sender.ge before giving up. Same bound as the mailer's
 *  HTTP path — a hung provider must not hold a request open. */
const TIMEOUT_MS = 15_000

export type SmsKind =
  /** A code, a confirmation, an offer landing — anything the person's own
   *  action asked for. `smsno=2`: no advertising suffix. */
  | 'info'
  /** Marketing. `smsno=1` appends the SmsNo the law wants on an ad. Nothing in
   *  the product sends one of these today; the value exists so that when
   *  something does, it cannot be filed as „info" by accident. */
  | 'ad'

export type SmsResult = {
  ok: boolean
  /** Which branch answered — `send`, `log`, `off`, or a named failure. Mirrors
   *  the mailer's `mode` so both senders read the same way in a log. */
  mode: string
  status?: number
  /** sender.ge's id for the message, when it took one. */
  messageId?: string
  /** Parts billed (`qnt`). Georgian is UCS-2, so this is rarely 1 for a long
   *  text — see `smsParts`. */
  parts?: number
}

type SmsPayload = {
  /** WHICH message this is (lib/outbound). Required by the compiler so a new
   *  SMS cannot exist without appearing in the registry the admin reads. */
  key: OutboundKey
  /** Any shape lib/phone accepts. Converted here; a non-Georgian number is
   *  refused rather than mangled. */
  to: string
  text: string
  /** Defaults to `info` — the only kind the product currently has. */
  kind?: SmsKind
  /**
   * `priority=1`, which sender.ge documents as „skip SMS subscription check".
   *
   * ⚠️ THINK BEFORE PASSING IT. Off (the default) a person who has opted out of
   * SMS hears nothing, which is what an opt-out is FOR and is not negotiable for
   * `ad`. The one honest case is a code the person is at that moment waiting
   * for: they asked, they are staring at the field, and a silent drop locks them
   * out of their own account. That call belongs to the caller and to the owner,
   * so it is a parameter and not a default.
   */
  skipSubscriptionCheck?: boolean
}

/**
 * The 9 digits sender.ge wants („555123456"), or null when this number is not a
 * Georgian mobile.
 *
 * ⚠️ NULL IS A REAL ANSWER AND IT HAS TO BE HANDLED. `lib/phone` accepts
 * international numbers ON PURPOSE — the diaspora vertical exists to serve
 * people abroad — and this provider dials Georgian mobiles only. So every
 * caller has a case where the person is reachable by mail and not by SMS, and
 * the failure must be visible rather than a message that quietly never went.
 */
export function smsDestination(raw: string | null | undefined): string | null {
  const v = normalizePhone(raw)
  if (!isGeorgianMobile(v)) return null
  return v.replace(/^\+?995/, '')
}

/**
 * How many parts sender.ge will bill for this text.
 *
 * Georgian is outside GSM-7, so every message containing a single Georgian
 * letter is encoded UCS-2: 70 characters in one part, and 67 per part once it
 * splits (the concatenation header eats three). A plain-ASCII text gets the
 * GSM-7 allowance of 160/153. Emoji and the ₾ sign force UCS-2 too.
 *
 * This is an estimate for logging and for keeping templates honest, not a
 * billing oracle — `qnt` in the response is what was actually charged.
 */
export function smsParts(text: string): number {
  // Astral characters (emoji) take two UTF-16 units on the wire, so count units.
  const units = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0)
  const unicode = /[^\x20-\x7E\n\r]/.test(text)
  const single = unicode ? 70 : 160
  const multi = unicode ? 67 : 153
  if (units === 0) return 0
  return units <= single ? 1 : Math.ceil(units / multi)
}

/** The stored shapes one Georgian number can have, for a `phone` lookup.
 *  A number is typed „555123456", „+995555123456" or „995555123456" and all
 *  three are stored as typed (lib/phone normalizes punctuation, not the code). */
function phoneVariants(local: string): string[] {
  return [local, `+995${local}`, `995${local}`]
}

/**
 * Send, then write down that we sent. The log row is the admin's whole answer to
 * „სად მიდის, როდის მიდის" — so it is written HERE, on every path out of
 * `deliver`, rather than at 27 call sites that could each forget one.
 */
export async function sendSms(payload: SmsPayload): Promise<SmsResult> {
  const r = await deliver(payload)
  await logMessage({
    channel: 'sms',
    key: payload.key,
    // ⚠️ MASKED IN THE TABLE TOO, not only in the log line. An operator
    // browsing sends does not need to be able to dial the recipients, and a
    // full number in a browsable table is the leak this project already refuses
    // for the `MC-` reference (CLAUDE.md §5).
    to: mask(payload.to),
    ok: r.ok,
    mode: r.mode,
    detail: r.mode.startsWith('sender-') ? r.mode : null,
    ref: r.messageId ?? null,
    parts: r.parts ?? null,
  })
  return r
}

async function deliver({ key, to, text, kind = 'info', skipSubscriptionCheck = false }: SmsPayload): Promise<SmsResult> {
  const mode = process.env.SMS_MODE
  const apiKey = process.env.SENDER_GE_API_KEY
  const destination = smsDestination(to)
  const parts = smsParts(text)

  /* ── 0. NOT A NUMBER THIS PROVIDER CAN DIAL ──────────────────────────────
     Before every other branch, including the off switch: „we would not have
     been able to send this anyway" is a different fact from „we chose not to",
     and a caller deciding whether to fall back to email needs the first one
     even on a deployment where SMS is dark. */
  if (!destination) {
    console.warn('📱 [SMS:unsupported]', { to: mask(to), why: 'not a Georgian mobile' })
    return { ok: false, mode: 'unsupported-destination' }
  }

  /* ── 1. THE OFF SWITCH, AND IT COMES BEFORE THE TRANSPORT ────────────────
     `off` is explicit and it is the only value that stops a configured sender.
     The message is still logged, so what WOULD have gone out is visible. */
  if (mode === 'off') {
    console.log('📱 [SMS:off]', { to: mask(to), kind, parts, text })
    return { ok: true, mode: 'off' }
  }

  /* ── 1a. THE ADMIN'S SWITCH ─────────────────────────────────────────────
     Per message, owned in /admin, and UNDER the environment's kill switch for
     the reason lib/mailer gives. SMS defaults to OFF for every message
     (lib/outboundSettings → defaultState): a letter is free and a text is not,
     so nobody is billed for a channel they did not deliberately turn on. */
  if (!(await channelOn(key, 'sms'))) {
    console.log('📱 [SMS:admin-off]', { to: mask(to), key })
    return { ok: true, mode: 'held-admin-off' }
  }

  /* ── 2. NOBODY WHO WAS ALREADY HERE ──────────────────────────────────────
     The mailer's MAIL_ONLY_AFTER, for phones. Owner, 2026-08-31: „ვინც user
     არის ახლანდელი, იმათ არ გაუგზავნო, და ახლებს გაუგზავნე." The rows in the
     database now are the owner's own test data and 25 real providers who were
     never told this site would text them; whoever arrives after the cutoff is
     fair game.

     ⚠️ TWO TABLES, exactly as the mailer learned: a request's phone is typed
     into the intake and need not belong to a User row at all.
     ⚠️ AND IT FAILS CLOSED. A lookup that throws holds the message. A missed
     SMS on a pre-launch site costs nothing; one sent to somebody who was
     promised silence is the whole of the complaint. */
  /* ⚠️ A CODE THE PERSON IS WAITING FOR IS NEVER HELD BY THE CUTOFF
     (2026-09-04). The cutoff exists so the site does not INITIATE contact with
     people who were here before it launched — owner: „ვინც user არის ახლანდელი,
     იმათ არ გაუგზავნო". Somebody who has just typed their number into the sign-in
     form and is staring at the code field is not being contacted by us; they
     asked. Holding that message does not protect them, it locks them out of
     their own account with no error anywhere — and since phone registration is
     PASSWORDLESS, for those accounts it is the only door there is.

     This was already true of the password-reset code on the mail side and had
     simply never been exercised. `credential: true` in lib/outbound is exactly
     the set of messages this applies to. */
  const onlyAfter = isCredential(key) ? null : process.env.SMS_ONLY_AFTER
  if (onlyAfter) {
    const cutoff = new Date(onlyAfter)
    if (Number.isNaN(cutoff.getTime())) {
      console.error('[server-error]', JSON.stringify({ scope: 'sms', err: 'SMS_ONLY_AFTER is not a date', value: onlyAfter }))
      return { ok: true, mode: 'held-bad-cutoff' }
    }
    const variants = phoneVariants(destination)
    try {
      const [user, request] = await Promise.all([
        prisma.user.findFirst({ where: { phone: { in: variants }, createdAt: { lte: cutoff } }, select: { id: true } }),
        prisma.serviceRequest.findFirst({ where: { phone: { in: variants }, createdAt: { lte: cutoff } }, select: { id: true } }),
      ])
      if (user || request) {
        console.log('📱 [SMS:held]', { to: mask(to), why: user ? 'user predates cutoff' : 'request predates cutoff' })
        return { ok: true, mode: 'held-pre-existing' }
      }
    } catch (err) {
      console.error('[server-error]', JSON.stringify({ scope: 'sms', stage: 'cutoff-lookup', to: mask(to), err: String(err) }))
      return { ok: true, mode: 'held-lookup-failed' }
    }
  }

  /* ── 3. log — the default, and the branch a missing key falls into ───────
     Written BEFORE the send branch on purpose: `SMS_MODE=send` with no key is
     somebody halfway through configuring the thing, and the safe reading of
     half a configuration is „do not send". */
  if (mode !== 'send' || !apiKey) {
    if (mode === 'send' && !apiKey) {
      console.warn('📱 [SMS] SMS_MODE=send but no SENDER_GE_API_KEY — logging instead')
    }
    console.log('📱 [SMS]', { to: mask(to), kind, parts, text })
    return { ok: true, mode: mode === 'send' ? 'log-no-key' : 'log' }
  }

  /* ── 4. send ─────────────────────────────────────────────────────────────
     Form-encoded, exactly as sender.ge documents it. `smsno` 2 is the
     informational shape (no advertising suffix), 1 the advertising one. */
  const body = new URLSearchParams({
    apikey: apiKey,
    smsno: kind === 'ad' ? '1' : '2',
    destination,
    content: text,
    priority: skipSubscriptionCheck ? '1' : '0',
  })

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const raw = await res.text().catch(() => '')
    const parsed = safeJson(raw)

    if (!res.ok) {
      // 401 invalid key · 402 insufficient balance · 403 access denied ·
      // 503 unavailable. Every one of them silently drops a real message, and
      // prod monitoring is `grep [server-error]` in the Railway logs
      // (instrumentation.ts convention), so this MUST carry the prefix.
      // 402 in particular is not a bug — it is „top the account up" — and it
      // will read as one at 2am unless the provider's own words are in the line.
      console.error('[server-error]', JSON.stringify({
        scope: 'sms', status: res.status, to: mask(to),
        detail: String(parsed?.message ?? raw).slice(0, 300),
      }))
      return { ok: false, mode: `sender-http-${res.status}`, status: res.status }
    }

    // 200 with `{ data: [ { messageId, statusId, qnt } ] }`. A 200 carrying a
    // `message` instead has not queued anything, whatever the status line says.
    const entry = Array.isArray(parsed?.data) ? parsed.data[0] : null
    if (!entry?.messageId) {
      console.error('[server-error]', JSON.stringify({
        scope: 'sms', status: res.status, to: mask(to), err: 'no messageId',
        detail: String(parsed?.message ?? raw).slice(0, 300),
      }))
      return { ok: false, mode: 'sender-no-id', status: res.status }
    }

    return {
      ok: true,
      mode: 'send',
      status: res.status,
      messageId: String(entry.messageId),
      parts: typeof entry.qnt === 'number' ? entry.qnt : parts,
    }
  } catch (err) {
    console.error('[server-error]', JSON.stringify({ scope: 'sms', to: mask(to), err: String(err) }))
    return { ok: false, mode: 'sender-error' }
  }
}

function safeJson(raw: string): { data?: { messageId?: unknown; qnt?: unknown }[]; message?: unknown } | null {
  try { return JSON.parse(raw) } catch { return null }
}

/** „555***456" — enough to tell two recipients apart in a log, not enough to
 *  dial. A phone number is personal data and a log is read by more people than
 *  a database is. */
export function mask(raw: string | null | undefined): string {
  // Georgian numbers are masked from their LOCAL digits, so „555123456" and
  // „+995555123456" — the same phone, stored two ways — leave the same trace.
  const v = smsDestination(raw) ?? normalizePhone(raw)
  if (v.length < 6) return '***'
  return `${v.slice(0, 3)}***${v.slice(-3)}`
}

/* ═══════════ the two questions a send cannot answer ═════════════════════ */

/**
 * What is left on the sender.ge account.
 *
 * ⚠️ THIS IS THE 402 YOU CAN SEE COMING. `402 Insufficient balance` is not a
 * bug and it does not read like one at 2am — it silently stops every text the
 * site sends, and the only warning the API gives is the failure itself. The
 * admin prints this number so the warning arrives while there is still time to
 * act on it.
 *
 * Null when the account cannot be asked (no key, or the endpoint refused) —
 * distinct from 0, which is a real and much worse answer.
 */
export async function smsBalance(): Promise<{ balance: number; overdraft: number } | null> {
  const apiKey = process.env.SENDER_GE_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://sender.ge/api/getBalance.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ apikey: apiKey }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    // ⚠️ IT ANSWERS `{"data":[{…}]}` AND THE NUMBERS ARE STRINGS — measured
    // 2026-09-02: {"data":[{"balance":"49.06","overdraft":"0.0000",…}]}. Both
    // shapes are read, and both are coerced, because a flat object is what the
    // documentation implies and an envelope is what the endpoint sends. Reading
    // only one of them is how this returned null against a funded account.
    const j = JSON.parse(await res.text()) as
      { balance?: unknown; overdraft?: unknown; data?: { balance?: unknown; overdraft?: unknown }[] }
    const src = Array.isArray(j.data) ? j.data[0] : j
    const n = (v: unknown) => (typeof v === 'number' ? v : Number(v))
    const balance = n(src?.balance)
    if (!Number.isFinite(balance)) return null
    return { balance, overdraft: Number.isFinite(n(src?.overdraft)) ? n(src?.overdraft) : 0 }
  } catch (err) {
    console.error('[server-error]', JSON.stringify({ scope: 'sms', stage: 'balance', err: String(err) }))
    return null
  }
}

/** sender.ge's delivery report codes, from its own documentation. */
export const DELIVERY = { PENDING: 0, DELIVERED: 1, UNDELIVERED: 2 } as const

/**
 * What the CARRIER did with a message we already sent.
 *
 * ⚠️ „SENT" IS NOT „DELIVERED", AND THE GAP IS WHERE MESSAGES DIE. A 200 from
 * send.php means sender.ge accepted the message — exactly what Twilio's `sent`
 * means („the carrier acknowledged receipt") while `delivered` waits for a
 * delivery receipt. Twilio's own troubleshooting says a message can sit in that
 * gap for ever with no failure ever reported. Until this function existed the
 * log could only ever claim the first fact, so a text that never arrived and a
 * text that arrived looked identical in the admin.
 *
 * Null when the report cannot be read; the caller leaves the row alone and asks
 * again on the next tick rather than recording a guess.
 */
export async function deliveryStatus(messageId: string): Promise<number | null> {
  const apiKey = process.env.SENDER_GE_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://sender.ge/api/callback.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ apikey: apiKey, messageId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const j = JSON.parse(await res.text()) as { statusId?: unknown; data?: { statusId?: unknown }[] }
    const raw = Array.isArray(j.data) ? j.data[0]?.statusId : j.statusId
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isInteger(n) ? n : null
  } catch {
    // Quiet: this runs on a timer over many rows, and one unreachable report is
    // not an incident. The row simply stays unsettled and is asked again.
    return null
  }
}
