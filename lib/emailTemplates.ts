// Branded transactional email templates (Georgian). Each builder returns
// { subject, html }. Inline styles only — email clients strip <style>/external
// CSS. Brand green #2F9C86 (the logo teal), neutral ink, no external assets.

import { SUPPORT_EMAIL } from './supportEmails'
import { fmtKaDateTime, type KaDateOpts } from './kaDate'
import { topicLabel } from './requestTopics'
import { messageText, type MessageT } from './messageText'

const BASE = 'https://mcodne.ge'

/**
 * A link to a page that REQUIRES A SESSION, routed through sign-in.
 *
 * ⚠️ THE BUG THIS EXISTS FOR (2026-08-17, owner holding the dead link). Every
 * provider-side surface answers `notFound()` rather than redirecting — a
 * deliberate rule, and the right one: a redirect to /signin tells a stranger
 * guessing URLs that the page is real and worth coming back to with an account.
 *
 * But an EMAIL RECIPIENT is not a stranger guessing URLs. We sent them the
 * link. And on the phone or the browser where they were not signed in, that
 * link answered „page not found" — for a request we had just told them about,
 * with nothing on the screen suggesting signing in would help. The rule that
 * protects the subsystem from strangers was punishing the exact person it was
 * written to serve.
 *
 * /signin resolves it without weakening anything: it is a PUBLIC page, so
 * landing on it reveals nothing about whether the target exists, and it already
 * 307s a visitor who turns out to have a live session straight through to
 * `redirect` (app/signin/page.tsx, validated by safeInternalPath). So:
 *   · signed in   → bounced onward, never sees the form
 *   · signed out  → signs in, lands exactly on the thing the email was about
 *   · a stranger  → a sign-in page, and no information
 *
 * ⚠️ NOT FOR CLIENT LINKS. /request/<ref> is reachable with NO account at all —
 * possession of the reference is the client's identity, by design — so sending
 * a client through sign-in would invent a wall the product spent its whole
 * design removing. Client emails link direct. This is for /provider and /admin.
 */
function gatedLink(path: string): string {
  return `${BASE}/signin?redirect=${encodeURIComponent(path)}`
}

const BRAND = '#2F9C86'
const INK = '#1c1a17'
const MUTED = '#6b6862'

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

// Shared shell: header wordmark, white card, optional CTA button, muted footer.
function shell(opts: {
  /** Resolved copy, passed in: `shell` is sync and the words are not. */
  t?: MessageT
  heading: string
  bodyHtml: string
  cta?: { label: string; href: string }
  /** Footer kicker. Defaults to „ავტომატური შეტყობინება", which is true of every
   *  template here EXCEPT the hand-written admin message — telling someone to
   *  reply and then labelling the mail automated is a small lie. */
  footerNote?: string
}): string {
  const { heading, bodyHtml, cta } = opts
  const footerNote = opts.footerNote ?? opts.t?.('shell', 'footer') ?? 'ავტომატური შეტყობინება'
  const button = cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${esc(cta.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:10px;">${esc(cta.label)}</a>
       </td></tr>`
    : ''
  return `<!doctype html>
<html lang="ka"><body style="margin:0;padding:0;background:#f4f3f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f1;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding:8px 4px 16px;">
          <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${BRAND};">mcodne</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e6e4e0;border-radius:14px;padding:28px 26px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:20px;font-weight:800;color:${INK};letter-spacing:-0.01em;padding-bottom:12px;">${esc(heading)}</td></tr>
            <tr><td style="font-size:15px;line-height:1.6;color:${INK};">${bodyHtml}</td></tr>
            ${button}
          </table>
        </td></tr>
        <tr><td style="padding:16px 4px;font-size:12px;line-height:1.6;color:${MUTED};">
          mcodne<br>
          ${esc(footerNote)} · <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED};">${SUPPORT_EMAIL}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;">${text}</p>`
}

// ── The one way to print a session time OUTSIDE the app ──────────────────────
// The server runs TZ=Asia/Tbilisi, so `fmtKaDateTime` already yields Tbilisi
// wall-clock — but a bare „28 ივლ · 11:00" is read in an inbox, next to an app
// that renders the SAME instant in the reader's own browser zone. For anyone
// outside Georgia those two disagree by hours with nothing on screen saying so,
// which is a silent missed-session bug rather than a cosmetic one. So every
// time string that leaves the server — email bodies AND the notify() bodies the
// booking routes write — goes through this, never through fmtKaDateTime alone.
export const TZ_LABEL = 'თბილისის დროით' // a timezone name, not copy
export function fmtWhenTz(d: Date, opts?: KaDateOpts): string {
  return `${fmtKaDateTime(d, opts)} (${TZ_LABEL})`
}

// A labelled detail row (used in booking/reminder emails).
function detail(rows: { label: string; value: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border-top:1px solid #eee;">
    ${rows.map(r => `<tr>
      <td style="padding:8px 0;font-size:13px;color:${MUTED};width:40%;border-bottom:1px solid #f0efec;">${esc(r.label)}</td>
      <td style="padding:8px 0;font-size:14px;font-weight:600;color:${INK};border-bottom:1px solid #f0efec;">${esc(r.value)}</td>
    </tr>`).join('')}
  </table>`
}

export async function welcomeEmail(name: string) {
  const t = await messageText()
  const first = (name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: t('auth.welcome', 'subject'),
    html: shell({
      t,
      heading: t('auth.welcome', 'heading', { name: first ? `${esc(first)}, ` : '' }),
      bodyHtml:
        p(t('auth.welcome', 'body1')) +
        p(t('auth.welcome', 'body2')),
      cta: { label: t('auth.welcome', 'cta'), href: `${BASE}/experts` },
    }),
  }
}

// Sent when Google sign-in links to an account whose email had NEVER been
// verified, which costs that account its stored password — see lib/googleLink.ts
// for why that is the only safe reading of two credentials claiming one address.
//
// This mail is not a courtesy. The user is losing a credential they may have
// been using, so silence would read as „my password randomly stopped working";
// and in the case the revocation exists for — someone else had registered this
// address — this is the ONLY signal the real owner ever gets that it happened.
// The CTA therefore goes to password recovery, not to the home page.
export async function googleLinkedEmail(name: string) {
  const t = await messageText()
  const first = (name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: t('auth.googleLinked', 'subject'),
    html: shell({
      t,
      heading: t('auth.googleLinked', 'heading', { name: first ? `${esc(first)}, ` : '' }),
      bodyHtml:
        p(t('auth.googleLinked', 'body1')) +
        p(t('auth.googleLinked', 'body2')) +
        p(t('auth.googleLinked', 'body3', { support: SUPPORT_EMAIL })),
      cta: { label: t('auth.googleLinked', 'cta'), href: `${BASE}/signin?view=reset` },
    }),
  }
}

/* ⚠️ ELEVEN TEMPLATES WERE CUT FROM THIS FILE ON 2026-08-24, and every one of
   them addressed a thing that no longer happens:

     bookingRequestEmail · bookingConfirmedEmail · bookingChangedEmail
     sessionReminderEmail · sessionImminentEmail · reviewNudgeEmail
     newApplicationAdminEmail · applicationApprovedEmail · expertActivationEmail
     expertRequestEscalationEmail · newMessageEmail

   A booking, a session, a consultation application and a Message row are all
   gone; nothing imported any of these by the time they were removed, so they
   were 400 lines of mail nobody could send. The live set — the request thread,
   the offer lifecycle, auth and the admin's own notices — is unchanged.

   ⚠️ AND THE RULES THEY ENCODED ARE NOT IN THE GIT LOG, so they are here:
     · every template renders BOTH halves, text and HTML, from one call — a
       text-only fallback that drifts from the HTML is a mail that says two
       different things depending on the client that opens it;
     · a time is formatted in TBILISI and says so (lib/tz), because the reader
       is not in the timezone the server thinks in;
     · the public reference (`MC-` + 5) is a CREDENTIAL and never goes into a
       provider's mail — see CLAUDE.md, „things that protect a person"; and
     · a link points at a page the recipient can actually open, which is the
       rule the 88 dead notification hrefs broke and the migration cleaned up. */

/* ═══════════ THE TRADES QUEUE ═══════════════════════════════════════════ */

// ⚠️ THESE FOUR EXIST BECAUSE THE TRADES SIDE HAD NO EMAIL AT ALL (2026-08-18).
//
// Every master-side notification was a bell row and nothing else — and the bell
// is only drawn on /student, /tutor, /notifications and the public pages, not
// inside /provider. So an approval reached a person only if they happened to
// come back and look. The expert queue solved this in August and wrote the
// reason down beside its own send: „the in-app bell only lands if they come
// back on their own." The same sentence applies here and was not acted on.
//
// It matters more here than there. An expert who misses their approval loses a
// day; a master who misses theirs is the supply side of a vertical that has no
// supply, and they are the person we asked to upload a photo of their face.

export async function newProviderApplicationAdminEmail(o: {
  name: string; kind: string; company?: string | null
  services: string[]; areas: string[]; phone?: string | null; email?: string | null
}) {
  const t = await messageText()
  const rows: { label: string; value: string }[] = [
    { label: t('application.new.admin', 'rowKind'), value: o.company ? `${o.kind} — ${o.company}` : o.kind },
    { label: t('application.new.admin', 'rowServices'), value: o.services.join(', ') || '—' },
    { label: t('application.new.admin', 'rowCity'), value: o.areas.join(', ') || '—' },
    { label: t('application.new.admin', 'rowPhone'), value: o.phone || '—' },
    { label: t('application.new.admin', 'rowEmail'), value: o.email || '—' },
  ]
  return {
    // The name rides in the subject, so strip CR/LF — header injection here
    // would be user-controlled. Same rule as the expert queue's version.
    subject: t('application.new.admin', 'subject', { name: String(o.name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60) }),
    html: shell({
      t,
      heading: t('application.new.admin', 'heading'),
      bodyHtml: p(t('application.new.admin', 'body1', { name: esc(o.name) })) + detail(rows),
      cta: { label: t('application.new.admin', 'cta'), href: `${BASE}/admin#masters` },
      footerNote: t('application.new.admin', 'footer'),
    }),
  }
}

// ⚠️ THE APPROVAL MAIL CARRIES THE LINK TO THE WORKSPACE, and that link is the
// whole point of the message. /provider is reachable from nowhere on the site —
// not the header, not the user menu — so until this mail existed an approved
// master's only route in was to guess the URL or wait for the next sign-in.
export async function providerApprovedEmail(o: { name: string; note?: string | null }) {
  const t = await messageText()
  const first = (o.name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: t('application.approved', 'subject'),
    html: shell({
      t,
      heading: t('application.approved', 'heading', { name: first ? `${esc(first)}, ` : '' }),
      bodyHtml:
        p(t('application.approved', 'body1')) +
        p(t('application.approved', 'body2')) +
        (o.note ? p(`<span style="color:${MUTED};">${esc(t('application.approved', 'noteLabel'))}</span> ${esc(o.note)}`) : ''),
      // ⚠️ THROUGH SIGN-IN, NOT DIRECT — and this mail is exactly the case the
      // rule was written for. Every /provider surface answers notFound() rather
      // than redirecting (a redirect would tell a stranger the page is real),
      // so a master reading this on a phone where they are not signed in would
      // tap „გახსენი მოთხოვნები" and land on „page not found" — about the
      // workspace we had just told them they were approved for. `gatedLink`
      // 307s straight through for anyone who does turn out to have a session.
      cta: { label: t('application.approved', 'cta'), href: gatedLink('/work/requests') },
    }),
  }
}

// The note is the message. A revision request without its reason is „fix it"
// and nothing else, which is why the endpoint refuses to send one without.
export async function providerRevisionEmail(o: { name: string; note: string }) {
  const t = await messageText()
  const first = (o.name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: t('application.revision', 'subject'),
    html: shell({
      t,
      heading: t('application.revision', 'heading', { name: first ? `${esc(first)}, ` : '' }),
      bodyHtml:
        p(esc(o.note)) +
        p(t('application.revision', 'body1')),
      cta: { label: t('application.revision', 'cta'), href: `${BASE}/join?can=WORK` },
    }),
  }
}

// Sent, not silent. A refusal nobody is told about is somebody waiting for a
// call that will not come — and /apply/master used to render nothing at all for
// this status, so they could not have found out by visiting either.
export async function providerRejectedEmail(o: { name: string; note: string }) {
  const t = await messageText()
  const first = (o.name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: t('application.rejected', 'subject'),
    html: shell({
      t,
      heading: t('application.rejected', 'heading', { name: first ? `${esc(first)}, ` : '' }),
      bodyHtml: p(esc(o.note)),
      footerNote: t('application.rejected', 'body1'),
    }),
  }
}








// ⚠️ THE BOOKING-CHANGE MAILER WAS HERE AND IS GONE (2026-08-26).
//
// It was one builder for seven booking events — declined, canceled, no-show,
// and all three reschedule steps — each with a session time, a „ჯავშნის
// ნახვა" button and a „სხვა დროის არჩევა" link. Nothing has imported it since
// the booking product was removed on 2026-08-24: there is no request to
// decline, no time to move and no session to miss. The request lifecycle has
// its own mails below (requestVerified / offerArrived / offerAccepted /
// offerDone / requestClosedNoOffers), and those are the ones that actually go
// out.

// ── Admin → ONE user, written by hand (admin panel „მიწერე") ────────────────
// Every other builder in this file is a template with a static subject and a
// couple of interpolated system values. This one is different in kind: BOTH the
// subject and the body are free text an operator typed into a form, so it is
// the one place where the escaping rules are load-bearing rather than habit.
//   · subject → sanitizeSubject() (CR/LF stripped: a newline in a mail header
//     splices in an extra header — the classic injection) and it is ALSO the
//     in-app notification title, so the route reuses the same helper.
//   · body    → esc()-ed first, then split into paragraphs. The only markup a
//     typed body can ever produce is <p> and <br>, both emitted by us.
// The caller sets replyTo to SUPPORT_EMAIL — the point of this message is that
// the recipient can hit Reply and reach a human, not a noreply void.
type AdminMessageTemplate = 'expert' | 'info' | 'blank'

export const ADMIN_MESSAGE_SUBJECT_MAX = 120
export const ADMIN_MESSAGE_BODY_MAX = 4000

// Where the message TAKES the person: the email CTA and the in-app notification
// href are the same destination. Kept server-side (never accepted from the
// request body) so a typed message can't be turned into an arbitrary link.
// ⚠️ THE LABEL LEFT THIS MAP (2026-09-03). It is COPY, and copy has one home
// now — the registry the owner edits (lib/messageTextDefs → admin.directMessage
// → ctaExpert / ctaAccount / ctaMessage). A second copy here would be the exact
// drift this whole conversion exists to end. The map keeps the ROUTE, which is
// not copy and must never come from the request body.
const ADMIN_MESSAGE_DEST: Record<AdminMessageTemplate, { href: string; ctaPart: string }> = {
  expert: { href: '/join',          ctaPart: 'ctaExpert' },
  info:   { href: '/settings',      ctaPart: 'ctaAccount' },
  blank:  { href: '/notifications', ctaPart: 'ctaMessage' },
}

export function adminMessageDestination(t?: string | null): { href: string; ctaPart: string } {
  // Explicit allowlist rather than `MAP[t] ?? MAP.blank`: an indexed lookup with
  // '__proto__' (or 'constructor') resolves through the prototype chain and
  // returns a truthy object, which would sail past the ?? and yield href
  // `undefined`. Comparing against the three literals cannot do that.
  const key: AdminMessageTemplate = t === 'expert' || t === 'info' ? t : 'blank'
  return ADMIN_MESSAGE_DEST[key]
}

/** One line, no header-splitting characters. Used for the mail subject AND the
 *  notification title, so both stay identical to what the admin typed. */
export function sanitizeSubject(s: string): string {
  return String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

export async function adminDirectMessageEmail(o: {
  name: string
  subject: string
  body: string
  template?: AdminMessageTemplate | string | null
}) {
  const t = await messageText()
  const first = (o.name || '').trim().split(/\s+/)[0]
  const subject = sanitizeSubject(o.subject)
  const dest = adminMessageDestination(o.template)
  // Blank-line separated blocks become paragraphs; single newlines become <br>.
  // esc() runs BEFORE the <br> substitution, so the only tags here are ours.
  const bodyBlocks = o.body
    .split(/\r?\n\s*\r?\n/)
    .map(b => b.trim())
    .filter(Boolean)
    .map(b => p(esc(b).replace(/\r?\n/g, '<br>')))
    .join('')
  return {
    subject: subject || t('admin.directMessage', 'subject'),
    html: shell({
      t,
      heading: t('admin.directMessage', 'heading', { name: first ? `${esc(first)}, ` : '' }),
      bodyHtml:
        (subject ? p(`<b>${esc(subject)}</b>`) : '') +
        bodyBlocks +
        p(`<span style="color:${MUTED};">${esc(t('admin.directMessage', 'replyNote'))}</span>`),
      cta: { label: t('admin.directMessage', dest.ctaPart), href: `${BASE}${dest.href}` },
      footerNote: t('admin.directMessage', 'signature'),
    }),
  }
}


/* ═══════════ the requests subsystem (2026-08-14) ═══════════════════════════
 *
 * THREE MAILS, AND EACH ONE IS THE LOOP-CLOSER FOR A PERSON WHO IS NOT ON THE
 * SITE. The speed-to-lead research is unambiguous — the share of clients who go
 * with the FIRST responder is ~78%, and a lead answered after 30 minutes is
 * ~21× less likely to qualify — and an in-app bell only reaches somebody
 * already sitting on the page. Same reasoning as newApplicationAdminEmail
 * above, which exists because a bell nobody saw once cost applicants days.
 *
 * ⚠️ NO CLIENT CONTACT IN THE PROVIDER MAILS, for the same reason the provider
 * screens carry none: the contact opening on acceptance IS the product. The
 * mail says what the work is and where to answer it — never who is asking.
 */

/** To every allowlisted provider the moment a request is VERIFIED. */
export async function requestVerifiedProviderEmail(o: {
  topicLabel: string
  kindLabel: string
  budgetLabel: string
  timingLabel: string
  requestId: string
}) {
  const t = await messageText()
  return {
    subject: t('request.verified.provider', 'subject', { topic: o.topicLabel }),
    html: shell({
      t,
      heading: t('request.verified.provider', 'heading'),
      bodyHtml:
        detail([
          { label: t('request.verified.provider', 'rowWhat'), value: o.topicLabel },
          { label: t('request.verified.provider', 'rowKind'), value: o.kindLabel },
          { label: t('request.verified.provider', 'rowBudget'), value: o.budgetLabel },
          { label: t('request.verified.provider', 'rowTiming'), value: o.timingLabel },
        ]) +
        // The one line that matters after the facts: places are limited and the
        // first answers win — true, and the reason to open the mail now.
        p(t('request.verified.provider', 'body1')),
      cta: { label: t('request.verified.provider', 'cta'), href: gatedLink(`/work/requests/${o.requestId}`) },
    }),
  }
}

/** To the CLIENT each time an offer lands. They usually have no account — this
 *  link is their only door back in, so it is the mail's whole body. */
export async function offerArrivedClientEmail(o: {
  publicRef: string
  topicLabel: string
  priceLabel: string
  /** „მასალა და ტრანსპორტი ფასში შედის" — what the price covers (2026-09-01,
   *  the owner's design canvas). Optional because every offer written before
   *  the column existed has none. */
  priceIncludes?: string | null
  providerName: string
  offerCount: number
}) {
  const t = await messageText()
  return {
    subject: t('request.offerArrived.client', 'subject', { ref: o.publicRef }),
    html: shell({
      t,
      heading: t('request.offerArrived.client', 'heading'),
      bodyHtml:
        detail([
          { label: t('request.offerArrived.client', 'rowRequest'), value: `${o.topicLabel} · ${o.publicRef}` },
          { label: t('request.offerArrived.client', 'rowFrom'), value: o.providerName },
          { label: t('request.offerArrived.client', 'rowPrice'), value: o.priceLabel },
          // ⚠️ THE ROW IS OMITTED, NOT EMPTIED, WHEN THERE IS NONE. A „რას
          // მოიცავს" line with a dash after it in a mail reads as a provider
          // who declined to answer, and the older offers simply predate the
          // field. The client's own page applies the same rule.
          ...(o.priceIncludes ? [{ label: t('request.offerArrived.client', 'rowIncludes'), value: o.priceIncludes }] : []),
        ]) +
        p(o.offerCount > 1
          ? t('request.offerArrived.client', 'bodyMany', { count: String(o.offerCount) })
          : t('request.offerArrived.client', 'bodyOne')),
      cta: { label: t('request.offerArrived.client', 'cta'), href: `${BASE}/request/${o.publicRef}` },
    }),
  }
}

/**
 * „We have it" — to the CLIENT, the moment they press send.
 *
 * ⚠️ THIS DID NOT EXIST AND ITS ABSENCE WAS A HOLE (2026-08-18). Submitting
 * mailed exactly one address — the operator's inbox. The client got their code
 * and their link on the thanks SCREEN and nowhere else, so closing the tab
 * before the first offer arrived left them with no way back to their own
 * request: the code was on the page they had just closed. Owner: „ვთქვათ
 * ჩამეკეცა — მერე როდის და როგორ უნდა ვნახო?"
 *
 * The address was already there. Email was made REQUIRED on 2026-08-17
 * precisely because „every client notification is an email and there is no
 * SMS" — and then the first and most important notification was not sent.
 *
 * ⚠️ IT PROMISES A CALL, NOT A TIME. What happens next depends on a person
 * picking up a phone, and „within 15 minutes" is a number nobody here can keep
 * at 02:00. What is promised is true and checkable: the request is recorded,
 * the link works, and offers arrive at this address.
 */
export async function requestReceivedClientEmail(o: {
  publicRef: string
  topicLabel: string
}) {
  const t = await messageText()
  return {
    subject: t('request.received.client', 'subject', { ref: o.publicRef }),
    html: shell({
      t,
      heading: t('request.received.client', 'heading'),
      bodyHtml:
        detail([
          { label: t('request.received.client', 'rowWhat'), value: o.topicLabel },
          { label: t('request.received.client', 'rowCode'), value: o.publicRef },
        ]) +
        p(t('request.received.client', 'body1')) +
        p(t('request.received.client', 'body2')),
      cta: { label: t('request.received.client', 'cta'), href: `${BASE}/request/${o.publicRef}` },
    }),
  }
}

/**
 * „Nobody answered" — to the client, when their request closes unanswered.
 *
 * ⚠️ THIS IS THE ONLY MAIL THAT CARRIES BAD NEWS, and it exists because the
 * alternative was worse: a request with no offers sat for STALE_OPEN_DAYS and
 * was then set CLOSED by the cron in silence. The person who described their
 * problem, left a number and waited two weeks was never told that nobody came —
 * and because a closed request also closes their thread with us, the moment
 * they stopped hearing from us was the same moment they lost the only place
 * they could ask why.
 *
 * Plain, and it does not apologise in paragraphs: what they need is the fact,
 * and a way back in. The CTA is a NEW request rather than the old page —
 * the old one is closed, and sending somebody to a dead screen to read „closed"
 * is the same silence with an extra click.
 */
export async function requestClosedNoOffersClientEmail(o: {
  publicRef: string
  topicLabel: string
}) {
  const t = await messageText()
  return {
    subject: t('request.closedNoOffers.client', 'subject', { ref: o.publicRef }),
    html: shell({
      t,
      heading: t('request.closedNoOffers.client', 'heading'),
      bodyHtml:
        detail([
          { label: t('request.closedNoOffers.client', 'rowRequest'), value: `${o.topicLabel} · ${o.publicRef}` },
        ]) +
        p(t('request.closedNoOffers.client', 'body1')) +
        p(t('request.closedNoOffers.client', 'body2')),
      cta: { label: t('request.closedNoOffers.client', 'cta'), href: `${BASE}/request` },
    }),
  }
}

/**
 * „YOUR 1₾ IS BACK" — to a provider who paid for a contact on a request that
 * then died with nobody answering.
 *
 * ⚠️ THE MAIL IS HALF THE FEATURE, AND THE RESEARCH IS WHY (2026-08-30). The
 * grievance that defines this category — read that day across Thumbtack's own
 * pro communities — is not only that a paid lead went nowhere: it is that
 * getting the money back meant noticing, arguing, and being told no. A refund
 * the provider has to discover by watching their balance is, from where they
 * sit, indistinguishable from no refund at all.
 *
 * So it says the amount, the request it belongs to, and the rule — in one
 * screen, unprompted, before anybody asks. There is no CTA to „claim" it,
 * because there is nothing to claim: the money is already there.
 */
export async function contactRefundedProviderEmail(o: {
  topicLabel: string
  amountLabel: string
}) {
  const t = await messageText()
  return {
    subject: t('request.contactRefunded.provider', 'subject', { amount: o.amountLabel }),
    html: shell({
      t,
      heading: t('request.contactRefunded.provider', 'heading', { amount: o.amountLabel }),
      bodyHtml:
        detail([
          { label: t('request.contactRefunded.provider', 'rowRequest'), value: o.topicLabel },
          { label: t('request.contactRefunded.provider', 'rowAmount'), value: o.amountLabel },
        ]) +
        p(t('request.contactRefunded.provider', 'body1')) +
        p(t('request.contactRefunded.provider', 'body2')),
      cta: { label: t('request.contactRefunded.provider', 'cta'), href: gatedLink('/work') },
    }),
  }
}

/** To the chosen provider when the client accepts. The page it links to is
 *  where the contact now lives — the mail itself still carries none, so a
 *  forwarded or mis-addressed mail leaks nothing. */
export async function offerAcceptedProviderEmail(o: { topicLabel: string }) {
  const t = await messageText()
  return {
    subject: t('request.offerAccepted.provider', 'subject'),
    html: shell({
      t,
      heading: t('request.offerAccepted.provider', 'heading'),
      bodyHtml:
        // ⚠️ NO publicRef (2026-08-17). It used to be printed here in brackets.
        // It is the CLIENT'S CREDENTIAL, not a reference number — see
        // app/provider/requests/[id]/page — and a mail is the easiest place in
        // the system to read one off and keep it.
        p(t('request.offerAccepted.provider', 'body1', { topic: esc(o.topicLabel) })) +
        p(t('request.offerAccepted.provider', 'body2')),
      cta: { label: t('request.offerAccepted.provider', 'cta'), href: gatedLink('/work/offers') },
    }),
  }
}

/**
 * „You have a new message" — the same mail to both sides, addressed
 * differently.
 *
 * ⚠️ THE PREVIEW IS THE POST-MASK BODY. Whatever the contact firewall removed
 * (lib/requestChat → maskContacts) is already gone by the time this is built,
 * so a number a sender tried to slip past the platform cannot ride out in the
 * notification email instead — which would be the firewall with a hole in the
 * one channel that leaves the site.
 */
/**
 * The PLATFORM thread — the client and us, not the client and a provider.
 *
 * A separate template rather than a flag on the one below, because the sentence
 * that matters is different in kind. „ექსპერტმა გიპასუხა" is about somebody the
 * reader chose to talk to; this one is about the platform they are waiting on,
 * and to the operator it is a job rather than a notification. The CTA differs
 * too — staff land in the panel, the client on their own page.
 */
export async function requestThreadEmail(o: {
  toStaff: boolean
  publicRef: string
  preview: string
}) {
  const t = await messageText()
  const href = o.toStaff ? gatedLink('/admin?tab=requests') : `${BASE}/request/${o.publicRef}`
  const preview = o.preview.length > 140 ? `${o.preview.slice(0, 140)}…` : o.preview
  return {
    subject: o.toStaff
      ? t('thread.message', 'subjectStaff', { ref: o.publicRef })
      : t('thread.message', 'subject', { ref: o.publicRef }),
    html: shell({
      t,
      heading: o.toStaff ? t('thread.message', 'headingStaff') : t('thread.message', 'heading'),
      bodyHtml:
        p(o.toStaff
          ? t('thread.message', 'bodyStaff', { ref: esc(o.publicRef) })
          : t('thread.message', 'body1')) +
        `<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${BRAND};background:#f7f9f8;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap">${esc(preview)}</blockquote>`,
      cta: { label: t('thread.message', 'cta'), href },
    }),
  }
}

export async function requestChatEmail(o: {
  toProvider: boolean
  topic: string
  publicRef: string
  preview: string
}) {
  const t = await messageText()
  const href = o.toProvider ? gatedLink('/work/offers') : `${BASE}/request/${o.publicRef}`
  // Trimmed to a glance. A full message in the body is a message nobody comes
  // back to the site to answer — and answering is the point.
  const preview = o.preview.length > 140 ? `${o.preview.slice(0, 140)}…` : o.preview
  return {
    // ⚠️ THE SUBJECT FORKS ON THE AUDIENCE, and only for this reason: the
    // reference is the CLIENT'S credential. In their own inbox it is the thing
    // that opens their request and belongs there; in a provider's inbox it is a
    // key to somebody else's account, sitting in a searchable archive forever.
    subject: o.toProvider
      ? t('chat.message', 'subjectProvider', { topic: topicLabel(o.topic) })
      : t('chat.message', 'subject', { ref: o.publicRef }),
    html: shell({
      t,
      heading: t('chat.message', 'heading'),
      bodyHtml:
        p(o.toProvider
          ? t('chat.message', 'bodyProvider')
          : t('chat.message', 'body1')) +
        `<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${BRAND};background:#f7f9f8;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap">${esc(preview)}</blockquote>`,
      cta: { label: t('chat.message', 'cta'), href },
    }),
  }
}

/* ── After the choice (stage 7, lib/offerLifecycle) ─────────────────────── */

/** To the client when the PROVIDER marked the job finished. The page it links
 *  to is where the client confirms and rates — the mail carries no name, no
 *  price, and (to a client) their own reference is not a leak. */
export async function offerDoneClientEmail(o: { publicRef: string; topicLabel: string }) {
  const t = await messageText()
  return {
    subject: t('request.done.client', 'subject', { ref: o.publicRef }),
    html: shell({
      t,
      heading: t('request.done.client', 'heading'),
      bodyHtml:
        detail([{ label: t('request.done.client', 'rowRequest'), value: `${o.topicLabel} · ${o.publicRef}` }]) +
        p(t('request.done.client', 'body1')),
      cta: { label: t('request.done.client', 'cta'), href: `${BASE}/request/${o.publicRef}` },
    }),
  }
}

/** To the provider when the CLIENT marked the job finished. NO publicRef —
 *  the client's credential never rides in a provider mail (see
 *  offerAcceptedProviderEmail). */
export async function offerDoneProviderEmail(o: { topicLabel: string }) {
  const t = await messageText()
  return {
    subject: t('request.done.provider', 'subject'),
    html: shell({
      t,
      heading: t('request.done.provider', 'heading'),
      bodyHtml: p(t('request.done.provider', 'body1', { topic: esc(o.topicLabel) })),
      cta: { label: t('request.done.provider', 'cta'), href: gatedLink('/work/offers') },
    }),
  }
}

/** The ONE reminder, 14 days after acceptance with nobody saying it finished
 *  (lib/offerLifecycle → runOfferLifecycleJobs). A question, not a claim. */
export async function offerDoneReminderClientEmail(o: { publicRef: string; topicLabel: string }) {
  const t = await messageText()
  return {
    subject: t('request.doneReminder.client', 'subject', { ref: o.publicRef }),
    html: shell({
      t,
      heading: t('request.doneReminder.client', 'heading'),
      bodyHtml:
        detail([{ label: t('request.doneReminder.client', 'rowRequest'), value: `${o.topicLabel} · ${o.publicRef}` }]) +
        p(t('request.doneReminder.client', 'body1')),
      cta: { label: t('request.doneReminder.client', 'cta'), href: `${BASE}/request/${o.publicRef}` },
    }),
  }
}
