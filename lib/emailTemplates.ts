// Branded transactional email templates (Georgian). Each builder returns
// { subject, html }. Inline styles only — email clients strip <style>/external
// CSS. Brand green #2F9C86 (the logo teal), neutral ink, no external assets.

import { SUPPORT_EMAIL } from './supportEmails'
import { fmtKaDateTime, type KaDateOpts } from './kaDate'
import { topicLabel } from './requestTopics'

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
  heading: string
  bodyHtml: string
  cta?: { label: string; href: string }
  /** Footer kicker. Defaults to „ავტომატური შეტყობინება", which is true of every
   *  template here EXCEPT the hand-written admin message — telling someone to
   *  reply and then labelling the mail automated is a small lie. */
  footerNote?: string
}): string {
  const { heading, bodyHtml, cta } = opts
  const footerNote = opts.footerNote ?? 'ავტომატური შეტყობინება'
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
          mcodne — კონსულტაციები ექსპერტებთან.<br>
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
export const TZ_LABEL = 'თბილისის დროით'
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

export function welcomeEmail(name: string) {
  const first = (name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: 'კეთილი იყოს მობრძანება 👋',
    html: shell({
      heading: first ? `${esc(first)}, კეთილი იყოს შენი მობრძანება!` : 'კეთილი იყოს შენი მობრძანება!',
      bodyHtml:
        p('დარეგისტრირდი <b>მცოდნეზე</b> — აქ შენს საკითხზე პირდაპირ ექსპერტს ესაუბრები.') +
        p('აღწერე რა გჭირდება — ექსპერტები შეთავაზებას ფასთან ერთად თავად გამოგიგზავნიან.'),
      cta: { label: 'იპოვე ექსპერტი', href: `${BASE}/experts` },
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
export function googleLinkedEmail(name: string) {
  const first = (name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: 'უსაფრთხოება — ანგარიშში Google-ით შეხვედი',
    html: shell({
      heading: first ? `${esc(first)}, ანგარიშში Google-ით შეხვედი` : 'ანგარიშში Google-ით შეხვედი',
      bodyHtml:
        p('შენი ელფოსტა აქამდე დადასტურებული არ იყო, ამიტომ უსაფრთხოებისთვის <b>ძველი პაროლი გავაუქმეთ</b> და ყველა გახსნილი სესია დავხურეთ.') +
        p('ამიერიდან ანგარიშში Google-ით შედი. თუ პაროლითაც გინდა შესვლა, დააყენე ახალი — ეს ერთი წუთის საქმეა.') +
        p(`თუ ეს შენ არ ყოფილხარ, მაშინვე მოგვწერე: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`),
      cta: { label: 'ახალი პაროლის დაყენება', href: `${BASE}/signin?view=reset` },
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

export function newProviderApplicationAdminEmail(o: {
  name: string; kind: string; company?: string | null
  services: string[]; areas: string[]; phone?: string | null; email?: string | null
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'ტიპი', value: o.company ? `${o.kind} — ${o.company}` : o.kind },
    { label: 'სერვისები', value: o.services.join(', ') || '—' },
    { label: 'ქალაქი', value: o.areas.join(', ') || '—' },
    { label: 'ტელეფონი', value: o.phone || '—' },
    { label: 'ელფოსტა', value: o.email || '—' },
  ]
  return {
    // The name rides in the subject, so strip CR/LF — header injection here
    // would be user-controlled. Same rule as the expert queue's version.
    subject: `ახალი განაცხადი — სერვისი — ${String(o.name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60)}`,
    html: shell({
      heading: 'ახალი განაცხადი მოდერაციაში',
      bodyHtml: p(`<b>${esc(o.name)}</b> გამოგზავნა განაცხადი სერვისზე.`) + detail(rows),
      cta: { label: 'გახსენი მოდერაცია', href: `${BASE}/admin#masters` },
      footerNote: 'ადმინის შეტყობინება',
    }),
  }
}

// ⚠️ THE APPROVAL MAIL CARRIES THE LINK TO THE WORKSPACE, and that link is the
// whole point of the message. /provider is reachable from nowhere on the site —
// not the header, not the user menu — so until this mail existed an approved
// master's only route in was to guess the URL or wait for the next sign-in.
export function providerApprovedEmail(o: { name: string; note?: string | null }) {
  const first = (o.name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: 'დამტკიცდი — მოთხოვნები უკვე მოგდის',
    html: shell({
      heading: first ? `${esc(first)}, დამტკიცდი` : 'დამტკიცდი',
      bodyHtml:
        p('შენი მიმართულების და შენს ქალაქში გამოგზავნილი მოთხოვნები ახლა შენთან მოდის.') +
        p('გახსენი სია, წაიკითხე და ფასი თვითონ დაწერე. სხვები შენს შეთავაზებას ვერ ხედავენ.') +
        (o.note ? p(`<span style="color:${MUTED};">კომენტარი:</span> ${esc(o.note)}`) : ''),
      // ⚠️ THROUGH SIGN-IN, NOT DIRECT — and this mail is exactly the case the
      // rule was written for. Every /provider surface answers notFound() rather
      // than redirecting (a redirect would tell a stranger the page is real),
      // so a master reading this on a phone where they are not signed in would
      // tap „გახსენი მოთხოვნები" and land on „page not found" — about the
      // workspace we had just told them they were approved for. `gatedLink`
      // 307s straight through for anyone who does turn out to have a session.
      cta: { label: 'გახსენი მოთხოვნები', href: gatedLink('/work/requests') },
    }),
  }
}

// The note is the message. A revision request without its reason is „fix it"
// and nothing else, which is why the endpoint refuses to send one without.
export function providerRevisionEmail(o: { name: string; note: string }) {
  const first = (o.name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: 'განაცხადს ერთი რამ აკლია',
    html: shell({
      heading: first ? `${esc(first)}, ერთი რამ აკლია` : 'ერთი რამ აკლია',
      bodyHtml:
        p(esc(o.note)) +
        p('შეავსე და ხელახლა გამოგზავნე — თავიდან ყველაფრის შევსება არ დაგჭირდება.'),
      cta: { label: 'გახსენი განაცხადი', href: `${BASE}/join?can=WORK` },
    }),
  }
}

// Sent, not silent. A refusal nobody is told about is somebody waiting for a
// call that will not come — and /apply/master used to render nothing at all for
// this status, so they could not have found out by visiting either.
export function providerRejectedEmail(o: { name: string; note: string }) {
  const first = (o.name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: 'განაცხადი არ დამტკიცდა',
    html: shell({
      heading: first ? `${esc(first)}, განაცხადი არ დამტკიცდა` : 'განაცხადი არ დამტკიცდა',
      bodyHtml: p(esc(o.note)),
      footerNote: 'თუ რამე შეიცვალა, ხელახლა გამოგზავნა შეგიძლია.',
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
const ADMIN_MESSAGE_DEST: Record<AdminMessageTemplate, { href: string; ctaLabel: string }> = {
  expert: { href: '/join',          ctaLabel: 'ექსპერტად რეგისტრაცია' },
  info:   { href: '/settings',      ctaLabel: 'ანგარიშის გახსნა' },
  blank:  { href: '/notifications', ctaLabel: 'შეტყობინების ნახვა' },
}

export function adminMessageDestination(t?: string | null): { href: string; ctaLabel: string } {
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

export function adminDirectMessageEmail(o: {
  name: string
  subject: string
  body: string
  template?: AdminMessageTemplate | string | null
}) {
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
    subject: subject || 'შეტყობინება მცოდნესგან',
    html: shell({
      heading: first ? `${esc(first)}, გამარჯობა` : 'გამარჯობა',
      bodyHtml:
        (subject ? p(`<b>${esc(subject)}</b>`) : '') +
        bodyBlocks +
        p(`<span style="color:${MUTED};">უპასუხე პირდაპირ ამ წერილს — ჩვენს ფოსტაზე მოვა და ცოცხალი ადამიანი წაიკითხავს.</span>`),
      cta: { label: dest.ctaLabel, href: `${BASE}${dest.href}` },
      footerNote: 'მცოდნეს გუნდი',
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
export function requestVerifiedProviderEmail(o: {
  topicLabel: string
  kindLabel: string
  budgetLabel: string
  timingLabel: string
  requestId: string
}) {
  return {
    subject: `ახალი მოთხოვნა — ${o.topicLabel}`,
    html: shell({
      heading: 'ახალი მოთხოვნა',
      bodyHtml:
        detail([
          { label: 'რა', value: o.topicLabel },
          { label: 'ტიპი', value: o.kindLabel },
          { label: 'ბიუჯეტი', value: o.budgetLabel },
          { label: 'ვადა', value: o.timingLabel },
        ]) +
        // The one line that matters after the facts: places are limited and the
        // first answers win — true, and the reason to open the mail now.
        p('ადგილები შეზღუდულია — პირველი შეთავაზებები იგებენ.'),
      cta: { label: 'ნახე და შესთავაზე', href: gatedLink(`/work/requests/${o.requestId}`) },
    }),
  }
}

/** To the CLIENT each time an offer lands. They usually have no account — this
 *  link is their only door back in, so it is the mail's whole body. */
export function offerArrivedClientEmail(o: {
  publicRef: string
  topicLabel: string
  priceLabel: string
  providerName: string
  offerCount: number
}) {
  return {
    subject: `ახალი შეთავაზება — ${o.publicRef}`,
    html: shell({
      heading: 'ახალი შეთავაზება მოგივიდა',
      bodyHtml:
        detail([
          { label: 'მოთხოვნა', value: `${o.topicLabel} · ${o.publicRef}` },
          { label: 'ვისგან', value: o.providerName },
          { label: 'ფასი', value: o.priceLabel },
        ]) +
        p(o.offerCount > 1
          ? `სულ ${o.offerCount} შეთავაზება გაქვს — შეადარე და აირჩიე.`
          : 'ნახე დეტალები და თუ მოგეწონება, აირჩიე.'),
      cta: { label: 'შეთავაზებების ნახვა', href: `${BASE}/request/${o.publicRef}` },
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
export function requestReceivedClientEmail(o: {
  publicRef: string
  topicLabel: string
}) {
  return {
    subject: `მოთხოვნა მივიღეთ — ${o.publicRef}`,
    html: shell({
      heading: 'მოთხოვნა მივიღეთ',
      bodyHtml:
        detail([
          { label: 'რა', value: o.topicLabel },
          { label: 'კოდი', value: o.publicRef },
        ]) +
        p('შევამოწმებთ და ექსპერტებს გადავცემთ. შეთავაზებები ამ ელფოსტაზე მოგივა.') +
        p('ეს ბმული შენი მოთხოვნის გვერდია — შეინახე, აქ ნახავ შეთავაზებებს და მოგვწერ, თუ რამე დასამატებელი გაქვს.'),
      cta: { label: 'ჩემი მოთხოვნა', href: `${BASE}/request/${o.publicRef}` },
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
export function requestClosedNoOffersClientEmail(o: {
  publicRef: string
  topicLabel: string
}) {
  return {
    subject: `შეთავაზება არ მოვიდა — ${o.publicRef}`,
    html: shell({
      heading: 'ამ მოთხოვნაზე შეთავაზება არ მოვიდა',
      bodyHtml:
        detail([
          { label: 'მოთხოვნა', value: `${o.topicLabel} · ${o.publicRef}` },
        ]) +
        p('ვცადეთ, მაგრამ ამ მიმართულებით თავისუფალი ექსპერტი ვერ მოვძებნეთ. მოთხოვნა დავხურეთ.') +
        p('თუ პირობები შეიცვალა — ბიუჯეტი, ვადა ან ფორმატი — გამოგვიგზავნე ახალი მოთხოვნა და თავიდან ვცდით.'),
      cta: { label: 'ახალი მოთხოვნა', href: `${BASE}/request` },
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
export function contactRefundedProviderEmail(o: {
  topicLabel: string
  amountLabel: string
}) {
  return {
    subject: `დაგიბრუნეთ ${o.amountLabel} — კლიენტი არ გამოეხმაურა`,
    html: shell({
      heading: `${o.amountLabel} დაგიბრუნდა`,
      bodyHtml:
        detail([
          { label: 'მოთხოვნა', value: o.topicLabel },
          { label: 'დაბრუნდა', value: o.amountLabel },
        ]) +
        p(`ამ მოთხოვნაზე კონტაქტი გახსენი, კლიენტი კი აღარ გამოხმაურებია — არავის შეთავაზება არ მიუღია. ასეთ დროს ფული თავისით ბრუნდება ბალანსზე.`) +
        p('არაფრის გაკეთება არ გჭირდება — თანხა უკვე ბალანსზეა.'),
      cta: { label: 'ბალანსი', href: gatedLink('/work') },
    }),
  }
}

/** To the chosen provider when the client accepts. The page it links to is
 *  where the contact now lives — the mail itself still carries none, so a
 *  forwarded or mis-addressed mail leaks nothing. */
export function offerAcceptedProviderEmail(o: { topicLabel: string }) {
  return {
    subject: 'შენი შეთავაზება აირჩიეს 🎉',
    html: shell({
      heading: 'შენი შეთავაზება აირჩიეს',
      bodyHtml:
        // ⚠️ NO publicRef (2026-08-17). It used to be printed here in brackets.
        // It is the CLIENT'S CREDENTIAL, not a reference number — see
        // app/provider/requests/[id]/page — and a mail is the easiest place in
        // the system to read one off and keep it.
        p(`კლიენტმა აირჩია შენი შეთავაზება — <b>${esc(o.topicLabel)}</b>.`) +
        p('კლიენტის კონტაქტი უკვე შენს გვერდზეა. დაუკავშირდი მალე — ის ამას ელოდება.'),
      cta: { label: 'კონტაქტის ნახვა', href: gatedLink('/work/offers') },
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
export function requestThreadEmail(o: {
  toStaff: boolean
  publicRef: string
  preview: string
}) {
  const href = o.toStaff ? gatedLink('/admin?tab=requests') : `${BASE}/request/${o.publicRef}`
  const preview = o.preview.length > 140 ? `${o.preview.slice(0, 140)}…` : o.preview
  return {
    subject: o.toStaff
      ? `[მცოდნე] შეტყობინება მოთხოვნაზე ${o.publicRef}`
      : `პასუხი — ${o.publicRef}`,
    html: shell({
      heading: o.toStaff ? 'კლიენტი წერს' : 'გიპასუხეთ',
      bodyHtml:
        p(o.toStaff
          ? `მოთხოვნა ${esc(o.publicRef)} — კლიენტმა მიმოწერაში დაწერა.`
          : 'შენს მოთხოვნაზე გიპასუხეთ.') +
        `<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${BRAND};background:#f7f9f8;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap">${esc(preview)}</blockquote>`,
      cta: { label: 'პასუხის გაცემა', href },
    }),
  }
}

export function requestChatEmail(o: {
  toProvider: boolean
  topic: string
  publicRef: string
  preview: string
}) {
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
      ? `ახალი შეტყობინება — ${topicLabel(o.topic)}`
      : `ახალი შეტყობინება — ${o.publicRef}`,
    html: shell({
      heading: 'ახალი შეტყობინება',
      bodyHtml:
        p(o.toProvider
          ? 'კლიენტმა მოგწერა შენს შეთავაზებაზე.'
          : 'ექსპერტმა გიპასუხა.') +
        `<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${BRAND};background:#f7f9f8;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap">${esc(preview)}</blockquote>`,
      cta: { label: 'პასუხის გაცემა', href },
    }),
  }
}

/* ── After the choice (stage 7, lib/offerLifecycle) ─────────────────────── */

/** To the client when the PROVIDER marked the job finished. The page it links
 *  to is where the client confirms and rates — the mail carries no name, no
 *  price, and (to a client) their own reference is not a leak. */
export function offerDoneClientEmail(o: { publicRef: string; topicLabel: string }) {
  return {
    subject: `სამუშაო დასრულდა — ${o.publicRef}`,
    html: shell({
      heading: 'სამუშაო დასრულდა',
      bodyHtml:
        detail([{ label: 'მოთხოვნა', value: `${o.topicLabel} · ${o.publicRef}` }]) +
        p('ექსპერტმა მონიშნა, რომ სამუშაო დასრულდა. შეაფასე შენს გვერდზე.'),
      cta: { label: 'შეფასება', href: `${BASE}/request/${o.publicRef}` },
    }),
  }
}

/** To the provider when the CLIENT marked the job finished. NO publicRef —
 *  the client's credential never rides in a provider mail (see
 *  offerAcceptedProviderEmail). */
export function offerDoneProviderEmail(o: { topicLabel: string }) {
  return {
    subject: 'კლიენტმა სამუშაო დასრულებულად მონიშნა',
    html: shell({
      heading: 'სამუშაო დასრულდა',
      bodyHtml: p(`კლიენტმა მონიშნა, რომ სამუშაო დასრულდა — <b>${esc(o.topicLabel)}</b>.`),
      cta: { label: 'ჩემი შეთავაზებები', href: gatedLink('/work/offers') },
    }),
  }
}

/** The ONE reminder, 14 days after acceptance with nobody saying it finished
 *  (lib/offerLifecycle → runOfferLifecycleJobs). A question, not a claim. */
export function offerDoneReminderClientEmail(o: { publicRef: string; topicLabel: string }) {
  return {
    subject: `დასრულდა სამუშაო? — ${o.publicRef}`,
    html: shell({
      heading: 'დასრულდა სამუშაო?',
      bodyHtml:
        detail([{ label: 'მოთხოვნა', value: `${o.topicLabel} · ${o.publicRef}` }]) +
        p('თუ სამუშაო დასრულდა, მონიშნე შენს გვერდზე და შეაფასე.'),
      cta: { label: 'გახსნა', href: `${BASE}/request/${o.publicRef}` },
    }),
  }
}
